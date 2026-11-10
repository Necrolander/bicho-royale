BEGIN;

CREATE TABLE IF NOT EXISTS public.withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'PENDING',
  cpf TEXT NOT NULL,
  pix_key TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT,
  admin_id TEXT,
  admin_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON public.withdrawals(user_id, created_at);
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

COMMIT;
