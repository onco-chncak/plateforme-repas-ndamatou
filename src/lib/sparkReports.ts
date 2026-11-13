import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';

// Reports use the server timestamp; older records without one retain their legacy ISO date.
export const loadSparkReport = async (db: Firestore, name: 'cashTransactions' | 'orders', startIso: string, endIso: string) => {
  const field = name === 'orders' ? 'serverCreatedAt' : 'recordedAt';
  const [official, legacy] = await Promise.all([
    getDocs(query(collection(db,name),where(field,'>=',new Date(startIso)),where(field,'<=',new Date(endIso)))),
    getDocs(query(collection(db,name),where('createdAt','>=',startIso),where('createdAt','<=',endIso))),
  ]);
  const rows = new Map<string,Record<string,unknown>>();
  for (const item of legacy.docs) {const data=item.data(); if (!data[field]) rows.set(item.id,{...data,id:item.id});}
  for (const item of official.docs) {const data=item.data(); rows.set(item.id,{...data,id:item.id,createdAt:data[field].toDate().toISOString()});}
  return [...rows.values()];
};
