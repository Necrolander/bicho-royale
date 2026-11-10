import { headers } from 'next/headers';
import { handleMercadoPagoWebhook, verifyMercadoPagoWebhookSignature } from '@/lib/mercadopago';
import { audit } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const h = await headers();
    const url = new URL(req.url);
    const topic = url.searchParams.get('type') || h.get('x-topic');
    const resourceId = url.searchParams.get('data.id') || h.get('x-resource-id');

    if (!topic || !resourceId) {
      return new Response('Missing topic or resource id', { status: 400 });
    }
    if (!verifyMercadoPagoWebhookSignature(h.get('x-signature'), h.get('x-request-id'), resourceId)) {
      return new Response('Invalid webhook signature', { status: 401 });
    }

    if (topic === 'payment') await handleMercadoPagoWebhook(topic, resourceId);

    audit(null, 'MP_WEBHOOK_RECEIVED', { topic, resourceId });
    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Mercado Pago webhook error:', error);
    audit(null, 'MP_WEBHOOK_FAILED', { error: error instanceof Error ? error.message : 'Unknown' });
    return new Response('Error', { status: 500 });
  }
}
