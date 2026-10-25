-- Deploy before (or together with) the application calling this RPC.
CREATE OR REPLACE FUNCTION public.soft_delete_member(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_admin boolean;
  v_profile public.profiles%ROWTYPE;
  v_deleted_at timestamptz := pg_catalog.now();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'Cannot delete yourself' USING ERRCODE = '42501';
  END IF;

  -- Serialize with all role writers, including service-role assignment paths.
  -- The protected-target check and removal must use the same locked snapshot.
  LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.roles IN SHARE MODE;
  v_admin := public.is_admin();
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor AND deleted_at IS NULL)
     OR NOT (v_admin OR public.has_role('会計') OR public.has_role('部長') OR public.has_role('副部長')) THEN
    RAISE EXCEPTION 'Member management permission required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002';
  END IF;
  -- Match isDelegableRole: unknown types and group roles fail closed.
  IF NOT v_admin AND EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id AND (
      r.type IS DISTINCT FROM 'general' OR r.accounting_group_id IS NOT NULL
      OR r.name IN ('会計', '部長', '副部長')
    )
  ) THEN
    RAISE EXCEPTION 'Protected member requires admin' USING ERRCODE = '42501';
  END IF;
  IF v_profile.deleted_at IS NOT NULL THEN
    -- An admin or the original operator can retry the Auth ban. No duplicate
    -- audit row or new timestamp. Other managers cannot adopt a deleted target.
    IF NOT v_admin AND NOT EXISTS (
      SELECT 1 FROM public.audit_logs
      WHERE table_name = 'profiles' AND record_id = p_user_id
        AND action = 'SOFT_DELETE' AND changed_by = v_actor
        AND new_data ->> 'deleted_at' = (pg_catalog.to_jsonb(v_profile.deleted_at) #>> '{}')
    ) THEN
      RAISE EXCEPTION 'Deleted member retry requires original operator or admin' USING ERRCODE = '42501';
    END IF;
    RETURN p_user_id;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  UPDATE public.profiles SET deleted_at = v_deleted_at, updated_at = v_deleted_at
  WHERE id = p_user_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member was not updated' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
  VALUES ('profiles', p_user_id, 'SOFT_DELETE', pg_catalog.to_jsonb(v_profile),
    pg_catalog.jsonb_build_object('deleted_at', v_deleted_at), v_actor);
  RETURN p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.soft_delete_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_member(uuid) TO authenticated;
COMMENT ON FUNCTION public.soft_delete_member(uuid) IS
  'Atomic member soft delete. Retry by admin/original actor is a no-op; Auth ban follows in the server action.';
