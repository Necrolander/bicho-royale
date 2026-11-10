-- Track which configurable scratch card was played for historical admin reports.
-- Existing records keep NULL and remain visible as cards without an identified game.
CREATE TABLE IF NOT EXISTS public.scratch_cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id),
  idempotency_key TEXT NOT NULL,
  price_points INTEGER NOT NULL,
  prize_points INTEGER NOT NULL,
  prize_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  game_id TEXT,
  UNIQUE(user_id, idempotency_key)
);
ALTER TABLE public.scratch_cards ADD COLUMN IF NOT EXISTS game_id TEXT;
CREATE INDEX IF NOT EXISTS idx_scratch_user_created ON public.scratch_cards(user_id, created_at);
ALTER TABLE public.scratch_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scratch_cards FROM anon, authenticated;
