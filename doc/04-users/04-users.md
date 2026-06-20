# Módulo 04 — Gestión de Usuarios

> **Fase:** 1 — Fundación  
> **Depende de:** 01-auth, 02-tenant, 03-rbac  
> **Es requerido por:** todos los módulos (la identidad del usuario es el actor de toda operación)

---

## 1. Propósito y Alcance

El módulo de usuarios permite a los administradores gestionar los miembros del equipo dentro de su empresa: crear nuevas cuentas, asignarles roles, asignarles a sucursales específicas y eliminarlos cuando ya no pertenezcan a la organización.

**Distinción crítica con módulo 01-auth:**
- **Auth (01)** gestiona la identidad propia del usuario: login, logout, perfil personal, contraseña propia.
- **Users (04)** gestiona la administración de otros usuarios: crear cuentas para el equipo, asignar roles y sucursales, eliminar usuarios.

**Quién lo usa:** administradores de empresa y usuarios con el permiso "Crear Usuario" / "Asignar Roles".

**Límite del módulo:** este módulo NO permite editar el nombre, email o contraseña de otro usuario (no existe `PUT /users/{user}` general — `UserPolicy::update` siempre devuelve `false`). Esas modificaciones solo las hace el propio usuario desde su perfil (módulo 01-auth).

---

## 2. Entidades de Datos

### Tabla `users`

Compartida con el módulo 01-auth. Ver columnas completas en `doc/01-auth/01-auth.md §2`.

Columnas más relevantes para este módulo:

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | — |
| `name` | varchar(255) NOT NULL | — |
| `email` | varchar unique NOT NULL | — |
| `password` | varchar NOT NULL | Hasheado con bcrypt |
| `is_super_admin` | boolean default false | Solo gestionable desde superadmin |
| `deleted_at` | timestamp nullable | Soft delete |

### Tabla `tenant_user` (pivot)

Determina a qué empresas/sucursales pertenece un usuario.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | — |
| `tenant_id` | bigint NOT NULL | FK → `tenants.id` |
| `user_id` | bigint NOT NULL | FK → `users.id` |
| `created_at` / `updated_at` | timestamp nullable | — |

Un usuario puede pertenecer a múltiples tenants simultáneamente (empresa principal + sucursales). La asignación de sucursal a través de `AssignBranchToUserAction` opera dentro del scope del tenant activo y sus hijos.

### Tabla `role_user` (pivot)

Ver módulo 03-rbac. Determina qué roles tiene el usuario en qué tenant.

---

## 3. Reglas de Negocio

### 3.1 Creación de usuario en el contexto del tenant activo

Cuando un admin crea un nuevo usuario desde `/users`, la acción `CreateUserAction` hace dos cosas:
1. Crea el registro en `users` (nombre, email, password hasheado)
2. Llama a `FindAndAttachTenantAction` → hace `$user->tenants()->attach($currentTenant)` — el usuario queda asociado SOLO al tenant activo en sesión, sin rol asignado

El nuevo usuario **no tiene rol** hasta que el admin lo asigne manualmente desde la pantalla de edición.

### 3.2 Asignación de rol: REEMPLAZA (no acumula)

`UpdateRoleUserAction` usa `$user->roles()->sync([$role_id])` — esto ELIMINA todos los roles previos del usuario y asigna únicamente el nuevo.

**Implicación práctica:** en el sistema actual un usuario solo puede tener **un rol activo** desde la UI de administración. Si se necesitan múltiples roles, debe hacerse directamente en la BD o via código.

**Contraste con módulo 03:** el trait `HasRoles::getValidRoles()` soporta múltiples roles, pero la UI solo permite uno.

### 3.3 Asignación de sucursal: scope restringido al árbol del tenant activo

`AssignBranchToUserAction` opera dentro del "scope" del tenant activo:
```
scope = Tenant::where('id', $currentTenantId)
             ->orWhere('parent_id', $currentTenantId)
```

Solo puede asignar al usuario a sucursales que sean la empresa actual o sus hijos directos. No puede asignar a tenants de otro árbol jerárquico.

**Flujo completo:**
1. Detach del usuario de TODOS los tenants en el scope (empresa + hijos)
2. Attach a los tenants seleccionados (filtrando que estén dentro del scope)
3. Guard de seguridad: si el usuario que se está editando es el admin mismo, no puede dejarse sin ningún tenant

### 3.4 Eliminación: es desvinculación + soft delete global

`DestroyUserAction`:
1. `FindAndDetachTenant::execute($user)` → desvincula al usuario del tenant activo en sesión
2. `$user->delete()` → soft delete global del usuario (campo `deleted_at`)

**Advertencia:** si un usuario pertenece a múltiples tenants (empresa + sucursal), eliminarlo desde cualquier tenant lo soft-elimina globalmente — ya no puede acceder a ningún tenant. Esto es una simplificación agresiva del sistema actual.

### 3.5 Visibilidad: el admin ve usuarios de todos los tenants relacionados

`GetAllUserAction` filtra usando `GetTenantContextAction`, que incluye self + descendientes + ancestros. Esto significa que desde la empresa principal se ven los usuarios de las sucursales.

```php
->whereHas('tenants', function ($query) use ($allowedTenantIds) {
    $query->whereIn('tenants.id', $allowedTenantIds);
})
```

### 3.6 Asignación de sucursal reutiliza el permiso de rol

El endpoint `PUT /users/{user}/branch` usa el mismo check de policy que la asignación de rol:
```php
->can('updateRole', 'user')
```
No existe un permiso separado para asignar sucursales — se requiere el permiso "Asignar Roles" (ID 17) o ser admin.

### 3.7 La pantalla de edición no tiene su propio guard de ruta

`GET /users/{user}/edit` no tiene middleware `can()` en la definición de ruta. Cualquier usuario autenticado puede acceder a la URL si conoce el ID. Las acciones de edición dentro de la pantalla sí verifican permisos. (PELIGROSO)

---

## 4. Flujos Funcionales

### 4.1 Ver lista de usuarios

```
GET /users
  │
  ├─ Middleware: can('viewAny', User::class) → UserPolicy::viewAny
  │   └─ checkTenantContext + (admin OR "Ver Usuarios")
  │
  └─ GetAllUserAction::execute()
      ├─ GetTenantContextAction → allowedTenantIds (self + descendientes + ancestros)
      ├─ QueryBuilder con allowedFilters: ['name', 'email', 'role']
      ├─ allowedSorts: ['name', 'email', 'role'], defaultSort: 'name'
      ├─ with(['roles', 'tenants']) eager loading
      └─ paginate(10)

  → Inertia render 'users/users'
  → Props: { users: UserResource::collection (paginado) }
```

**UI resultante:**
- Tabla con columnas: Nombre, Email, Rol (solo el primero), Acciones (editar, eliminar)
- Si tiene permiso "Crear Usuario": formulario de alta visible en la parte superior

### 4.2 Crear usuario

```
POST /users
  │
  ├─ Middleware: can('store', User::class) → UserPolicy::store
  │   └─ checkTenantContext + (admin OR "Crear Usuario")
  │
  ├─ RegisterRequest::validate()
  │   name: required, max:255
  │   email: required, unique:users (mismo que registro!)
  │   password: required, min:6, confirmed
  │
  └─ CreateUserAction::execute($request)
      ├─ User::create([name, email, password: Hash::make(...)])
      └─ FindAndAttachTenantAction::execute($user)
          └─ $user->tenants()->attach($currentTenantId)

  → redirect()->route('users') con flash 'success'
```

**Nota:** el nuevo usuario creado no tiene rol asignado. El admin debe ir a `/users/{id}/edit` para asignarlo.

### 4.3 Ver detalle / editar usuario

```
GET /users/{user}/edit
  │
  ├─ Sin middleware de autorización en la ruta
  ├─ GetCurrentTenantAction → $currentTenant
  ├─ Role::where('tenant_id', $currentTenant)->get() → roles disponibles
  └─ Tenant::where('id', $currentTenant)->orWhere('parent_id', $currentTenant)->get() → sucursales

  → Inertia render 'users/user-edit'
  → Props: { userToEdit: UserResource, roles: RoleResource[], branches: Tenant[] }
```

**UI resultante (3 secciones):**
1. **UserInfo** — muestra: avatar (iniciales), nombre, rol badge, email, fecha de alta, última actualización, empresas asociadas (read-only)
2. **UserAssignBranch** — select de sucursal; preselecciona la sucursal hija actual del usuario (prefiere branches con `parent_id` sobre la empresa raíz)
3. **UserAddRole** — select de rol disponible en el tenant; solo visible con permiso "Asignar Roles"

### 4.4 Asignar rol al usuario

```
PUT /users/{user}/role
  │
  ├─ Middleware: can('updateRole', 'user') → UserPolicy::updateRole
  │   └─ checkTenant + (admin OR "Asignar Roles")
  │
  ├─ UpdateRoleUserRequest::validate()
  │   role_id: required, exists:roles,id
  │
  └─ UpdateRoleUserAction::execute($request, $user)
      └─ $user->roles()->sync([$request->role_id])
         IMPORTANTE: sync() reemplaza TODOS los roles anteriores

  → redirect()->back() con flash 'success'
```

### 4.5 Asignar sucursal al usuario

```
PUT /users/{user}/branch
  │
  ├─ Middleware: can('updateRole', 'user') → UserPolicy::updateRole (mismo permiso)
  │
  ├─ UpdateUserBranchRequest::validate()
  │   tenant_id: required, integer, exists:tenants,id
  │
  └─ AssignBranchToUserAction::execute($user, [$tenant_id])
      ├─ GetCurrentTenantAction → $currentTenantId
      ├─ scope = tenant activo + hijos directos
      ├─ $user->tenants()->detach($scopeTenants)     ← desvincula de todo el scope
      ├─ $validTenantIds = scope.intersect([$tenant_id])  ← filtra por seguridad
      ├─ Guard: si es el admin mismo y validTenantIds está vacío → Exception
      ├─ $user->tenants()->attach($validTenantIds)
      └─ Si se editó a sí mismo y el tenant de sesión ya no es válido → SetCurrentTenantAction

  → redirect()->back() con flash 'success'
```

### 4.6 Eliminar usuario

```
DELETE /users/{user}
  │
  ├─ Sin middleware de autorización en la ruta (!) — solo auth
  │
  └─ DestroyUserAction::execute($user)
      ├─ FindAndDetachTenant::execute($user)
      │   └─ $user->tenants()->detach($currentTenantId)
      └─ $user->delete()    ← soft delete global

  → redirect()->back() con flash 'success'
```

---

## 5. Recursos y Tipos

### UserResource

```php
[
  'id'          => $this->id,
  'tenants'     => $this->tenants,       // todos los tenants del usuario
  'name'        => $this->name,
  'avatar_url'  => $this->avatar_url,    // URL construida por accessor (R2 o default)
  'email'       => $this->email,
  'roles'       => $this->roles->map(fn($r) => ['id' => $r->id, 'name' => $r->name]),
  'permissions' => $this->getPermissionNames(),   // array de strings
  'created_at'  => $this->created_at,
  'updated_at'  => $this->updated_at,
]
```

---

## 6. API / Endpoints

| Método | Path | Nombre | Auth | Guard | Body / Params |
|--------|------|--------|------|-------|---------------|
| `GET` | `/users` | `users` | auth | `can('viewAny', User)` | — |
| `POST` | `/users` | `users.store` | auth | `can('store', User)` | `name`, `email`, `password`, `password_confirmation` |
| `GET` | `/users/{user}/edit` | `users.edit` | auth | ninguno en ruta | — |
| `PUT` | `/users/{user}/role` | `users.updateRole` | auth | `can('updateRole', 'user')` | `role_id` |
| `PUT` | `/users/{user}/branch` | `users.updateBranch` | auth | `can('updateRole', 'user')` | `tenant_id` |
| `DELETE` | `/users/{user}` | `users.destroy` | auth | ninguno en ruta | — |

**Nota sobre guards faltantes:** `GET /users/{user}/edit` y `DELETE /users/{user}` no tienen middleware `can()` en la definición de ruta. Es una deuda técnica — las políticas se verifican implícitamente dentro de las acciones pero no en la capa de routing.

---

## 7. Consideraciones de Migración Next.js

### Endpoint para crear usuario

El sistema actual reutiliza `RegisterRequest` para crear usuarios desde el admin. En Next.js, crear una Server Action / Route Handler dedicada con validación propia (sin `password_confirmation` si no es necesario en el flujo de admin, por ejemplo).

```typescript
// app/api/users/route.ts
export async function POST(req: Request) {
  const session = await auth()
  await requirePermission(session, 'Crear Usuario')
  
  const { name, email, password } = await req.json()
  
  return db.transaction(async (tx) => {
    const user = await tx.insert(users).values({ name, email, password: hash(password) })
    await tx.insert(tenantUser).values({ tenantId: session.tenantId, userId: user.id })
    return user
  })
}
```

### Reemplazar `sync()` por operación explícita

El `roles().sync([$role_id])` en Next.js con Drizzle:

```typescript
async function assignRole(userId: number, roleId: number, tenantId: number) {
  // Eliminar roles anteriores del usuario en este tenant
  await db.delete(roleUser)
    .where(and(
      eq(roleUser.userId, userId),
      inArray(roleUser.roleId, 
        db.select({ id: roles.id }).from(roles).where(eq(roles.tenantId, tenantId))
      )
    ))
  // Asignar el nuevo rol
  await db.insert(roleUser).values({ userId, roleId })
}
```

### Protección de rutas sin guard

En Next.js, usar middleware para proteger todas las rutas del área de admin:

```typescript
// middleware.ts
export const config = { matcher: ['/users/:path*'] }

export async function middleware(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.redirect('/login')
  // El check de permiso granular lo hace cada Route Handler
}
```

### Scope de tenant en queries

`GetAllUserAction` filtra por `GetTenantContextAction`. Traducir a:

```typescript
const allowedTenantIds = await getTenantContext(session.tenantId)

const usersList = await db
  .selectDistinct({ ...users })
  .from(users)
  .innerJoin(tenantUser, eq(tenantUser.userId, users.id))
  .where(inArray(tenantUser.tenantId, allowedTenantIds))
  .orderBy(users.name)
```

---

## 8. Mejoras Propuestas v2.0

### Edición de datos personales de otros usuarios por el admin

En la versión actual `UserPolicy::update` siempre devuelve `false` — no existe pantalla para que un admin modifique el nombre o email de otro usuario. En v2.0 habilitar esta funcionalidad con el permiso "Actualizar Usuario" (ID 14, actualmente inactivo).

### Múltiples roles por usuario desde la UI

El `sync()` actual limita a un rol por usuario en la práctica. En v2.0 cambiar a `syncWithoutDetaching()` y proveer una UI de checkboxes multi-select para roles.

### Invitación por email en lugar de crear contraseña

En la versión actual, el admin crea la contraseña del empleado directamente. En v2.0, el flujo de invitación (US-AUTH-16 wizard / US-V2-ONB-03) envía un email al empleado para que él mismo establezca su contraseña.

### Indicador de actividad reciente del usuario

Mostrar en la lista de usuarios la última vez que cada empleado inició sesión (basado en `sessions.last_activity`), para detectar cuentas inactivas.

### Separación de permisos: asignar sucursal vs asignar rol

Actualmente ambas operaciones (`PUT /users/{user}/branch` y `PUT /users/{user}/role`) usan el mismo permiso "Asignar Roles". En v2.0 crear un permiso separado "Asignar Sucursal" para poder delegar la gestión de sucursales sin dar acceso a la configuración de roles.

### Guard en rutas de edición y eliminación

Agregar middleware `can()` en `GET /users/{user}/edit` y `DELETE /users/{user}` para cumplir con el principio de defensa en profundidad y no depender únicamente de los checks dentro de las acciones.
