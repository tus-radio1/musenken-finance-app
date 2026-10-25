-- Cleanup crosses DB and Storage APIs. A durable claim prevents another writer
-- from attaching a path between the reference check and the Storage removal.
CREATE TABLE public.receipt_cleanup_claims (
  path text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  claimed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.receipt_cleanup_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.receipt_cleanup_claims FROM anon, authenticated;
GRANT ALL ON public.receipt_cleanup_claims TO service_role;

CREATE FUNCTION public.receipt_reference_name(p_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v_path text := pg_catalog.btrim(p_value);
  v_escape text[];
BEGIN
  IF v_path ~* '^https?://' THEN
    v_path := pg_catalog.split_part(pg_catalog.split_part(v_path, '?', 1), '#', 1);
    IF v_path ~ '/storage/v1/object/(public|sign|authenticated)/receipts/' THEN
      v_path := pg_catalog.regexp_replace(v_path, '^.*/storage/v1/object/(public|sign|authenticated)/receipts/', '');
    ELSE
      v_path := pg_catalog.regexp_replace(v_path, '^.*/', '');
    END IF;
    LOOP
      v_escape := pg_catalog.regexp_match(v_path, '%([0-9a-fA-F]{2})');
      EXIT WHEN v_escape IS NULL;
      v_path := pg_catalog.replace(v_path, '%' || v_escape[1],
        pg_catalog.chr(('x' || v_escape[1])::bit(8)::integer));
    END LOOP;
  END IF;
  RETURN v_path;
END;
$$;

CREATE FUNCTION public.claim_receipt_cleanup(p_path text, p_owner_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_owner_id IS NULL OR NOT pg_catalog.starts_with(p_path, p_owner_id::text || '/')
    OR p_path !~ '^[a-zA-Z0-9._/-]+$' OR pg_catalog.strpos(p_path, '..') > 0 THEN
    RETURN false;
  END IF;
  -- Block record writers while checking and claiming. The write trigger below
  -- rejects a claimed path after these locks are released, including direct API writes.
  LOCK TABLE public.transactions, public.subsidy_items, public.audit_logs IN SHARE MODE;
  IF EXISTS (SELECT 1 FROM public.transactions WHERE public.receipt_reference_name(receipt_url) = p_path)
    OR EXISTS (SELECT 1 FROM public.subsidy_items
      WHERE public.receipt_reference_name(receipt_url) = p_path OR public.receipt_reference_name(evidence_url) = p_path)
    OR EXISTS (
      SELECT 1 FROM public.audit_logs a,
      LATERAL pg_catalog.jsonb_path_query(
        pg_catalog.jsonb_build_array(a.old_data, a.new_data),
        '$.** ? (@.type() == "object").keyvalue() ? (@.key == "receipt_url" || @.key == "evidence_url").value'
      ) AS ref(value)
      WHERE a.action IN ('DELETE', 'SOFT_DELETE')
        AND public.receipt_reference_name(ref.value #>> '{}') = p_path
    ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.receipt_cleanup_claims(path, owner_id) VALUES (p_path, p_owner_id)
  ON CONFLICT (path) DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_receipt_cleanup(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_receipt_cleanup(text, uuid) TO service_role;

CREATE FUNCTION public.reject_claimed_receipt_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.receipt_cleanup_claims c
    WHERE c.path = public.receipt_reference_name(NEW.receipt_url)
      OR c.path = public.receipt_reference_name(pg_catalog.to_jsonb(NEW) ->> 'evidence_url')
  ) THEN
    RAISE EXCEPTION 'Receipt upload has been discarded; upload it again' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reject_claimed_receipt_reference() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER reject_claimed_transaction_receipt
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.reject_claimed_receipt_reference();
CREATE TRIGGER reject_claimed_subsidy_receipt
BEFORE INSERT OR UPDATE ON public.subsidy_items
FOR EACH ROW EXECUTE FUNCTION public.reject_claimed_receipt_reference();
