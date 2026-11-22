'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock3, Copy, RefreshCw, Search, Wallet, X } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { api } from './Royale';

type Withdrawal = {
  id: string; name: string; email: string | null; cpf: string; pix_key: string | null;
  amount_cents: number; status: string; created_at: string; processed_at: string | null; admin_note: string | null;
};
const dates = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const labels: Record<string, string> = { PENDING: 'Pendente', APPROVED: 'Pago', REJECTED: 'Rejeitado' };
const deadline = (item: Withdrawal) => new Date(new Date(item.created_at).getTime() + 86400000);
const cpfLabel = (cpf: string) => cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

export default function AdminWithdrawals() {
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('PENDING');
  const [now, setNow] = useState(Date.now());
  const [selection, setSelection] = useState<{ item: Withdrawal; action: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api('admin/withdrawals')); setError(''); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, [load]);
  useEffect(() => {
    if (!selection || saving) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelection(null); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [selection, saving]);
  const pending = items.filter((item) => item.status === 'PENDING');
  const overdue = pending.filter((item) => deadline(item).getTime() <= now);
  const query = search.trim().toLowerCase();
  const digits = query.replace(/\D/g, '');
  const visible = items.filter((item) =>
    (filter === 'ALL' || (filter === 'OVERDUE' ? item.status === 'PENDING' && deadline(item).getTime() <= now : item.status === filter)) &&
    (!query || `${item.name} ${item.email || ''} ${item.id}`.toLowerCase().includes(query) || (digits.length > 0 && item.cpf.replace(/\D/g, '').includes(digits))),
  ).sort((a, b) => a.status === 'PENDING' && b.status === 'PENDING' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setMessage('Copiado para a área de transferência.'); }
    catch { setMessage('Selecione o texto e copie manualmente.'); }
  };
  const submit = async () => {
    if (!selection || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await api('admin/withdrawals', { id: selection.item.id, action: selection.action, adminNote: note.trim() || 'Pix enviado manualmente pelo administrador' });
      setMessage(selection.action === 'approve' ? 'Pagamento registrado com sucesso.' : 'Saque rejeitado. O valor retornou ao saldo do cliente.');
      setSelection(null);
      await load();
    } catch (e) { setMessage((e as Error).message); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <div className="aw-panel">
    <section className="surface aw-heading"><div><span className="eyebrow">GESTÃO DE PAGAMENTOS</span><h2>Saques via Pix</h2><p>Pagamento manual em até 24 horas. Saque mínimo de R$ 20,00.</p></div><button className="secondary" disabled={loading || saving} onClick={() => void load()}><RefreshCw size={15} />{loading ? 'Atualizando…' : 'Atualizar'}</button></section>
    <div className="aw-metrics">
      <article className="surface"><Wallet size={20} /><small>Valor pendente</small><strong>{formatBRL(pending.reduce((sum, item) => sum + item.amount_cents, 0))}</strong><span>{pending.length} solicitações para pagar</span></article>
      <article className="surface"><Clock3 size={20} /><small>Prazo ultrapassado</small><strong>{overdue.length}</strong><span>Solicitações com mais de 24 horas</span></article>
      <article className="surface"><CheckCircle2 size={20} /><small>Pagamentos registrados</small><strong>{formatBRL(items.filter((item) => item.status === 'APPROVED').reduce((sum, item) => sum + item.amount_cents, 0))}</strong><span>Valores da lista carregada</span></article>
    </div>
    <section className="surface aw-list">
      <div className="aw-filters"><label><Search size={16} /><input aria-label="Buscar saques" placeholder="Buscar nome, e-mail ou CPF" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filtrar por status" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="PENDING">Pendentes</option><option value="OVERDUE">Prazo ultrapassado</option><option value="APPROVED">Pagos</option><option value="REJECTED">Rejeitados</option><option value="ALL">Todos</option></select></div>
      <p className="aw-list-caption">{visible.length} solicitações exibidas · até 200 registros mais recentes · horários de Brasília</p>
      {error && <p className="aw-error" role="alert">{error} <button onClick={() => void load()}>Tentar novamente</button></p>}
      {message && <p className="aw-feedback" role="status">{message}</p>}
      <div className="scroll-table"><table className="aw-table"><thead><tr><th>Cliente / solicitação</th><th>CPF / destino Pix</th><th>Valor</th><th>Status</th><th>Prazo de 24 horas</th><th>Ações</th></tr></thead><tbody>
        {visible.map((item) => { const late = item.status === 'PENDING' && deadline(item).getTime() <= now; return <tr key={item.id}>
          <td><b>{item.name}</b><small>{item.email || 'Sem e-mail'}</small><small>{dates.format(new Date(item.created_at))}</small><small title={item.id}>Pedido #{item.id.slice(0, 8)}</small></td>
          <td><code>{cpfLabel(item.cpf)}</code><button className="aw-copy" onClick={() => void copy(item.cpf)}><Copy size={12} />Copiar CPF</button>{item.pix_key && item.pix_key !== item.cpf && <><small>Chave Pix informada</small><code>{item.pix_key}</code><button className="aw-copy" onClick={() => void copy(item.pix_key!)}>Copiar chave</button></>}</td>
          <td><strong className="aw-amount">{formatBRL(item.amount_cents)}</strong></td>
          <td><span className={`withdrawal-status withdrawal-status-${item.status.toLowerCase()}`}>{labels[item.status] || item.status}</span>{item.processed_at && <small>Processado em {dates.format(new Date(item.processed_at))}</small>}</td>
          <td><time dateTime={deadline(item).toISOString()}>{dates.format(deadline(item))}</time>{item.status === 'PENDING' && <small className={late ? 'aw-late' : 'aw-on-time'}>{late ? 'Prazo ultrapassado' : 'Dentro do prazo'}</small>}</td>
          <td>{item.status === 'PENDING' ? <div className="aw-actions"><button className="primary" disabled={saving} onClick={() => { setNote(''); setMessage(''); setSelection({item, action:'approve'}); }}><CheckCircle2 size={14} />Marcar como pago</button><button className="secondary" disabled={saving} onClick={() => { setNote(''); setMessage(''); setSelection({item, action:'reject'}); }}>Rejeitar</button></div> : <span className="aw-finished">{item.status === 'APPROVED' ? 'Pagamento registrado' : 'Valor devolvido'}</span>}{item.admin_note && <small className="aw-note">{item.admin_note}</small>}</td>
        </tr>; })}
      </tbody></table></div>
      {!loading && !error && visible.length === 0 && <div className="aw-empty"><Wallet size={28} /><b>Nenhum saque encontrado</b><p>Altere os filtros ou aguarde uma nova solicitação.</p></div>}
    </section>
    {selection && <div className="modal-backdrop"><section className="modal surface aw-confirm" role="dialog" aria-modal="true" aria-label={selection.action === 'approve' ? 'Confirmar pagamento' : 'Rejeitar saque'}><button className="modal-close icon-button" aria-label="Fechar" disabled={saving} onClick={() => setSelection(null)}><X /></button><h2>{selection.action === 'approve' ? 'Registrar pagamento' : 'Rejeitar solicitação'}</h2><p>{selection.item.name} · {formatBRL(selection.item.amount_cents)}</p><p>CPF {cpfLabel(selection.item.cpf)}</p><p>{selection.action === 'approve' ? 'Confirme somente após enviar o Pix ao destino informado.' : 'O valor reservado será devolvido ao saldo do cliente.'}</p><form onSubmit={(event) => { event.preventDefault(); void submit(); }}><label className="field">{selection.action === 'approve' ? 'Observação ou referência do comprovante (opcional)' : 'Motivo da rejeição'}<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} required={selection.action === 'reject'} rows={3} /></label><div className="aw-actions"><button className="primary" disabled={saving || (selection.action === 'reject' && !note.trim())}>{saving ? 'Registrando…' : selection.action === 'approve' ? 'Confirmar Pix enviado' : 'Rejeitar e devolver saldo'}</button><button type="button" className="secondary" disabled={saving} onClick={() => setSelection(null)}>Cancelar</button></div></form>{message && <p role="alert">{message}</p>}</section></div>}
  </div>;
}
