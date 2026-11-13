import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions, Response as RuntimeResponse } from 'miniflare';

const origin='https://sandbox.runtime.test';
const id='22222222-2222-4222-8222-222222222222';
const output=await build({entryPoints:[fileURLToPath(new URL('./worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const script=output.outputFiles[0].text;
const env={APP_ENV:'sandbox',PAYMENTS_ENABLED:'true',BICTORYS_API_URL:'https://api.test.bictorys.com',BICTORYS_API_KEY:'test_public-runtime-fixture',BICTORYS_WEBHOOK_SECRET:'runtime-webhook-secret-1234567890',DEMO_PASSWORD:'runtime-password-1234567890',SESSION_SECRET:'runtime-session-secret-12345678901234567890'};

async function runtime(provider){
 let calls=0;
 // Every outbound request is intercepted locally. There is no network route
 // to Bictorys, no real key, and no connection to the remote D1 database.
 const mf=new Miniflare(convertV4MiniflareOptions({
  modules:true,compatibilityDate:'2026-11-13',script,cf:false,
  bindings:env,d1Databases:{DB:'runtime-fixture'},d1Persist:false,
  outboundService:async request=>{calls++;return provider(request);},
 }));
 const db=await mf.getD1Database('DB');
 const schema=readFileSync(new URL('./schema.sql',import.meta.url),'utf8');
 const trigger=schema.match(/CREATE TRIGGER[\s\S]*?END;/)[0];
 const statements=schema.replace(trigger,'').split(';').map(s=>s.trim()).filter(s=>s&&!s.startsWith('PRAGMA'));
 await db.batch(statements.map(sql=>db.prepare(sql)));
 await db.prepare(trigger).run();
 const request=(path,body,cookie,headers={})=>mf.dispatchFetch(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const login=await request('/api/login',{password:env.DEMO_PASSWORD});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 return {mf,db,request,cookie,calls:()=>calls};
}

test('Cloudflare réel local : création simulée 505 F puis notification crédite 500 F une seule fois',async()=>{
 const f=await runtime(async request=>{
  assert.equal(request.url,'https://api.test.bictorys.com/pay/v1/charges');
  assert.equal(request.headers.get('x-api-key'),env.BICTORYS_API_KEY);
  const data=await request.json();assert.equal(data.amount,505);assert.equal(data.currency,'XOF');
  return new RuntimeResponse(JSON.stringify({transactionId:'runtime-'+id,redirectUrl:'https://pay.bictorys.com/test'}),{status:201,headers:{'content-type':'application/json'}});
 });
 try{
  const result=await f.request('/api/payments',{requestId:id,badgeId:'DEMO-001',amount:505},f.cookie);
  assert.equal(result.status,201);assert.equal(f.calls(),1);
  assert.equal((await f.db.prepare("SELECT balance FROM badges WHERE id='DEMO-001'").first()).balance,0);
  const event={id:'runtime-'+id,merchantReference:id,paymentReference:id,status:'succeeded',amount:505,currency:'XOF'};
  for(let i=0;i<3;i++)assert.equal((await f.request('/webhooks/bictorys',event,null,{'x-secret-key':env.BICTORYS_WEBHOOK_SECRET})).status,200);
  assert.equal((await f.db.prepare("SELECT balance FROM badges WHERE id='DEMO-001'").first()).balance,500);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM credits').first()).n,1);
 }finally{await f.mf.dispose();}
});

test('Cloudflare réel local : redirection fournisseur refusée sans suivre ni transmettre la clé ailleurs',async()=>{
 const f=await runtime(async request=>{
  assert.equal(new URL(request.url).hostname,'api.test.bictorys.com');
  return new RuntimeResponse('',{status:302,headers:{location:'https://untrusted.example/collect'}});
 });
 try{
  const result=await f.request('/api/payments',{requestId:id,badgeId:'DEMO-001',amount:505},f.cookie);
  assert.equal(result.status,502);
  const data=await result.json();assert.match(data.error,/provider_http_error \(HTTP 302\)/);
  assert.equal(f.calls(),1);
  assert.equal((await f.db.prepare("SELECT balance FROM badges WHERE id='DEMO-001'").first()).balance,0);
 }finally{await f.mf.dispose();}
});

test('Cloudflare réel local : Checkout 202 lien seul puis succès confirmé et répété crédite 500 F une fois',async()=>{
 const f=await runtime(async()=>new RuntimeResponse(JSON.stringify({type:'CheckoutLinkObject',link:'https://pay.bictorys.com/v1/charges/fixture?op_token=FAKE-TOKEN',chargeId:'33333333-3333-4333-8333-333333333333'}),{status:202,headers:{'content-type':'application/json'}}));
 try{
  const creation=await f.request('/api/payments',{requestId:id,badgeId:'DEMO-001',amount:505},f.cookie);
  assert.equal(creation.status,202);assert.equal((await creation.json()).status,'pending');
  assert.equal((await f.db.prepare("SELECT balance FROM badges WHERE id='DEMO-001'").first()).balance,0);
  const event={id:'runtime-checkout-'+id,merchantReference:id,paymentReference:id,status:'succeeded',amount:505,currency:'XOF'};
  for(let i=0;i<3;i++)assert.equal((await f.request('/webhooks/bictorys',event,null,{'x-secret-key':env.BICTORYS_WEBHOOK_SECRET})).status,200);
  assert.equal((await f.db.prepare("SELECT balance FROM badges WHERE id='DEMO-001'").first()).balance,500);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM credits').first()).n,1);
  assert.equal(f.calls(),1);
 }finally{await f.mf.dispose();}
});
test('Cloudflare réel local : transaction déjà liée à un checkout ne peut créditer un second badge',async()=>{
 const f=await runtime(async()=>new RuntimeResponse(JSON.stringify({link:'https://pay.bictorys.com/test'}),{status:202,headers:{'content-type':'application/json'}}));
 try{
  const second='44444444-4444-4444-8444-444444444444';
  for(const [requestId,badgeId]of [[id,'DEMO-001'],[second,'DEMO-002']])assert.equal((await f.request('/api/payments',{requestId,badgeId,amount:505},f.cookie)).status,202);
  const event={id:'shared-provider-transaction',merchantReference:id,paymentReference:id,status:'succeeded',amount:505,currency:'XOF'};
  assert.equal((await f.request('/webhooks/bictorys',event,null,{'x-secret-key':env.BICTORYS_WEBHOOK_SECRET})).status,200);
  assert.equal((await f.request('/webhooks/bictorys',{...event,merchantReference:second,paymentReference:second},null,{'x-secret-key':env.BICTORYS_WEBHOOK_SECRET})).status,409);
  assert.equal((await f.db.prepare("SELECT balance FROM badges WHERE id='DEMO-002'").first()).balance,0);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM credits').first()).n,1);
 }finally{await f.mf.dispose();}
});
