import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createWorker } from './worker.mjs';

const origin = 'https://sandbox.example.test';
const id = '11111111-1111-4111-8111-111111111111';
function fixture(providerReply) {
  const hooks = {};
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const wrap = (sql, args = []) => ({
    bind: (...values) => wrap(sql, values),
    first: async () => sqlite.prepare(sql).get(...args) || null,
    all: async () => { await hooks.beforeAll?.(sql,args); return { results: sqlite.prepare(sql).all(...args) }; },
    run: async () => { await hooks.beforeRun?.(sql,args); return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
  });
  let calls = 0;
  const env = { DB: { prepare: sql => wrap(sql) }, APP_ENV:'sandbox', PAYMENTS_ENABLED:'true', BICTORYS_API_URL:'https://api.test.bictorys.com', BICTORYS_API_KEY:'test_public-fixture', BICTORYS_WEBHOOK_SECRET:'webhook-fixture-secret-123456789', DEMO_PASSWORD:'password-fixture-123456789', SESSION_SECRET:'session-fixture-secret-1234567890123456789' };
  const worker = createWorker(async (url, options) => {
    calls++; assert.equal(new URL(url).origin, env.BICTORYS_API_URL);
    assert.equal(options.redirect,'manual');
    const body = JSON.parse(options.body);
    if(providerReply)return providerReply({url,options,body});
    return Response.json({ transactionId:'provider-'+body.merchantReference,redirectUrl:'https://pay.bictorys.com/checkout/test' }, {status:201});
  });
  const request = (path, body, cookie, headers={}) => worker.fetch(new Request(origin+path, {method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  const login = async () => (await request('/api/login',{password:env.DEMO_PASSWORD})).headers.get('set-cookie').split(';')[0];
  const pay = cookie => request('/api/payments',{requestId:id,badgeId:'DEMO-001',amount:510},cookie);
  const event = (patch={}) => ({id:'provider-'+id,merchantReference:id,paymentReference:id,status:'succeeded',amount:510,currency:'XOF',...patch});
  const webhook = body => request('/webhooks/bictorys',body,null,{'x-secret-key':env.BICTORYS_WEBHOOK_SECRET});
  return {env,worker,sqlite,request,login,pay,event,webhook,hooks,calls:()=>calls};
}

test('sandbox : page marquée TEST, données protégées et configuration absente refusée',async()=>{
 const f=fixture(); assert.match(await (await f.request('/')).text(),/TEST/);
 assert.equal((await f.request('/api/badges')).status,401);
 f.env.SESSION_SECRET=''; assert.equal((await f.request('/api/login',{password:'test'})).status,503);
});
test('sandbox : mot de passe incorrect, session falsifiée et limite de connexion',async()=>{
 const f=fixture(); assert.equal((await f.request('/api/login',{password:'wrong'})).status,401);
 assert.equal((await f.request('/api/badges',undefined,'demo_session=fake')).status,401);
 for(let i=0;i<8;i++) await f.request('/api/login',{password:'wrong'});
 assert.equal((await f.request('/api/login',{password:f.env.DEMO_PASSWORD})).status,429);
});
test('sandbox : cookie sécurisé et création autorisée unique pour 510 F donnant 505 F fictifs',async()=>{
 const f=fixture(); const res=await f.request('/api/login',{password:f.env.DEMO_PASSWORD});
 assert.match(res.headers.get('set-cookie'),/HttpOnly/); assert.match(res.headers.get('set-cookie'),/Secure/);
 const cookie=res.headers.get('set-cookie').split(';')[0];
 assert.equal((await f.pay(cookie)).status,201); assert.equal((await f.pay(cookie)).status,200); assert.equal(f.calls(),1);
 assert.equal(f.sqlite.prepare('SELECT credit_amount FROM attempts').get().credit_amount,505);
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,0);
});
test('sandbox : création désactivée, URL ou clé réelle et montants invalides refusés',async()=>{
 for(const patch of [{PAYMENTS_ENABLED:'false'},{APP_ENV:'production'},{BICTORYS_API_URL:'https://api.bictorys.com'},{BICTORYS_API_KEY:'public-real'}]) {
  const f=fixture(), cookie=await f.login(); Object.assign(f.env,patch);
  assert.equal((await f.pay(cookie)).status,503); assert.equal(f.calls(),0);
 }
 const f=fixture(), cookie=await f.login();
 for(const amount of [-1,0,1.5,10001]) assert.equal((await f.request('/api/payments',{requestId:id,badgeId:'DEMO-001',amount},cookie)).status,400);
 assert.equal((await f.request('/api/payments',{requestId:id,badgeId:'REAL-BADGE',amount:510},cookie)).status,400);
 assert.equal((await f.request('/api/payments',{requestId:id,badgeId:'DEMO-001',amount:510},cookie,{origin:'https://evil.test'})).status,403);
});
test('sandbox : webhook sans secret ou faux montant/devise/référence ne crédite rien',async()=>{
 const f=fixture(); await f.pay(await f.login());
 assert.equal((await f.request('/webhooks/bictorys',f.event())).status,401);
 for(const patch of [{amount:999},{currency:'EUR'},{merchantReference:'unknown'},{id:'wrong-provider'}]) assert.ok((await f.webhook(f.event(patch))).status>=400);
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,0);
});
test('sandbox : succès authentifié et notifications répétées/concurrentes donnent un crédit unique',async()=>{
 const f=fixture(); await f.pay(await f.login());
 const results=await Promise.all(Array.from({length:4},()=>f.webhook(f.event())));
 for(const r of results) assert.equal(r.status,200);
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,505);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM credits').get().n,1);
});
test('sandbox : retour navigateur, attente et autorisation carte ne constituent pas un crédit',async()=>{
 const f=fixture(); await f.pay(await f.login());
 assert.equal((await f.request('/return?status=success')).status,200);
 for(const status of ['pending','processing','authorized']) assert.equal((await f.webhook(f.event({status}))).status,200);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM credits').get().n,0);
});
test('sandbox : événement précoce conservé puis rapproché avant crédit',async()=>{
 const f=fixture(); const cookie=await f.login();
 const worker=createWorker(async()=>{
  assert.equal((await f.webhook(f.event())).status,202);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM credits').get().n,0);
  return Response.json({transactionId:'provider-'+id,redirectUrl:'https://pay.bictorys.com/test'},{status:201});
 });
 const r=await worker.fetch(new Request(origin+'/api/payments',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({requestId:id,badgeId:'DEMO-001',amount:510})}),f.env);
 assert.equal(r.status,201); assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM credits').get().n,1);
});
test('sandbox : interleaving lecture précoce puis insertion après rapprochement ne perd pas le crédit',async()=>{
 const f=fixture(),cookie=await f.login();
 const reached=Promise.withResolvers(),release=Promise.withResolvers();let eventPromise;
 f.hooks.beforeRun=async sql=>{if(sql.startsWith('INSERT OR IGNORE INTO events')){reached.resolve();await release.promise;}};
 const worker=createWorker(async()=>{
  eventPromise=f.webhook(f.event());await reached.promise;
  return Response.json({transactionId:'provider-'+id,redirectUrl:'https://pay.bictorys.com/test'},{status:201});
 });
 const response=await worker.fetch(new Request(origin+'/api/payments',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({requestId:id,badgeId:'DEMO-001',amount:510})}),f.env);
 assert.equal(response.status,201);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM credits').get().n,0);
 release.resolve();assert.equal((await eventPromise).status,200);
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,505);
});
test('sandbox : annulation/échec sans crédit et renversement conservé pour revue',async()=>{
 const f=fixture(); await f.pay(await f.login());
 await f.webhook(f.event({status:'failed'})); assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM credits').get().n,0);
 const g=fixture();await g.pay(await g.login());
 await g.webhook(g.event()); await g.webhook(g.event({status:'reversed'})); await g.webhook(g.event());
 assert.equal(g.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,505);
 assert.equal(g.sqlite.prepare('SELECT status FROM attempts').get().status,'review');
});
test('sandbox : erreur fournisseur ne déclenche aucun nouvel appel sur rejeu',async()=>{
 const f=fixture(); let calls=0; const worker=createWorker(async()=>{calls++;throw Error('network');}); const cookie=await f.login();
 const req=()=>new Request(origin+'/api/payments',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({requestId:id,badgeId:'DEMO-001',amount:510})});
 assert.equal((await worker.fetch(req(),f.env)).status,502); assert.equal((await worker.fetch(req(),f.env)).status,409); assert.equal(calls,1);
});

test('premier test : 505 F XOF confirmés créditent exactement 500 F depuis un solde nul, une seule fois',async()=>{
 const f=fixture(),cookie=await f.login();
 assert.equal((await f.request('/api/payments',{requestId:id,badgeId:'DEMO-001',amount:505},cookie)).status,201);
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,0);
 const e=f.event({amount:505});
 for(let i=0;i<3;i++)assert.equal((await f.webhook(e)).status,200);
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,500);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM credits').get().n,1);
});
test('premier test : échec, annulation et états non définitifs conservent un solde nul',async()=>{
 for(const status of ['failed','cancelled','pending','processing','authorized']){
  const f=fixture(),cookie=await f.login();
  await f.request('/api/payments',{requestId:id,badgeId:'DEMO-001',amount:505},cookie);
  assert.equal((await f.webhook(f.event({amount:505,status}))).status,200);
  assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,0);
 }
});
test('premier test : succès tardif depuis une attente et répétitions tardives donnent un seul crédit de 500 F',async()=>{
 const f=fixture(),cookie=await f.login();
 await f.request('/api/payments',{requestId:id,badgeId:'DEMO-001',amount:505},cookie);
 f.sqlite.prepare('UPDATE attempts SET created_at=? WHERE id=?').run('2026-01-01T00:00:00.000Z',id);
 await f.webhook(f.event({amount:505,status:'pending'}));
 await f.webhook(f.event({amount:505}));
 await f.webhook(f.event({amount:505,status:'failed'}));
 await f.webhook(f.event({amount:505}));
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,500);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM credits').get().n,1);
});
test('premier test : succès contradictoire après échec ou annulation doit rester sans crédit et passer en revue',async()=>{
 for(const status of ['failed','cancelled']){
  const f=fixture(),cookie=await f.login();
  await f.request('/api/payments',{requestId:id,badgeId:'DEMO-001',amount:505},cookie);
  await f.webhook(f.event({amount:505,status}));await f.webhook(f.event({amount:505}));
  assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,0);
  assert.equal(f.sqlite.prepare('SELECT status FROM attempts').get().status,'review');
 }
});
test('premier test : les pages et réponses publiques ne contiennent aucune valeur de secret',async()=>{
 const f=fixture();
 for(const path of ['/','/app.js','/health','/api/badges']){
  const text=await (await f.request(path)).text();
  for(const name of ['BICTORYS_API_KEY','BICTORYS_WEBHOOK_SECRET','DEMO_PASSWORD','SESSION_SECRET'])assert.equal(text.includes(f.env[name]),false);
 }
});
test('premier test : une annulation concurrente avant l’écriture du crédit interdit le crédit',async()=>{
 const f=fixture(),cookie=await f.login();
 await f.request('/api/payments',{requestId:id,badgeId:'DEMO-001',amount:505},cookie);
 const reached=Promise.withResolvers(),release=Promise.withResolvers();
 f.hooks.beforeRun=async sql=>{if(sql.startsWith('INSERT OR IGNORE INTO credits')){reached.resolve();await release.promise;}};
 const success=f.webhook(f.event({amount:505}));await reached.promise;
 await f.webhook(f.event({amount:505,status:'cancelled'}));release.resolve();await success;
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,0);
 assert.equal(f.sqlite.prepare('SELECT status FROM attempts').get().status,'review');
});
test('premier test : annulation précoce persistée bloque un succès avant le rejeu des événements',async()=>{
 const f=fixture(),cookie=await f.login();const reached=Promise.withResolvers(),release=Promise.withResolvers();
 f.hooks.beforeAll=async sql=>{if(sql.startsWith('SELECT payload FROM events')){reached.resolve();await release.promise;}};
 const worker=createWorker(async()=>{
  assert.equal((await f.webhook(f.event({amount:505,status:'cancelled'}))).status,202);
  return Response.json({transactionId:'provider-'+id,redirectUrl:'https://pay.bictorys.com/test'},{status:201});
 });
 const creation=worker.fetch(new Request(origin+'/api/payments',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({requestId:id,badgeId:'DEMO-001',amount:505})}),f.env);
 await reached.promise;
 await f.webhook(f.event({amount:505}));
 const balance=f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance;
 release.resolve();await creation;
 assert.equal(balance,0);
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,0);
 assert.equal(f.sqlite.prepare('SELECT status FROM attempts').get().status,'review');
});

async function diagnosticRequest(f,provider) {
 const cookie=await f.login(),worker=createWorker(provider);
 const response=await worker.fetch(new Request(origin+'/api/payments',{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({requestId:id,badgeId:'DEMO-001',amount:505})}),f.env);
 const rows=f.sqlite.prepare("SELECT payload FROM events WHERE status='creation_diagnostic'").all();
 return {response,rows,diagnostic:rows.length?JSON.parse(rows[0].payload):null};
}
test('diagnostic : statut HTTP conservé sans corps fournisseur, clé ou donnée sensible',async()=>{
 for(const httpStatus of [400,401,403,500]){
  const f=fixture(),secret='SUPPLIER-PRIVATE-DETAIL-DO-NOT-STORE';
  const result=await diagnosticRequest(f,async()=>Response.json({title:secret,key:f.env.BICTORYS_API_KEY},{status:httpStatus}));
  assert.equal(result.response.status,502);assert.equal(result.rows.length,1);
  assert.equal(result.diagnostic.code,'provider_http_error');assert.equal(result.diagnostic.httpStatus,httpStatus);
  const text=result.rows[0].payload+await result.response.text();assert.equal(text.includes(secret),false);
  for(const value of Object.values(f.env))if(typeof value==='string'&&value.length>20)assert.equal(text.includes(value),false);
  assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,0);
  assert.equal(f.sqlite.prepare('SELECT status FROM attempts').get().status,'review');
 }
});
test('diagnostic : réponse JSON invalide, identifiant absent ou lien non autorisé distingués',async()=>{
 const cases=[
  [()=>new Response('<html>private supplier error</html>',{status:201}), 'provider_invalid_json'],
  [()=>Response.json({redirectUrl:'https://pay.bictorys.com/test'},{status:201}), 'provider_missing_transaction_id'],
  [()=>Response.json({transactionId:'provider-'+id,redirectUrl:'https://evil.example/private'},{status:201}), 'provider_invalid_checkout_url'],
 ];
 for(const [response,code]of cases){const f=fixture();const r=await diagnosticRequest(f,async()=>response());assert.equal(r.response.status,502);assert.equal(r.diagnostic?.code,code);assert.equal(r.diagnostic.httpStatus,201);}
});
test('diagnostic : délai dépassé sans message brut et sans répétition automatique du paiement',async()=>{
 const f=fixture();let calls=0;
 const r=await diagnosticRequest(f,async()=>{calls++;throw new DOMException('private supplier detail','TimeoutError');});
 assert.equal(r.diagnostic?.code,'provider_timeout');assert.equal(r.diagnostic.httpStatus,null);
 assert.equal((await r.response.text()).includes('private supplier detail'),false);
 const cookie=await f.login();assert.equal((await f.request('/api/payments',{requestId:id,badgeId:'DEMO-001',amount:505},cookie)).status,409);
 assert.equal(calls,1);assert.equal(f.calls(),0);
});

const checkoutReply=()=>Response.json({type:'CheckoutLinkObject',chargeId:'33333333-3333-4333-8333-333333333333',link:'https://pay.bictorys.com/v1/charges/fixture?op_token=FAKE-CHECKOUT-TOKEN',opToken:'FAKE-CHECKOUT-TOKEN'},{status:202});
const pay505=async f=>f.request('/api/payments',{requestId:id,badgeId:'DEMO-001',amount:505},await f.login());
test('Checkout 202 : lien sans transactionId accepté, aucun crédit avant webhook et liaison unique après succès',async()=>{
 const f=fixture(checkoutReply);const result=await pay505(f);
 assert.equal(result.status,202);const body=await result.json();assert.equal(body.status,'pending');assert.match(body.checkoutUrl,/pay\.bictorys\.com/);
 assert.equal(f.sqlite.prepare('SELECT provider_id FROM attempts').get().provider_id,null);
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,0);
 const trace=f.sqlite.prepare("SELECT payload FROM events WHERE status='checkout_created'").get().payload;
 assert.equal(trace.includes('FAKE-CHECKOUT-TOKEN'),false);
 for(let i=0;i<3;i++)assert.equal((await f.webhook(f.event({amount:505}))).status,200);
 assert.equal(f.sqlite.prepare('SELECT provider_id FROM attempts').get().provider_id,'provider-'+id);
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,500);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM credits').get().n,1);assert.equal(f.calls(),1);
});
test('Checkout 202 : refus des confirmations non authentifiées ou incohérentes avant toute liaison',async()=>{
 const f=fixture(checkoutReply);await pay505(f);
 assert.equal((await f.request('/webhooks/bictorys',f.event({amount:505}))).status,401);
 for(const patch of [{amount:999},{currency:'EUR'},{merchantReference:'unknown'},{id:''}])assert.ok((await f.webhook(f.event({amount:505,...patch}))).status>=400);
 assert.equal(f.sqlite.prepare('SELECT provider_id FROM attempts').get().provider_id,null);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM credits').get().n,0);
});
test('Checkout 202 : notification avant la réponse rapprochée sans traiter la trace checkout comme un paiement',async()=>{
 let f;f=fixture(async()=>{assert.equal((await f.webhook(f.event({amount:505}))).status,202);return checkoutReply();});
 const r=await pay505(f);assert.equal(r.status,202);const body=await r.json();assert.equal(body.status,'credited');assert.equal(body.checkoutUrl,null);
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,500);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM credits').get().n,1);
});
test('Checkout 202 : première transaction liée ne peut être remplacée par une autre notification',async()=>{
 const f=fixture(checkoutReply);await pay505(f);
 await f.webhook(f.event({amount:505,status:'pending'}));
 assert.equal((await f.webhook(f.event({amount:505,id:'different-transaction'}))).status,409);
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,0);
 await f.webhook(f.event({amount:505}));
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,500);
});
test('Checkout 202 : annulation précoce et succès d’une autre transaction concurrente mis en revue sans crédit',{timeout:5000},async()=>{
 const reached=Promise.withResolvers(),release=Promise.withResolvers();let f;
 f=fixture(async()=>{await f.webhook(f.event({amount:505,status:'cancelled'}));return checkoutReply();});
 f.hooks.beforeAll=async sql=>{if(sql.startsWith('SELECT payload FROM events')){reached.resolve();await release.promise;}};
 const creation=pay505(f);await reached.promise;
 assert.equal((await f.webhook(f.event({amount:505,id:'different-transaction'}))).status,409);
 release.resolve();const response=await creation;
 assert.equal(response.status,202);assert.equal((await response.json()).status,'review');
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,0);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM credits').get().n,0);
});
test('Checkout 202 : identité concurrente persistée après la liaison mais avant le crédit bloque le crédit',{timeout:5000},async()=>{
 const f=fixture(checkoutReply);await pay505(f);
 const cancelRead=Promise.withResolvers(),cancelRelease=Promise.withResolvers();
 const creditReady=Promise.withResolvers(),creditRelease=Promise.withResolvers();
 f.hooks.beforeRun=async(sql,args)=>{
  if(sql.startsWith('INSERT OR IGNORE INTO events')&&args[1]==='cancelled'){cancelRead.resolve();await cancelRelease.promise;}
  if(sql.startsWith('INSERT OR IGNORE INTO credits')){creditReady.resolve();await creditRelease.promise;}
 };
 const cancel=f.webhook(f.event({amount:505,id:'different-transaction',status:'cancelled'}));await cancelRead.promise;
 const success=f.webhook(f.event({amount:505}));await creditReady.promise;
 cancelRelease.resolve();const cancelResponse=await cancel;
 creditRelease.resolve();await success;
 assert.equal(cancelResponse.status,409);
 assert.equal(f.sqlite.prepare('SELECT balance FROM badges WHERE id=?').get('DEMO-001').balance,0);
 assert.equal(f.sqlite.prepare('SELECT status FROM attempts').get().status,'review');
});
test('Checkout 202 : ancienne revue ou attente sans preuve checkout ne permet pas une nouvelle liaison',async()=>{
 for(const status of ['review','pending']){
  const f=fixture();
  f.sqlite.prepare('INSERT INTO attempts(id,badge_id,amount,credit_amount,fee_policy,status,checkout_url,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,'DEMO-001',505,500,'legacy',status,status==='pending'?'https://pay.bictorys.com/test':null,new Date().toISOString());
  const result=await f.webhook(f.event({amount:505}));assert.equal(result.status,status==='review'?200:409);
  assert.equal(f.sqlite.prepare('SELECT provider_id FROM attempts').get().provider_id,null);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM credits').get().n,0);
 }
});
