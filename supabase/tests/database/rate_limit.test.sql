BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(26);

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.rate_limit_hits'::regclass),
  true, 'rate limit table has RLS enabled'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policies WHERE schemaname = 'public' AND tablename = 'rate_limit_hits'),
  0, 'rate limit table has no policies'
);
SELECT is(
  (SELECT proconfig FROM pg_proc WHERE oid = 'public.rate_limit_hit(text,text,integer,integer)'::regprocedure),
  ARRAY['search_path=""'], 'definer function has an empty search path'
);
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.rate_limit_hit(text,text,integer,integer)'::regprocedure),
  'rate limit function executes with definer privileges'
);

SET LOCAL ROLE service_role;
SELECT results_eq(
  $$SELECT allowed, remaining FROM public.rate_limit_hit('pgtap-login', 'raw-key-9900001', 2, 900)$$,
  $$VALUES (true, 1)$$, 'first hit is allowed with one attempt remaining'
);
SELECT results_eq(
  $$SELECT allowed, remaining FROM public.rate_limit_hit('pgtap-login', 'raw-key-9900001', 2, 900)$$,
  $$VALUES (true, 0)$$, 'hit at the limit is allowed'
);
SELECT results_eq(
  $$SELECT allowed, remaining FROM public.rate_limit_hit('pgtap-login', 'raw-key-9900001', 2, 900)$$,
  $$VALUES (false, 0)$$, 'hit after the limit is blocked'
);
SELECT results_eq(
  $$SELECT allowed, remaining FROM public.rate_limit_hit('pgtap-login', 'raw-key-9900001', 2, 900)$$,
  $$VALUES (false, 0)$$, 'subsequent hits stay blocked'
);
SELECT is(
  (SELECT count FROM public.rate_limit_hits WHERE bucket = 'pgtap-login'),
  3, 'counter saturates at max plus one'
);
SELECT is(
  (SELECT key_hash FROM public.rate_limit_hits WHERE bucket = 'pgtap-login'),
  encode(sha256(convert_to('raw-key-9900001', 'UTF8')), 'hex'), 'stored key is SHA-256'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.rate_limit_hits AS hits WHERE row_to_json(hits)::text LIKE '%raw-key-9900001%'),
  'raw key is absent from the entire stored row'
);
SELECT is(
  (SELECT window_start FROM public.rate_limit_hits WHERE bucket = 'pgtap-login'),
  to_timestamp(floor(extract(epoch FROM statement_timestamp()) / 900) * 900),
  'window starts on a fixed epoch boundary'
);
SELECT is(
  (SELECT reset_at - window_start FROM public.rate_limit_hits WHERE bucket = 'pgtap-login'),
  interval '15 minutes', 'reset time is exactly one window after the start'
);

-- Advance the stored window into the past without sleeping or changing the DB clock.
UPDATE public.rate_limit_hits SET window_start = window_start - interval '15 minutes',
  reset_at = reset_at - interval '15 minutes' WHERE bucket = 'pgtap-login';
SELECT results_eq(
  $$SELECT allowed, remaining FROM public.rate_limit_hit('pgtap-login', 'raw-key-9900001', 2, 900)$$,
  $$VALUES (true, 1)$$, 'a new window resets the counter'
);
SELECT is(
  (SELECT count(*)::integer FROM public.rate_limit_hits WHERE bucket = 'pgtap-login'),
  1, 'a new window replaces the expired row through bounded cleanup'
);
-- A delayed hit assigned to the current window cannot overwrite another window.
INSERT INTO public.rate_limit_hits (bucket, key_hash, window_start, reset_at, count)
SELECT bucket, key_hash, window_start + interval '15 minutes', reset_at + interval '15 minutes', 2
FROM public.rate_limit_hits WHERE bucket = 'pgtap-login';
DO $$ BEGIN
  PERFORM public.rate_limit_hit('pgtap-login', 'raw-key-9900001', 2, 900);
END $$;
SELECT is(
  (SELECT count FROM public.rate_limit_hits WHERE bucket = 'pgtap-login'
   ORDER BY window_start DESC LIMIT 1),
  2, 'hits from an earlier window leave a later window unchanged'
);
SELECT results_eq(
  $$SELECT allowed, remaining FROM public.rate_limit_hit('pgtap-other', 'raw-key-9900001', 2, 900)$$,
  $$VALUES (true, 1)$$, 'buckets are independent for the same key'
);
SELECT results_eq(
  $$SELECT allowed, remaining FROM public.rate_limit_hit('pgtap-login', 'another-key', 2, 900)$$,
  $$VALUES (true, 1)$$, 'keys are independent in the same bucket'
);
SELECT throws_ok(
  $$SELECT * FROM public.rate_limit_hit('pgtap-login', 'key', 0, 900)$$,
  '22023', 'Invalid rate limit parameters', 'invalid parameters are rejected'
);

-- Bounded cleanup leaves active rows alone and removes at most 100 expired rows.
INSERT INTO public.rate_limit_hits (bucket, key_hash, window_start, reset_at, count)
SELECT 'pgtap-cleanup', encode(sha256(convert_to(i::text, 'UTF8')), 'hex'),
  statement_timestamp() - interval '2 hours', statement_timestamp() - interval '1 hour', 1
FROM generate_series(1, 105) AS i;
DO $$ BEGIN
  PERFORM public.rate_limit_hit('pgtap-cleanup', 'active-key', 2, 900);
END $$;
SELECT is(
  (SELECT count(*)::integer FROM public.rate_limit_hits WHERE bucket = 'pgtap-cleanup'),
  6, 'cleanup removes at most 100 expired keys and retains the active key'
);
DO $$ BEGIN
  PERFORM public.rate_limit_hit('pgtap-cleanup', 'active-key', 2, 900);
END $$;
SELECT is(
  (SELECT count(*)::integer FROM public.rate_limit_hits WHERE bucket = 'pgtap-cleanup'),
  1, 'subsequent hit removes remaining expired keys'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.rate_limit_hit('pgtap-login', 'key', 2, 900)$$,
  '42501', NULL, 'anon cannot execute the function'
);
SELECT throws_ok(
  $$SELECT * FROM public.rate_limit_hits$$,
  '42501', NULL, 'anon cannot read the table'
);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.rate_limit_hit('pgtap-login', 'key', 2, 900)$$,
  '42501', NULL, 'authenticated cannot execute the function'
);
SELECT throws_ok(
  $$SELECT * FROM public.rate_limit_hits$$,
  '42501', NULL, 'authenticated cannot read the table'
);
RESET ROLE;
SELECT ok(
  NOT has_function_privilege('public', 'public.rate_limit_hit(text,text,integer,integer)', 'EXECUTE'),
  'PUBLIC cannot execute the function'
);

SELECT * FROM finish();
ROLLBACK;
