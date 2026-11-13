import test from 'node:test';
import assert from 'node:assert/strict';
import { getOrderAccounting } from '../src/lib/business.ts';
import type { Order } from '../src/types.ts';

const meal = { items:[{meal:{category:'plat',price:800},quantity:1}],orderType:'regular' } as Order;
test('les anciens repas gardent les anciens tarifs après activation',()=>{
 const result=getOrderAccounting(meal,{real:1000,staff:500,hospital:500,legacy:{real:800,staff:410,hospital:390}});
 assert.equal(result.staffPaid,410); assert.equal(result.hospitalSupport,390);
});
test('un repas du nouveau modèle garde ses montants après un changement de tarif',()=>{
 const result=getOrderAccounting({...meal,settlement:{policy:'shared_510_505_v1',staffBase:500,hospitalBase:500}},{real:1200,staff:600,hospital:600});
 assert.equal(result.staffPaid,500); assert.equal(result.hospitalSupport,500);
});
