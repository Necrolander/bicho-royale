CREATE TABLE IF NOT EXISTS public.efi_configs(id INTEGER PRIMARY KEY CHECK(id=1),encrypted TEXT NOT NULL,environment TEXT NOT NULL,pix_key_hint TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS public.pix_deposits(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES public.users(id),txid TEXT UNIQUE NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),status TEXT NOT NULL,copy_paste TEXT,created_at TEXT NOT NULL,confirmed_at TEXT,e2e_id TEXT UNIQUE);
CREATE INDEX IF NOT EXISTS idx_pix_user ON public.pix_deposits(user_id,created_at);
ALTER TABLE public.efi_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pix_deposits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.efi_configs, public.pix_deposits FROM anon, authenticated;
