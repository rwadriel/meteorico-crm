import { useAuth } from '../context/AuthContext.js';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ['*'],
  admin: [
    'campaigns:*', 'contacts:*', 'groups:*', 'messages:*',
    'settings:read', 'settings:update', 'reports:*',
  ],
  operator: [
    'campaigns:read', 'campaigns:update',
    'contacts:read', 'contacts:update',
    'groups:read',
    'messages:create', 'messages:read',
    'reports:read',
  ],
  analyst: [
    'campaigns:read', 'contacts:read', 'groups:read',
    'messages:read', 'reports:*',
  ],
  read_only: ['campaigns:read', 'reports:read'],
};

function hasPermission(role: string, resource: string, action: string): boolean {
  if (role === 'owner') return true;

  const perms = ROLE_PERMISSIONS[role] ?? [];
  const full = `${resource}:${action}`;

  return perms.some(
    (p) => p === '*' || p === full || p === `${resource}:*`,
  );
}

const SECTION_PERMISSIONS: Record<string, [string, string]> = {
  dashboard: ['campaigns', 'read'],
  campaigns: ['campaigns', 'read'],
  contacts: ['contacts', 'read'],
  groups: ['groups', 'read'],
  messages: ['messages', 'read'],
  flows: ['campaigns', 'read'],
  ai: ['campaigns', 'read'],
  integrations: ['settings', 'read'],
  imports: ['contacts', 'read'],
  audit: ['settings', 'read'],
  settings: ['settings', 'read'],
  reports: ['reports', 'read'],
};

export function usePermission(resource: string, action: string): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return hasPermission(user.role, resource, action);
}

export function useCanAccess(section: string): boolean {
  const { user } = useAuth();
  if (!user) return false;
  const mapping = SECTION_PERMISSIONS[section];
  if (!mapping) return false;
  return hasPermission(user.role, mapping[0], mapping[1]);
}
