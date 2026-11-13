import test from 'node:test';
import assert from 'node:assert/strict';
import { createTopupRequestStore } from '../src/lib/topupRequests.ts';
const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
test('une réponse perdue garde le même identifiant après actualisation', () => {
 const storage = memory();
 const first = createTopupRequestStore(storage, () => 'operation-1').begin('cashier-agent-2000');
 const afterReload = createTopupRequestStore(storage, () => 'operation-2').begin('cashier-agent-2000');
 assert.equal(afterReload, first);
});
test('une recharge confirmée libère une nouvelle opération de même montant', () => {
 const storage = memory();
 const first = createTopupRequestStore(storage, () => 'operation-1');
 first.begin('key'); first.complete('key');
 assert.equal(createTopupRequestStore(storage, () => 'operation-2').begin('key'), 'operation-2');
});
test('des agents différents conservent des identifiants distincts', () => {
 const storage = memory(); let sequence = 0;
 const store = createTopupRequestStore(storage, () => String(++sequence));
 assert.notEqual(store.begin('agent-a'), store.begin('agent-b'));
});
test('stockage indisponible : refus avant tout appel de recharge', () => {
 const store = createTopupRequestStore({ getItem: () => null, setItem: () => { throw new Error('Stockage indisponible'); } });
 assert.throws(() => store.begin('key'), /Stockage indisponible/);
});
