# Historias de Usuario — Módulo 03: Control de Acceso Basado en Roles (RBAC)

> **Módulo:** 03-rbac  
> **Fase:** 1 — Fundación  
> **Depende de:** 01-auth, 02-tenant

---

## US-RBAC-01 — Ver roles de mi empresa

**Como** administrador de una empresa,  
**quiero** ver todos los roles definidos en mi empresa con sus permisos asignados,  
**para** auditar qué puede hacer cada miembro del equipo y detectar configuraciones incorrectas.

### Criterios de aceptación
- [ ] La página de empresa muestra una sección "Roles" con cada rol listado
- [ ] Cada rol muestra su nombre y el número total de permisos asignados
- [ ] Al expandir un rol, se muestran todos sus permisos agrupados por dominio (Ventas, Compras, Tesorería, etc.)
- [ ] Se distinguen visualmente los roles del sistema (admin, super-admin) de los roles personalizados
- [ ] Solo puede acceder quien tenga el permiso "Ver Roles" (ID 16) o sea admin

### Notas técnicas
- Ruta: `GET /tenant` (sección roles de la empresa)
- Tablas: `roles`, `permissions`, `permission_role`
- El rol "admin" siempre recibe los 102 permisos y se muestra como especial

---

## US-RBAC-02 — Crear un rol personalizado

**Como** administrador de una empresa,  
**quiero** crear un nuevo rol con un nombre descriptivo (ej: "VENTAS", "COMPRAS", "CAJERO"),  
**para** definir un perfil de acceso específico para un tipo de empleado antes de asignarle permisos.

### Criterios de aceptación
- [ ] El formulario solicita únicamente el nombre del rol
- [ ] El nombre no puede repetirse dentro de la misma empresa
- [ ] El rol se crea sin ningún permiso asignado (se configuran en US-RBAC-03)
- [ ] El nuevo rol aparece inmediatamente en la lista de roles de la empresa
- [ ] El nuevo rol está disponible para asignar a usuarios desde el módulo de usuarios
- [ ] Solo puede crear roles quien tenga el permiso "Crear Roles" (ID 4) o sea admin

### Notas técnicas
- Ruta: `POST /tenant/role`
- Tabla: `roles` (tenant_id tomado de la sesión, guard_name='web')

---

## US-RBAC-03 — Configurar permisos de un rol

**Como** administrador de una empresa,  
**quiero** seleccionar qué permisos tiene cada rol mediante checkboxes agrupados por área,  
**para** controlar con precisión qué puede ver y hacer cada miembro del equipo.

### Criterios de aceptación
- [ ] Los 102 permisos se muestran agrupados por dominio: Empresa, Usuarios, Productos, Clientes, Proveedores, Ventas, Compras, Inventario, Tesorería, Caja, Reportes, Órdenes de Compra, Multi-Sucursal
- [ ] Cada permiso tiene su checkbox y puede activarse/desactivarse individualmente
- [ ] Hay botones "Seleccionar todos" y "Deseleccionar todos" por grupo
- [ ] Al guardar, los cambios aplican inmediatamente a todos los usuarios con ese rol
- [ ] Solo puede configurar permisos quien tenga el permiso "Actualizar Roles" (ID 5) o sea admin
- [ ] El rol "admin" no puede quedarse sin permisos (validación de protección mínima)

### Notas técnicas
- Ruta: `PUT /tenant/role/{role}`
- Operación: `$role->permissions()->sync($permissionIds)` — reemplaza todos los permisos
- Tabla: `permission_role`

---

## US-RBAC-04 — Asignar un rol a un usuario

**Como** administrador de una empresa,  
**quiero** cambiar el rol de un usuario de mi empresa,  
**para** darle los permisos que corresponden a su función.

### Criterios de aceptación
- [ ] Desde la lista de usuarios, puedo ver el rol actual de cada miembro
- [ ] Puedo asignar cualquier rol definido en la empresa actual
- [ ] Un usuario puede tener más de un rol simultáneamente
- [ ] El cambio de rol tiene efecto inmediato (el próximo request del usuario usa los nuevos permisos)
- [ ] No puedo quitarle el rol "admin" al último administrador de la empresa (protección)
- [ ] Solo puede asignar roles quien tenga el permiso "Asignar Roles" (ID 17) o sea admin

### Notas técnicas
- Ruta: `PUT /users/{user}/role` (módulo Users)
- Tabla: `role_user` (sincronización con los roles del tenant activo)
- `getValidRoles()` filtra por tenant activo + ancestros

---

## US-RBAC-05 — Verificar acceso al intentar una acción no autorizada

**Como** usuario sin el permiso necesario,  
**quiero** recibir un mensaje claro cuando intento acceder a una sección o realizar una acción no autorizada,  
**para** entender que no tengo acceso y a quién pedírselo.

### Criterios de aceptación
- [ ] Al acceder a una URL sin permiso, se muestra una página 403 con mensaje amigable
- [ ] El mensaje indica qué sección es restringida (no el permiso técnico interno)
- [ ] La navegación (sidebar, menú) no muestra los ítems para los que el usuario no tiene permiso
- [ ] Los botones de acción (Crear, Editar, Eliminar) no se renderizan para usuarios sin permiso
- [ ] El backend valida independientemente del frontend (no se puede bypasear con llamadas directas a la API)

### Notas técnicas
- Middleware `can()` en rutas protegidas
- Frontend: `usePage().props.user.permissions` se usa para condicionar la UI
- Backend: `$this->authorize()` o `Gate::authorize()` en controllers

---

## US-RBAC-06 — Ver datos de múltiples sucursales (permiso especial)

**Como** dueño de una empresa con sucursales,  
**quiero** tener un permiso especial que me permita ver las facturas y transacciones de todas mis sucursales al mismo tiempo,  
**para** tener una visión consolidada sin tener que cambiar de sucursal una por una.

### Criterios de aceptación
- [ ] El permiso "Ver Facturas Sucursales" (ID 93) amplía la visibilidad a toda la jerarquía de tenants
- [ ] Con este permiso, las listas de facturas y transacciones muestran registros de todas las sucursales relacionadas
- [ ] Cada registro indica a qué sucursal pertenece con un badge o columna visual
- [ ] Un filtro por sucursal permite acotar la vista a una sola o verlas todas
- [ ] Sin este permiso, cada usuario solo ve datos de su sucursal activa en sesión

### Notas técnicas
- `HandlesTenantAccess::checkTenant()`: detecta "Ver Facturas Sucursales" y llama `getAllowedTenantIds()`
- `getAllowedTenantIds()` retorna self + hasta 10 niveles de descendientes + hasta 10 niveles de ancestros

---

## US-RBAC-07 — Gestionar pagos de sucursales (permiso multi-sucursal)

**Como** administrador de empresa principal,  
**quiero** crear y ver transacciones (pagos/cobros) que pertenecen a mis sucursales,  
**para** poder gestionar la tesorería centralizada sin tener que cambiar de contexto.

### Criterios de aceptación
- [ ] El permiso "Gestionar Pagos Sucursales" (ID 94) permite crear transacciones para sucursales hijas
- [ ] Al crear una transacción, puedo seleccionar en qué sucursal se registra
- [ ] Las transacciones de sucursales aparecen en el listado con indicador de origen
- [ ] Sin este permiso, solo se pueden crear transacciones en la sucursal activa en sesión

### Notas técnicas
- `TransactionPolicy` + `HandlesTenantAccess::checkTenant()`
- El permiso ID 94 amplía el alcance similar a "Ver Facturas Sucursales"

---

## US-RBAC-08 — Gestionar órdenes de compra de sucursales

**Como** responsable de compras de la empresa principal,  
**quiero** aprobar, rechazar o crear órdenes de compra de mis sucursales,  
**para** centralizar el proceso de aprobación de compras.

### Criterios de aceptación
- [ ] El permiso "Gestionar Órdenes de Compra Sucursales" (ID 95) amplía el acceso a OC de sucursales hijas
- [ ] Las órdenes de compra de sucursales aparecen en el listado central
- [ ] Puedo aprobar o rechazar una OC aunque pertenezca a otra sucursal
- [ ] Sin este permiso, solo se pueden ver/gestionar OC del tenant activo

### Notas técnicas
- `PurchaseOrderPolicy::canAccessTenant()` verifica este permiso antes de usar `GetTenantContextAction`

---

## US-RBAC-09 — Acceso al panel de reportes

**Como** gerente o dueño de una empresa,  
**quiero** acceder a los reportes del sistema y emitirlos,  
**para** analizar el desempeño de ventas, compras y productos con datos exportables.

### Criterios de aceptación
- [ ] El permiso "Ver Reportes" (ID 81) da acceso a la sección de reportes
- [ ] Dentro de reportes, cada tipo tiene su propio permiso de emisión:
  - "Emitir Reportes de Productos" (ID 82)
  - "Emitir reportes de Clientes" (ID 83)
  - "Emitir reportes de Proveedores" (ID 84)
  - "Emitir reportes Ventas" (ID 85)
  - "Emitir reportes Compras" (ID 86)
- [ ] Un usuario puede tener acceso a "Ver Reportes" pero no a emitir todos los tipos
- [ ] Los botones de descarga/exportación no aparecen si no se tiene el permiso de emisión

### Notas técnicas
- `ReportPolicy` verifica cada tipo independientemente
- Reportes se exportan como Excel via `maatwebsite/excel`

---

## US-RBAC-10 — Acceso a caja con permisos granulares

**Como** cajero de un punto de venta,  
**quiero** tener solo los permisos necesarios para operar mi turno de caja,  
**para** no tener acceso a información financiera que no me corresponde.

### Criterios de aceptación
- [ ] Se pueden configurar roles de caja con únicamente: Ver Caja (96) + Abrir Turno (97) + Cerrar Turno (98) + Registrar Movimiento (99)
- [ ] Sin "Ver Historial de Caja" (100), el cajero no puede ver turnos anteriores al suyo
- [ ] Sin "Gestionar Cajas" (101), no puede crear ni configurar nuevas cajas
- [ ] Sin "Exportar Caja" (102), no puede descargar el resumen del turno
- [ ] "Cerrar Turno" verifica además que el turno esté en estado `open` (regla de negocio, no solo permiso)

### Notas técnicas
- `CashShiftPolicy` NO tiene el shortcut admin — requiere permisos explícitos siempre
- `CashShiftPolicy::close()` también verifica `$shift->status === 'open'`

---

## US-RBAC-11 — Acceso a módulo de facturas con tipos diferenciados

**Como** empleado de ventas,  
**quiero** tener acceso a las facturas de venta pero NO a las facturas de compra,  
**para** operar solo en mi área sin ver información de proveedores y costos.

### Criterios de aceptación
- [ ] Un rol "VENTAS" puede configurarse con: Ver/Crear/Actualizar/Eliminar Facturas de Venta (IDs 41-45)
- [ ] Sin los permisos de Compra (IDs 46-50), la sección de facturas de compra no aparece en el menú
- [ ] La separación aplica también para presupuestos (IDs 55-58) y notas de crédito (IDs 59-62)
- [ ] El backend valida el tipo de invoice al momento de la operación (no solo la lista)

### Notas técnicas
- `InvoicePolicy` discrimina por `$invoice->invoice_type` en `update()`, `view()` y `delete()`
- Un usuario puede tener permiso para ver la lista de ventas pero no ver una factura individual de compra

---

## US-RBAC-12 — Flujo de aprobación de órdenes de compra con roles separados

**Como** empresa con proceso de aprobación de compras,  
**quiero** que quienes crean órdenes de compra sean distintos a quienes las aprueban,  
**para** implementar un control interno de doble verificación.

### Criterios de aceptación
- [ ] Un rol "COMPRAS" puede tener: Crear OC (87) + Editar OC (88) + Devolver OC (91)
- [ ] Un rol "GERENTE" puede tener: Aprobar OC (90) + Rechazar OC (89)
- [ ] Un mismo usuario puede tener ambos roles si la empresa lo decide
- [ ] Una OC en estado "pendiente" solo puede aprobarse por alguien con permiso "Aprobar Orden de Compra" (90)
- [ ] El sistema previene que quien crea la OC también la apruebe (si así se configura via roles separados)

### Notas técnicas
- `PurchaseOrderPolicy` con 6 métodos separados para el flujo completo
- Estados de OC: borrador → pendiente → aprobada/rechazada/devuelta

---

## US-RBAC-13 — Super-admin: acceso total sin restricciones (v2.0)

**Como** operador del sistema GestioNube (super-admin),  
**quiero** acceder a cualquier tenant y recurso sin estar sujeto a las restricciones de tenant,  
**para** prestar soporte técnico, depurar problemas y gestionar el sistema global.

### Criterios de aceptación
- [ ] El flag `users.is_super_admin = true` concede acceso total a todas las políticas
- [ ] El super-admin puede visualizar datos de cualquier tenant sin estar asociado a él
- [ ] Existe un panel de superadmin (`/super-admin`) solo accesible por super-admins
- [ ] Las acciones del super-admin en tenants de clientes quedan registradas en el log de auditoría
- [ ] El super-admin no puede modificar la contraseña de otros usuarios sin confirmación extra

### Notas técnicas
- `HandlesTenantAccess::checkTenant()`: primer check es `$user->hasRole('super-admin')` → return true
- En v2.0: el panel super-admin se separa en un subdomain o ruta dedicada con autenticación adicional

---

## US-RBAC-14 — Presets de roles sugeridos por IA (v2.0)

**Como** administrador configurando roles por primera vez,  
**quiero** que el sistema me sugiera configuraciones de permisos típicas según el tipo de negocio,  
**para** no tener que seleccionar manualmente los 102 permisos uno a uno.

### Criterios de aceptación
- [ ] Al crear un rol, el sistema ofrece presets: "Vendedor", "Contador", "Cajero", "Logística", "Gerente", etc.
- [ ] Al elegir un preset, se preseleccionan los permisos típicos para ese perfil
- [ ] Puedo ajustar libremente los permisos sugeridos antes de guardar
- [ ] Los presets pueden ser sugeridos por IA según el giro del negocio (si está configurado)
- [ ] El historial de configuraciones de roles de empresas similares informa los presets

### Notas técnicas
- **Nuevo en v2.0** — no existe en Laravel actual
- Implementar como JSON estático de presets + IA que customiza según contexto del tenant
- Nueva tabla sugerida: `role_presets` (name, description, permission_ids JSON)

---

## US-RBAC-15 — Auditoría de cambios de permisos (v2.0)

**Como** dueño de una empresa,  
**quiero** ver un historial de quién modificó los permisos de cada rol y cuándo,  
**para** auditar cambios de acceso y detectar modificaciones no autorizadas.

### Criterios de aceptación
- [ ] Cada cambio en `permission_role` queda registrado en `activities` con: usuario, rol, permisos antes/después, timestamp
- [ ] Cada cambio en `role_user` queda registrado: usuario que asignó, usuario afectado, rol asignado/quitado
- [ ] La sección de actividades muestra estos eventos con descripción legible: "El usuario X cambió los permisos del rol VENTAS"
- [ ] Los cambios de roles y permisos son accesibles con el permiso "Ver Actividades" (ID 80)

### Notas técnicas
- **Mejora v2.0** — actualmente `activities` NO registra cambios de roles/permisos
- Implementar con observers en los modelos `Role` y `role_user` pivot

---

## US-RBAC-16 — Interfaz de configuración de permisos mejorada con agrupación visual (v2.0)

**Como** administrador configurando los permisos de un rol,  
**quiero** una pantalla de permisos organizada por área funcional con presets y vista previa,  
**para** entender qué acceso estoy otorgando sin tener que conocer de memoria los 102 permisos.

### Criterios de aceptación
- [ ] Los 102 permisos están agrupados por dominio con iconos: Empresa, Ventas, Compras, Inventario, Tesorería, Caja, Reportes, Órdenes de Compra, Multi-Sucursal
- [ ] Cada grupo tiene un toggle "Seleccionar todo el grupo" para activar/desactivar en bloque
- [ ] Al hacer clic en un rol de usuario (ej: "Juan Pérez"), se muestra un panel "Vista previa — Qué puede ver Juan" antes de guardar
- [ ] Barra de búsqueda de permisos por nombre (ej: escribir "caja" filtra solo los 7 permisos de caja)
- [ ] Al pasar el cursor sobre un permiso, tooltip con descripción de qué operación específica habilita
- [ ] Los cambios pendientes se muestran como diff (permisos a agregar en verde, a quitar en rojo) antes del botón Guardar

### Notas técnicas
- **Mejora v2.0** — la UI actual es una lista plana de checkboxes sin agrupación
- No requiere cambios en BD; solo mejora del componente React de configuración de roles
- La "vista previa" consulta el endpoint de permisos del rol con los cambios aplicados temporalmente

---

## US-RBAC-17 — Configurar herencia de permisos entre sucursales (v2.0)

**Como** administrador de una empresa con varias sucursales,  
**quiero** configurar si cada sucursal hereda los roles y permisos de la empresa principal o los gestiona de forma independiente,  
**para** poder centralizar la configuración de acceso o delegarla por sucursal según mi estructura organizativa.

### Criterios de aceptación
- [ ] En la configuración de cada sucursal, opción "Hereda configuración de roles de la empresa principal"
- [ ] Con herencia activa: la sucursal usa exactamente los mismos roles y permisos que la empresa madre; no puede modificarlos
- [ ] Con herencia desactivada: la sucursal puede crear sus propios roles y permisos sin afectar a la empresa madre
- [ ] Override selectivo: "Heredar todo excepto los permisos de Caja" — permite customizar solo ciertos dominios
- [ ] El cambio de modo de herencia muestra una advertencia si la sucursal ya tiene roles propios configurados

### Notas técnicas
- **Nuevo en v2.0** — la herencia actual solo funciona hacia arriba (hijo hereda del padre en `getValidRoles()`) y no es configurable
- Nueva columna sugerida: `tenants.inherit_roles_from_parent` (boolean, default true)
- Cuando `inherit_roles_from_parent = true`, `getValidRoles()` ignora los roles propios de la sucursal

---

## US-RBAC-18 — Agregar permisos para los nuevos módulos v2.0 (v2.0)

**Como** sistema GestioNube v2.0 incorporando nuevas funcionalidades,  
**quiero** que los nuevos módulos (eCommerce, IA, auditoría avanzada) tengan permisos granulares propios,  
**para** que los administradores puedan controlar el acceso a las nuevas funcionalidades con la misma granularidad que los módulos existentes.

### Criterios de aceptación
- [ ] **GestioNube Shop:** permisos `Conectar GestioNube Shop`, `Ver Sincronización Productos`, `Gestionar Sincronización Stock`, `Ver Pedidos Online`
- [ ] **ARCA avanzado:** permisos `Gestionar Certificados AFIP`, `Ver Estado Conexión AFIP`
- [ ] **Módulo IA:** permisos `Ver Módulo IA`, `Ejecutar Análisis IA`, `Ver Predicciones de Compra`
- [ ] **Auditoría:** permisos `Exportar Log de Actividades`, `Ver Log de Accesos`
- [ ] Los nuevos permisos aparecen automáticamente en la pantalla de configuración de roles, agrupados en sus respectivas secciones
- [ ] Los roles "admin" existentes reciben todos los nuevos permisos automáticamente al ejecutar la migración

### Notas técnicas
- **Nuevo en v2.0** — agregar mediante migración que inserte en la tabla `permissions`
- Los roles admin existentes deben recibir los nuevos permisos: ejecutar `AssignAllPermissionsToRole` o una migración de datos que haga el sync
- Diseñar el catálogo de permisos nuevos antes de implementar cada módulo v2.0
