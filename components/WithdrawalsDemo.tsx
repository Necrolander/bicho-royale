'use client';
import { Clock3, LockKeyhole, ShieldCheck, Wallet } from 'lucide-react';

export default function WithdrawalsDemo() {
  return (
    <div className="withdrawal-demo-layout">
      <section className="surface withdrawal-demo-hero">
        <div className="withdrawal-demo-icon"><Wallet size={25} /></div>
        <span className="eyebrow">SAQUES · MODO DEMONSTRAÇÃO</span>
        <h2>Solicitações de saque</h2>
        <p>
          Esta página explica como o fluxo funcionaria. No momento, a plataforma não envia pedidos
          de saque nem faz transferências bancárias.
        </p>
        <span className="badge">INDISPONÍVEL NESTA DEMONSTRAÇÃO</span>
      </section>

      <section className="withdrawal-demo-info-grid">
        <article className="surface withdrawal-demo-info">
          <span className="admin-stat-icon"><Clock3 size={19} /></span>
          <div>
            <h3>Prazo informado</h3>
            <strong>Até 24 horas</strong>
            <p>Prazo apenas ilustrativo. Nenhum pedido será processado ou pago por este site.</p>
          </div>
        </article>
        <article className="surface withdrawal-demo-info">
          <span className="admin-stat-icon"><LockKeyhole size={19} /></span>
          <div>
            <h3>CPF e dados bancários</h3>
            <strong>Não solicitados</strong>
            <p>Como não há saque real habilitado, não pedimos nem armazenamos dados pessoais para pagamento.</p>
          </div>
        </article>
      </section>

      <section className="surface withdrawal-demo-status">
        <div className="withdrawal-demo-status-icon"><ShieldCheck size={22} /></div>
        <div>
          <h3>Nenhuma solicitação enviada</h3>
          <p>
            Os pontos exibidos na conta são demonstrativos e não podem ser convertidos em dinheiro.
            Por isso, o formulário de saque está desativado.
          </p>
        </div>
      </section>
    </div>
  );
}
