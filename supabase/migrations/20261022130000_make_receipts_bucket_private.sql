-- Migration: Make the receipts bucket private (S4)
--
-- Problem:
--   The receipts bucket was public, so anyone with an object URL
--   (/storage/v1/object/public/receipts/...) could read receipts without
--   logging in. In addition, two storage.objects policies let any logged-in
--   user upload into their own prefix and read / list / sign every receipt
--   directly through the Storage API, bypassing the app.
--
-- Fix:
--   - receipts becomes private (also when the bucket is created here).
--   - Both storage.objects policies are dropped. With RLS enabled and no
--     policy, anon and authenticated can neither read, list, sign nor write
--     objects. Only the service role (which bypasses RLS) can:
--       * uploads: uploadReceiptAction (app/actions.ts),
--       * cleanup: removeReplacedReceipt (lib/receipt-storage.ts),
--       * viewing: GET /api/receipts checks the session, then signs a
--         short-lived URL (lib/receipt-signing.ts).
--   - The migration aborts if any other storage.objects policy remains
--     (for example one created in the Dashboard), because a permissive policy
--     would silently re-open access. Review such policies before deploying.
--
-- Deploy order: the app version that links to /api/receipts must be live
-- before this migration runs; older app versions build public URLs, which
-- stop working once the bucket is private.
--
-- Rollback (not recommended; re-exposes every receipt to anonymous users):
--   UPDATE storage.buckets SET public = true WHERE id = 'receipts';
-- Prefer rolling the app forward instead.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'receipts',
  'receipts',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/tiff',
    'image/bmp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Authenticated users can upload to receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read receipts" ON storage.objects;

DO $$
DECLARE
  remaining TEXT;
BEGIN
  IF NOT (
    SELECT relrowsecurity
    FROM pg_catalog.pg_class
    WHERE oid = 'storage.objects'::regclass
  ) THEN
    RAISE EXCEPTION 'storage.objects must have row level security enabled';
  END IF;

  SELECT string_agg(format('%I (%s)', policyname, cmd), ', ' ORDER BY policyname)
  INTO remaining
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects';

  IF remaining IS NOT NULL THEN
    RAISE EXCEPTION 'Unreviewed storage.objects policies remain: %', remaining
      USING HINT = 'Drop them or add a reviewed exception to this migration before making receipts private.';
  END IF;
END
$$;
