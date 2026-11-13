import type { UserProfile } from '../types';

// Placeholder while authentication loads; never represents an account or a balance.
export const EMPTY_PROFILE: UserProfile = {
  id: '', name: '', email: '', phone: '', badgeNumber: '', department: '',
  building: '', floor: '', room: '', walletBalance: 0, role: 'employee', status: 'pending',
};
