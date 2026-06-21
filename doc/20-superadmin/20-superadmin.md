# Módulo 20 — Superadmin

> **Fase:** 5 — Extras y v2.0  
> **Depende de:** 02-tenant, 05-suscription  
> **Acceso:** solo usuarios con `users.is_super_admin = true`  
> **Archivo de rutas:** `routes/super_admin.php`  
> **Middleware:** `['auth', 'super-admin']` (alias de `RequireSuperAdmin`)

---

## 1. Propósito y Alcance

El panel de Superadmin es el centro de control global de GestioNube. Desde aquí el equipo interno gestiona todos los tenants (empresas clientes), sus suscripciones, los planes disponibles, los cupones de descuento, los mensajes de consulta del landing y el feedback interno de los usuarios.

**Quién lo usa:** exclusivamente el equipo de GestioNube (usuarios con `is_super_admin = true`).  
**No usa RBAC:** el acceso se controla por un flag booleano en la tabla `users`, no por roles ni permisos.

---

## 2. Control de Acceso

```php
// app/Http/Middleware/RequireSuperAdmin.php
if (! $request->user()?->is_super_admin) {
    abort(403, 'Acceso restringido.');
}
```

El campo `users.is_super_admin` (boolean) es la única guarda. No hay roles intermedios ni permisos granulares dentro del panel de superadmin — cualquier superadmin tiene acceso total a todas las secciones.

---

## 3. Secciones del Panel

### 3.1 Dashboard (`GetDashboardMetricsAction`)

Métricas globales de la plataforma en tiempo real:

| Métrica | Descripción |
|---------|-------------|
| `totalTenants` | Total de empresas registradas (`parent_id IS NULL`) |
| `activeTenants` | Empresas con `active = true` |
| `suspendedTenants` | Empresas con `active = false` |
| `activeSuscriptions` | Suscripciones con `active = true` (todas, incluyendo free tier) |
| `expiringSoon` | Suscripciones que vencen en los próximos 7 días (con tenant y plan) |
| `recentTenants` | Últimos 10 tenants registrados con su suscripción activa |
| `tenantsByMonth` | Conteo de nuevos tenants por mes (últimos 12 meses, `DATE_TRUNC('month', created_at)`) |
| `plans` | Lista de planes con `suscriptions_count` (activas) |

**Nota:** todas las métricas excluyen sucursales hijas (`parent_id IS NOT NULL`). Solo se cuentan empresas "raíz".

---

### 3.2 Tenants (Gestión de Clientes)

#### Listado (`ListTenantsAction`)
- Paginación: 20 por página
- Filtros: `search` (ILIKE por nombre, email, CUIT) y `active` (boolean)
- Incluye: `users_count`, `children_count` y suscripción activa con plan
- Solo muestra tenants raíz (`parent_id IS NULL`)

#### Detalle (`GetTenantDetailAction`)
- Datos completos del tenant
- Features habilitadas/deshabilitadas (`tenant_features`)
- Lista de planes activos para asignar

#### Operaciones disponibles

| Operación | Action | Descripción |
|-----------|--------|-------------|
| Editar datos | `Tenant::update` | Actualiza nombre, email, CUIT, teléfono |
| Suspender | `ToggleTenantStatusAction::suspend` | Pone `active = false` + `suspended_reason` |
| Reactivar | `ToggleTenantStatusAction::reactivate` | Pone `active = true`, limpia `suspended_reason` |
| Sugerir suscripción | `SendSuscripcionSugerenciaAction` | Envía email al tenant sugiriendo que contrate un plan |
| Actualizar módulos | `UpdateTenantFeaturesAction` | Habilita/deshabilita features en `tenant_features` |

#### Gestión de Features (`UpdateTenantFeaturesAction`)

Los 16 módulos controlables por tenant via `TenantFeature`:

| Key | Módulo |
|-----|--------|
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

**Regla de default:** si no existe un registro en `tenant_features` para un key, el feature está **habilitado por defecto** (`TenantFeature::isEnabled` retorna `true` si no hay registro). Los superadmins solo crean registros cuando quieren deshabilitar algo.

---

### 3.3 Suscripciones

#### Listado (`ListSuscriptionsAction`)
Vista global de todas las suscripciones del sistema con estado, plan, fecha de vencimiento y tenant.

#### Asignar Plan (`AssignPlanToTenantAction`)
- Desactiva todas las suscripciones activas previas del tenant (`active = false`)
- Crea una nueva suscripción con `status = AUTHORIZED`, `active = true`
- `next_payment_date = now() + N meses` (configurable)
- Guarda `metadata.assigned_by_super_admin = true` para auditoría

#### Extender (`ExtendSuscriptionAction`)
- Agrega N **días** (no meses) a `next_payment_date`
- Si `next_payment_date` ya pasó, toma `now()` como base en lugar de la fecha vencida

#### Revocar (`RevokeSuscriptionAction`)
- Elimina la suscripción (hard delete o `active = false` — verificar en implementación)

---

### 3.4 Planes (`SuperAdminPlanController`)

CRUD completo de planes de suscripción:

| Operación | Ruta |
|-----------|------|
| Listar | `GET /super-admin/plans` |
| Crear | `POST /super-admin/plans` |
| Actualizar | `PUT /super-admin/plans/{plan}` |
| Eliminar | `DELETE /super-admin/plans/{plan}` |

Campos del `Plan`: `name`, `price` (int/centavos), `description`, `order`, `active`, `is_free_tier`, `duration`, `isRecurrent`, `frequency`, `frequency_type`, `trial_days`, `show_in`.

---

### 3.5 Cupones (`SuperAdminCouponController`)

| Operación | Ruta |
|-----------|------|
| Listar | `GET /super-admin/coupons` |
| Crear | `POST /super-admin/coupons` |
| Toggle estado | `POST /super-admin/coupons/{coupon}/toggle` |

**No hay edición ni eliminación** — solo se activan/desactivan cupones existentes.

`Coupon` campos: `code`, `type`, `value` (int), `max_uses`, `current_uses`, `start_date`, `end_date`, `active`, `reference`.

---

### 3.6 Consultas del Landing (`SuperAdminInquiryController`)

Mensajes enviados desde el formulario de contacto del sitio web público.

| Operación | Ruta |
|-----------|------|
| Listar | `GET /super-admin/inquiries` |
| Actualizar estado | `PATCH /super-admin/inquiries/{inquiry}/status` |
| Responder | `POST /super-admin/inquiries/{inquiry}/reply` |

Campos de `inquiry_messages`: `name`, `email`, `phone`, `subject`, `message`, `status`, `ip_address`, `handled_at`.

---

### 3.7 Feedback de Tenants (`SuperAdminFeedbackController`)

Mensajes de soporte enviados por usuarios del sistema desde la app.

| Operación | Ruta |
|-----------|------|
| Listar | `GET /super-admin/feedback` |
| Ver detalle | `GET /super-admin/feedback/{feedback}` |
| Responder | `POST /super-admin/feedback/{feedback}/reply` |
| Actualizar estado | `PATCH /super-admin/feedback/{feedback}/status` |

Campos de `feedback`: `tenant_id`, `user_id`, `subject`, `status`.  
Mensajes en `feedback_messages`: `feedback_id`, `user_id`, `message`, `is_super_admin`.

---

## 4. API / Endpoints

Todas las rutas bajo `prefix('super-admin')`, middleware `['auth', 'super-admin']`, nombre base `super-admin.*`.

| Método | Path | Nombre | Descripción |
|--------|------|--------|-------------|
| GET | `/super-admin/` | `super-admin.dashboard` | Dashboard con métricas |
| GET | `/super-admin/tenants` | `super-admin.tenants.index` | Lista de tenants |
| GET | `/super-admin/tenants/{tenant}` | `super-admin.tenants.show` | Detalle de tenant |
| PUT | `/super-admin/tenants/{tenant}` | `super-admin.tenants.update` | Editar datos básicos |
| POST | `/super-admin/tenants/{tenant}/suspend` | `super-admin.tenants.suspend` | Suspender tenant |
| POST | `/super-admin/tenants/{tenant}/reactivate` | `super-admin.tenants.reactivate` | Reactivar tenant |
| PUT | `/super-admin/tenants/{tenant}/features` | `super-admin.tenants.features` | Actualizar módulos habilitados |
| POST | `/super-admin/tenants/{tenant}/suggest-subscription` | `super-admin.tenants.suggest-subscription` | Enviar email de sugerencia |
| GET | `/super-admin/suscriptions` | `super-admin.suscriptions.index` | Lista de suscripciones |
| POST | `/super-admin/suscriptions/{tenant}/assign` | `super-admin.suscriptions.assign` | Asignar plan a tenant |
| POST | `/super-admin/suscriptions/{suscription}/extend` | `super-admin.suscriptions.extend` | Extender suscripción en N días |
| DELETE | `/super-admin/suscriptions/{suscription}` | `super-admin.suscriptions.revoke` | Revocar suscripción |
| GET | `/super-admin/plans` | `super-admin.plans.index` | Lista de planes |
| POST | `/super-admin/plans` | `super-admin.plans.store` | Crear plan |
| PUT | `/super-admin/plans/{plan}` | `super-admin.plans.update` | Editar plan |
| DELETE | `/super-admin/plans/{plan}` | `super-admin.plans.destroy` | Eliminar plan |
| GET | `/super-admin/coupons` | `super-admin.coupons.index` | Lista de cupones |
| POST | `/super-admin/coupons` | `super-admin.coupons.store` | Crear cupón |
| POST | `/super-admin/coupons/{coupon}/toggle` | `super-admin.coupons.toggle` | Activar/desactivar cupón |
| GET | `/super-admin/inquiries` | `super-admin.inquiries.index` | Lista de consultas del landing |
| PATCH | `/super-admin/inquiries/{inquiry}/status` | `super-admin.inquiries.update-status` | Actualizar estado de consulta |
| POST | `/super-admin/inquiries/{inquiry}/reply` | `super-admin.inquiries.reply` | Responder consulta |
| GET | `/super-admin/feedback` | `super-admin.feedback.index` | Lista de feedback de tenants |
| GET | `/super-admin/feedback/{feedback}` | `super-admin.feedback.show` | Ver conversación de feedback |
| POST | `/super-admin/feedback/{feedback}/reply` | `super-admin.feedback.reply` | Responder feedback |
| PATCH | `/super-admin/feedback/{feedback}/status` | `super-admin.feedback.update-status` | Cambiar estado de feedback |

---

## 5. Integraciones con Otros Módulos

| Módulo | Qué hace Superadmin sobre él |
|--------|------------------------------|
| **Tenant (02)** | Suspende, reactiva, edita datos, habilita/deshabilita features |
| **Suscription (05)** | Asigna, extiende y revoca suscripciones manualmente |
| **Plan (05)** | CRUD completo de planes |
| **Coupon (05)** | Crea y activa/desactiva cupones |
| **User (04)** | Lee `is_super_admin` para el guard; no gestiona usuarios desde este panel |

---

## 6. Consideraciones de Migración Next.js

- **Ruta separada:** el panel de superadmin debe ser una sub-aplicación con layout propio. En Next.js implementar bajo `/super-admin/` con un layout distinto al ERP normal.
- **Guard de acceso:** en Next.js verificar `is_super_admin` en el middleware de Next.js (middleware.ts) antes de renderizar cualquier página bajo `/super-admin/*`. Si no es superadmin → redirect a `/dashboard`.
- **Separación de sesiones:** considerar si el superadmin usa el mismo auth o uno separado (usuario distinto). En la versión actual usan el mismo sistema de auth — el superadmin simplemente tiene el flag activado.
- **Sin RLS:** el superadmin no está sujeto al `tenant_id` de sesión. Las queries del panel no usan `GetCurrentTenantAction`. En Next.js, las Route Handlers del superadmin deben omitir el filtro de tenant y usar la conexión directa a PostgreSQL sin RLS.
- **Feature flags desde el panel:** la tabla `tenant_features` controla qué módulos están disponibles para cada tenant. En Next.js este control debe evaluarse en el middleware o en el servidor antes de renderizar páginas de módulos.
- **Métricas del dashboard:** `DATE_TRUNC('month', created_at)` es PostgreSQL-only. Compatible con Hyperdrive + PostgreSQL en Cloudflare; no compatible con D1 (SQLite). Usar Hyperdrive para queries de reporting del superadmin.

---

## 7. Mejoras Propuestas v2.0

### 7.1 Gestión de features dinámica sin deploy
Los `TenantFeature.FEATURES` están actualmente hardcodeados en la clase. En v2.0, gestionar la lista de features desde la BD con descripción, icono y versión mínima de plan requerida.

### 7.2 Auditoría de acciones del superadmin
Todas las operaciones del superadmin (suspensión, asignación de plan, cambio de features) deben quedar registradas con `who`, `what`, `when` y `old_value / new_value`. Actualmente no hay auditoría de acciones del superadmin.

### 7.3 Métricas de MRR y churn
Dashboard ampliado con: Monthly Recurring Revenue (MRR), tasa de churn mensual, LTV promedio por tenant, distribución de tenants por plan, cohort de retención.

### 7.4 Notificaciones proactivas al superadmin
- Alerta cuando un tenant lleva N días sin actividad (riesgo de churn)
- Alerta cuando una suscripción vence en menos de 3 días sin que el tenant haya renovado
- Alerta cuando se detecta un error crítico de ARCA en múltiples tenants

### 7.5 Impersonación de tenants
Funcionalidad para que el superadmin pueda "entrar" en la sesión de un tenant específico para diagnosticar problemas sin conocer su contraseña. Registra en auditoría cuándo y quién realizó la impersonación.

### 7.6 Panel de observabilidad del sistema
Sección de salud del sistema con: latencia promedio de endpoints, tasa de error, jobs en cola, uso de almacenamiento R2, estado de conectividad ARCA (por tenant).
