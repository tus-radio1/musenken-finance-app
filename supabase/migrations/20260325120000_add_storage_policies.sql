-- Migration: Add RLS policies for storage.objects (receipts bucket)
-- Purpose: Allow authenticated users to upload and read files in the receipts bucket

CREATE POLICY "Authenticated users can upload to receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
	bucket_id = 'receipts'
	AND owner = auth.uid()
	AND name LIKE auth.uid()::text || '/%'
);

CREATE POLICY "Authenticated users can read receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'receipts');
