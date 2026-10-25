-- One row per bucket/key/fixed window; concurrent hits increment atomically.
CREATE TABLE public.rate_limit_hits (
  bucket text NOT NULL,
  key_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  reset_at timestamptz NOT NULL,
  count integer NOT NULL CHECK (count > 0),
  PRIMARY KEY (bucket, key_hash, window_start)
);

CREATE INDEX rate_limit_hits_expiry_idx ON public.rate_limit_hits (bucket, reset_at);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- No policies: browser roles cannot access counters. Only trusted server code
-- may invoke the function; service_role also needs targeted E2E cleanup access.
REVOKE ALL ON TABLE public.rate_limit_hits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rate_limit_hits TO service_role;

CREATE FUNCTION public.rate_limit_hit(
  p_bucket text, p_key text, p_max integer, p_window_seconds integer
)
RETURNS TABLE (allowed boolean, remaining integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_start timestamptz;
  v_reset timestamptz;
  v_count integer;
BEGIN
  IF p_bucket IS NULL OR p_bucket = '' OR p_key IS NULL OR p_key = ''
     OR p_max IS NULL OR p_max < 1 OR p_max = 2147483647
     OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters' USING ERRCODE = '22023';
  END IF;

  v_start := pg_catalog.to_timestamp(
    floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds
  );
  v_reset := v_start + pg_catalog.make_interval(secs => p_window_seconds);

  INSERT INTO public.rate_limit_hits AS hits (bucket, key_hash, window_start, reset_at, count)
  VALUES (
    p_bucket,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_key, 'UTF8')), 'hex'),
    v_start, v_reset, 1
  )
  ON CONFLICT (bucket, key_hash, window_start) DO UPDATE SET
    count = least(hits.count, p_max) + 1
  RETURNING hits.count INTO v_count;

  -- Reap at most 100 expired keys per hit, indexed by bucket/expiry. SKIP LOCKED
  -- avoids waiting on concurrent requests. Idle buckets retain expired hashes
  -- until their next hit. A separate row per window prevents delayed requests
  -- from overwriting a newer window's count at a boundary.
  DELETE FROM public.rate_limit_hits AS hits
  WHERE hits.ctid IN (
    SELECT expired.ctid FROM public.rate_limit_hits AS expired
    WHERE expired.bucket = p_bucket AND expired.reset_at <= v_now
    LIMIT 100 FOR UPDATE SKIP LOCKED
  );

  RETURN QUERY SELECT v_count <= p_max, greatest(p_max - v_count, 0), v_reset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rate_limit_hit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, text, integer, integer)
  TO service_role;
