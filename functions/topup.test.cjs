const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup({ balance = 1000, status = 'active', role = 'restaurant_admin', maxBalance = 10000 } = {}) {
 const rows = new Map([
  ['users/cashier', { name: 'Caissier', role }],
  ['users/agent', { name: 'Agent', badgeNumber: 'ND-001', walletBalance: balance, status }],
  ['settings/institution', { maxBadgeBalance: maxBalance, waveCashierFeeRate: 1 }],
 ]);
 let seq = 0;
 const snapshot = key => ({ exists: rows.has(key), data: () => structuredClone(rows.get(key)) });
 const ref = key => ({ key, id: key.split('/').at(-1), get: async () => snapshot(key) });
 const db = {
  doc: ref,
  collection: name => ({ doc: id => ref(`${name}/${id || 'auto-' + ++seq}`) }),
  runTransaction: async fn => {
   const writes = [];
   const tx = { get: async r => snapshot(r.key),
    update: (r, data) => writes.push(() => {
     const next = { ...rows.get(r.key) };
     for(const [k,v] of Object.entries(data)) next[k] = v?.increment !== undefined ? (next[k] || 0) + v.increment : v;
     rows.set(r.key, next);
    }),
    set: (r,data) => writes.push(() => rows.set(r.key, data)),
   };
   const result = await fn(tx);
   writes.forEach(write => write());
   return result;
  }
 };
 class HttpsError extends Error { constructor(code,message) {super(message); this.code=code;} }
 const context = { exports: {}, console, require: name => {
  if(name === 'firebase-functions/v2/https') return {onCall: fn=>fn,HttpsError};
  if(name === 'firebase-admin/app') return {initializeApp: ()=>{}};
  if(name === 'firebase-admin/firestore') return {getFirestore: ()=>db, FieldValue: { increment: n=>({increment:n}) }};
  if(name === './finance.cjs') return require('./finance.cjs');
  throw new Error(name);
 }};
 vm.runInNewContext(fs.readFileSync(__dirname + '/index.js', 'utf8'), context);
 const request = (data={}) => ({ auth: {uid:'cashier',token:{email:'cashier@hospital.sn'}}, data: {employeeId:'agent',amount:1000,note:'Versement reçu',method:'cash',requestId:'operation-1',...data} });
 return { topup: context.exports.accountantTopup, rows, request };
}

test('recharge réelle : solde et écriture comptable sont enregistrés ensemble', async()=>{
 const {topup,rows,request}=setup();
 const result=await topup(request());
 assert.equal(rows.get('users/agent').walletBalance,2000);
 assert.equal(rows.get('cashTransactions/'+result.id).amount,1000);
 assert.equal(result.cashierId,'cashier');
});
test('recharge Wave conserve le moyen de paiement et calcule les frais serveur',async()=>{
 const {topup,request}=setup();
 const result=await topup(request({method:'wave'}));
 assert.equal(result.method,'wave');
 assert.equal(result.waveFeeRate,1);
 assert.equal(result.waveFeeAmount,10);
});

test('partage mobile : 510 F confirmés donnent 505 F et un reçu détaillé', async()=>{
 const {topup,rows,request}=setup();
 const receipt=await topup(request({amount:505,grossAmount:510,method:'wave'}));
 assert.equal(receipt.grossAmount,510);
 assert.equal(receipt.processorFeeCents,1020);
 assert.equal(receipt.netReceivedCents,49980);
 assert.equal(receipt.waveFeeAmount,5);
 assert.equal(rows.get('users/agent').walletBalance,1505);
});

test('partage mobile : un crédit supérieur au calcul du brut est refusé',async()=>{
 const {topup,request}=setup();
 await assert.rejects(topup(request({amount:510,grossAmount:510,method:'wave'})),{code:'invalid-argument'});
});

test('partage mobile : Orange Money suit le même calcul',async()=>{
 const {topup,request}=setup();
 const receipt=await topup(request({amount:505,grossAmount:510,method:'orange_money'}));
 assert.equal(receipt.amount,505);
 assert.equal(receipt.method,'orange_money');
});

test('un rejeu doit conserver le montant réellement versé même si le crédit est identique',async()=>{
 const {topup,request}=setup();
 await topup(request({amount:51,grossAmount:51,method:'wave'}));
 await assert.rejects(topup(request({amount:51,grossAmount:52,method:'wave'})),{code:'already-exists'});
});
test('réessayer la même recharge ne crédite pas deux fois le badge',async()=>{
 const {topup,rows,request}=setup();
 const first=await topup(request());
 const second=await topup(request());
 assert.equal(second.id,first.id);
 assert.equal(rows.get('users/agent').walletBalance,2000);
});
test('un badge bloqué et un dépassement du plafond ne créent aucune écriture',async()=>{
 for(const options of [{status:'blocked'},{balance:9500}]) {
  const {topup,rows,request}=setup(options);
  await assert.rejects(topup(request()), {code:'failed-precondition'});
  assert.equal([...rows.keys()].filter(k=>k.startsWith('cashTransactions/')).length,0);
  assert.equal(rows.get('users/agent').walletBalance, options.balance || 1000);
 }
});
test('un agent sans droit de caisse ne peut pas effectuer de recharge',async()=>{
 const {topup,request}=setup({role:'employee'});
 await assert.rejects(topup(request()),{code:'permission-denied'});
});
test('montant fractionnaire ou moyen de paiement inconnu sont refusés',async()=>{
 for(const data of [{amount:1.5},{method:'other'}]) {
  const {topup,request}=setup();
  await assert.rejects(topup(request(data)),{code:'invalid-argument'});
 }
});
