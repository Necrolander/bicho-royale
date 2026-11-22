-- Migration 012: Track credited deposits to ensure deposits accurately add to user points balance.
ALTER TABLE public.mercadopago_deposits ADD COLUMN IF NOT EXISTS credited_at TEXT;
ALTER TABLE public.pix_deposits ADD COLUMN IF NOT EXISTS credited_at TEXT;
