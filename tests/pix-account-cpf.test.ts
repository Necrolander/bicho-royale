import {beforeAll, beforeEach, afterAll, describe, expect, it, vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';

const transport=vi.hoisted(()=>({bodies:[] as Record<string,unknown>[]}));
vi.mock('node:https',()=>({default:{
  request:(_options:unknown,callback:(response:EventEmitter & {statusCode:number})=>void)=>{
    const request=new EventEmitter();
    return Object.assign(request,{
      end(body:string){
        transport.bodies.push(JSON.parse(body));
        queueMicrotask(()=>{
          const response=Object.assign(new EventEmitter(),{statusCode:201});
          callback(response);
          response.emit('data',Buffer.from(JSON.stringify({id:123456,status:'pending',point_of_interaction:{transaction_data:{qr_code:'pix-code-test',qr_code_base64:'cXItY29kZQ=='}}})));
          response.emit('end');
        });
      },
      destroy(error:Error){request.emit('error',error);},
    });
  },
}}));

process.env.DATABASE_PATH=`data/pix-cpf-${randomUUID()}.sqlite`;
const {one,run}=await import('../lib/db');
const {createUser}=await import('../lib/auth');
const {createMercadoPagoPayment,saveMercadoPagoConfig}=await import('../lib/mercadopago');
let owner:string;
const previous={key:process.env.MERCADOPAGO_CONFIG_KEY,enabled:process.env.MERCADOPAGO_PAYMENTS_ENABLED};
beforeAll(()=>{
  process.env.MERCADOPAGO_CONFIG_KEY=Buffer.alloc(32,11).toString('base64');
  process.env.MERCADOPAGO_PAYMENTS_ENABLED='true';
  owner=createUser('Titular Pix','titular@example.test','local-test-password-123','USER',undefined,'52998224725');
  saveMercadoPagoConfig({accessToken:'TEST-local-only',publicKey:'TEST-local-only',webhookSecret:'',environment:'sandbox'},owner);
});
beforeEach(()=>{
  transport.bodies.length=0;
  run('UPDATE users SET cpf=? WHERE id=?','52998224725',owner);
});
afterAll(()=>{
  for(const [key,value] of Object.entries({MERCADOPAGO_CONFIG_KEY:previous.key,MERCADOPAGO_PAYMENTS_ENABLED:previous.enabled})) {
    if(value===undefined) delete process.env[key]; else process.env[key]=value;
  }
});
const payer=()=>transport.bodies[0].payer;

describe('CPF da conta enviado ao provedor Pix',()=>{
  it('gera Pix sem documento no pedido usando o CPF cadastrado',async()=>{
    const result=await createMercadoPagoPayment(owner,1000,'pix','titular@example.test');
    expect(payer()).toMatchObject({identification:{type:'CPF',number:'52998224725'}});
    expect(result.qrCode).toBe('pix-code-test');
    expect(one('SELECT user_id,qr_code FROM mercadopago_deposits WHERE id=?',result.id)).toMatchObject({user_id:owner,qr_code:'pix-code-test'});
  });
  it('ignora CPF diferente enviado pelo cliente e números do e-mail',async()=>{
    await createMercadoPagoPayment(owner,1000,'pix','11144477735@example.test',undefined,undefined,undefined,{type:'CPF',number:'11144477735'});
    expect(payer()).toMatchObject({identification:{type:'CPF',number:'52998224725'}});
  });
  it('consulta o CPF atual da conta e normaliza sua máscara',async()=>{
    run('UPDATE users SET cpf=? WHERE id=?','111.444.777-35',owner);
    await createMercadoPagoPayment(owner,1000,'pix','titular@example.test');
    expect(payer()).toMatchObject({identification:{type:'CPF',number:'11144477735'}});
  });
  it.each([null,'','00000000000','12345678900'])('recusa CPF ausente ou inválido (%s) antes de gerar cobrança',async(cpf)=>{
    run('UPDATE users SET cpf=? WHERE id=?',cpf,owner);
    const count=Number(one('SELECT count(*) AS total FROM mercadopago_deposits')?.total);
    await expect(createMercadoPagoPayment(owner,1000,'pix','52998224725@example.test')).rejects.toThrow('CPF válido');
    expect(transport.bodies).toHaveLength(0);
    expect(Number(one('SELECT count(*) AS total FROM mercadopago_deposits')?.total)).toBe(count);
  });
});


describe.each(['credit_card','boleto'] as const)('CPF da conta no método %s',(method)=>{
  it('não exige documento no pedido para usar o CPF cadastrado',async()=>{
    await createMercadoPagoPayment(owner,1000,method,'titular@example.test',method==='credit_card'?'token-local-only':undefined,1,undefined,undefined,method==='credit_card'?'visa':undefined);
    expect(payer()).toMatchObject({identification:{type:'CPF',number:'52998224725'}});
  });
  const create=()=>createMercadoPagoPayment(owner,1000,method,'titular@example.test',method==='credit_card'?'token-local-only':undefined,1,undefined,{type:'CPF',number:'11144477735'},method==='credit_card'?'visa':undefined,method==='boleto'?{first_name:'Titular',last_name:'Teste',address:{zip_code:'01001000',street_name:'Praça da Sé',street_number:'1',neighborhood:'Sé',city:'São Paulo',federal_unit:'SP'}}:undefined);
  it('envia o CPF do banco, ignorando o documento enviado pelo navegador',async()=>{
    await create();
    expect(payer()).toMatchObject({identification:{type:'CPF',number:'52998224725'}});
    expect(transport.bodies[0].payment_method_id).toBe(method==='boleto'?'bolbradesco':'visa');
  });
  it('utiliza automaticamente o CPF atualizado no perfil',async()=>{
    run('UPDATE users SET cpf=? WHERE id=?','11144477735',owner);
    await create();
    expect(payer()).toMatchObject({identification:{type:'CPF',number:'11144477735'}});
  });
  it.each([null,'00000000000'])('recusa CPF ausente ou inválido antes de criar cobrança (%s)',async(cpf)=>{
    run('UPDATE users SET cpf=? WHERE id=?',cpf,owner);
    await expect(create()).rejects.toThrow('CPF válido');
    expect(transport.bodies).toHaveLength(0);
  });
});
