import { create } from 'zustand';
import { useTranslation } from 'react-i18next';
import { useToastStore } from './toast';

type AuthState = {
  roles: Set<string>;
  setRoles: (roles: string[]) => void;
  addRole: (role: string) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  roles: new Set(['admin']),
  setRoles: (roles) =>
    set({
      roles: new Set(roles.map((role) => role.toLowerCase())),
    }),
  addRole: (role) =>
    set((state) => {
      const next = new Set(state.roles);
      next.add(role.toLowerCase());
      return { roles: next };
    }),
}));

type RoleGuard = {
  assertAccess: (required: string | string[], contextKey?: string) => boolean;
};

export const useRoleGuard = (): RoleGuard => {
  const roles = useAuthStore((state) => state.roles);
  const { t } = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);

  const assertAccess: RoleGuard['assertAccess'] = (required, contextKey) => {
    const requiredList = Array.isArray(required) ? required : [required];
    const lowerRoles = requiredList.map((role) => role.toLowerCase());
    const allowed = lowerRoles.some((role) => roles.has(role));
    if (!allowed) {
      pushToast({
        tone: 'error',
        title: t('auth.accessDeniedTitle'),
        description: t('auth.accessDeniedBody', {
          roles: lowerRoles.join(', '),
        }),
        actionLabel: contextKey,
      });
    }
    return allowed;
  };

  return { assertAccess };
};
