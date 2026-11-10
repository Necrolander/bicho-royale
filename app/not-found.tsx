import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="error-page">
      <span>♛</span>
      <h1>Este caminho ainda não foi sorteado.</h1>
      <p>Página não encontrada.</p>
      <Link href="/" className="button primary">
        Voltar ao Bichos Vegas
      </Link>
    </main>
  );
}
