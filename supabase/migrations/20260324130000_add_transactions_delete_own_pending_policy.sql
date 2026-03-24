-- Allow transaction owners to delete their own pending records
CREATE POLICY "transactions_delete_own_pending"
  ON public.transactions FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND approval_status = 'pending'
  );
