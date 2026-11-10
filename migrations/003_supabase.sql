-- Run in the dedicated bicho-royale Supabase project's SQL editor.
CREATE TABLE IF NOT EXISTS roles (name TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE,password_hash TEXT,role TEXT NOT NULL REFERENCES roles(name),blocked INTEGER NOT NULL DEFAULT 0,points INTEGER NOT NULL DEFAULT 1000 CHECK(points>=0),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS animals(id INTEGER PRIMARY KEY CHECK(id BETWEEN 1 AND 25),name TEXT NOT NULL,tens TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS modes(id TEXT PRIMARY KEY,definition TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rounds(id TEXT PRIMARY KEY,type TEXT NOT NULL CHECK(type IN ('ROULETTE','TRADITIONAL')),state TEXT NOT NULL CHECK(state IN ('SCHEDULED','OPEN','LOCKED','DRAWING','PUBLISHED','CANCELLED')),opens_at TEXT NOT NULL,locks_at TEXT NOT NULL,published_at TEXT,seed TEXT NOT NULL,commitment TEXT NOT NULL,result TEXT,rules TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS draw_results(round_id TEXT PRIMARY KEY REFERENCES rounds(id),result TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),round_id TEXT NOT NULL REFERENCES rounds(id),mode TEXT NOT NULL REFERENCES modes(id),selection TEXT NOT NULL,points INTEGER NOT NULL CHECK(points>0),idempotency_key TEXT NOT NULL,outcome TEXT,created_at TEXT NOT NULL,UNIQUE(user_id,idempotency_key));
CREATE TABLE IF NOT EXISTS transactions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),entry_id TEXT UNIQUE REFERENCES entries(id),amount INTEGER NOT NULL,balance INTEGER NOT NULL CHECK(balance>=0),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS entry_rules(entry_id TEXT PRIMARY KEY REFERENCES entries(id),positions TEXT NOT NULL,rules TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),message TEXT NOT NULL,read INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS preferences(user_id TEXT PRIMARY KEY REFERENCES users(id),value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs(seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,id TEXT UNIQUE NOT NULL,actor TEXT,action TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS content_pages(slug TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS external_draws(round_id TEXT PRIMARY KEY REFERENCES rounds(id),video_id TEXT NOT NULL,video_url TEXT NOT NULL,numbers TEXT,published_at TEXT);
CREATE TABLE IF NOT EXISTS efi_configs(id INTEGER PRIMARY KEY CHECK(id=1),encrypted TEXT NOT NULL,environment TEXT NOT NULL,pix_key_hint TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pix_deposits(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),txid TEXT UNIQUE NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),status TEXT NOT NULL,copy_paste TEXT,created_at TEXT NOT NULL,confirmed_at TEXT,e2e_id TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS scratch_cards(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),idempotency_key TEXT NOT NULL,price_points INTEGER NOT NULL,prize_points INTEGER NOT NULL,prize_label TEXT NOT NULL,created_at TEXT NOT NULL,game_id TEXT,UNIQUE(user_id,idempotency_key));
CREATE INDEX IF NOT EXISTS idx_scratch_user_created ON scratch_cards(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_round_state ON rounds(state,locks_at);
CREATE INDEX IF NOT EXISTS idx_entry_user ON entries(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_entry_round ON entries(round_id);
CREATE INDEX IF NOT EXISTS idx_session_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_notify_user ON notifications(user_id,created_at);

CREATE OR REPLACE FUNCTION royale_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'This record is immutable'; END $$;
CREATE OR REPLACE FUNCTION royale_published_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF OLD.state='PUBLISHED' THEN RAISE EXCEPTION 'Published round is immutable'; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS immutable_published ON rounds;
CREATE TRIGGER immutable_published BEFORE UPDATE ON rounds FOR EACH ROW EXECUTE FUNCTION royale_published_immutable();
DROP TRIGGER IF EXISTS immutable_result ON draw_results;
CREATE TRIGGER immutable_result BEFORE UPDATE OR DELETE ON draw_results FOR EACH ROW EXECUTE FUNCTION royale_immutable();
DROP TRIGGER IF EXISTS immutable_entry_rules ON entry_rules;
CREATE TRIGGER immutable_entry_rules BEFORE UPDATE OR DELETE ON entry_rules FOR EACH ROW EXECUTE FUNCTION royale_immutable();
DROP TRIGGER IF EXISTS immutable_audit ON audit_logs;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION royale_immutable();

-- The application uses its private server-side Postgres connection; no table is
-- readable or writable using a browser-facing anon/authenticated API key.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['roles','users','sessions','animals','modes','rounds','draw_results','entries','transactions','entry_rules','notifications','preferences','settings','audit_logs','content_pages','rate_limits','external_draws','efi_configs','pix_deposits','scratch_cards'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
