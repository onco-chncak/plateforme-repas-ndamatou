/** Keeps the same operation ID until a recharge has a confirmed server receipt. */
export const createTopupRequestStore = (
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
  createId = () => 'cash-' + crypto.randomUUID(),
) => {
  const storageKey = 'ndamatou_pending_topups';
  const read = (): Record<string, string> => {
    const value = (storage ?? window.sessionStorage).getItem(storageKey);
    const parsed = value ? JSON.parse(value) : {};
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.values(parsed).some(id => typeof id !== 'string')) {
      throw new Error('Historique des recharges en attente invalide. Vérifiez les opérations avant de réessayer.');
    }
    return parsed;
  };
  return {
    begin(key: string) {
      const pending = read();
      const id = pending[key] || createId();
      pending[key] = id;
      // Persist before the server call, so a refresh cannot generate a second credit.
      (storage ?? window.sessionStorage).setItem(storageKey, JSON.stringify(pending));
      return id;
    },
    complete(key: string) {
      try {
        const pending = read();
        delete pending[key];
        (storage ?? window.sessionStorage).setItem(storageKey, JSON.stringify(pending));
      } catch (error) {
        // A stale pending ID is safer than reporting failure after a confirmed credit.
        console.error('Reçu confirmé, nettoyage de la recharge en attente impossible', error);
      }
    },
  };
};
