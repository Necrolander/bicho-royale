-- Add account profile fields required by registration and CPF-based flows.
-- Safe to apply to existing production databases more than once.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cpf TEXT UNIQUE;
