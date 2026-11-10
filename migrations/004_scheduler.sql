-- Run in the dedicated Supabase SQL editor after the Vercel deployment is live.
-- The endpoint advances and publishes due rounds; it does not need credentials.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'bicho-royale-advance',
  '30 seconds',
  $$SELECT net.http_get(
    url := 'https://bichos-vegas.vercel.app/api/health',
    timeout_milliseconds := 15000
  )$$
);
