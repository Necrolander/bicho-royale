'use client';
import { formatBRL } from '@/lib/money';

import { ArrowDownRight, ArrowRight, CircleHelp, Clock3, Coins, Gamepad2, ShieldCheck, Wallet } from 'lucide-react';

type Props = {
  points: number;
  onNavigate: (page: 'roulette' | 'scratch' | 'rules') => void;
};

export default function WithdrawalsDemo({ points, onNavigate }: Props) {
  return (
    <div className="withdrawal-demo-layout">
      <section className="surface withdrawal-demo-hero">
        <div className="withdrawal-demo-heading">
          <div className="withdrawal-demo-icon"><Wallet size={24} /></div>
          <span className="withdrawal-demo-status-pill"><span /> INATIVO</span>
        </div>
        <span className="eyebrow">SUA CARTEIRA</span>
        <h2>Seus R$ são para jogar.</h2>
        <p>
          O saldo é usado nos jogos. Não há
          solicitação de saque ou transferência bancária disponível.
        </p>
        <div className="withdrawal-demo-balance">
          <span><Coins size={16} /> SALDO PARA JOGAR</span>
          <strong>{formatBRL(points)} <small>saldo</small></strong>
          <span className="withdrawal-demo-no-cash"><ArrowDownRight size={14} /> Sem valor monetário</span>
        </div>
      </section>

      <section className="withdrawal-demo-info-grid">
        <article className="surface withdrawal-demo-info">
          <span className="admin-stat-icon"><Clock3 size={19} /></span>
          <div>
            <h3>Prazo de pagamento</h3>
            <strong>Não se aplica</strong>
            <p>O prazo de pagamento se aplica quando os saques estão disponíveis.</p>
          </div>
        </article>
        <article className="surface withdrawal-demo-info">
          <span className="admin-stat-icon"><ShieldCheck size={19} /></span>
          <div>
            <h3>Seus dados pessoais</h3>
            <strong>Não solicitados</strong>
            <p>Não pedimos CPF ou dados bancários para um saque que não está disponível.</p>
          </div>
        </article>
      </section>

      <section className="surface withdrawal-demo-next">
        <div className="withdrawal-demo-next-icon"><Gamepad2 size={20} /></div>
        <div className="withdrawal-demo-next-copy">
          <span className="eyebrow">CONTINUE A EXPERIÊNCIA</span>
          <h3>Use seus R$ nas jogos</h3>
          <p>Escolha entre a roletinha e as raspadinhas.</p>
        </div>
        <div className="withdrawal-demo-actions">
          <button className="primary" onClick={() => onNavigate('roulette')}>Abrir roletinha <ArrowRight size={15} /></button>
          <button className="secondary" onClick={() => onNavigate('scratch')}>Ver raspadinhas</button>
        </div>
      </section>

      <section className="surface withdrawal-demo-faq">
        <div className="withdrawal-demo-faq-heading"><CircleHelp size={18} /><h3>Dúvidas sobre saques</h3></div>
        <details>
          <summary>Posso pedir um saque ou cadastrar meu CPF?</summary>
          <p>Não. Os saques estão indisponíveis.</p>
        </details>
        <details>
          <summary>Os R$ podem ser convertidos em dinheiro?</summary>
          <p>Não. O saldo pode ser usado nos jogos.</p>
        </details>
        <details>
          <summary>O prazo de até 24 horas está valendo?</summary>
          <p>Não. Como não há processamento de saques, nenhum prazo de transferência está ativo.</p>
        </details>
        <button className="withdrawal-demo-rules" onClick={() => onNavigate('rules')}>Consultar regras <ArrowRight size={14} /></button>
      </section>
    </div>
  );
}
