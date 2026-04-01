-- =============================================================================
-- Schedule Edge Function: update-fiscal-year
-- =============================================================================
-- Uses pg_cron + pg_net to invoke the update-fiscal-year Edge Function
-- every year on March 31 at 15:00 UTC (= April 1 00:00 JST).
--
-- Prerequisites (run manually via Supabase Dashboard > SQL Editor):
--   select vault.create_secret('<SUPABASE_URL>', 'project_url');
--   select vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY>', 'service_role_key');
--
-- NOTE: pg_cron, pg_net, and supabase_vault extensions must be enabled on the
-- hosted Supabase project (they are enabled by default).
-- =============================================================================

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Schedule the cron job: March 31 at 15:00 UTC = April 1 at 00:00 JST
SELECT cron.schedule(
  'update-fiscal-year',
  '0 15 31 3 *',
  $$
  SELECT net.http_post(
    url   := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
             || '/functions/v1/update-fiscal-year',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer '
        || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body  := '{}'::jsonb
  ) AS request_id;
  $$
);
