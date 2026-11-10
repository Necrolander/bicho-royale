-- Aditiva: não modifica nem remove bilhetes anteriores.
CREATE TABLE IF NOT EXISTS entry_rules(entry_id TEXT PRIMARY KEY REFERENCES entries(id),positions TEXT NOT NULL,rules TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS immutable_entry_rules_update BEFORE UPDATE ON entry_rules BEGIN SELECT RAISE(ABORT,'Ticket rules are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_entry_rules_delete BEFORE DELETE ON entry_rules BEGIN SELECT RAISE(ABORT,'Ticket rules are immutable'); END;
