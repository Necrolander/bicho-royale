-- Mercado Pago configuration and transparent checkout deposit records.
-- Apply to the Supabase database used by the production project.
CREATE TABLE IF NOT EXISTS public.mercadopago_configs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  encrypted TEXT NOT NULL,
  environment TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.mercadopago_deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id),
  external_reference TEXT UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL,
  init_point TEXT,
  sandbox_init_point TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  payment_id TEXT,
  qr_code TEXT,
  qr_code_base64 TEXT,
  ticket_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_mp_user
  ON public.mercadopago_deposits(user_id, created_at);

ALTER TABLE public.mercadopago_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadopago_deposits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercadopago_configs, public.mercadopago_deposits FROM anon, authenticated;
