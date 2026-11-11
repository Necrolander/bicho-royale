BEGIN;
CREATE TABLE IF NOT EXISTS public.referrals (
  invitee_id TEXT PRIMARY KEY REFERENCES public.users(id),
  referrer_id TEXT NOT NULL REFERENCES public.users(id),
  reward_cents INTEGER NOT NULL CHECK (reward_cents > 0),
  created_at TEXT NOT NULL,
  CHECK (invitee_id <> referrer_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id, created_at);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
COMMIT;
