# Módulo 01 — Autenticación (Auth)

> **Fase:** 1 — Fundación  
> **Depende de:** ninguno  
> **Es requerido por:** todos los demás módulos

---

## 1. Propósito y Alcance

El módulo de autenticación gestiona el ciclo de vida de la identidad de un usuario en el sistema: registro de nuevas cuentas, inicio y cierre de sesión, y recuperación de contraseña olvidada. También cubre la gestión del perfil propio del usuario autenticado (datos personales, contraseña, avatar, y eliminación de cuenta).

**Quién lo usa:** cualquier persona que acceda al sistema, antes de interactuar con cualquier otro módulo.

**Límite del módulo:** este módulo NO decide qué puede ver o hacer el usuario una vez autenticado — eso es responsabilidad de RBAC (módulo 03). Auth solo responde a la pregunta "¿eres quien dices ser?".

---

## 2. Entidades de Datos

### Tabla `users`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | Auto-incremental |
| `name` | string(255) | Nombre completo |
| `email` | string unique | Identificador único de login |
| `avatar_url` | string nullable | Ruta en storage (R2). El accessor devuelve URL completa o default |
| `email_verified_at` | timestamp nullable | NULL = email no verificado (verificación deshabilitada actualmente) |
| `password` | string | Hasheado con bcrypt (cast `hashed`) |
| `remember_token` | string nullable | Token de sesión persistente ("recuérdame") |
| `address_id` | bigint FK nullable | → `addresses.id` |
| `dni` | bigint nullable | Documento de identidad |
| `phone` | string nullable | Teléfono de contacto |
| `is_super_admin` | boolean default false | Acceso al panel de superadmin |
| `created_at` / `updated_at` | timestamps | — |
| `deleted_at` | timestamp nullable | Soft delete |

**Traits del modelo:**
- `HasRoles` — métodos de roles y permisos (ver módulo 03)
- `SoftDeletes` — eliminación lógica
- `Notifiable` — soporte Laravel Notifications

**Accessor `getAvatarUrlAttribute`:** si el valor es vacío retorna `asset('images/default-avatar.webp')`; si tiene valor, construye la URL pública desde el disco de storage configurado (Cloudflare R2 en producción).

### Tabla `password_reset_tokens`

| Columna | Tipo |
|---------|------|
| `email` | string PK |
| `token` | string (hasheado) |
| `created_at` | timestamp nullable |

Gestionada automáticamente por Laravel Password Broker. Expiración configurable en `config/auth.php` (`passwords.users.expire` en minutos).

### Tabla `sessions`

| Columna | Tipo |
|---------|------|
| `id` | string PK |
| `user_id` | bigint nullable (indexed) |
| `ip_address` | string(45) nullable |
| `user_agent` | text nullable |
| `payload` | longtext (sesión encriptada) |
| `last_activity` | integer (timestamp Unix, indexed) |

Driver de sesión: `database`. La sesión almacena el `tenant_id` activo (ver módulo 02).

---

## 3. Reglas de Negocio

1. **Rate limiting en login:** 5 intentos fallidos por `email + IP` bloquean el login temporalmente. La clave de throttle es `Str::lower($email) . '|' . $ip`. Al éxito se limpia el contador.

2. **Pipeline en registro:** el registro no es una operación simple. Ejecuta 7 pasos atómicos en una transacción DB usando `Illuminate\Pipeline\Pipeline`. Si cualquier paso falla, todo se revierte (rollback completo). Los pasos son:
   1. `CreateUser` — crea el registro de usuario
   2. `CreateTenant` — crea una empresa para el usuario ("Empresa de {name}")
   3. `AttachTenantToUser` — asocia usuario ↔ tenant en la tabla pivot `tenant_user`
   4. `SetupTaxesForTenant` — configura alícuotas de IVA del tenant (10.5%, 21% preferido, 27%)
   5. `CreateAdminRoleForTenant` — crea un rol "admin" scoped a ese tenant
   6. `AssignRoleToUser` — asigna el rol admin al usuario
   7. `AssignAllPermissionsToRole` — otorga todos los permisos del sistema al rol admin

3. **Tenant activo post-registro y post-login:** inmediatamente después de autenticar (login o register), se ejecuta `SetCurrentTenantAction::execute()` sin argumento, que toma el primer tenant del usuario y lo guarda en `Session::put('tenant_id', ...)`.

4. **Logout limpia el historial de Inertia:** `Inertia::clearHistory()` se llama en logout para evitar que datos sensibles queden en el historial de navegación del browser (Inertia encripta el historial cuando HTTPS está activo).

5. **Password reset:** usa el Password Broker nativo de Laravel. Envía email con link firmado. Al resetear, se invalida el token y se genera un nuevo `remember_token` en el usuario.

6. **Verificación de email:** el campo `email_verified_at` existe pero la verificación está deshabilitada (comentado en el modelo: `// MustVerifyEmail`). Los usuarios pueden operar sin verificar email.

7. **Actividad registrada:** login, logout y registro quedan registrados en el log de actividad (`RegisterLoginActivityAction`, `RegisterLogoutActivityAction`, `RegisterRegistrationActivityAction`).

---

## 4. Flujos Funcionales

### 4.1 Registro de nueva cuenta

```
POST /register
  │
  ├─ ValidateRegisterRequest
  │   name: required, max:255
  │   email: required, unique:users
  │   password: required, min:6, confirmed
  │
  └─ RegisterAction::execute()
      │ DB::transaction()
      │
      ├─ [1] CreateUser           → crea usuario, hashea password
      ├─ [2] CreateTenant         → crea Tenant("Empresa de {name}")
      ├─ [3] AttachTenantToUser   → pivot tenant_user
      ├─ [4] SetupTaxesForTenant  → tax_tenant con IVA 10.5%, 21%, 27%
      ├─ [5] CreateAdminRoleForTenant → Role(name="admin", tenant_id=...)
      ├─ [6] AssignRoleToUser     → role_user pivot
      └─ [7] AssignAllPermissionsToRole → todos los permisos → permission_role
      
  Auth::login($user)
  RegisterRegistrationActivityAction::execute()
  SetCurrentTenantAction::execute()     → Session::put('tenant_id', $tenant->id)
  
  → redirect dashboard
```

### 4.2 Login

```
POST /login
  │
  ├─ ValidateLoginRequest
  │   email: required, email
  │   password: required
  │
  └─ LoginAction::execute()
      │
      ├─ ensureIsNotRateLimited()    → lanza error si >5 intentos
      ├─ Auth::attempt(email, password, remember)
      │   ├─ FALLA → RateLimiter::hit() + throw ValidationException
      │   └─ ÉXITO → RateLimiter::clear()
      ├─ Session::regenerate()
      ├─ SetCurrentTenantAction::execute()   → session tenant_id
      └─ RegisterLoginActivityAction::execute()
  
  → redirect()->intended('dashboard')
```

### 4.3 Logout

```
POST /logout
  │
  └─ LogoutAction::execute()
      ├─ RegisterLogoutActivityAction::execute()
      ├─ Auth::guard('web')->logout()
      ├─ session()->invalidate()
      ├─ session()->regenerateToken()
      └─ Inertia::clearHistory()
  
  → redirect login
```

### 4.4 Recuperación de contraseña

```
POST /send-reset-link
  email: required, email
  Password::sendResetLink($email)
  → respuesta flash con resultado (enviado / error / throttled)

GET  /reset-password/{token}?email=...
  → render página con token y email

POST /reset-password
  token: required
  email: required
  password: required, confirmed, Password::defaults()
  
  Password::reset(...)
    └─ user->forceFill([password, remember_token])->save()
  
  → redirect login con flash 'success'
```

### 4.5 Gestión de perfil (`/account`)

```
GET  /account
  → render página con UserResource del usuario autenticado

PUT  /account/{user}         → UpdatePersonalInfo (name, email, phone, dni)
PUT  /account/{user}/password → UpdatePasswordAction (current_password, new_password)
POST /account/{user}/avatar   → UpdateAvatarAction (file → WebP → R2 → avatar_url)
DELETE /account/{user}        → DeleteAccountAction → logout → redirect login
```

---

## 5. Integraciones con Otros Módulos

| Módulo | Relación | Detalle |
|--------|----------|---------|
| **Tenant** (02) | Crea tenant en registro | `CreateTenant` pipeline step instancia el primer tenant del usuario |
| **RBAC** (03) | Crea rol admin en registro | `CreateAdminRoleForTenant` + `AssignAllPermissionsToRole` en pipeline |
| **Activity** | Registra eventos | Login, logout, registro quedan en tabla `activities` |
| **Inertia Middleware** | Propaga user a frontend | `HandleInertiaRequests` comparte `user`, `tenant`, `currentTenant`, `isFreeTier`, `tenant_features`, `auth_notifications` en cada request |

**Props compartidas por Inertia en cada request autenticado:**

```typescript
{
  user: UserResource & { tenants: {id, name, parent_id}[] },
  tenant: { id, name, logo_url, is_branch },
  currentTenant: number,          // session tenant_id
  isFreeTier: boolean,
  FreeTierResources: object | null,
  auth_notifications: { latest: Notification[], unreadCount: number },
  tenant_features: string[],
  flash: { success: string | null, error: string | null },
}
```

---

## 6. API / Endpoints

| Método | Path | Nombre | Auth | Body / Params | Respuesta |
|--------|------|--------|------|---------------|-----------|
| `GET` | `/login` | `login` | guest | — | Render `auth/login` |
| `POST` | `/login` | `doLogin` | guest | `email`, `password`, `remember?` | Redirect `dashboard` |
| `GET` | `/register` | `register` | guest | — | Render `auth/register` |
| `POST` | `/register` | `doRegister` | guest | `name`, `email`, `password`, `password_confirmation` | Redirect `dashboard` |
| `GET` | `/forgot-password` | `forgotPassword` | guest | — | Render `auth/forgot-password` |
| `POST` | `/send-reset-link` | `sendResetLink` | guest | `email` | Flash success/error |
| `GET` | `/reset-password/{token}` | `password.reset` | guest | `email` (query) | Render `auth/reset-password` |
| `POST` | `/reset-password` | `password.store` | guest | `token`, `email`, `password`, `password_confirmation` | Redirect `login` |
| `POST` | `/logout` | `logout` | auth | — | Redirect `login` |
| `GET` | `/account` | `account` | auth | — | Render `account/account` |
| `PUT` | `/account/{user}` | `account.updatePersonalInfo` | auth | `name`, `email?`, `phone?`, `dni?` | Redirect back |
| `PUT` | `/account/{user}/password` | `account.updatePassword` | auth | `current_password`, `password`, `password_confirmation` | Redirect back |
| `POST` | `/account/{user}/avatar` | `account.updateAvatar` | auth | `avatar` (file) | Redirect back |
| `DELETE` | `/account/{user}` | `account.deleteAccount` | auth | — | Redirect `login` |

---

## 7. Consideraciones de Migración Next.js

### Sesiones → JWT / Cookies seguras
Laravel usa sesiones server-side (tabla `sessions`). En Next.js + Cloudflare Workers, las opciones son:
- **NextAuth v5 / Auth.js** con adapter de base de datos (PostgreSQL via Hyperdrive) — más cercano al modelo actual
- **JWT en cookie HttpOnly** — stateless, ideal para edge

**Recomendación:** NextAuth v5 con `database` strategy + Hyperdrive para mantener compatibilidad con la tabla `sessions` existente. Migrar sin perder las sesiones activas.

### Pipeline de Registro
El pipeline de 7 pasos en `RegisterAction` debe reproducirse como una función async en secuencia con rollback manual (o transacción DB con Drizzle ORM):

```typescript
async function registerUser(data: RegisterInput) {
  return await db.transaction(async (tx) => {
    const user = await createUser(tx, data)
    const tenant = await createTenant(tx, user)
    await attachTenantToUser(tx, user, tenant)
    await setupTaxesForTenant(tx, tenant)
    const adminRole = await createAdminRoleForTenant(tx, tenant)
    await assignRoleToUser(tx, user, adminRole)
    await assignAllPermissionsToRole(tx, adminRole)
    return user
  })
}
```

### Rate Limiting
En Cloudflare Workers usar **Cloudflare Rate Limiting** (nativo, gratuito hasta cierto límite) en lugar de Redis/Laravel RateLimiter. Se configura a nivel de regla en el dashboard o via Workers KV para contadores por IP.

### Password Hashing
Usar `bcrypt` de Node.js (biblioteca `bcryptjs`) con el mismo costo de trabajo. Las contraseñas existentes en PostgreSQL son compatibles.

### Reset de contraseña
En Next.js, usar el flujo de NextAuth o construir uno propio:
1. Generar token seguro → guardar en tabla `password_reset_tokens`
2. Enviar email con Resend o SendGrid
3. Validar token en el endpoint de reset
4. Hashear nueva contraseña y actualizar

### Inertia Shared Props → Layout Server Component
En Next.js App Router, los datos que Inertia compartía globalmente van en un **Layout Server Component** que los pasa como props a cada página:

```tsx
// app/(authenticated)/layout.tsx
export default async function AuthLayout({ children }) {
  const session = await getServerSession()
  const tenant = await getCurrentTenant(session.tenantId)
  const features = await getTenantFeatures(tenant.id)
  
  return (
    <AuthProvider user={session.user} tenant={tenant} features={features}>
      {children}
    </AuthProvider>
  )
}
```

### `Inertia::clearHistory()` en logout
En Next.js no hay equivalente directo. Al hacer logout redirigir a `/login` con `router.replace()` (reemplaza el historial en vez de push) y limpiar cualquier estado en Zustand/Jotai.

### Avatar en R2
El accessor que genera la URL pública del avatar se reemplaza por una función utilitaria:
```typescript
function getAvatarUrl(avatarPath: string | null): string {
  if (!avatarPath) return '/images/default-avatar.webp'
  return `${process.env.R2_PUBLIC_URL}/${avatarPath}`
}
```

---

## 8. Mejoras Propuestas v2.0

### Autenticación de dos factores (2FA)
Agregar TOTP (Time-based One-Time Password) opcional para usuarios con datos sensibles. Biblioteca: `otpauth` en Node.js. Flujo:
1. Usuario activa 2FA en su perfil → se genera secreto TOTP → muestra QR para escanear con app (Google Authenticator, Authy)
2. En el próximo login, después de email/password, se solicita el código de 6 dígitos
3. Backup codes impresos en caso de perder el dispositivo

### OAuth / Social Login
Permitir login con Google (especialmente útil para PYMEs que usan Google Workspace). NextAuth v5 tiene soporte nativo para Google OAuth. Al registrar con OAuth, el pipeline de creación de empresa/tenant se ejecuta igual.

### Verificación de email (activar el campo existente)
El campo `email_verified_at` existe pero nunca se usa. En v2.0 activarlo: enviar email de verificación al registrarse, bloquear acceso a la app hasta verificar. Esto mejora la calidad de la base de usuarios y reduce cuentas basura.

### Sesiones activas visibles al usuario
Mostrar en la página de perfil la lista de sesiones activas (device, IP, última actividad) con opción de cerrar sesiones individuales remotamente. La tabla `sessions` ya tiene `ip_address` y `user_agent`.

### Detección de login sospechoso (IA)
Al detectar login desde IP o dispositivo nunca visto, enviar notificación por email al usuario: "Nuevo inicio de sesión desde [ciudad, dispositivo]". Implementar con Cloudflare Workers AI para clasificar IPs o simplemente comparar con historial de sesiones.

### Onboarding Wizard post-registro
Actualmente el usuario queda en el dashboard vacío. En v2.0, post-registro mostrar un wizard de 3-4 pasos asistido por IA:
1. Configurar datos de la empresa (nombre, CUIT, logo)
2. Agregar el primer producto
3. Configurar punto de venta (si facturan electrónicamente)
4. Invitar al equipo
