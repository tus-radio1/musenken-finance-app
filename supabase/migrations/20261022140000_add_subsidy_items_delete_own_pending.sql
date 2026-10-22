-- Migration: Let applicants delete their own pending subsidy items
--
-- Problem:
--   deleteMySubsidyItem hard-deletes a non-admin applicant's own pending item
--   with the user's session, but subsidy_items has no DELETE policy for
--   non-admins (only subsidy_items_admin_all). RLS filtered the DELETE to
--   0 rows and the action reported success while the item stayed.
--
-- Fix (additive only):
--   A permissive DELETE policy that mirrors transactions_delete_own_pending
--   (20260324130000): the applicant may delete their own item while it is
--   still 'pending' and not soft-deleted. Existing policies are unchanged, so
--   no current read or write path loses access. The app's rule is the same
--   (owners may delete pending items only).
--
-- Rollback (reversible, no data change):
--   DROP POLICY IF EXISTS "subsidy_items_delete_own_pending" ON public.subsidy_items;

CREATE POLICY "subsidy_items_delete_own_pending"
  ON public.subsidy_items FOR DELETE
  TO authenticated
  USING (
    applicant_id = auth.uid()
    AND status = 'pending'
    AND deleted_at IS NULL
  );
