import { headers } from 'next/headers';
import { handleMercadoPagoWebhook } from '@/lib/mercadopago';
import { audit } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request) {
  try {
    const h = await headers();
    const topic = h.get('x-topic') || h.get('X-Topic');
    const resourceId = h.get('x-resource-id') || h.get('X-Resource-Id') || h.get('data.id');

    if (!topic || !resourceId) {
      return new Response('Missing topic or resource id', { status: 400 });
    }

    await handleMercadoPagoWebhook(topic, resourceId);

    audit(null, 'MP_WEBHOOK_RECEIVED', { topic, resourceId });
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Mercado Pago webhook error:', error);
    audit(null, 'MP_WEBHOOK_FAILED', { error: error instanceof Error ? error.message : 'Unknown' });
    return new Response('Error', { status: 500 });
  }
}