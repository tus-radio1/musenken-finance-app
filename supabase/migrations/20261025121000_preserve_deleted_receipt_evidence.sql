-- Capture evidence for every physical deletion, including group/year bulk
-- deletes and linked subsidy transaction deletes. Storage objects are retained.
CREATE OR REPLACE FUNCTION public.audit_deleted_receipt_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, changed_by)
  VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', pg_catalog.to_jsonb(OLD), auth.uid());
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_deleted_receipt_record() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER audit_deleted_transaction
AFTER DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.audit_deleted_receipt_record();
CREATE TRIGGER audit_deleted_subsidy_item
AFTER DELETE ON public.subsidy_items
FOR EACH ROW EXECUTE FUNCTION public.audit_deleted_receipt_record();
