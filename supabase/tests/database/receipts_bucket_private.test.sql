-- pgTAP: the receipts bucket is private and its objects are reachable only
-- through the service role (migration 20261022130000).
-- Run with: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(12);

-- ---------------------------------------------------------------------------
-- Bucket and policy configuration
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'receipts'),
  false,
  'receipts bucket is private'
);

SELECT is_empty(
  $$SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'$$,
  'storage.objects has no policies (anon / authenticated get nothing)'
);

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner, RLS not applied)
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('a1000000-0000-4000-8000-00000000000a', 'receipt-member@example.test');

INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
  ('receipts', 'a1000000-0000-4000-8000-00000000000a/pgtap-own.png', NULL,
   '{"mimetype":"image/png","size":1}'),
  ('receipts', 'pgtap-legacy-root.png', NULL,
   '{"mimetype":"image/png","size":1}');

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

SELECT is(
  (SELECT count(*)::INT FROM storage.objects WHERE bucket_id = 'receipts'),
  0,
  'anon cannot select or list receipts objects'
);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name)
    VALUES ('receipts', 'pgtap-anon-upload.png')$$,
  '42501', NULL, 'anon cannot insert receipts objects'
);

WITH updated AS (
  UPDATE storage.objects SET metadata = '{}'
  WHERE bucket_id = 'receipts' RETURNING 1
)
SELECT is(count(*)::INT, 0, 'anon cannot update receipts objects')
FROM updated;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- authenticated member (the object owner prefix included)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-00000000000a","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT count(*)::INT FROM storage.objects WHERE bucket_id = 'receipts'),
  0,
  'authenticated cannot select or list receipts objects directly'
);

SELECT is(
  (SELECT count(*)::INT FROM storage.objects
   WHERE bucket_id = 'receipts'
     AND name = 'a1000000-0000-4000-8000-00000000000a/pgtap-own.png'),
  0,
  'authenticated cannot read objects under their own prefix directly'
);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('receipts',
            'a1000000-0000-4000-8000-00000000000a/pgtap-direct-upload.png',
            'a1000000-0000-4000-8000-00000000000a')$$,
  '42501', NULL, 'authenticated cannot insert into their own prefix directly'
);

WITH updated AS (
  UPDATE storage.objects SET metadata = '{}'
  WHERE bucket_id = 'receipts' RETURNING 1
)
SELECT is(count(*)::INT, 0, 'authenticated cannot update receipts objects')
FROM updated;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- service role (upload / cleanup / signing path)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE service_role;

SELECT is(
  (SELECT count(*)::INT FROM storage.objects
   WHERE bucket_id = 'receipts' AND name LIKE '%pgtap-%'),
  2,
  'service role can read receipts objects'
);

SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name)
    VALUES ('receipts',
            'a1000000-0000-4000-8000-00000000000a/pgtap-service-upload.png')$$,
  'service role can insert receipts objects'
);

RESET ROLE;

-- The upload policy must not come back under another command either.
SELECT is(
  (SELECT count(*)::INT FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
  0,
  'no write policy exists on storage.objects'
);

SELECT * FROM finish();
ROLLBACK;
