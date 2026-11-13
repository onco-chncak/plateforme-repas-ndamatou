const { before, beforeEach, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
type RulesTestEnvironment = import('@firebase/rules-unit-testing').RulesTestEnvironment;
const { doc, setDoc, updateDoc, getDoc, writeBatch, serverTimestamp } = require('firebase/firestore');
let env: RulesTestEnvironment;
const profile = (id: string, role='employee', walletBalance=1000) => ({id,name:id,email:id+'@hospital.sn',phone:'77'+String([...id].reduce((hash,char)=>(hash*31+char.charCodeAt(0))%10000000,0)).padStart(7,'0'),badgeNumber:'ND-'+id,department:'Service',building:'A',floor:'RDC',room:'',walletBalance,role,status:'active',badgeBlocked:false,hrAccess:false,accountantAccess:false,topupAccess:false});
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-ndamatou-spark',firestore:{host:'127.0.0.1',port:8087,rules:readFileSync('firestore.rules','utf8')}});});
beforeEach(async()=>{await env.clearFirestore(); await env.withSecurityRulesDisabled(async c=>{
 const db=c.firestore();
 await setDoc(doc(db,'users/cashier'),profile('cashier','restaurant_admin'));
 await setDoc(doc(db,'users/agent'),profile('agent'));
 await setDoc(doc(db,'settings/institution'),{maxBadgeBalance:10000,waveCashierFeeRate:1,orderWindowEnabled:false,orderWindowStart:'00:00',weekendOrderingClosed:false,maxItemsPerOrder:2,realMealPrice:800,staffMealPrice:410});
});});
after(async()=>env?.cleanup());
const asUser=(uid:string)=>env.authenticatedContext(uid,{email:uid+'@hospital.sn',email_verified:true}).firestore();

test('Spark : un caissier ne peut pas augmenter un solde sans reçu et journal',async()=>{
 await assertFails(updateDoc(doc(asUser('cashier'),'users/agent'),{walletBalance:2000}));
});
test('Spark : un agent ne peut pas se créer un solde initial fictif',async()=>{
 await assertFails(setDoc(doc(asUser('new-agent'),'users/new-agent'),profile('new-agent','employee',50000)));
});
test('Spark : une inscription ne peut pas se donner les droits de caisse',async()=>{
 await assertFails(setDoc(doc(asUser('new-agent'),'users/new-agent'),{...profile('new-agent','employee',0),accountantAccess:true}));
});
test('Spark : une adresse administrateur non vérifiée ne peut pas promouvoir son compte',async()=>{
 const db=env.authenticatedContext('agent',{email:'smsgueye@gmail.com',email_verified:false}).firestore();
 await assertFails(updateDoc(doc(db,'users/agent'),{role:'admin'}));
});
test('Spark : un reçu financier isolé ne peut pas être fabriqué par la caisse',async()=>{
 await assertFails(setDoc(doc(asUser('cashier'),'cashTransactions/fake'),{id:'fake',employeeId:'agent',amount:1000,cashierId:'cashier',method:'cash'}));
});
const { transpileModule, ModuleKind } = require('typescript');
const sparkModule = { exports: {} as any };
new Function('require','module','exports',transpileModule(readFileSync('src/lib/sparkBalance.ts','utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:99}}).outputText)((name:string)=>name === '@ndamatou/finance' ? require('../functions/finance.cjs') : require(name),sparkModule,sparkModule.exports);
const factory = sparkModule.exports.createSparkBalance;
const orderModule = {exports:{} as any};
new Function('require','module','exports',transpileModule(readFileSync('src/lib/sparkOrders.ts','utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:99}}).outputText)((name:string)=>name === '@ndamatou/finance' ? require('../functions/finance.cjs') : require(name),orderModule,orderModule.exports);
const payOrder=orderModule.exports.createSparkPaidOrder;
const spark = (uid='cashier') => factory(asUser(uid),()=>({uid,email:uid+'@hospital.sn'}));

const seedStatusOrder = async (status='pending', paymentStatus='paid') => {
 const order={id:'status-order',employeeId:'agent',employeeName:'agent',badgeNumber:'ND-agent',department:'Service',items:[],total:410,status,paymentStatus,paymentMethod:'badge_card',createdAt:new Date().toISOString(),steps:[]};
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'orders/status-order'),order));
};

test('Sécurité Spark : un remboursement ne peut pas être requalifié en repas livré/payé',async()=>{
 await seedStatusOrder('cancelled','refunded');
 for (const actor of ['agent','cashier']) {
  await assertFails(updateDoc(doc(asUser(actor),'orders/status-order'),{status:'delivered',paymentStatus:'paid'}));
 }
});

test('Sécurité Spark : un agent ne peut pas déclarer un remboursement sans journal et recrédit',async()=>{
 await seedStatusOrder();
 await assertFails(updateDoc(doc(asUser('agent'),'orders/status-order'),{status:'cancelled',paymentStatus:'refunded'}));
});

test('Sécurité Spark : les commandes terminées ne sont pas réactivables',async()=>{
 for (const status of ['cancelled','expired','delivered','returned']) {
  await seedStatusOrder(status);
  await assertFails(updateDoc(doc(asUser('cashier'),'orders/status-order'),{status:'preparing'}));
 }
});

test('Sécurité Spark : même l’administration ne supprime pas commandes et anciens reçus',async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),'users/admin'),profile('admin','admin'));
  await setDoc(doc(c.firestore(),'cashTransactions/legacy-receipt'),{id:'legacy-receipt',employeeId:'agent',amount:1000,method:'cash',cashierId:'cashier',cashierName:'Caisse fictive',createdAt:new Date().toISOString()});
 });
 await seedStatusOrder('delivered');
 const {deleteDoc}=require('firebase/firestore');
 await assertFails(deleteDoc(doc(asUser('admin'),'orders/status-order')));
 await assertFails(deleteDoc(doc(asUser('admin'),'cashTransactions/legacy-receipt')));
});

test('Sécurité Spark : annuler une demande Wave conserve le document sans crédit',async()=>{
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'waveTopupRequests/cancel-request'),{id:'cancel-request',employeeId:'agent',amount:1000,status:'pending',reference:'FICTIF-ANNULATION'}));
 await assertSucceeds(updateDoc(doc(asUser('agent'),'waveTopupRequests/cancel-request'),{status:'cancelled',cancelledBy:'agent',cancelledAt:serverTimestamp()}));
 const saved=(await getDoc(doc(asUser('agent'),'waveTopupRequests/cancel-request'))).data();
 assert.equal(saved.status,'cancelled'); assert.equal(saved.amount,1000);
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().walletBalance,1000);
 await assert.rejects(spark().approveWave('cancel-request'));
});

test('Sécurité Spark : une demande approuvée ne peut être annulée ou effacée',async()=>{
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'waveTopupRequests/approved-request'),{id:'approved-request',employeeId:'agent',amount:1000,status:'approved',reference:'FICTIF-VALIDE'}));
 await assertFails(updateDoc(doc(asUser('agent'),'waveTopupRequests/approved-request'),{status:'cancelled',cancelledBy:'agent',cancelledAt:serverTimestamp()}));
 const {deleteDoc}=require('firebase/firestore');
 await assertFails(deleteDoc(doc(asUser('cashier'),'waveTopupRequests/approved-request')));
 await assertFails(updateDoc(doc(asUser('cashier'),'waveTopupRequests/approved-request'),{status:'pending'}));
});

test('Démo Spark : les rôles opérationnels gardent préparation, livraison et remise',async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  for(const role of ['admin','operator','delivery']) await setDoc(doc(c.firestore(),'users',role),profile(role,role));
 });
 for(const actor of ['cashier','admin','operator','delivery']) {
  await seedStatusOrder();
  for(const status of ['preparing','delivering','delivered']) {
   await assertSucceeds(updateDoc(doc(asUser(actor),'orders/status-order'),{status,deliveryTime:new Date().toISOString()}));
  }
 }
});

test('Démo Spark : le scan et l’annulation simple restent ouverts au bénéficiaire',async()=>{
 await seedStatusOrder();
 await assertSucceeds(updateDoc(doc(asUser('agent'),'orders/status-order'),{status:'delivered',paymentStatus:'paid'}));
 await seedStatusOrder();
 await assertSucceeds(updateDoc(doc(asUser('agent'),'orders/status-order'),{status:'cancelled',paymentStatus:'paid'}));
});

test('Démo Spark : confirmation administrative d’un ancien paiement en attente préservée',async()=>{
 await seedStatusOrder('pending','pending');
 await assertSucceeds(updateDoc(doc(asUser('cashier'),'orders/status-order'),{status:'delivered',paymentStatus:'paid'}));
});

test('Démo Spark : comptabilité et DRH gardent leurs accès utiles sans réécriture des soldes',async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),'users/accountant'),profile('accountant','accountant'));
  await setDoc(doc(c.firestore(),'users/hr'),profile('hr','hr'));
 });
 await seedStatusOrder();
 for(const actor of ['agent','cashier','accountant','hr']) {
  await assertSucceeds(getDoc(doc(asUser(actor),'users/agent')));
  await assertSucceeds(getDoc(doc(asUser(actor),'orders/status-order')));
 }
 await assertSucceeds(updateDoc(doc(asUser('hr'),'users/agent'),{validatedById:'hr',validatedByName:'DRH fictive',validatedAt:new Date().toISOString(),status:'active'}));
 await assertFails(updateDoc(doc(asUser('hr'),'users/agent'),{walletBalance:9999}));
 await spark('accountant').topup('agent',100,'Encaissement fictif comptable','cash','accountant-demo');
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().walletBalance,1100);
});

test('Sécurité Spark : les droits de caisse ne permettent pas de changer le montant d’une demande Wave',async()=>{
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'waveTopupRequests/tamper-request'),{id:'tamper-request',employeeId:'agent',amount:1000,status:'pending',reference:'FICTIF-INTEGRITE'}));
 await assertFails(updateDoc(doc(asUser('cashier'),'waveTopupRequests/tamper-request'),{status:'approved',amount:9000,validatedBy:'cashier'}));
 await assertFails(updateDoc(doc(asUser('agent'),'waveTopupRequests/tamper-request'),{status:'cancelled',amount:9000,cancelledBy:'agent',cancelledAt:serverTimestamp()}));
});

test('Sécurité Spark : un autre agent ne valide ni n’annule la commande ou la demande Wave',async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),'users/other-agent'),profile('other-agent'));
  await setDoc(doc(c.firestore(),'waveTopupRequests/other-request'),{id:'other-request',employeeId:'agent',amount:1000,status:'pending',reference:'FICTIF-AUTRE'});
 });
 await seedStatusOrder();
 for(const status of ['delivered','cancelled']) await assertFails(updateDoc(doc(asUser('other-agent'),'orders/status-order'),{status}));
 await assertFails(updateDoc(doc(asUser('other-agent'),'waveTopupRequests/other-request'),{status:'cancelled',cancelledBy:'other-agent',cancelledAt:serverTimestamp()}));
});

test('Spark : recharge réelle et reçu persistent après une nouvelle lecture', async()=>{
 const receipt = await spark().topup('agent',2000,'Encaissement confirmé','cash','real-1');
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().walletBalance,3000);
 const journal=(await getDoc(doc(asUser('cashier'),'walletOperations',receipt.id))).data();
 const saved=(await getDoc(doc(asUser('agent'),'cashTransactions',receipt.id))).data();
 assert.equal(journal.amount,2000); assert.deepEqual(saved,journal);
});
test('Spark : rejouer une recharge au plafond restitue le reçu sans double crédit', async()=>{
 const first=await spark().topup('agent',9000,'Versement','cash','retry-1');
 const retry=await spark().topup('agent',9000,'Versement','cash','retry-1');
 assert.equal(retry.id,first.id);
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().walletBalance,10000);
});
test('Spark : deux recharges concurrentes ne peuvent pas dépasser le plafond', async()=>{
 const results=await Promise.allSettled([
  spark().topup('agent',6000,'Encaissement A','cash','race-1'),
  spark().topup('agent',6000,'Encaissement B','cash','race-2'),
 ]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().walletBalance,7000);
});
test('Spark : un agent ordinaire ne peut pas faire une recharge complète',async()=>{
 await assertFails(spark('agent').topup('agent',1000,'Tentative','cash','fake-1'));
});
test('Spark : montant fractionnaire et badge bloqué sont refusés',async()=>{
 await assert.rejects(spark().topup('agent',1.5,'Versement','cash','fraction'));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'users/agent'),{badgeBlocked:true}));
 await assert.rejects(spark().topup('agent',1000,'Versement','cash','blocked'));
});
test('Spark : paiement Wave manuel conserve les frais et le reçu',async()=>{
 const receipt=await spark().topup('agent',1000,'Wave vérifié par caisse','wave','wave-1');
 assert.equal(receipt.method,'wave'); assert.equal(receipt.waveFeeRate,1); assert.equal(receipt.waveFeeAmount,10);
});

test('Spark : 510 F mobile donnent 505 F et les frais externes sont conservés',async()=>{
 const receipt=await spark().topup('agent',505,'Paiement vérifié','wave','shared-1',510);
 assert.equal(receipt.amount,505); assert.equal(receipt.grossAmount,510);
 assert.equal(receipt.processorFeeCents,1020); assert.equal(receipt.netReceivedCents,49980);
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().walletBalance,1505);
 const retry=await spark().topup('agent',505,'Paiement vérifié','wave','shared-1',510);
 assert.equal(retry.id,receipt.id);
});

test('Spark : Orange Money applique le même partage',async()=>{
 const receipt=await spark().topup('agent',505,'Orange vérifié','orange_money','orange-1',510);
 assert.equal(receipt.method,'orange_money'); assert.equal(receipt.amount,505);
});

test('Spark : recharge 510, crédit 505, repas 500, reste 5 sans deuxième frais',async()=>{
 await env.withSecurityRulesDisabled(async c=>{
  await updateDoc(doc(c.firestore(),'users/agent'),{walletBalance:0});
  await updateDoc(doc(c.firestore(),'settings/institution'),{realMealPrice:1000,staffMealPrice:500});
  await setDoc(doc(c.firestore(),'meals/meal-shared'),{id:'meal-shared',name:'Riz',category:'plat',price:1000,stock:5,maxStock:5,image:'Plat',isNextDay:false,isAvailableToday:true});
 });
 await spark().topup('agent',505,'Mobile vérifié','wave','flow-1',510);
 const order={id:'shared-order',employeeId:'agent',items:[{meal:{id:'meal-shared'},quantity:1}],total:500,status:'pending',paymentMethod:'badge_card',paymentStatus:'paid',createdAt:new Date().toISOString(),fulfillmentMode:'pickup',steps:[]};
 await payOrder(asUser('agent'),'agent',order);
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().walletBalance,5);
 const saved=(await getDoc(doc(asUser('agent'),'orders/shared-order'))).data();
 assert.equal(saved.settlement.staffBase,500); assert.equal(saved.settlement.hospitalBase,500);
 await assertFails(updateDoc(doc(asUser('cashier'),'orders/shared-order'),{settlement:{...saved.settlement,hospitalBase:0}}));
});

test('Spark : correction du crédit mobile ne prélève pas à nouveau la contribution agent',async()=>{
 const receipt=await spark().topup('agent',505,'Mobile vérifié','orange_money','correction-mobile',510);
 await spark().correct(receipt.id,0,'Annulation erreur de caisse');
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().walletBalance,1000);
});

test('Spark : des frais externes et un crédit mobile falsifiés sont refusés par les règles',async()=>{
 const finance=require('../functions/finance.cjs').quoteMobileTopup(510);
 await assertFails(writeRaw(directReceipt({...finance,method:'wave',balanceAfter:1505,processorFeeCents:0})));
 await assertFails(writeRaw(directReceipt({...finance,method:'wave',balanceAfter:1510,amount:510})));
 await assertFails(writeRaw(directReceipt({...finance,method:'wave',balanceAfter:1505,netReceivedCents:51000})));
});
test('Spark : un journal confirmé ne peut pas être modifié ou supprimé',async()=>{
 const receipt=await spark().topup('agent',1000,'Versement','cash','immutable');
 await assertFails(updateDoc(doc(asUser('cashier'),'walletOperations',receipt.id),{amount:5000}));
 const {deleteDoc}=require('firebase/firestore');
 await assertFails(deleteDoc(doc(asUser('cashier'),'walletOperations',receipt.id)));
 await assertFails(deleteDoc(doc(asUser('cashier'),'cashTransactions',receipt.id)));
});
const directReceipt = (changes:Record<string,unknown>={}) => ({id:'raw-1',kind:'topup',actorId:'cashier',employeeId:'agent',employeeName:'agent',badgeNumber:'ND-agent',amount:1000,method:'cash',waveFeeRate:0,waveFeeAmount:0,cashierId:'cashier',cashierName:'cashier',balanceBefore:1000,balanceAfter:2000,createdAt:new Date().toISOString(),recordedAt:serverTimestamp(),note:'Encaissement',...changes});
const writeRaw = (receipt:any, uid='cashier') => {
 const db=asUser(uid); const batch=writeBatch(db);
 batch.update(doc(db,'users/agent'),{walletBalance:receipt.balanceAfter,lastWalletOperationId:receipt.id});
 batch.set(doc(db,'walletOperations',receipt.id),receipt);
 batch.set(doc(db,'cashTransactions',receipt.id),receipt);
 return batch.commit();
};
test('Spark : les règles refusent un dépassement et un faux montant même par API directe',async()=>{
 await assertFails(writeRaw(directReceipt({amount:10000,balanceAfter:11000})));
 await assertFails(writeRaw(directReceipt({amount:1.5,balanceAfter:1001.5})));
});
test('Spark : les frais financiers ne peuvent pas être inventés',async()=>{
 await assertFails(writeRaw(directReceipt({waveFeeRate:99,waveFeeAmount:99000})));
});
test('Spark : parcours profil personnel',async()=>{
 await assertSucceeds(updateDoc(doc(asUser('agent'),'users/agent'),{name:'Agent Modifié'}));
});
test('Spark : parcours DRH validation badge',async()=>{
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users/hr'),profile('hr','hr')));
 await assertSucceeds(updateDoc(doc(asUser('hr'),'users/agent'),{status:'active',validatedById:'hr',validatedByName:'hr',validatedAt:new Date().toISOString()}));
});
test('Spark : une nouvelle inscription normale reste possible',async()=>{
 await assertSucceeds(setDoc(doc(asUser('new-agent'),'users/new-agent'),profile('new-agent','employee',0)));
});
test('Spark : une commande payée nécessite son débit dans la même transaction',async()=>{
 const db=asUser('agent');
 const meal={id:'meal-1',name:'Riz',category:'plat',price:800,stock:5,maxStock:5,image:'Plat',isNextDay:false,isAvailableToday:true};
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'meals/meal-1'),meal));
 const order={id:'order-1',employeeId:'agent',employeeName:'agent',items:[{meal,quantity:1}],total:410,status:'pending',paymentMethod:'badge_card',paymentStatus:'paid',createdAt:new Date().toISOString(),fulfillmentMode:'pickup',steps:[],serverCreatedAt:serverTimestamp()};
 await assertFails(setDoc(doc(db,'orders/order-1'),order));
 await assertSucceeds(payOrder(db,'agent',order));
 assert.equal((await getDoc(doc(db,'users/agent'))).data().walletBalance,590);
 const savedOrder=(await getDoc(doc(db,'orders/order-1'))).data();
 assert.equal(savedOrder.settlement.staffBase,410);
 assert.equal(savedOrder.settlement.hospitalBase,390);
});
test('Spark : une carte prépayée est consommée une seule fois',async()=>{
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'prepaidCards/card-1'),{id:'card-1',employeeId:'agent',badgeNumber:'ND-agent',code:'CODE-1',amount:2000,cashierId:'cashier',cashierName:'cashier',status:'active'}));
 const first=await spark('agent').redeem('card-1');
 const retry=await spark('agent').redeem('card-1');
 assert.equal(retry.id,first.id);
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().walletBalance,3000);
 assert.equal((await getDoc(doc(asUser('agent'),'prepaidCards/card-1'))).data().status,'used');
});
test('Spark : validation manuelle Wave et crédit sont atomiques et non rejouables',async()=>{
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'waveTopupRequests/request-1'),{id:'request-1',employeeId:'agent',amount:1000,status:'pending',reference:'PAIEMENT-1'}));
 const first=await spark().approveWave('request-1');
 const retry=await spark().approveWave('request-1');
 assert.equal(retry.id,first.id);
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().walletBalance,2000);
});
test('Spark : une correction tracée ne peut être créditée deux fois',async()=>{
 const original=await spark().topup('agent',1000,'Encaissement','cash','correct-me');
 const correction=await spark().correct(original.id,500,'Erreur montant reçu');
 const retry=await spark().correct(original.id,500,'Erreur montant reçu');
 assert.equal(retry.id,correction.id);
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().walletBalance,1500);
});
test('Spark : une correction de solde produit son journal et son reçu',async()=>{
 const receipt=await spark().adjust('agent',1200,'Rapprochement de caisse');
 assert.equal(receipt.amount,200);
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().walletBalance,1200);
});
test('Spark : un remboursement caisse ne crédite qu’une fois et restaure le stock',async()=>{
 const meal={id:'meal-1',name:'Riz',category:'plat',stock:4,price:800};
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),'meals/meal-1'),meal);
  await setDoc(doc(c.firestore(),'orders/refund-me'),{id:'refund-me',employeeId:'agent',employeeName:'agent',items:[{meal,quantity:1}],total:410,status:'pending',paymentMethod:'badge_card',paymentStatus:'paid',createdAt:new Date().toISOString(),steps:[]});
 });
 const first=await spark().cancel('refund-me',[]);
 const retry=await spark().cancel('refund-me',[]);
 assert.equal(retry.id,first.id);
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().walletBalance,1410);
 assert.equal((await getDoc(doc(asUser('agent'),'meals/meal-1'))).data().stock,5);
});
const rawOrderWrite = async (total=410, quantity=1, changeStock=true, itemId='meal-1', includeSettlement=true) => {
 const db=asUser('agent'); const meal={id:itemId,name:'Riz',category:'plat',price:800,stock:500,maxStock:500,image:'Plat',isNextDay:false,isAvailableToday:true};
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'meals/meal-1'),{...meal,id:'meal-1'}));
 const before=(await getDoc(doc(db,'users/agent'))).data();
 const day=Math.floor(Date.now()/86400000);
 const oldQty=before.orderCounterDay===day ? before.regularPortionsToday || 0 : 0;
 const oldHot=before.orderCounterDay===day ? before.hotPortionsToday || 0 : 0;
 const order={id:'forged-order',employeeId:'agent',employeeName:'agent',items:[{meal,quantity}],total,status:'pending',paymentMethod:'badge_card',paymentStatus:'paid',createdAt:new Date().toISOString(),fulfillmentMode:'pickup',steps:[]};
 Object.assign(order,{badgeNumber:before.badgeNumber,department:before.department,steps:[{status:'pending',title:'Commande',description:'Paiement',timestamp:order.createdAt}],createdAtMillis:Date.parse(order.createdAt),serverCreatedAt:serverTimestamp(),orderCounterDay:day,regularPortions:quantity,hotPortions:quantity,extraCreditsUsed:0});
 if(includeSettlement) Object.assign(order,{settlement:{policy:'shared_510_505_v1',staffBase:800*quantity-(oldHot===0?390:0),hospitalBase:oldHot===0?390:0}});
 const batch=writeBatch(db); batch.set(doc(db,'orders/forged-order'),order);
 batch.update(doc(db,'users/agent'),{walletBalance:before.walletBalance-total,lastPaidOrderId:'forged-order',orderCounterDay:day,regularPortionsToday:oldQty+quantity,hotPortionsToday:oldHot+quantity,extraSubsidyCredits:before.extraSubsidyCredits || 0});
 if(changeStock) batch.update(doc(db,'meals/meal-1'),{stock:500-quantity});
 return batch.commit();
};
test('Spark : tarif falsifié à 1 FCFA refusé par les règles',async()=>{await assertFails(rawOrderWrite(1));});
test('Spark : quantité excessive refusée par les règles',async()=>{await assertFails(rawOrderWrite(800,100));});
test('Spark : commande sans réservation du stock refusée',async()=>{await assertFails(rawOrderWrite(410,1,false));});
test('Spark : article inventé refusé par les règles',async()=>{await assertFails(rawOrderWrite(410,1,false,'fake-meal'));});
const orderInput = (id:string,total:number,quantity=1) => ({id,employeeId:'agent',employeeName:'agent',items:[{meal:{id:'meal-1'},quantity}],total,status:'pending',paymentMethod:'badge_card',paymentStatus:'paid',createdAt:new Date().toISOString(),fulfillmentMode:'pickup',orderType:'regular',steps:[]});
const seedOrders = async (balance=5000) => env.withSecurityRulesDisabled(async c=>{
 await updateDoc(doc(c.firestore(),'users/agent'),{walletBalance:balance});
 await setDoc(doc(c.firestore(),'meals/meal-1'),{id:'meal-1',name:'Riz',category:'plat',price:800,stock:50,maxStock:50,image:'Plat',isNextDay:false,isAvailableToday:true});
});
test('Spark : première portion subventionnée, suivante au tarif réel, quota quotidien imposé',async()=>{
 await seedOrders(); const db=asUser('agent');
 await assertSucceeds(payOrder(db,'agent',orderInput('first',410)));
 await assertSucceeds(payOrder(db,'agent',orderInput('second',800)));
 await assert.rejects(payOrder(db,'agent',orderInput('third',800)));
 assert.equal((await getDoc(doc(db,'users/agent'))).data().walletBalance,3790);
});
test('Spark : une deuxième subvention ne peut pas être forcée par appel direct',async()=>{
 await seedOrders(); await payOrder(asUser('agent'),'agent',orderInput('first',410));
 await assertFails(rawOrderWrite(410));
});
test('Spark : le tarif personnel permanent s’applique aux portions autorisées',async()=>{
 await seedOrders();
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'users/agent'),{alwaysStaffMealPrice:true}));
 await assertSucceeds(payOrder(asUser('agent'),'agent',orderInput('permanent',820,2)));
});
test('Spark : un crédit de subvention accordé par la DRH est consommé une seule fois',async()=>{
 await seedOrders(); await payOrder(asUser('agent'),'agent',orderInput('first',410));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'users/agent'),{extraSubsidyCredits:1}));
 await assertSucceeds(payOrder(asUser('agent'),'agent',orderInput('extra-credit',410)));
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().extraSubsidyCredits,0);
});
test('Spark : le créneau de commande fermé est contrôlé par les règles',async()=>{
 await seedOrders(); const hour=new Date().getUTCHours();
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'settings/institution'),{orderWindowEnabled:true,orderWindowStart:String((hour+2)%24).padStart(2,'0')+':00',orderWindowEnd:String((hour+3)%24).padStart(2,'0')+':00'}));
 await assertFails(payOrder(asUser('agent'),'agent',orderInput('closed-window',410)));
});
test('Spark : une correction déjà confirmée refuse un montant cible différent',async()=>{
 const original=await spark().topup('agent',1000,'Encaissement','cash','correct-conflict');
 await spark().correct(original.id,500,'Erreur de saisie');
 await assert.rejects(spark().correct(original.id,700,'Erreur de saisie'));
});
test('Spark : trois portions de deux plats différents restent compatibles avec les règles',async()=>{
 await seedOrders();
 await env.withSecurityRulesDisabled(async c=>{
  await updateDoc(doc(c.firestore(),'settings/institution'),{maxItemsPerOrder:3});
  for(const id of ['meal-2','meal-3']) await setDoc(doc(c.firestore(),'meals',id),{id,name:'Riz '+id,category:'plat',price:800,stock:50,maxStock:50,image:'Plat',isNextDay:false,isAvailableToday:true});
 });
 const input={...orderInput('three-meals',2010),items:[{meal:{id:'meal-1'},quantity:2},{meal:{id:'meal-2'},quantity:1}]};
 await assertSucceeds(payOrder(asUser('agent'),'agent',input));
});
test('Spark : remboursement caisse libère le quota de la commande annulée',async()=>{
 await seedOrders(); await payOrder(asUser('agent'),'agent',orderInput('first',410));
 await spark().cancel('first',[]);
 assert.equal((await getDoc(doc(asUser('agent'),'users/agent'))).data().regularPortionsToday,0);
 await assertSucceeds(payOrder(asUser('agent'),'agent',orderInput('replacement',410)));
});


test('Spark : une transaction directe au tarif officiel reste autorisée',async()=>{await assertSucceeds(rawOrderWrite(410));});
test('Spark : une nouvelle commande sans ventilation ne peut pas échapper au décompte',async()=>{await assertFails(rawOrderWrite(410,1,true,'meal-1',false));});

test('Spark : des boissons ne peuvent pas se déguiser en dîner spécial pour contourner le quota',async()=>{
 await seedOrders(); const day=Math.floor(Date.now()/86400000); const db=asUser('agent');
 const meal={id:'drink',name:'Eau',category:'boisson',price:100,stock:50,image:'Eau',isNextDay:false,isAvailableToday:true};
 await env.withSecurityRulesDisabled(async c=>{
  await updateDoc(doc(c.firestore(),'settings/institution'),{extrasOrderingEnabled:true,specialDinnerEnabled:false});
  await updateDoc(doc(c.firestore(),'users/agent'),{orderCounterDay:day,regularPortionsToday:2,hotPortionsToday:1});
  await setDoc(doc(c.firestore(),'meals/drink'),meal);
 });
 const input={...orderInput('fake-dinner',100),orderType:'special_dinner',items:[{meal,quantity:1}]};
 await assert.rejects(payOrder(db,'agent',input));
 const createdAt=new Date().toISOString(); const batch=writeBatch(db);
 batch.set(doc(db,'orders/fake-dinner'),{...input,badgeNumber:'ND-agent',department:'Service',createdAt,createdAtMillis:Date.parse(createdAt),serverCreatedAt:serverTimestamp(),steps:[{status:'pending',title:'Commande',description:'Paiement',timestamp:createdAt}],orderCounterDay:day,regularPortions:0,hotPortions:0,extraCreditsUsed:0});
 batch.update(doc(db,'users/agent'),{walletBalance:4900,lastPaidOrderId:'fake-dinner',orderCounterDay:day,regularPortionsToday:2,hotPortionsToday:1,extraSubsidyCredits:0});
 batch.update(doc(db,'meals/drink'),{stock:49});
 await assertFails(batch.commit());
});


test('Spark : rapport comptable basé sur la date serveur et compatible avec les anciens reçus',async()=>{
 const reportModule={exports:{} as any};
 new Function('require','module','exports',transpileModule(readFileSync('src/lib/sparkReports.ts','utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:99}}).outputText)(require,reportModule,reportModule.exports);
 const now=new Date(); const start=new Date(now.getTime()-60000).toISOString(); const end=new Date(now.getTime()+60000).toISOString();
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),'cashTransactions/official'),{createdAt:'2000-01-01T00:00:00.000Z',recordedAt:now,amount:1000});
  await setDoc(doc(c.firestore(),'cashTransactions/legacy'),{createdAt:now.toISOString(),amount:2000});
  await setDoc(doc(c.firestore(),'cashTransactions/outside'),{createdAt:now.toISOString(),recordedAt:new Date('2000-01-01'),amount:3000});
 });
 const rows=await reportModule.exports.loadSparkReport(asUser('cashier'),'cashTransactions',start,end);
 assert.deepEqual(rows.map(r=>r.id).sort(),['legacy','official']);
 assert.equal(rows.find(r=>r.id==='official').createdAt,now.toISOString());
});


test('Spark : livraison autorisée conserve les frais du tarif institutionnel',async()=>{
 await seedOrders();
 await env.withSecurityRulesDisabled(async c=>{
  await updateDoc(doc(c.firestore(),'users/agent'),{deliveryAllowed:true});
  await updateDoc(doc(c.firestore(),'settings/institution'),{deliveryFeeEnabled:true,deliveryFeeAmount:100,deliveryFeePayer:'employee'});
 });
 await assertSucceeds(payOrder(asUser('agent'),'agent',{...orderInput('delivery',510),fulfillmentMode:'delivery'}));
});

test('Spark : livraison validée par un responsable du service reste possible',async()=>{
 await seedOrders();
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users/issuer'),{...profile('issuer'),deliveryCodeViewer:true,deliveryVisibleDepartments:[]}));
 await assertSucceeds(payOrder(asUser('agent'),'agent',{...orderInput('delivery-issuer',410),fulfillmentMode:'delivery',deliveryAuthorizedById:'issuer'}));
});
