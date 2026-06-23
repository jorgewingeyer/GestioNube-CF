export interface Permission {
  id: number;
  name: string;
}
export interface Role {
  id: number;
  name: string;
  permissions: Permission[];
}
export interface User {
  id: number;
  name: string;
  email: string;
  tenants: {
    id: number;
    name: string;
  }[];
  roles?: Role[];
  permissions?: Permission[];
  created_at: string;
  updated_at: string;
  avatar_url: string;
}

export const usePermissions = (): {
  hasRole: string[];
  hasPermissions: Permission[];
} => {
  const user = {} as User;
  const hasRole = (user as User)?.roles?.map((role) => role.name) ?? [];
  const hasPermissions = (user as User)?.permissions ?? [];
  return { hasRole, hasPermissions };
};

export const useCan = (permission: string) => {
  //   const { hasPermissions } = usePermissions();
  //   return hasPermissions?.includes(permission);
  return true;
};

/**
 * Devuelve true si la feature está habilitada para el tenant activo.
 * Por defecto true si no hay registro (feature nunca configurada = habilitada).
 */
export const useTenantFeature = (featureKey: string): boolean => {
  const tenant_features = {} as Record<string, boolean>;
  if (!tenant_features) return true;
  return tenant_features[featureKey] ?? true;
};

/**
 * Devuelve el mapa completo de features del tenant activo.
 */
export const useTenantFeatures = (): Record<string, boolean> => {
  const tenant_features = {};
  return tenant_features ?? {};
};
