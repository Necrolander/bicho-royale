'use client';

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
        <span className="eyebrow">SUA CARTEIRA · MODO DEMONSTRAÇÃO</span>
        <h2>Seus créditos são para jogar.</h2>
        <p>
          Esta versão do Bichos Vegas usa créditos fictícios. Não existe conversão para reais,
          solicitação de saque ou transferência bancária disponível.
        </p>
        <div className="withdrawal-demo-balance">
          <span><Coins size={16} /> SALDO VIRTUAL</span>
          <strong>{points.toLocaleString('pt-BR')} <small>créditos</small></strong>
          <span className="withdrawal-demo-no-cash"><ArrowDownRight size={14} /> Sem valor monetário</span>
        </div>
      </section>

      <section className="withdrawal-demo-info-grid">
        <article className="surface withdrawal-demo-info">
          <span className="admin-stat-icon"><Clock3 size={19} /></span>
          <div>
            <h3>Prazo de pagamento</h3>
            <strong>Não se aplica</strong>
            <p>Não há pagamentos ou prazo de 24 horas ativo nesta demonstração.</p>
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
          <h3>Use seus créditos nas modalidades demonstrativas</h3>
          <p>Escolha um jogo para ver como a plataforma funciona. Os resultados e créditos não envolvem dinheiro real.</p>
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
          <p>Não. A função de saque está inativa e o site não coleta informações de pagamento nesta demonstração.</p>
        </details>
        <details>
          <summary>Os créditos podem ser convertidos em dinheiro?</summary>
          <p>Não. Eles servem apenas para demonstrar as telas e mecânicas do sistema e não têm valor monetário.</p>
        </details>
        <details>
          <summary>O prazo de até 24 horas está valendo?</summary>
          <p>Não. Como não há processamento de saques, nenhum prazo de transferência está ativo.</p>
        </details>
        <button className="withdrawal-demo-rules" onClick={() => onNavigate('rules')}>Consultar regras da demonstração <ArrowRight size={14} /></button>
      </section>
    </div>
  );
}
