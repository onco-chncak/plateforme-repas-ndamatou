import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransitionOrder } from '../src/lib/orderLifecycle.ts';

test('un repas remboursé ne peut pas être remis ou remis en préparation', () => {
  for (const target of ['preparing', 'delivering', 'delivered']) {
    assert.equal(canTransitionOrder({status:'cancelled',paymentStatus:'refunded'}, target), false);
  }
});

test('les scans et les opérations normales des commandes actives restent possibles', () => {
  for (const source of ['pending', 'preparing', 'delivering']) {
    for (const target of ['delivered', 'cancelled', 'expired', 'returned']) {
      assert.equal(canTransitionOrder({status:source,paymentStatus:'paid'},target), true);
    }
  }
});

test('les commandes terminales ne redeviennent pas actives ; une confirmation identique est neutre', () => {
  for (const source of ['cancelled', 'expired', 'delivered', 'returned']) {
    assert.equal(canTransitionOrder({status:source,paymentStatus:'paid'},'preparing'),false);
    assert.equal(canTransitionOrder({status:source,paymentStatus:'paid'},source),true);
  }
});
