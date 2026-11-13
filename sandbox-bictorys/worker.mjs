import finance from '../functions/finance.cjs';
import { page, appScript } from './page.mjs';

const API = 'https://api.test.bictorys.com';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
const json = (data,status=200,headers={}) => Response.json(data,{status,headers});
const fail = (status,message) => { throw Object.assign(new Error(message),{status}); };
const stmt = (env,sql,...args) => env.DB.prepare(sql).bind(...args);
const now = () => new Date().toISOString();

async function equal(a,b) {
  const hash = s => crypto.subtle.digest('SHA-256',encoder.encode(s));
  const [x,y] = await Promise.all([hash(a||''),hash(b||'')]);
  return new Uint8Array(x).reduce((diff,n,i)=>diff|(n^new Uint8Array(y)[i]),0)===0;
}
async function readJson(request) {
  if (!request.body) fail(400,'Corps JSON requis.');
  const reader=request.body.getReader(), chunks=[]; let size=0;
  for (;;) { const {value,done}=await reader.read(); if(done)break; size+=value.length;
    if(size>8192){await reader.cancel();fail(413,'Requête trop grande.');} chunks.push(value); }
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try {const result=JSON.parse(new TextDecoder().decode(bytes));if(!result||typeof result!=='object'||Array.isArray(result))fail(400,'Objet JSON requis.');return result;}
  catch {fail(400,'JSON invalide.');}
}
function configured(env) {
  return env.APP_ENV==='sandbox' && env.BICTORYS_API_URL===API
    && /^test_public-\S+$/.test(env.BICTORYS_API_KEY||'')
    && (env.BICTORYS_WEBHOOK_SECRET||'').length>=24
    && (env.SESSION_SECRET||'').length>=32 && (env.DEMO_PASSWORD||'').length>=20
    && !!env.DB && !Object.keys(env).some(key=>/FIREBASE|GOOGLE_APPLICATION_CREDENTIALS/i.test(key));
}
async function mac(secret,value) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
}
async function session(request,env) {
  const token=(request.headers.get('cookie')||'').match(/(?:^|;\s*)demo_session=([^;]+)/)?.[1];
  const [expiry,nonce,signature]=token?.split('.')||[];
  if(!env.SESSION_SECRET||!/^\d+$/.test(expiry||'')||!nonce||!signature||Number(expiry)<=Date.now())return false;
  return equal(signature,await mac(env.SESSION_SECRET,expiry+'.'+nonce));
}
function sameOrigin(request) {
  if(request.headers.get('origin')!==new URL(request.url).origin)fail(403,'Origine non autorisée.');
}
async function applyEvent(env,event) {
  const reference=event.merchantReference||event.paymentReference;
  let attempt=await stmt(env,'SELECT * FROM attempts WHERE id=?',reference).first();
  if(!attempt)fail(409,'Tentative inconnue.');
  if(event.currency!=='XOF'||event.amount!==attempt.amount)fail(409,'Montant ou devise non concordants.');
  if(!attempt.provider_id) {
    // Checkout HTTP 202 provides a checkout link before any payment transaction
    // exists. Bind only a verified callback for an accepted, stored checkout.
    // The predicate is atomic and refuses conflicting transaction identities.
    try {
      await stmt(env,`UPDATE attempts SET provider_id=? WHERE id=? AND provider_id IS NULL
        AND status='pending' AND checkout_url IS NOT NULL
        AND EXISTS (SELECT 1 FROM events c WHERE c.attempt_id=attempts.id AND c.status='checkout_created')
        AND NOT EXISTS (SELECT 1 FROM events e WHERE e.attempt_id=attempts.id
          AND e.provider_id!=? AND e.status IN ('succeeded','pending','processing','authorized','failed','cancelled','reversed'))`,event.id,reference,event.id).run();
    } catch {
      await stmt(env,"UPDATE attempts SET status='review' WHERE id=? AND provider_id IS NULL",reference).run();
      fail(409,'Transaction déjà liée ou rapprochement impossible.');
    }
    attempt=await stmt(env,'SELECT * FROM attempts WHERE id=?',reference).first();
    if(!attempt?.provider_id) {
      await stmt(env,"UPDATE attempts SET status='review' WHERE id=? AND status!='creating'",reference).run();
      fail(409,'Identité de transaction non rapprochée ; revue nécessaire.');
    }
  }
  if(attempt.provider_id!==event.id)fail(409,'Transaction non rapprochée.');
  if(event.status==='reversed') {
    await stmt(env,"UPDATE attempts SET status='review' WHERE id=?",reference).run();
    return;
  }
  if(event.status==='succeeded') {
    // A single SQLite statement + trigger atomically journals and credits once.
    await stmt(env,`INSERT OR IGNORE INTO credits(attempt_id,provider_id,badge_id,amount,created_at)
      SELECT a.id,a.provider_id,a.badge_id,a.credit_amount,? FROM attempts a
      WHERE a.id=? AND a.provider_id=? AND a.status='pending'
      AND NOT EXISTS (SELECT 1 FROM events e WHERE e.attempt_id=a.id
        AND e.provider_id=a.provider_id AND e.status IN ('failed','cancelled','reversed'))
      AND NOT EXISTS (SELECT 1 FROM events e WHERE e.attempt_id=a.id AND e.provider_id!=a.provider_id
        AND e.status IN ('succeeded','pending','processing','authorized','failed','cancelled','reversed'))`,now(),reference,event.id).run();
    // A late success contradicting an already recorded terminal failure must
    // be reconciled manually, without granting a credit. The INSERT predicate
    // also enforces this when cancellation arrives concurrently.
    await stmt(env,`UPDATE attempts SET status='review' WHERE id=? AND
      (status IN ('failed','cancelled') OR (status='pending' AND EXISTS
        (SELECT 1 FROM events e WHERE e.attempt_id=attempts.id
          AND ((e.provider_id=attempts.provider_id AND e.status IN ('failed','cancelled','reversed'))
            OR (e.provider_id!=attempts.provider_id AND e.status IN ('succeeded','pending','processing','authorized','failed','cancelled','reversed'))))))`,reference).run();
  } else if(['failed','cancelled'].includes(event.status)) {
    await stmt(env,"UPDATE attempts SET status=? WHERE id=? AND status='pending'",event.status,reference).run();
  }
}
async function webhook(request,env) {
  if(!configured(env))fail(503,'Sandbox non configuré.');
  const supplied=request.headers.get('x-secret-key');
  if(!supplied||!await equal(supplied,env.BICTORYS_WEBHOOK_SECRET))fail(401,'Notification non authentifiée.');
  const body=await readJson(request), reference=body.merchantReference||body.paymentReference;
  if(typeof reference!=='string'||typeof body.id!=='string'||!/^\S{1,200}$/.test(body.id)||!['succeeded','pending','processing','authorized','failed','cancelled','reversed'].includes(body.status))fail(400,'Notification invalide.');
  const attempt=await stmt(env,'SELECT * FROM attempts WHERE id=?',reference).first();
  if(!attempt||body.currency!=='XOF'||body.amount!==attempt.amount
    || (body.merchantReference&&body.merchantReference!==attempt.id)
    || (body.paymentReference&&body.paymentReference!==attempt.id)
    || (attempt.provider_id&&attempt.provider_id!==body.id))fail(409,'Montant, devise ou référence non concordants.');
  const event={id:body.id,status:body.status,merchantReference:reference,amount:body.amount,currency:'XOF'};
  await stmt(env,'INSERT OR IGNORE INTO events(provider_id,status,attempt_id,payload,created_at) VALUES(?,?,?,?,?)',event.id,event.status,reference,JSON.stringify(event),now()).run();
  // Creation may have finished while the event was being stored. Re-read after
  // persistence so either this request or creation-side replay will apply it.
  const reconciled=await stmt(env,'SELECT provider_id,status,checkout_url FROM attempts WHERE id=?',reference).first();
  if(!reconciled?.provider_id) {
    if(reconciled?.status==='review')return json({stored:true,manualReview:true});
    if(reconciled?.status!=='pending'||!reconciled.checkout_url)return json({stored:true,awaitingReconciliation:true},202);
  }
  await applyEvent(env,event);
  return json({stored:true});
}
function checkoutUrl(value) {
  try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&['bictorys.com','wave.com'].some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain))?url.href:null;}
  catch{return null;}
}
async function createPayment(request,env,providerFetch) {
  if(!configured(env)||env.PAYMENTS_ENABLED!=='true')fail(503,'Les paiements sandbox ne sont pas encore activés.');
  const input=await readJson(request), {requestId,badgeId,amount}=input;
  if(!uuid.test(requestId||'')||!['DEMO-001','DEMO-002'].includes(badgeId)||!Number.isSafeInteger(amount)||amount<2||amount>10000)fail(400,'Badge fictif ou montant de test invalide (2 à 10 000 F).');
  if(Object.keys(input).some(k=>!['requestId','badgeId','amount'].includes(k)))fail(400,'Paramètre non autorisé.');
  const previous=await stmt(env,'SELECT * FROM attempts WHERE id=?',requestId).first();
  if(previous) {
    if(previous.badge_id!==badgeId||previous.amount!==amount)fail(409,'Référence déjà utilisée pour une autre tentative.');
    if(previous.status!=='pending'&&previous.status!=='credited')fail(409,'Tentative en cours ou à examiner : ne pas répéter le paiement.');
    return json({id:previous.id,status:previous.status,checkoutUrl:previous.checkout_url,creditAmount:previous.credit_amount});
  }
  const quote=finance.quoteMobileTopup(amount);
  let inserted;
  try {
    inserted=await stmt(env,`INSERT INTO attempts(id,badge_id,amount,credit_amount,fee_policy,created_at)
      SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM attempts WHERE created_at>=?)<20`,requestId,badgeId,amount,quote.amount,quote.feePolicy,now(),now().slice(0,10)).run();
  } catch {fail(409,'Référence déjà en cours de traitement.');}
  if(!inserted.meta.changes)fail(429,'Limite du sandbox atteinte : 20 tentatives par jour.');
  let failureCode='provider_network_error', httpStatus=null, responseKind=null, responseShape=null;
  try {
    const origin=new URL(request.url).origin;
    const response=await providerFetch(API+'/pay/v1/charges',{
      // Cloudflare rejects redirect:'error' before sending. Manual mode keeps
      // redirects visible to the non-success check without forwarding the key.
      method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),
      headers:{'X-Api-Key':env.BICTORYS_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({amount,currency:'XOF',country:'SN',merchantReference:requestId,paymentReference:requestId,successRedirectUrl:origin+'/return',errorRedirectUrl:origin+'/return'}),
    });
    httpStatus=response.status;
    const contentType=response.headers.get('content-type')||'';
    responseKind=contentType.includes('json')?'json':contentType.includes('html')?'html':'other';
    failureCode='provider_http_error';
    if(!response.ok)throw Error('provider');
    failureCode='provider_invalid_json';
    const data=await readJson(response);
    responseShape={transactionIdPresent:typeof data.transactionId==='string',idPresent:typeof data.id==='string',redirectUrlPresent:typeof data.redirectUrl==='string',linkPresent:typeof data.link==='string',dataWrapperPresent:!!data.data&&typeof data.data==='object'};
    failureCode='provider_unexpected_success_status';
    if(![201,202].includes(httpStatus))throw Error('provider response');
    failureCode='provider_missing_transaction_id';
    const providerId=typeof data.transactionId==='string'&&/^\S{1,200}$/.test(data.transactionId)?data.transactionId:null;
    if(!providerId&&(httpStatus!==202||data.transactionId!=null))throw Error('provider response');
    failureCode='provider_invalid_checkout_url';
    const redirect=checkoutUrl(data.link||data.redirectUrl);
    if(!redirect)throw Error('provider response');
    failureCode='local_storage_error';
    if(!providerId) {
      await stmt(env,"INSERT OR IGNORE INTO events(provider_id,status,attempt_id,payload,created_at) VALUES(?,'checkout_created',?,?,?)",'local-checkout:'+requestId,requestId,JSON.stringify({kind:'checkout_created',httpStatus:202}),now()).run();
    }
    await stmt(env,"UPDATE attempts SET provider_id=?,checkout_url=?,status='pending' WHERE id=? AND status='creating'",providerId,redirect,requestId).run();
    failureCode='local_reconciliation_error';
    const early=await stmt(env,"SELECT payload FROM events WHERE attempt_id=? AND status IN ('succeeded','pending','processing','authorized','failed','cancelled','reversed') ORDER BY created_at",requestId).all();
    for(const item of early.results) {
      try {await applyEvent(env,JSON.parse(item.payload));}
      catch(error) {
        if(error?.status!==409)throw error;
        await stmt(env,"UPDATE attempts SET status='review' WHERE id=? AND status!='credited'",requestId).run();
      }
    }
    const current=await stmt(env,'SELECT status FROM attempts WHERE id=?',requestId).first();
    return json({id:requestId,status:current.status,checkoutUrl:current.status==='pending'?redirect:null,creditAmount:quote.amount},httpStatus);
  } catch(error) {
    if(failureCode==='provider_network_error'&&['TimeoutError','AbortError'].includes(error?.name))failureCode='provider_timeout';
    if(failureCode==='provider_invalid_json'&&error?.status===413)failureCode='provider_response_too_large';
    await stmt(env,"UPDATE attempts SET status='review' WHERE id=? AND status!='credited'",requestId).run();
    // Store only enum codes, numeric status and boolean shape flags. Never
    // persist provider bodies, arbitrary error messages, headers or secrets.
    const diagnostic={kind:'creation_diagnostic',code:failureCode,httpStatus,responseKind,responseShape};
    try {
      await stmt(env,"INSERT OR IGNORE INTO events(provider_id,status,attempt_id,payload,created_at) VALUES(?,'creation_diagnostic',?,?,?)",'local-diagnostic:'+requestId,requestId,JSON.stringify(diagnostic),now()).run();
    } catch { /* A diagnostic write failure must not trigger a provider retry. */ }
    fail(502,'Confirmation de création indisponible. Tentative conservée pour vérification ; ne pas recommencer. Diagnostic : '+failureCode+(httpStatus?' (HTTP '+httpStatus+')':'')+'.');
  }
}

export function createWorker(providerFetch=globalThis.fetch) {
  return { async fetch(request,env) {
    let response;
    try {
      const url=new URL(request.url), path=url.pathname;
      if(request.method==='GET'&&(path==='/'||path==='/return'))response=new Response(page,{headers:{'content-type':'text/html; charset=utf-8'}});
      else if(request.method==='GET'&&path==='/app.js')response=new Response(appScript,{headers:{'content-type':'text/javascript; charset=utf-8'}});
      else if(request.method==='GET'&&path==='/health')response=json({environment:'sandbox',realBadgesConnected:false,configured:configured(env),paymentsEnabled:configured(env)&&env.PAYMENTS_ENABLED==='true'});
      else if(request.method==='POST'&&path==='/webhooks/bictorys')response=await webhook(request,env);
      else if(request.method==='POST'&&path==='/api/login') {
        if(!configured(env))fail(503,'Configuration du sandbox incomplète.');
        sameOrigin(request);
        const bucket=(request.headers.get('cf-connecting-ip')||'local')+':'+Math.floor(Date.now()/900000);
        await stmt(env,'DELETE FROM login_limits WHERE bucket NOT LIKE ?', '%:'+Math.floor(Date.now()/900000)).run();
        const limit=await stmt(env,'INSERT INTO login_limits(bucket,count) VALUES(?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',bucket).first();
        if(limit.count>8)fail(429,'Trop de tentatives. Réessayez dans 15 minutes.');
        const body=await readJson(request);
        if(typeof body.password!=='string'||!await equal(body.password,env.DEMO_PASSWORD))fail(401,'Accès refusé.');
        const value=(Date.now()+3600000)+'.'+crypto.randomUUID();
        response=json({ok:true},200,{'set-cookie':'demo_session='+value+'.'+await mac(env.SESSION_SECRET,value)+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600'});
      } else if(path.startsWith('/api/')) {
        if(!await session(request,env))fail(401,'Connexion au sandbox requise.');
        if(request.method==='GET'&&path==='/api/badges')response=json((await stmt(env,'SELECT id,name,balance FROM badges ORDER BY id').all()).results);
        else if(request.method==='GET'&&path==='/api/attempts')response=json((await stmt(env,'SELECT id,badge_id,amount,credit_amount,status,created_at FROM attempts ORDER BY created_at DESC LIMIT 20').all()).results);
        else if(request.method==='POST'&&path==='/api/payments'){sameOrigin(request);response=await createPayment(request,env,providerFetch);}
        else if(request.method==='POST'&&path==='/api/logout'){sameOrigin(request);response=json({ok:true},200,{'set-cookie':'demo_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});}
        else fail(404,'Page introuvable.');
      } else fail(404,'Page introuvable.');
    } catch(error) {response=json({error:error.status?error.message:'Service de test temporairement indisponible.'},error.status||503);}
    const headers=new Headers(response.headers);
    headers.set('cache-control','no-store');headers.set('x-content-type-options','nosniff');headers.set('referrer-policy','no-referrer');
    headers.set('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    return new Response(response.body,{status:response.status,headers});
  }};
}
export default createWorker();
