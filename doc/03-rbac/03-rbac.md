# Módulo 03 — Control de Acceso Basado en Roles (RBAC)

> **Fase:** 1 — Fundación  
> **Depende de:** 01-auth, 02-tenant  
> **Es requerido por:** todos los módulos que verifican autorización

---

## 1. Propósito y Alcance

El módulo RBAC (Role-Based Access Control) responde a la pregunta "¿qué puede hacer este usuario autenticado en este tenant?". Gestiona roles, permisos y las políticas de autorización que protegen cada operación del sistema.

**Diseño central:**
- Los **roles** son **tenant-scoped** — cada tenant define sus propios roles con sus propios permisos.
- Los **permisos** son **globales** — el catálogo de 102 permisos es único para todo el sistema.
- El **super-admin** es un bypass total — no necesita permisos explícitos.
- Un usuario puede tener roles en múltiples tenants, pero en cada request solo aplican los roles del tenant activo y sus ancestros.

**Quién lo usa:** administradores de empresa (crear/editar roles, asignar permisos), todos los controllers (verificar autorización en cada request), y el sistema al momento del registro (crear el rol admin con todos los permisos).

---

## 2. Entidades de Datos

### Tabla `roles`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | Auto-incremental |
| `name` | varchar NOT NULL | Ej: "admin", "VENTAS", "COMPRAS" |
| `tenant_id` | bigint NOT NULL | FK → `tenants.id`. Scoping obligatorio. |
| `guard_name` | varchar NOT NULL | Siempre `'web'` |
| `created_at` / `updated_at` | timestamp nullable | — |
| `deleted_at` | timestamp nullable | Soft delete |

**Índices relevantes:** ningún índice único explícito en la tabla — el nombre del rol puede repetirse entre tenants distintos (Ej: cada tenant tiene su propio "admin").

**No existe un rol global.** El mismo nombre en distintos `tenant_id` son entidades completamente separadas con sus propios permisos.

### Tabla `permissions`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | Auto-incremental |
| `name` | varchar NOT NULL | Nombre legible en español. Ej: "Ver Facturas de Venta" |
| `guard_name` | varchar NOT NULL | Siempre `'web'` |
| `created_at` / `updated_at` | timestamp nullable | — |
| `deleted_at` | timestamp nullable | Soft delete |

**Sin `tenant_id`.** Los permisos son un catálogo global inmutable. No se crean por tenant, se asignan a roles.

### Tabla `permission_role` (pivot)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | — |
| `role_id` | bigint NOT NULL | FK → `roles.id` |
| `permission_id` | bigint NOT NULL | FK → `permissions.id` |
| `created_at` / `updated_at` | timestamp nullable | — |

Cuando un admin modifica los permisos de un rol, esta tabla recibe un `sync()` completo (se eliminan todos y se reinsertan los nuevos).

### Tabla `role_user` (pivot)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | — |
| `role_id` | bigint NOT NULL | FK → `roles.id` |
| `user_id` | bigint NOT NULL | FK → `users.id` |
| `created_at` / `updated_at` | timestamp nullable | — |

Un usuario puede tener múltiples roles (incluso en el mismo tenant). La lógica de "qué roles son válidos" es contextual al request.

---

## 3. Catálogo Completo de 102 Permisos

### Empresa (IDs 1–3)

| ID | Nombre | Política |
|----|--------|----------|
| 1 | Ver Empresa | `TenantPolicy::viewAny` |
| 2 | Actualizar Empresa | `TenantPolicy::update` |
| 3 | Actualizar Logo | `TenantPolicy::updateLogo` |

### Roles (IDs 4–7)

| ID | Nombre | Política |
|----|--------|----------|
| 4 | Crear Roles | `RolePolicy::create` |
| 5 | Actualizar Roles | `RolePolicy::update` / `updateRolePermissions` |
| 6 | Eliminar Roles | `RolePolicy::delete` (deshabilitado, siempre false) |
| 7 | Asignar Permisos | Verificado en `TenantController` |

### Impuestos (IDs 8–11)

| ID | Nombre |
|----|--------|
| 8 | Ver Impuestos |
| 9 | Crear Impuestos |
| 10 | Actualizar Impuestos |
| 11 | Eliminar Impuestos |

### Usuarios (IDs 12–17)

| ID | Nombre | Política |
|----|--------|----------|
| 12 | Ver Usuarios | `UserPolicy::viewAny` |
| 13 | Crear Usuario | `UserPolicy::store` |
| 14 | Actualizar Usuario | `UserPolicy::update` (deshabilitado) |
| 15 | Eliminar Usuario | `UserPolicy::delete` (deshabilitado) |
| 16 | Ver Roles | `RolePolicy::viewAny` |
| 17 | Asignar Roles | `UserPolicy::updateRole` |

### Dashboard (ID 18)

| ID | Nombre | Política |
|----|--------|----------|
| 18 | Ver Dashboard | `DashboardPolicy` (checkTenantContext) |

### Categorías (IDs 19–22)

| ID | Nombre |
|----|--------|
| 19 | Ver Categorias |
| 20 | Crear Categorias |
| 21 | Actualizar Categorias |
| 22 | Eliminar Categorias |

### Productos (IDs 23–26)

| ID | Nombre | Política |
|----|--------|----------|
| 23 | Ver Productos | `ProductPolicy::viewAny` |
| 24 | Crear Productos | `ProductPolicy::create` |
| 25 | Actualizar Productos | `ProductPolicy::update` |
| 26 | Eliminar Productos | `ProductPolicy::delete` |

### Lotes / Batches (IDs 27–30)

| ID | Nombre | Política |
|----|--------|----------|
| 27 | Ver Lotes | `BatchPolicy::viewAny` |
| 28 | Crear Lotes | `BatchPolicy::create` |
| 29 | Actualizar Lotes | `BatchPolicy::update` |
| 30 | Eliminar Lotes | `BatchPolicy::delete` |

### Clientes (IDs 31–35)

| ID | Nombre | Política |
|----|--------|----------|
| 31 | Ver Clientes | `CounterpartyPolicy::viewAnyClient` |
| 32 | Crear Clientes | `CounterpartyPolicy::storeClient` |
| 33 | Actualizar Clientes | `CounterpartyPolicy::updateClient` |
| 34 | Eliminar Clientes | `CounterpartyPolicy::deleteClient` |
| 35 | Asociar Clientes | `CounterpartyPolicy::attachClient` |

### Proveedores (IDs 36–40)

| ID | Nombre | Política |
|----|--------|----------|
| 36 | Ver Proveedores | `CounterpartyPolicy::viewAnyProvider` |
| 37 | Crear Proveedores | `CounterpartyPolicy::storeProvider` |
| 38 | Actualizar Proveedores | `CounterpartyPolicy::updateProvider` |
| 39 | Eliminar Proveedores | `CounterpartyPolicy::deleteProvider` |
| 40 | Asociar Proveedores | `CounterpartyPolicy::attachProvider` |

### Facturas de Venta (IDs 41–45)

| ID | Nombre | Política |
|----|--------|----------|
| 41 | Ver Facturas de Venta | `InvoicePolicy::viewAnySale` (lista) |
| 42 | Ver Factura de Venta | `InvoicePolicy::view` (individual) |
| 43 | Crear Facturas de Venta | `InvoicePolicy::storeSale` / `createSale` |
| 44 | Actualizar Facturas de Venta | `InvoicePolicy::update` (tipo SALE) |
| 45 | Eliminar Facturas de Venta | `InvoicePolicy::delete` (tipo SALE) |

### Facturas de Compra (IDs 46–50)

| ID | Nombre | Política |
|----|--------|----------|
| 46 | Ver Facturas de Compra | `InvoicePolicy::viewAnyPurchase` |
| 47 | Ver Factura de Compra | `InvoicePolicy::view` (tipo PURCHASE) |
| 48 | Crear Facturas de Compra | `InvoicePolicy::storePurchase` |
| 49 | Actualizar Facturas de Compra | `InvoicePolicy::update` (tipo PURCHASE) |
| 50 | Eliminar Facturas de Compra | `InvoicePolicy::delete` (tipo PURCHASE) |

### Inventario (IDs 51–54)

| ID | Nombre | Política |
|----|--------|----------|
| 51 | Ver Dashboard Inventario | `InventoryPolicy::viewDashboard` |
| 52 | Ver Productos en Inventario | `InventoryPolicy::viewProducts` |
| 53 | Ver Análisis de Inventario | `InventoryPolicy::viewAnalysis` |
| 54 | Ver Inventario | `InventoryPolicy::view` |

### Presupuestos (IDs 55–58)

| ID | Nombre | Política |
|----|--------|----------|
| 55 | Ver Presupuestos | `InvoicePolicy::viewAnyBudget` |
| 56 | Crear Presupuestos | `InvoicePolicy::storeBudget` |
| 57 | Actualizar Presupuestos | `InvoicePolicy::update` (tipo BUDGET) |
| 58 | Eliminar Presupuestos | `InvoicePolicy::delete` (tipo BUDGET) |

### Notas de Crédito (IDs 59–62)

| ID | Nombre | Política |
|----|--------|----------|
| 59 | Ver Notas de Crédito | `InvoicePolicy::viewAnyCreditNote` |
| 60 | Crear Notas de Crédito | `InvoicePolicy::createCreditNote` (admin OR permiso) |
| 61 | Actualizar Notas de Crédito | `InvoicePolicy::update` (tipo CREDIT_NOTE) |
| 62 | Eliminar Notas de Crédito | `InvoicePolicy::delete` (tipo CREDIT_NOTE) |

### Márgenes (IDs 63–66)

| ID | Nombre | Política |
|----|--------|----------|
| 63 | Ver Margen | `MarginPolicy::viewAny` |
| 64 | Crear Margen | `MarginPolicy::create` |
| 65 | Actualizar Margen | `MarginPolicy::update` |
| 66 | Eliminar Margen | `MarginPolicy::delete` |

### Transacciones / Tesorería (IDs 67–77)

| ID | Nombre | Política |
|----|--------|----------|
| 67 | Ver Transacciones | `TransactionPolicy::viewAny` (lista) |
| 68 | Ver Transacción | `TransactionPolicy::view` (individual) |
| 69 | Ver Dashboard Tesorería | — |
| 70 | Ver Flujo de Caja | — |
| 71 | Ver Balance General | — |
| 72 | Ver Resumen de Clientes | — |
| 73 | Ver Resumen de Proveedores | — |
| 74 | Ver Resumen de Cuentas | `TransactionPolicy::accountSummaries` |
| 75 | Crear Transacciones | `TransactionPolicy::create` / `store` |
| 76 | Actualizar Transacciones | `TransactionPolicy::update` |
| 77 | Eliminar Transacciones | `TransactionPolicy::delete` |

### Historial de Precios (IDs 78–79)

| ID | Nombre | Política |
|----|--------|----------|
| 78 | Ver Hitorial de Precios | `PriceHistoryPolicy::viewAny` |
| 79 | Descargar Reporte Historial de Precios | `PriceHistoryPolicy::download` |

### Actividades (ID 80)

| ID | Nombre | Política |
|----|--------|----------|
| 80 | Ver Actividades | `ActivityPolicy::viewAny` |

### Reportes (IDs 81–86)

| ID | Nombre | Política |
|----|--------|----------|
| 81 | Ver Reportes | `ReportPolicy::viewAny` |
| 82 | Emitir Reportes de Productos | `ReportPolicy::emitProducts` |
| 83 | Emitir reportes de Clientes | `ReportPolicy::emitClients` |
| 84 | Emitir reportes de Proveedores | `ReportPolicy::emitProviders` |
| 85 | Emitir reportes Ventas | `ReportPolicy::emitSales` |
| 86 | Emitir reportes Compras | `ReportPolicy::emitPurchases` |

### Órdenes de Compra (IDs 87–92)

| ID | Nombre | Política |
|----|--------|----------|
| 87 | Crear Orden de Compra | `PurchaseOrderPolicy::create` |
| 88 | Editar Orden de Compra | `PurchaseOrderPolicy::update` |
| 89 | Rechazar Orden de Compra | `PurchaseOrderPolicy::reject` |
| 90 | Aprobar Orden de Compra | `PurchaseOrderPolicy::approve` |
| 91 | Devolver Orden de Compra | `PurchaseOrderPolicy::revertToDraft` |
| 92 | Eliminar Orden de Compra | `PurchaseOrderPolicy::delete` |

### Multi-Sucursal (IDs 93–95)

| ID | Nombre | Descripción |
|----|--------|-------------|
| 93 | Ver Facturas Sucursales | **Permiso especial**: amplía visibilidad a toda la jerarquía de tenants. Detectado en `HandlesTenantAccess::checkTenant()` |
| 94 | Gestionar Pagos Sucursales | Acceso a transacciones de otras sucursales |
| 95 | Gestionar Órdenes de Compra Sucursales | `PurchaseOrderPolicy::canAccessTenant()` usa `GetTenantContextAction` si este permiso existe |

### Caja (IDs 96–102)

| ID | Nombre | Política |
|----|--------|----------|
| 96 | Ver Caja | `CashShiftPolicy::viewAny` / `view` |
| 97 | Abrir Turno | `CashShiftPolicy::open` |
| 98 | Cerrar Turno | `CashShiftPolicy::close` (requiere `status='open'`) |
| 99 | Registrar Movimiento de Caja | `CashShiftPolicy::createMovement` |
| 100 | Ver Historial de Caja | `CashShiftPolicy::viewHistory` |
| 101 | Gestionar Cajas | `CashRegisterPolicy::*` |
| 102 | Exportar Caja | `CashShiftPolicy::export` |

---

## 4. Roles en el Sistema

### Tipos de roles

| Tipo | Descripción | Comportamiento |
|------|-------------|----------------|
| **super-admin** | Rol global de sistema (tenant_id = 1) | Bypassa TODAS las políticas. `$user->hasRole('super-admin')` es el primer check en cada policy. Puede ver todos los tenants. |
| **admin** | Creado automáticamente en el registro y al crear sucursales | Recibe los 102 permisos al crearse. En muchas políticas hay un shortcut explícito: `$user->getRoleNames()->contains('admin')`. |
| **user** | Rol por defecto para usuarios invitados | Permisos limitados. El admin asigna permisos manualmente. |
| **Roles custom** (VENTAS, COMPRAS, etc.) | Creados por el admin de cada tenant | Los permisos se configuran libremente desde la UI de empresa. |

### Roles en la BD (resumen)

```
id=1  super-admin  tenant_id=1  (rol de sistema)
id=2  user         tenant_id=1  (base)
id=3  admin        tenant_id=2  (empresa demo)
id=4  VENTAS       tenant_id=2  (rol custom)
id=5  admin        tenant_id=3
id=9  COMPRAS      tenant_id=2  (rol custom)
... (un "admin" por cada tenant registrado)
```

Cada empresa registrada automáticamente tiene su propio `admin` con los 102 permisos. Los roles custom tienen los permisos que el admin les asigne.

---

## 5. Reglas de Negocio

### 5.1 Resolución de roles válidos (HasRoles trait)

```php
// app/Http/Trait/HasRoles.php

public function getValidRoles(): Collection
{
    $tenantId = GetCurrentTenantAction::execute();

    return $this->roles->filter(function ($role) use ($tenantId) {
        // Incluye roles del tenant activo
        if ($role->tenant_id === $tenantId) return true;

        // Incluye roles de hasta 10 niveles de ancestros
        $currentTenantId = $tenantId;
        for ($i = 0; $i < 10; $i++) {
            $parentId = Tenant::find($currentTenantId)?->parent_id;
            if (!$parentId) break;
            if ($role->tenant_id === $parentId) return true;
            $currentTenantId = $parentId;
        }
        return false;
    });
}
```

**Implicación:** un usuario con rol "admin" en el tenant padre (empresa) también tiene ese rol cuando está operando en una sucursal hija. Los permisos del padre "filtran hacia abajo".

### 5.2 Resolución de permisos

Los permisos SOLO provienen de roles. No existen permisos directos asignados al usuario.

```php
public function getPermissionsViaRoles(): Collection
{
    return $this->getValidRoles()
        ->flatMap(fn($role) => $role->permissions)
        ->unique('id');
}
```

### 5.3 El shortcut admin en las políticas

Muchas políticas tienen una comprobación explícita del rol "admin" además del permiso correspondiente:

```php
// Patrón típico en las policies:
return $this->checkTenantContext($user) 
    && ($user->getRoleNames()->contains('admin') || $user->getPermissionNames()->contains('Ver Empresa'));
```

Esto significa que el rol admin tiene acceso garantizado independientemente de los permisos configurados en `permission_role`. Es un segundo mecanismo de seguridad para que los administradores no se queden sin acceso si alguien modifica los permisos del rol admin.

**Excepción:** `TransactionPolicy`, `CashShiftPolicy` y algunas otras políticas NO tienen el shortcut admin — requieren el permiso explícito siempre.

### 5.4 El permiso especial "Ver Facturas Sucursales" (ID 93)

Este permiso altera el comportamiento de `HandlesTenantAccess::checkTenant()`:

```php
public function checkTenant(User $user, $model): bool
{
    if ($user->hasRole('super-admin')) return true;

    if ($user->hasPermissionTo('Ver Facturas Sucursales')) {
        // Visibilidad completa: self + descendientes + ancestros (hasta 10 niveles cada lado)
        $allowedIds = $this->getAllowedTenantIds($currentTenantId);
        return in_array($model->tenant_id, $allowedIds);
    }

    // Sin el permiso: solo el tenant activo
    return $currentTenantId === $model->tenant_id;
}
```

**Quién usa esto:** InvoicePolicy, TransactionPolicy, ProductPolicy, CounterpartyPolicy — los módulos con datos financieros.

### 5.5 Contexto de tenant requerido

`checkTenantContext($user)` valida que el usuario tenga un tenant activo en sesión:

```php
public function checkTenantContext(User $user): bool
{
    if ($user->hasRole('super-admin')) return true;
    return GetCurrentTenantAction::execute() !== null;
}
```

Si no hay `tenant_id` en sesión, todas las políticas que usan `checkTenantContext` devuelven `false`.

### 5.6 Operaciones deshabilitadas (false forzado)

Las siguientes políticas siempre devuelven `false` por decisión de diseño (las operaciones no están disponibles via UI):

| Policy | Método | Motivo |
|--------|--------|--------|
| `RolePolicy` | `delete`, `forceDelete` | Los roles no se eliminan (soft-delete nunca activado) |
| `UserPolicy` | `update`, `delete`, `forceDelete` | No existe pantalla de edición de otro usuario |
| `TenantPolicy` | `view`, `delete`, `forceDelete` | Operaciones no expuestas |
| `InvoicePolicy` | `restore`, `forceDelete` | Las facturas no se restauran via UI |

### 5.7 PurchaseOrderPolicy: patrón distinto

`PurchaseOrderPolicy` NO usa `HandlesTenantAccess`. Implementa `canAccessTenant()` directamente con `GetTenantContextAction`. El `viewAny` siempre retorna `true` (el filtro es en la query, no en la policy).

---

## 6. Flujos Funcionales

### 6.1 Creación de rol personalizado

```
POST /tenant/role
  │
  ├─ Verifica: RolePolicy::create (admin OR "Crear Roles")
  ├─ Valida: name (único por tenant), guard_name='web'
  └─ CreateRoleAction::execute()
      ├─ Role::create([name, tenant_id, guard_name='web'])
      └─ retorna el rol creado (sin permisos inicialmente)
```

### 6.2 Modificación de permisos de un rol

```
PUT /tenant/role/{role}
  │
  ├─ Verifica: RolePolicy::updateRolePermissions (admin OR "Actualizar Roles")
  └─ UpdateRolePermissionsAction::execute($role, $permissionIds)
      └─ $role->permissions()->sync($permissionIds)
         (elimina los anteriores y asigna los nuevos en permission_role)
```

### 6.3 Asignación de rol a usuario

```
PUT /users/{user}/role    (o similar)
  │
  ├─ Verifica: UserPolicy::updateRole (admin OR "Asignar Roles")
  └─ AssignRoleToUserAction::execute($user, $role)
      └─ $user->roles()->syncWithoutDetaching([$role->id])
         (agrega sin remover roles existentes de otros tenants)
```

### 6.4 Evaluación de autorización en un request

```
GET /invoices-sale
  │
  ├─ Middleware 'auth' → verifica sesión
  ├─ Middleware 'can:viewAnySale,App\Models\Invoice'
  │   └─ InvoicePolicy::viewAnySale($user)
  │       ├─ checkTenantContext($user) → tenant_id en sesión?
  │       └─ getPermissionNames()->contains('Ver Facturas de Venta')
  │           └─ getPermissionsViaRoles()
  │               └─ getValidRoles() → filtra por tenant activo + ancestros
  └─ Controller ejecuta la query
```

---

## 7. Las 21 Políticas — Resumen

| Policy | Modelo | Permisos clave |
|--------|--------|----------------|
| `ActivityPolicy` | Activity | Ver Actividades |
| `ArcaPolicy` | ArcaCertificate | Verificado por tenant (admin only) |
| `BatchPolicy` | Batch | Ver/Crear/Actualizar/Eliminar Lotes |
| `CashRegisterPolicy` | CashRegister | Gestionar Cajas |
| `CashShiftPolicy` | CashShift | Ver/Abrir/Cerrar Turno, Registrar Movimiento, Ver Historial, Exportar Caja |
| `CategoryPolicy` | Category | Ver/Crear/Actualizar/Eliminar Categorias |
| `CounterpartyPolicy` | Counterparty | 5 permisos por tipo (cliente/proveedor) |
| `InventoryPolicy` | (global) | 4 permisos de visualización de inventario |
| `InvoicePolicy` | Invoice | Discrimina por `invoice_type` en update/delete/view |
| `MarginPolicy` | Margin | Ver/Crear/Actualizar/Eliminar Margen |
| `PriceHistoryPolicy` | PriceHistory | Ver / Descargar Historial |
| `ProductPolicy` | Product | Ver/Crear/Actualizar/Eliminar Productos |
| `PurchaseOrderPolicy` | PurchaseOrder | Flujo de aprobación (Crear/Editar/Aprobar/Rechazar/Devolver/Eliminar) |
| `ReportPolicy` | (global) | Ver + 5 tipos de reportes |
| `RolePolicy` | Role | Crear/Actualizar Roles |
| `SuscriptionPolicy` | Suscription | Acceso a configuración de suscripción |
| `TaxPolicy` | Tax | Ver/Crear/Actualizar/Eliminar Impuestos |
| `TenantPolicy` | Tenant | Ver/Actualizar Empresa / Actualizar Logo |
| `TransactionPolicy` | Transaction | Ver/Crear/Actualizar/Eliminar Transacciones + Resumen de Cuentas |
| `UserPolicy` | User | Ver/Crear Usuarios + Asignar Roles |
| `Concerns/HandlesTenantAccess` | (trait) | Base compartida: checkTenant, getAllowedTenantIds, checkTenantContext |

---

## 8. Integraciones con Otros Módulos

| Módulo | Relación |
|--------|----------|
| **Auth (01)** | El registro crea el rol "admin" con 102 permisos (`AssignAllPermissionsToRole`). El login no verifica permisos. |
| **Tenant (02)** | Los roles tienen `tenant_id`. Al cambiar de sucursal, `getValidRoles()` recalcula con el nuevo tenant activo. |
| **Users (04)** | Los usuarios se asocian a roles vía `role_user`. El módulo de usuarios expone la UI para asignar/quitar roles. |
| **Todos los demás** | Cada módulo tiene su policy que usa `HandlesTenantAccess`. Los controllers aplican `can()` middleware o `$this->authorize()`. |

---

## 9. Consideraciones de Migración Next.js

### De Policies a Middleware y Checks en Server Components

Laravel Policies son clases PHP invocadas por el middleware `can()`. En Next.js App Router el equivalente es:

```typescript
// lib/rbac.ts
export async function can(user: User, permission: string): Promise<boolean> {
  if (user.isSuperAdmin) return true
  const validRoles = await getValidRoles(user.id, user.currentTenantId)
  const permissions = validRoles.flatMap(r => r.permissions)
  return permissions.some(p => p.name === permission)
}

// En un Server Component / Route Handler:
const allowed = await can(session.user, 'Ver Facturas de Venta')
if (!allowed) return notFound() // o redirect('/403')
```

### Roles válidos: resolver en el JWT o en DB

**Opción A (recomendada):** al momento de `auth()`, consultar los roles válidos para el tenant activo e incluirlos como claim en el JWT:
```json
{ "userId": 42, "tenantId": 7, "roles": ["admin"], "permissions": ["Ver Facturas de Venta", ...] }
```
Ventaja: cero queries en cada request. Desventaja: el JWT puede quedar desactualizado si cambian permisos.

**Opción B:** consultar siempre a DB. Usar Cloudflare KV o D1 con caché por `userId:tenantId` con TTL corto (60s).

### Tenant-scoping con Row-Level Security (RLS)

En PostgreSQL se puede definir una política RLS en la tabla `roles`:
```sql
CREATE POLICY tenant_roles ON roles
  USING (tenant_id = current_setting('app.current_tenant_id')::bigint);
```
Esto elimina la necesidad de filtrar en código. Ver módulo 02 para detalles de RLS.

### Permisos como enum TypeScript

Para evitar strings mágicos en el código Next.js, definir un enum centralizado:

```typescript
// lib/permissions.ts
export const Permissions = {
  // Empresa
  VER_EMPRESA: 'Ver Empresa',
  ACTUALIZAR_EMPRESA: 'Actualizar Empresa',
  ACTUALIZAR_LOGO: 'Actualizar Logo',
  // Roles
  CREAR_ROLES: 'Crear Roles',
  ACTUALIZAR_ROLES: 'Actualizar Roles',
  ASIGNAR_PERMISOS: 'Asignar Permisos',
  // ... los 102 permisos
} as const

export type Permission = typeof Permissions[keyof typeof Permissions]
```

### Caché de permisos

Las consultas de permisos se ejecutan en CADA request. En Next.js con Cloudflare Workers, usar:
- **D1 con índice en `permission_role`** para queries rápidas
- **React `cache()`** para deduplicar llamadas en el mismo render tree
- **KV Store** como caché de segundo nivel con TTL 5 minutos o menos segun conveniencia

---

## 10. Mejoras Propuestas v2.0

### Permisos granulares adicionales sugeridos

Los permisos actuales cubren bien los módulos existentes. Para v2.0 se proponen los siguientes permisos nuevos:

**GestioNube Shop (eCommerce)**
- `Conectar GestioNube Shop` — autorizar la vinculación de una tienda
- `Ver Sincronización Productos` — ver estado de sync de catálogo
- `Gestionar Sincronización Stock` — disparar sync manual de stock
- `Ver Pedidos Online` — acceso a pedidos que vienen de la tienda

**ARCA / AFIP**
- `Gestionar Certificados AFIP` — cargar key_pem y passphrase
- `Ver Estado AFIP` — ver validez del ticket WSAA y última emisión exitosa

**IA y Análisis**
- `Ver Módulo IA` — acceso al módulo de agentes IA
- `Ejecutar Análisis IA` — disparar análisis de rentabilidad, predicciones

**Auditoría**
- `Exportar Log de Actividades` — descargar historial de auditoría
- `Ver Log de Accesos` — ver quién accedió a qué y cuándo

### Interfaz de gestión de permisos mejorada

En la versión actual, los permisos se asignan desde la pantalla de empresa (vista básica con checkboxes). En v2.0 proponer:
- Agrupación visual por dominio (Ventas, Compras, Tesorería, etc.)
- Presets de rol: botón "Perfil Vendedor", "Perfil Contador", etc. que precarga un conjunto típico
- Preview de "¿qué verá este usuario?" antes de guardar
- Historial de cambios de permisos (quién cambió qué y cuándo)

### Herencia de permisos por jerarquía de sucursales

En la versión actual, la herencia de roles solo funciona hacia arriba (hijos heredan roles del padre). En v2.0 proponer configuración de herencia explícita:
- Opción "Esta sucursal hereda configuración de permisos de la empresa principal"
- Override selectivo: heredar todo excepto los permisos de Caja

### RBAC basado en atributos (ABAC) como extensión

Para casos avanzados (ej: "puede ver facturas pero solo las propias"):
- Agregar un campo `context` en `permission_role` con JSON de condiciones
- El resolver de permisos evalúa el contexto al momento de la query

### Auditoría de cambios de roles y permisos

Registrar en `activities` cada vez que:
- Se crea/modifica/elimina un rol
- Se asignan/quitan permisos de un rol
- Se cambia el rol de un usuario

Actualmente estos eventos NO quedan en el log de actividades.
