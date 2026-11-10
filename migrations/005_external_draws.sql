CREATE TABLE IF NOT EXISTS public.external_draws(
  round_id TEXT PRIMARY KEY REFERENCES public.rounds(id),
  video_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  numbers TEXT,
  published_at TEXT
);
ALTER TABLE public.external_draws ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_draws FROM anon, authenticated;
