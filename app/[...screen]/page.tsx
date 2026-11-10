import { redirect } from 'next/navigation';
import Royale from '@/components/Royale';
export default async function Page({ params }: { params: Promise<{ screen: string[] }> }) {
  const path = '/' + (await params).screen.join('/');
  if (path === '/inicio' || path === '/admin' || path.startsWith('/admin/') || path === '/depositar' || path === '/saques') return <Royale />;
  redirect('/roleta');
}
