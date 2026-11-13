const DELIVERY_CODE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const getDeliveryCodeExpiresAt = (date: Date) =>
  new Date((Math.floor(date.getTime() / DELIVERY_CODE_WINDOW_MS) + 1) * DELIVERY_CODE_WINDOW_MS).toISOString();

export const getPersonalDeliveryCode = (date: Date, institutionSeed: string, profileId: string) => {
  const windowNumber = Math.floor(date.getTime() / DELIVERY_CODE_WINDOW_MS);
  const source = `${institutionSeed || 'NDAMATOU'}-${profileId}-${windowNumber}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return String(1000 + (Math.abs(hash) % 9000));
};

