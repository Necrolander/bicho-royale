import { all, one, type Row } from './db';
import { ApiError } from './auth';
import { allowedPositions, type ModeId } from './game';
import { publicRound } from './rounds';
export function ticketReceipt(entry: Row) {
  const round = one('SELECT * FROM rounds WHERE id=?', String(entry.round_id))!;
  const snapshot = one('SELECT * FROM entry_rules WHERE entry_id=?', String(entry.id));
  const rules = JSON.parse(String(snapshot?.rules || round.rules));
  return {
    ...entry,
    selection: JSON.parse(String(entry.selection)),
    outcome: entry.outcome ? JSON.parse(String(entry.outcome)) : null,
    positions: snapshot
      ? JSON.parse(String(snapshot.positions))
      : allowedPositions(entry.mode as ModeId, rules),
    rules,
    type: round.type,
    status: entry.outcome ? 'CONFERIDO' : round.state === 'CANCELLED' ? 'CANCELADO' : 'AGUARDANDO',
    round: publicRound(round),
  };
}
export function ownTicket(userId: string, id: string) {
  const entry = one('SELECT * FROM entries WHERE id=? AND user_id=?', id, userId);
  if (!entry) throw new ApiError(404, 'Bilhete não encontrado nesta conta');
  return ticketReceipt(entry);
}
export function ownTickets(userId: string) {
  return all('SELECT * FROM entries WHERE user_id=? ORDER BY created_at DESC', userId).map(
    ticketReceipt,
  );
}
