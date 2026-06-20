# Módulo 02 — Multi-Tenant y Sucursales (Tenant)

> **Fase:** 1 — Fundación  
> **Depende de:** 01-auth  
> **Es requerido por:** todos los demás módulos

---

## 1. Propósito y Alcance

El módulo Tenant implementa el corazón del modelo multi-tenant de GestioNube. Cada `Tenant` representa una empresa o sucursal. El sistema soporta una jerarquía padre-hijo de dos niveles: una empresa principal puede tener múltiples sucursales bajo ella.

**Quién lo usa:**
- El administrador de la empresa: configura datos fiscales, logo, sucursales y condición IVA
- El sistema internamente: prácticamente cada query filtra datos por tenant activo

**Qué resuelve:**
- Aislamiento de datos entre empresas distintas (multi-tenancy)
- Visibilidad cruzada entre empresa principal y sus sucursales
- Cambio de contexto de trabajo (switch de sucursal activa)
- Features habilitables/deshabilitables por tenant según el plan contratado

**Límite del módulo:** este módulo gestiona la identidad y configuración de las empresas. La lógica de qué puede hacer cada usuario dentro de una empresa corresponde a RBAC (módulo 03).

---

## 2. Entidades de Datos

### Tabla `tenants` (principal)

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| `id` | bigint PK | no | auto | — |
| `name` | varchar(255) | no | — | Nombre comercial de la empresa o sucursal |
| `email` | varchar(255) unique | no | — | Email de contacto de la empresa |
| `cuit` | varchar(255) | sí | null | CUIT/CUIL fiscal argentino |
| `phone` | varchar(255) | sí | null | Teléfono de contacto |
| `logo_url` | varchar(255) | sí | null | Ruta en R2 (no URL completa). Accessor construye la URL pública |
| `iva` | varchar(255) | sí | null | Condición IVA del vendedor: "Responsable Inscripto", "Monotributo", etc. Comentario en DB: "IVA condition of the seller/tenant" |
| `parent_id` | bigint FK nullable | sí | null | FK self-referencial → `tenants.id`. NULL = empresa raíz, valor = sucursal |
| `address_id` | bigint FK nullable | sí | null | → `addresses.id` (ON DELETE SET NULL) |
| `active` | boolean | no | true | Si el tenant está activo. `false` = suspendido |
| `suspended_reason` | text | sí | null | Motivo de suspensión (ej: pago vencido) |
| `created_at` / `updated_at` | timestamp | — | — | — |
| `deleted_at` | timestamp | sí | null | Soft delete |

**Índices y constraints:**
- `tenants_email_unique` — email único en toda la tabla
- `tenants_parent_id_foreign` — FK self → `tenants.id` ON DELETE CASCADE (si se elimina la empresa padre, se eliminan las sucursales)

**Accessor `getLogoUrlAttribute`:** si `logo_url` es vacío, retorna `asset('images/default-logo.webp')`; si tiene valor, construye la URL pública desde el disco de storage (Cloudflare R2).

**Attribute `getIsfreeTierAttribute`:** consulta la suscripción activa del tenant actual para determinar si está en free tier.

---

### Tablas relacionadas

#### `tenant_user` (pivot usuarios ↔ tenants)
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | — |
| `tenant_id` | bigint FK | → `tenants.id` ON DELETE CASCADE |
| `user_id` | bigint FK | → `users.id` ON DELETE CASCADE |
| `created_at` / `updated_at` | timestamp | — |

Un usuario puede pertenecer a múltiples tenants. Un tenant puede tener múltiples usuarios.

#### `tax_tenant` (pivot impuestos ↔ tenants)
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | — |
| `tenant_id` | bigint FK | → `tenants.id` ON DELETE CASCADE |
| `tax_id` | bigint FK | → `taxes.id` ON DELETE CASCADE |
| `value` | numeric(10,2) | Porcentaje de la alícuota (ej: 21.00, 10.50) |
| `is_preferred` | boolean | Default false. Solo una alícuota por tenant es `true` |

Solo uno puede tener `is_preferred = true` por tenant (el sistema lo garantiza en `setPreferredTax`).

#### `tenant_features` (features habilitadas por tenant)
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | — |
| `tenant_id` | bigint FK | → `tenants.id` ON DELETE CASCADE |
| `feature` | varchar(255) | Clave del feature (ver listado) |
| `enabled` | boolean | Default true |

**Unique constraint:** `(tenant_id, feature)` — un registro por feature por tenant.

**Features disponibles (`TenantFeature::FEATURES`):**
| Clave | Descripción |
|-------|-------------|
| `facturas_venta` | Facturas de Venta |
| `facturas_compra` | Facturas de Compra |
| `presupuestos` | Presupuestos |
| `notas_credito` | Notas de Crédito/Débito |
| `facturacion_electronica` | Facturación Electrónica (AFIP/ARCA) |
| `tesoreria` | Tesorería |
| `caja` | Sistema de Caja |
| `inventario` | Inventario |
| `lotes` | Lotes |
| `transferencias` | Transferencias entre Sucursales |
| `ordenes_compra` | Órdenes de Compra |
| `reportes` | Reportes |
| `actividad` | Log de Actividad |
| `sucursales` | Gestión de Sucursales |
| `exportar_excel` | Exportación a Excel |
| `ecommerce` | eCommerce (próximamente) |

Si un feature no tiene registro en la tabla, **se considera habilitado por defecto** (`GetTenantFeaturesAction` usa `$saved[$key] ?? true`).

#### `tenant_transaction` (pivot tenants ↔ transacciones)
| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | — |
| `tenant_id` | bigint FK | → `tenants.id` ON DELETE CASCADE |
| `transaction_id` | bigint FK | → `transactions.id` ON DELETE CASCADE |

---

## 3. Reglas de Negocio

1. **Jerarquía de solo 2 niveles en práctica:** aunque el sistema técnicamente soporta jerarquías de hasta 10 niveles (el algoritmo de `GetTenantContextAction` itera hasta 10 niveles en cada dirección), el uso real es padre (empresa) → hijo (sucursal). No se crean sucursales de sucursales.

2. **Herencia de logo al crear sucursal:** `CreateBranchAction` copia el `logo_url` raw del tenant padre. Si el padre no tiene logo, la sucursal tampoco tendrá.

3. **`parent_id` del branch se toma del tenant activo en sesión:** `storeBranch` en el controller hace `$data['parent_id'] = GetCurrentTenantAction::execute()`. No viene del request — previene crear branches bajo tenants ajenos.

4. **Email único en toda la tabla `tenants`:** dos empresas o sucursales no pueden compartir el mismo email.

5. **IVA preferido es único:** al cambiar el impuesto preferido, se desactivan todos los otros con `UPDATE tax_tenant SET is_preferred = false WHERE tenant_id = ?` antes de activar el nuevo.

6. **Features habilitadas por defecto:** si un tenant no tiene registro en `tenant_features` para un feature dado, se asume habilitado. Solo se graba cuando se deshabilita explícitamente.

7. **Cascade delete en jerarquía:** si se elimina un tenant padre, sus hijos se eliminan también (FK ON DELETE CASCADE). En la práctica, los tenants se soft-delete, no físicamente.

8. **Caché invalida al cambiar de tenant:** `SwitchBranchAction` invalida tres claves de caché: `inventory_products_{id}`, `dashboard_data_tenant_{id}`, `treasury_dashboard_tenant_{id}`.

9. **Acceso a sucursales para el rol admin:** un usuario con rol admin puede hacer switch a las sucursales (hijos) de los tenants a los que pertenece, aunque no esté directamente en la tabla `tenant_user` de esa sucursal. El super-admin puede acceder a cualquier tenant.

10. **Acceso a `GetTenantContext`:** los IDs retornados incluyen self + todos los descendientes + todos los ancestros. Esto permite que un admin de la empresa principal vea datos de sus sucursales, y vice-versa (con el permiso "Ver Facturas Sucursales").

---

## 4. Flujos Funcionales

### 4.1 Tenant activo en sesión

```
Cada request autenticado:
  │
  └─ GetCurrentTenantAction::execute()
      ├─ Session::get('tenant_id') → si existe, retorna
      └─ Si NO existe en sesión:
          ├─ User::find(Auth::id())
          ├─ $user->tenants()->orderBy('id')->first()
          └─ Session::put('tenant_id', $tenant->id) → retorna id

En Inertia Middleware (cada request):
  ├─ currentTenant = session('tenant_id')
  └─ tenant = GetCurrentTenantObjectAction::execute()
      → { id, name, logo_url, is_branch }
```

### 4.2 Cambio de sucursal activa

```
POST /branch/switch  { tenant_id: int }
  │
  └─ SwitchBranchAction::execute($user, $tenantId)
      │
      ├─ Si NO es super-admin:
      │   ├─ Verificar acceso directo: user->tenants WHERE id = $tenantId
      │   └─ Si admin: verificar hijos de sus tenants (parent_id en userTenantIds)
      │   └─ Si ninguno → Exception("No tienes permiso")
      │
      ├─ SetCurrentTenantAction::execute($tenantId)
      │   └─ Session::put('tenant_id', $tenantId)
      │
      └─ Invalidar caché:
          Cache::forget("inventory_products_{$tenantId}")
          Cache::forget("dashboard_data_tenant_{$tenantId}")
          Cache::forget("treasury_dashboard_tenant_{$tenantId}")

  → redirect back
```

### 4.3 Crear sucursal

```
POST /tenant/branch  (StoreBranchRequest)
  │
  └─ TenantController::storeBranch()
      ├─ $data['parent_id'] = GetCurrentTenantAction::execute()
      └─ CreateBranchAction::execute($data, Auth::user())
          │ DB::transaction()
          │
          ├─ Copiar logo_url del padre (getRawOriginal para evitar accessor)
          ├─ Crear Address si viene address + location_id
          ├─ [1] Tenant::create({ name, cuit, phone, email, address_id, parent_id, iva, logo_url })
          ├─ [2] DefaultFreeTierForTenant::execute($branch) → crea registros free tier
          ├─ [3] Setup taxes: attach IVA 10.5%, 21% (preferred), 27%
          ├─ [4] User->tenants()->attach($branch->id)
          ├─ [5] Role::create({ name: 'admin', tenant_id: $branch->id })
          ├─ [6] User->roles()->attach($role->id)
          └─ [7] $role->permissions()->sync(Permission::all())

  → redirect back con flash success
```

### 4.4 Actualizar información de la empresa

```
PUT /tenant/{tenant}  (UpdateTenantRequest)
  │
  └─ UpdateTenantInfo::execute($data, $tenant)
      ├─ Si viene address + location_id:
      │   Address::updateOrCreate(['id' => $tenant->address_id], { address, location_id })
      └─ $tenant->update({ name, cuit, email, phone, address_id, iva })
```

### 4.5 Actualizar logo

```
POST /tenant/{tenant}/logo  (UpdateLogoRequest)
  │
  └─ UpdateLogoAction::execute($tenant, $file)
      ├─ DeletePictureAction::execute($oldLogoPath)  ← borra del R2
      ├─ filename = "{tenant_id}_{timestamp}.webp"
      ├─ UploadPictureAction::execute(file, 'logos', filename) → retorna path
      └─ $tenant->update(['logo_url' => $logoPath])
```

### 4.6 Cambiar IVA preferido

```
POST /tenant/{tenant}/preferred-tax  { tax_tenant_id: int }
  │
  └─ TenantController::setPreferredTax()
      ├─ Valida que tax_tenant_id existe en tax_tenant
      ├─ Valida que pertenece al tenant
      ├─ UPDATE tax_tenant SET is_preferred = false WHERE tenant_id = ?
      └─ $taxTenant->update(['is_preferred' => true])
```

### 4.7 GetTenantContext — visibilidad cruzada

```
GetTenantContextAction::execute($tenantId): int[]

Retorna: self + descendientes (hasta 10 niveles) + ancestros (hasta 10 niveles)

Ejemplo:
  Empresa A (id=1, parent_id=null)
  ├─ Sucursal B (id=2, parent_id=1)
  └─ Sucursal C (id=3, parent_id=1)

  Para tenantId=2:
  → [2, 1]       (self + padre)

  Para tenantId=1:
  → [1, 2, 3]    (self + hijos)

Uso: todas las queries que necesitan multi-tenant usan este array como whereIn
```

---

## 5. Integraciones con Otros Módulos

| Módulo | Relación | Detalle |
|--------|----------|---------|
| **Auth** (01) | Crea tenant al registrar usuario | Pipeline de registro crea tenant, lo attach, crea rol admin |
| **RBAC** (03) | Roles son tenant-scoped | `roles.tenant_id` — al cambiar tenant, cambian los roles válidos |
| **Todos** | `tenant_id` en casi toda tabla | Productos, facturas, transacciones, lotes, etc. filtran por tenant activo |
| **Tesorería** (16) | `tenant_transaction` pivot | Las transacciones se vinculan a tenants |
| **Suscripción** (05) | `suscriptions.tenant_id` | Cada tenant tiene su plan y suscripción activa |
| **Inertia Middleware** | Propaga tenant al frontend | `tenant`, `currentTenant`, `tenant_features` en cada request |

---

## 6. API / Endpoints

| Método | Path | Nombre | Auth | Body / Params | Respuesta |
|--------|------|--------|------|---------------|-----------|
| `POST` | `/branch/switch` | `branch.switch` | auth | `{ tenant_id: int }` | Redirect back |
| `GET` | `/tenant` | `tenant` | auth, policy:viewAny | — | Render `company/company` con tenant + roles + permisos + provincias + márgenes |
| `PUT` | `/tenant/{tenant}` | `tenant.update` | auth, policy:update | `name, cuit, email, phone, iva, address?, location_id?` | Redirect back |
| `PUT` | `/tenant/role/{role}` | `tenant.updateRolePermissions` | auth, policy:updateRolePermissions | `{ permissions: string[] }` | Redirect back |
| `POST` | `/tenant/{tenant}/logo` | `tenant.updateLogo` | auth, policy:updateLogo | `logo` (file) | Redirect back |
| `POST` | `/tenant/{tenant}/preferred-tax` | `tenant.setPreferredTax` | auth, policy:update | `{ tax_tenant_id: int }` | Redirect back |
| `POST` | `/tenant/branch` | `tenant.branch.store` | auth, policy:store | `name, cuit?, phone?, email?, iva?, address?, location_id?` | Redirect back |
| `PUT` | `/tenant/branch/{tenant}` | `tenant.branch.update` | auth, policy:store | `name, cuit?, phone?, email?, iva?, address?, location_id?` | Redirect back |
| `DELETE` | `/tenant/branch/{tenant}` | `tenant.branch.destroy` | auth, policy:store | — | Redirect back |

**Datos enviados al frontend en `GET /tenant`:**
```typescript
{
  tenant: TenantResource,      // con taxes, roles, permisos, address, children
  roles: RoleResource[],
  permissions: PermissionResource[],
  allPermissions: Permission[],
  provinces: ProvinceResource[],
  locations: LocationResource[],  // lazy — solo si viene province_id en query
  margins: MarginResource[],
  taxConditions: { value, label }[],  // enum TaxConditionTypes
}
```

---

## 7. Consideraciones de Migración Next.js

### Tenant activo en sesión → JWT claim o cookie
En Laravel el tenant activo se guarda en `Session::put('tenant_id')`. En Next.js la opción recomendada es incluir el `tenantId` como claim en el JWT (o token de sesión de NextAuth). Esto evita un lookup extra en cada request.

```typescript
// En NextAuth session callback:
async session({ session, token }) {
  session.tenantId = token.tenantId  // claim persistido en token
  return session
}
```

Al cambiar de sucursal, actualizar el token mediante una acción server-side que renueve el JWT con el nuevo `tenantId`.

### GetTenantContextAction → utilidad compartida
Esta función es crítica para casi todos los módulos. En Next.js implementar como función pura en `/lib/tenant.ts`:

```typescript
export async function getTenantContext(tenantId: number, db: DB): Promise<number[]> {
  const ids = [tenantId]
  // descendants (hasta 10 niveles)
  // ancestors (hasta 10 niveles)
  return [...new Set(ids)]
}
```

### RLS como alternativa al filtrado en código
En el ERP v1, el filtrado por tenant se hace en cada query (`.whereIn('tenant_id', context)`). En v2.0, considerar **Row-Level Security en PostgreSQL** para hacerlo a nivel de BD:

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = ANY(current_setting('app.tenant_ids')::int[]));
```

Se setea con `SET LOCAL app.tenant_ids = '{1,2,3}'` al inicio de cada request. Esto elimina el riesgo de olvidar el filtro en una query.

### Features → context provider en React
Los features del tenant se compartían via Inertia shared props. En Next.js, pasar como props del layout o usar un context provider en el root:

```tsx
// app/(authenticated)/layout.tsx
const features = await getTenantFeatures(tenantId)
return <FeaturesProvider features={features}>{children}</FeaturesProvider>
```

### Logo en R2
El accessor que construye la URL pública del logo se reemplaza con una función utilitaria:
```typescript
function getTenantLogoUrl(logoPath: string | null): string {
  if (!logoPath) return '/images/default-logo.webp'
  return `${env.R2_PUBLIC_URL}/${logoPath}`
}
```

### Jerarquía en tiempo real (switch de branch)
Al cambiar de branch en Next.js, el servidor debe:
1. Validar que el usuario tiene acceso al tenantId solicitado
2. Actualizar el tenantId en la sesión (NextAuth `update()` o cookie)
3. Invalidar el caché del tenant anterior (Cloudflare Cache API o KV)
4. Retornar redirect con el nuevo contexto

### eCommerce (feature `ecommerce`)
El feature `ecommerce` ya existe en `TenantFeature::FEATURES` (marcado como "próximamente"). En v2.0 este flag habilitará la sincronización con GestioNube Shop (el proyecto independiente de eCommerce). Cada tenant con este feature activo tendrá credenciales de API para conectar su tienda.

---

## 8. Mejoras Propuestas v2.0

### Onboarding Wizard post-registro
Actualmente el usuario llega a un dashboard vacío. En v2.0, detectar si el tenant está recién creado (sin productos, sin facturas) y mostrar un wizard guiado:
1. **Paso 1:** Completar datos fiscales (CUIT, condición IVA, dirección)
2. **Paso 2:** Subir logo
3. **Paso 3:** Agregar el primer producto
4. **Paso 4 (opcional):** Configurar punto de venta AFIP
5. **Paso 5 (opcional):** Crear primera sucursal o invitar al equipo

### Configuración de features desde el panel
Actualmente los features se habilitan/deshabilitan solo desde superadmin. En v2.0, el plan determina automáticamente qué features están disponibles. Agregar una pantalla de configuración visible para el admin de la empresa que muestre qué features tiene activos según su plan.

### Multi-idioma por tenant
Agregar campo `locale` en `tenants` para soportar el sistema en otros países hispanohablantes (Colombia, México, Perú). El locale afecta formato de fecha, moneda y terminología fiscal.

### Límites de uso por tenant
Agregar tabla `tenant_limits` con límites configurables (máx. usuarios, máx. sucursales, máx. productos, etc.) vinculados al plan. En v2.0 verificar estos límites antes de crear recursos.

### Credenciales de API para GestioNube Shop
Agregar tabla `api_credentials` (tenant_id, client_id, client_secret, scopes, last_used_at) para que cada tenant pueda conectar su tienda online con el ERP via OAuth2 machine-to-machine.
