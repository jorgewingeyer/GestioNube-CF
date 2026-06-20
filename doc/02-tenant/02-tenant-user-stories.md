# Historias de Usuario — Módulo 02: Multi-Tenant y Sucursales (Tenant)

> **Módulo:** 02-tenant  
> **Fase:** 1 — Fundación  
> **Depende de:** 01-auth

---

## US-TENANT-01 — Ver información de mi empresa

**Como** administrador de una empresa,  
**quiero** ver los datos registrados de mi empresa (nombre, CUIT, condición IVA, dirección, logo),  
**para** verificar que la información fiscal esté correcta antes de emitir comprobantes.

### Criterios de aceptación
- [ ] La página de empresa muestra: nombre, email, CUIT, teléfono, condición IVA, dirección y logo
- [ ] También muestra las alícuotas de IVA configuradas con la preferida resaltada
- [ ] Muestra las sucursales existentes bajo esta empresa
- [ ] Muestra los roles y permisos configurados para la empresa
- [ ] Solo puede acceder quien tenga el permiso "Ver Empresa"

### Notas técnicas
- Ruta: `GET /tenant`
- Tablas: `tenants`, `tax_tenant`, `taxes`, `roles`, `permissions`, `addresses`, `tenants` (children)

---

## US-TENANT-02 — Editar información de mi empresa

**Como** administrador de una empresa,  
**quiero** actualizar los datos de mi empresa (nombre, CUIT, email, teléfono, condición IVA y dirección),  
**para** mantener la información fiscal actualizada y que aparezca correcta en mis facturas.

### Criterios de aceptación
- [ ] El formulario permite editar: nombre, email, CUIT, teléfono, condición IVA y dirección
- [ ] La condición IVA se elige de una lista predefinida (Responsable Inscripto, Monotributo, Exento, etc.)
- [ ] La dirección incluye selección de provincia y localidad
- [ ] Los cambios se reflejan inmediatamente en los próximos comprobantes emitidos
- [ ] Solo puede editar quien tenga el permiso "Actualizar Empresa"

### Notas técnicas
- Ruta: `PUT /tenant/{tenant}`
- Tablas: `tenants`, `addresses`

---

## US-TENANT-03 — Actualizar el logo de mi empresa

**Como** administrador de una empresa,  
**quiero** subir el logo de mi empresa,  
**para** que aparezca en las facturas, presupuestos y en la interfaz del sistema.

### Criterios de aceptación
- [ ] Puedo subir una imagen desde mi dispositivo (JPG, PNG, WEBP)
- [ ] La imagen se convierte automáticamente a WebP al guardarse
- [ ] El logo anterior se elimina del almacenamiento al subir uno nuevo
- [ ] El nuevo logo aparece de inmediato en el encabezado de la app y en los documentos PDF
- [ ] Si no tengo logo, se muestra un logo predeterminado del sistema
- [ ] Solo puede actualizar el logo quien tenga el permiso "Actualizar Logo"

### Notas técnicas
- Ruta: `POST /tenant/{tenant}/logo`
- Almacenamiento: Cloudflare R2, directorio `logos/`
- Formato guardado: `{tenant_id}_{timestamp}.webp`

---

## US-TENANT-04 — Configurar alícuota de IVA preferida

**Como** administrador de una empresa,  
**quiero** establecer cuál alícuota de IVA es la predeterminada para mis productos,  
**para** que al crear un producto o factura se use ese IVA automáticamente sin tener que seleccionarlo cada vez.

### Criterios de aceptación
- [ ] La página de empresa muestra las alícuotas de IVA disponibles (10.5%, 21%, 27%)
- [ ] Puedo marcar una de ellas como "preferida"
- [ ] Solo puede haber una alícuota preferida a la vez
- [ ] Al cambiar la preferida, la anterior deja de serlo automáticamente
- [ ] La alícuota preferida se usa como valor por defecto al crear productos nuevos

### Notas técnicas
- Ruta: `POST /tenant/{tenant}/preferred-tax`
- Tabla: `tax_tenant` (campo `is_preferred`)

---

## US-TENANT-05 — Crear una sucursal

**Como** administrador de una empresa,  
**quiero** crear una sucursal adicional bajo mi empresa,  
**para** gestionar el inventario, ventas y tesorería de cada punto de venta por separado.

### Criterios de aceptación
- [ ] Puedo crear una sucursal ingresando: nombre, email, CUIT (opcional), teléfono (opcional), condición IVA y dirección
- [ ] La sucursal hereda el logo de la empresa principal automáticamente
- [ ] La sucursal se crea con las alícuotas de IVA ya configuradas (10.5%, 21%, 27%)
- [ ] Al crearla, el administrador actual queda asociado a la sucursal y con rol admin en ella
- [ ] La sucursal aparece en el selector de sucursal activa del header
- [ ] Si falla algún paso de la creación, todo se revierte (transacción atómica)
- [ ] Solo puede crear sucursales quien tenga el permiso correspondiente

### Notas técnicas
- Ruta: `POST /tenant/branch`
- El `parent_id` se toma del tenant activo en sesión (no viene del formulario)
- Tablas: `tenants`, `addresses`, `tax_tenant`, `tenant_user`, `roles`, `role_user`, `permission_role`

---

## US-TENANT-06 — Editar una sucursal existente

**Como** administrador de una empresa,  
**quiero** editar los datos de una sucursal (nombre, dirección, teléfono, condición IVA),  
**para** mantener la información de mis puntos de venta actualizada.

### Criterios de aceptación
- [ ] Puedo editar los mismos campos disponibles al crear la sucursal
- [ ] Los cambios se reflejan inmediatamente en los documentos emitidos desde esa sucursal
- [ ] Solo puede editar sucursales quien tenga el permiso correspondiente

### Notas técnicas
- Ruta: `PUT /tenant/branch/{tenant}`
- Tablas: `tenants`, `addresses`

---

## US-TENANT-07 — Eliminar una sucursal

**Como** administrador de una empresa,  
**quiero** eliminar una sucursal que ya no está operativa,  
**para** mantener limpia la lista de puntos de venta activos.

### Criterios de aceptación
- [ ] Se solicita confirmación antes de eliminar (advertencia sobre el impacto)
- [ ] La eliminación es lógica (soft delete), no física — el historial de datos se preserva
- [ ] La sucursal eliminada desaparece del selector de sucursal
- [ ] Si la sucursal tiene datos activos (stock, facturas pendientes), mostrar advertencia adicional
- [ ] Solo puede eliminar sucursales quien tenga el permiso correspondiente

### Notas técnicas
- Ruta: `DELETE /tenant/branch/{tenant}`
- Tabla: `tenants` (campo `deleted_at`)

---

## US-TENANT-08 — Cambiar de sucursal activa

**Como** usuario con acceso a múltiples sucursales,  
**quiero** cambiar la sucursal en la que estoy trabajando desde el header de la aplicación,  
**para** ver y gestionar los datos específicos de cada punto de venta sin cerrar sesión.

### Criterios de aceptación
- [ ] El header muestra la sucursal activa actual con opción de cambiar
- [ ] El selector muestra todas las sucursales a las que tengo acceso (las propias y las hijas de mis tenants)
- [ ] Al seleccionar una sucursal, la aplicación refresca mostrando los datos de esa sucursal
- [ ] Si intento cambiar a una sucursal sin permiso, se muestra un error y no se cambia el contexto
- [ ] El cambio de sucursal invalida los cachés relevantes para que los datos se actualicen

### Notas técnicas
- Ruta: `POST /branch/switch`
- Se guarda `tenant_id` en sesión
- Cache invalidado: `inventory_products_*`, `dashboard_data_tenant_*`, `treasury_dashboard_tenant_*`

---

## US-TENANT-09 — Ver datos de múltiples sucursales (visibilidad cruzada)

**Como** dueño de la empresa principal (tenant padre),  
**quiero** ver los datos consolidados de mis sucursales (facturas, inventario, tesorería),  
**para** tener una visión global del negocio sin tener que cambiar de sucursal una por una.

### Criterios de aceptación
- [ ] Usuarios con el permiso "Ver Facturas Sucursales" pueden ver datos de todas las sucursales relacionadas
- [ ] Las listas (facturas, transacciones, etc.) muestran un indicador de a qué sucursal pertenece cada registro
- [ ] El filtro por sucursal permite ver una sola o todas a la vez
- [ ] Sin el permiso especial, cada usuario solo ve datos de su sucursal activa

### Notas técnicas
- `GetTenantContextAction::execute($tenantId)` retorna todos los IDs relacionados
- El permiso "Ver Facturas Sucursales" en `HandlesTenantAccess` amplía la visibilidad

---

## US-TENANT-10 — Configurar permisos de un rol

**Como** administrador de una empresa,  
**quiero** configurar qué permisos tiene cada rol de mi empresa,  
**para** controlar qué puede hacer cada miembro del equipo en el sistema.

### Criterios de aceptación
- [ ] La página de empresa muestra los roles existentes con sus permisos actuales
- [ ] Puedo activar o desactivar permisos individuales para cada rol mediante checkboxes
- [ ] Los cambios aplican inmediatamente a todos los usuarios con ese rol
- [ ] No puedo eliminar todos los permisos del rol admin (protección mínima)
- [ ] Solo puede configurar permisos quien tenga el permiso "Asignar Permisos"

### Notas técnicas
- Ruta: `PUT /tenant/role/{role}`
- Tabla: `permission_role` (sync completo de permisos)

---

## US-TENANT-11 — Ver features disponibles según mi plan (v2.0)

**Como** usuario de GestioNube,  
**quiero** ver qué funcionalidades tengo disponibles según mi plan de suscripción,  
**para** saber qué puedo usar y qué necesito contratar para acceder a más funcionalidades.

### Criterios de aceptación
- [ ] Una pantalla de "Mi Plan" muestra todos los features disponibles con estado: activo / inactivo / requiere upgrade
- [ ] Los features deshabilitados muestran un badge "Disponible en Plan Pro" con CTA para contratar
- [ ] El administrador puede habilitar/deshabilitar features activos desde esta pantalla
- [ ] Los features marcados como "próximamente" aparecen en una sección separada

### Notas técnicas
- **Mejora v2.0** — actualmente la gestión de features es solo desde superadmin
- Tabla: `tenant_features` (feature, enabled)
- `TenantFeature::FEATURES` define el listado completo incluyendo `ecommerce`

---

## US-TENANT-12 — Conectar con GestioNube Shop (v2.0)

**Como** administrador de una empresa con el feature `ecommerce` activo,  
**quiero** conectar mi empresa con una tienda online de GestioNube Shop,  
**para** sincronizar automáticamente productos, stock y pedidos entre el ERP y mi tienda.

### Criterios de aceptación
- [ ] En la página de empresa aparece una sección "GestioNube Shop" cuando el feature está activo
- [ ] Puedo generar credenciales de API (client_id y client_secret) para conectar la tienda
- [ ] Se muestra el estado de conexión: conectado / desconectado / con errores
- [ ] Puedo ver la última sincronización exitosa y los registros de errores recientes
- [ ] Puedo revocar las credenciales si necesito desconectar la tienda

### Notas técnicas
- **Nuevo en v2.0** — requiere nueva tabla `api_credentials` (tenant_id, client_id, client_secret, scopes, last_used_at)
- Autenticación: OAuth2 client_credentials (machine-to-machine)
- Feature flag: `tenant_features.feature = 'ecommerce'`

---

## US-TENANT-13 — Configurar el idioma y país de la empresa (v2.0)

**Como** administrador de una empresa que opera fuera de Argentina,  
**quiero** configurar el país y la moneda de mi empresa en GestioNube,  
**para** que las fechas, montos y terminología fiscal se adapten a mi realidad local.

### Criterios de aceptación
- [ ] En la configuración de empresa, campo "País de operación" con selector: Argentina, Colombia, México, Perú
- [ ] Al cambiar el país, la terminología fiscal se adapta automáticamente: CUIT/NIT/RFC, IVA/IVA-DIAN/IVA-SAT
- [ ] El formato de fecha cambia según el locale (DD/MM/YYYY en AR, MM/DD/YYYY en MX si corresponde)
- [ ] La moneda predeterminada cambia según el país: ARS, COP, MXN, PEN
- [ ] Las alícuotas de IVA se preconfigutan según el país seleccionado
- [ ] Los comprobantes fiscales generados respetan el formato requerido por el país

### Notas técnicas
- **Nuevo en v2.0** — nueva columna `tenants.locale` (ej: `es_AR`, `es_CO`, `es_MX`) y `tenants.currency` (ej: `ARS`, `COP`)
- Fase 1: solo Argentina. Fase 2: Colombia. Fase 3: México, Perú
- El módulo ARCA/AFIP es específico de Argentina — abstraer detrás de una interfaz `FiscalProvider` para soportar otros países

---

## US-TENANT-14 — Ver y respetar los límites de uso según el plan (v2.0)

**Como** sistema GestioNube,  
**quiero** aplicar límites configurables por plan (máx. usuarios, sucursales, productos),  
**para** que los límites del plan gratuito se respeten y los planes pagos ofrezcan mayor capacidad.

### Criterios de aceptación
- [ ] Al intentar crear un recurso que excede el límite del plan, el sistema muestra un mensaje claro: "Alcanzaste el límite de 3 usuarios en el plan gratuito. Actualizá tu plan para agregar más."
- [ ] El mensaje incluye un botón de acción directo para contratar un plan superior
- [ ] El panel de empresa muestra un indicador de uso por recurso: "2/3 usuarios · 0/1 sucursales adicionales · 45/100 productos"
- [ ] El superadmin puede definir límites personalizados para un tenant específico (override del plan)
- [ ] Los límites son configurables por plan desde el panel de superadmin (no hardcodeados en `.env`)

### Notas técnicas
- **Nuevo en v2.0** — actualmente los límites del free tier se configuran en `.env` (`FREE_TIER_*`)
- Nueva tabla: `plan_limits` (plan_id, resource VARCHAR, max_count INT) para migrar de `.env` a BD
- Alternativa: columnas directas en `plans` table (max_users, max_branches, max_products, etc.)
