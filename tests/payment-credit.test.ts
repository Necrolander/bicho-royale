import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
const provider=vi.hoisted(()=>({payments:new Map<string,Record<string,unknown>>(),status:'pending',overrides:{} as Record<string,unknown>,counter:10000}));
vi.mock('node:https',()=>({default:{request:(options:{method:string;path:string},callback:(response:EventEmitter & {statusCode:number})=>void)=>{
  const request=new EventEmitter();
  return Object.assign(request,{
    end(body:string){queueMicrotask(()=>{
      let payment:Record<string,unknown>;
      if(options.method==='POST') {
        const input=JSON.parse(body);
        const id=String(++provider.counter);
        payment={...input,id,status:provider.status,currency_id:'BRL',...provider.overrides};
        provider.payments.set(id,payment);
      } else payment=provider.payments.get(options.path.split('/').pop()!) || {};
      const response=Object.assign(new EventEmitter(),{statusCode:200});callback(response);
      response.emit('data',Buffer.from(JSON.stringify(payment)));response.emit('end');
    });},
    destroy(error:Error){request.emit('error',error);},
  });
}}}));
process.env.DATABASE_PATH=`data/payment-credit-${randomUUID()}.sqlite`;
const {one,all,run,db}=await import('../lib/db');
const {createUser}=await import('../lib/auth');
const {createMercadoPagoPayment,saveMercadoPagoConfig,refreshMercadoPagoDeposit,handleMercadoPagoWebhook,reconcileUncreditedDeposits}=await import('../lib/mercadopago');
const previous={key:process.env.MERCADOPAGO_CONFIG_KEY,enabled:process.env.MERCADOPAGO_PAYMENTS_ENABLED};
let owner:string,other:string;
beforeAll(()=>{
  process.env.MERCADOPAGO_CONFIG_KEY=Buffer.alloc(32,19).toString('base64');
  process.env.MERCADOPAGO_PAYMENTS_ENABLED='true';
});
beforeEach(()=>{
  provider.status='pending';provider.overrides={};provider.payments.clear();
  owner=createUser('Titular do depósito',randomUUID()+'@example.test','local-password-123');
  other=createUser('Outra conta',randomUUID()+'@example.test','local-password-123');
  run('UPDATE users SET cpf=? WHERE id=?','52998224725',owner);
  saveMercadoPagoConfig({accessToken:'TEST-local-only',publicKey:'TEST-local-only',webhookSecret:'local-webhook-secret',environment:'sandbox'},owner);
});
afterAll(()=>{
  if(previous.key===undefined)delete process.env.MERCADOPAGO_CONFIG_KEY;else process.env.MERCADOPAGO_CONFIG_KEY=previous.key;
  if(previous.enabled===undefined)delete process.env.MERCADOPAGO_PAYMENTS_ENABLED;else process.env.MERCADOPAGO_PAYMENTS_ENABLED=previous.enabled;
});
const balance=(id=owner)=>Number(one('SELECT points FROM users WHERE id=?',id)?.points);
const ledger=()=>all('SELECT * FROM transactions WHERE user_id=? AND amount=?',owner,1234);
const releaseCpf=()=>run('UPDATE users SET cpf=NULL WHERE id=?',owner);

describe.each(['pix','credit_card','boleto'] as const)('crédito após aprovação de %s',(method)=>{
  const create=()=>createMercadoPagoPayment(owner,1234,method,'titular@example.test',method==='credit_card'?'token-local-only':undefined,1,undefined,undefined,method==='credit_card'?'visa':undefined);
  const assertOnce=()=>{
    expect(balance()).toBe(2234);expect(balance(other)).toBe(1000);
    expect(ledger()).toHaveLength(1);
    expect(one('SELECT count(*) AS count FROM notifications WHERE user_id=?',owner)?.count).toBe(1);
  };
  it('credita aprovação imediata exatamente uma vez após webhooks e consultas repetidos',async()=>{
    try {
      provider.status='approved';const deposit=await create();assertOnce();
      const payment=Array.from(provider.payments.values())[0];
      await Promise.all(Array.from({length:8},()=>handleMercadoPagoWebhook('payment',String(payment.id))));
      for(let i=0;i<3;i++){await refreshMercadoPagoDeposit(owner,deposit.id);reconcileUncreditedDeposits(owner);}
      assertOnce();expect(one('SELECT credited_at FROM mercadopago_deposits WHERE id=?',deposit.id)?.credited_at).toBeTruthy();
    } finally {releaseCpf();}
  });
  it('não credita pendente; aprovação posterior com consultas e webhooks concorrentes credita uma vez',async()=>{
    try {
      const deposit=await create();const payment=Array.from(provider.payments.values())[0];
      await handleMercadoPagoWebhook('payment',String(payment.id));await refreshMercadoPagoDeposit(owner,deposit.id);
      expect(balance()).toBe(1000);expect(ledger()).toHaveLength(0);
      payment.status='approved';
      await Promise.all(Array.from({length:12},(_,i)=>i%2?handleMercadoPagoWebhook('payment',String(payment.id)):refreshMercadoPagoDeposit(owner,deposit.id)));
      reconcileUncreditedDeposits(owner);assertOnce();
      await expect(refreshMercadoPagoDeposit(other,deposit.id)).rejects.toThrow('não encontrado');
    } finally {releaseCpf();}
  });

  it.each([false,true])('falha ao gravar crédito é revertida e uma nova confirmação recupera sem duplicar (imediata=%s)',async(immediate)=>{
    try {
      provider.status=immediate?'approved':'pending';
      const deposit=immediate?undefined:await create();
      const startPayment=Array.from(provider.payments.values())[0];
      if(startPayment) startPayment.status='approved';
      db().exec("CREATE TEMP TRIGGER reject_credit_notification BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'simulated persistence failure'); END");
      try {
        if(immediate) await expect(create()).rejects.toThrow('simulated persistence failure');
        else await expect(refreshMercadoPagoDeposit(owner,deposit!.id)).rejects.toThrow('simulated persistence failure');
      } finally {db().exec('DROP TRIGGER IF EXISTS reject_credit_notification');}
      expect(balance()).toBe(1000);expect(ledger()).toHaveLength(0);
      const row=one('SELECT credited_at,status FROM mercadopago_deposits WHERE user_id=?',owner);
      expect(row?.credited_at).toBeNull();
      expect(['CREATING','PENDING']).toContain(String(row?.status).toUpperCase());
      const payment=Array.from(provider.payments.values())[0];
      await handleMercadoPagoWebhook('payment',String(payment.id));
      await handleMercadoPagoWebhook('payment',String(payment.id));
      reconcileUncreditedDeposits(owner);assertOnce();
    } finally {db().exec('DROP TRIGGER IF EXISTS reject_credit_notification');releaseCpf();}
  });
  it.each([{transaction_amount:12.35},{currency_id:'USD'},{external_reference:'wrong-reference'}])('não credita aprovação posterior com dados divergentes %j',async(overrides)=>{
    try {
      const deposit=await create();const payment=Array.from(provider.payments.values())[0];Object.assign(payment,{status:'approved'},overrides);
      await handleMercadoPagoWebhook('payment',String(payment.id));await refreshMercadoPagoDeposit(owner,deposit.id);reconcileUncreditedDeposits(owner);
      expect(balance()).toBe(1000);expect(ledger()).toHaveLength(0);
    } finally {releaseCpf();}
  });
  it.each([{transaction_amount:12.35},{currency_id:'USD'},{external_reference:'wrong-reference'}])('recusa aprovação imediata com dados divergentes %j',async(overrides)=>{
    try {
      provider.status='approved';provider.overrides=overrides;
      await expect(create()).rejects.toThrow();reconcileUncreditedDeposits(owner);
      expect(balance()).toBe(1000);expect(ledger()).toHaveLength(0);
    } finally {releaseCpf();}
  });
});
