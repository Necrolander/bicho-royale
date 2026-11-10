'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <span>♛</span>
      <h1>Uma pausa na experiência.</h1>
      <p>Não foi possível carregar esta tela.</p>
      <button onClick={reset} className="primary">
        Tentar novamente
      </button>
    </main>
  );
}
