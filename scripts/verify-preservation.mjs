import { DatabaseSync } from 'node:sqlite';
const current = new DatabaseSync('data/bicho-royale.sqlite', { readOnly: true });
const previous = new DatabaseSync(
  'data/before-traditional-expansion-2026-10-09T19-01-53-597Z.sqlite',
  { readOnly: true },
);
const missing = {};
for (const table of ['users', 'rounds', 'entries', 'transactions']) {
  const lookup = current.prepare(`SELECT id FROM ${table} WHERE id=?`);
  missing[table] = previous
    .prepare(`SELECT id FROM ${table}`)
    .all()
    .filter((row) => !lookup.get(row.id)).length;
}
console.log(
  JSON.stringify({
    integrity: current.prepare('PRAGMA integrity_check').get(),
    missing,
    ticketSchema: !!current
      .prepare("SELECT name FROM sqlite_master WHERE name='entry_rules'")
      .get(),
  }),
);
current.close();
previous.close();
