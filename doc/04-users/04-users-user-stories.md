# Historias de Usuario — Módulo 04: Gestión de Usuarios

> **Módulo:** 04-users  
> **Fase:** 1 — Fundación  
> **Depende de:** 01-auth, 02-tenant, 03-rbac

---

## US-USER-01 — Ver la lista de usuarios de mi empresa

**Como** administrador de una empresa,  
**quiero** ver todos los usuarios que tienen acceso a mi sistema con su nombre, email y rol asignado,  
**para** saber quiénes son los miembros activos del equipo y qué nivel de acceso tiene cada uno.

### Criterios de aceptación
- [ ] La lista muestra: nombre, email, rol actual y acciones disponibles (editar, eliminar)
- [ ] La lista está paginada (10 usuarios por página) con navegación
- [ ] Puedo buscar por nombre o email en tiempo real
- [ ] Los usuarios de las sucursales relacionadas también aparecen en la lista (visibilidad cruzada)
- [ ] Si no hay usuarios, se muestra un estado vacío con indicación de cómo agregar el primero
- [ ] Solo pueden ver la lista quienes tengan el permiso "Ver Usuarios" (ID 12) o sean admin

### Notas técnicas
- Ruta: `GET /users`
- `GetAllUserAction` filtra por `GetTenantContextAction` (incluye descendientes y ancestros)
- Tabla: `users` join `tenant_user` join `tenants`

---

## US-USER-02 — Crear una nueva cuenta de usuario para un empleado

**Como** administrador de una empresa,  
**quiero** crear una cuenta de acceso para un nuevo empleado ingresando su nombre, email y contraseña inicial,  
**para** que pueda acceder al sistema inmediatamente sin necesitar que él se registre por su cuenta.

### Criterios de aceptación
- [ ] El formulario solicita: nombre completo, email y contraseña (con confirmación)
- [ ] El email debe ser único en todo el sistema; si ya existe, mostrar error claro
- [ ] La contraseña debe tener mínimo 6 caracteres
- [ ] El nuevo usuario queda automáticamente asociado al tenant activo en sesión
- [ ] El nuevo usuario se crea sin rol asignado — el admin debe asignarlo desde la pantalla de edición
- [ ] Tras crearlo exitosamente, se redirige a la lista de usuarios con mensaje de confirmación
- [ ] Solo pueden crear usuarios quienes tengan el permiso "Crear Usuario" (ID 13) o sean admin

### Notas técnicas
- Ruta: `POST /users`
- Reutiliza `RegisterRequest` — misma validación que el registro propio
- `CreateUserAction`: crea el user + `FindAndAttachTenantAction` (solo al tenant activo)
- El usuario nuevo NO pasa por el pipeline de 7 pasos del registro (no crea empresa ni rol admin)

---

## US-USER-03 — Ver el detalle de un usuario específico

**Como** administrador de una empresa,  
**quiero** ver el perfil completo de un usuario: sus datos, el rol que tiene y las sucursales a las que pertenece,  
**para** verificar su configuración antes de modificarla.

### Criterios de aceptación
- [ ] La pantalla de edición muestra (en modo solo lectura): avatar con iniciales, nombre, rol actual, email, fecha de alta, fecha de última actualización y lista de empresas/sucursales asociadas
- [ ] Debajo de la info, aparecen los formularios de edición de rol y sucursal (si tengo permiso)
- [ ] Si no tengo permiso para editar, los formularios no se muestran pero la info sí es visible

### Notas técnicas
- Ruta: `GET /users/{user}/edit`
- Componente `UserInfo` muestra los datos; `UserAddRole` y `UserAssignBranch` son los formularios de edición
- **Nota de deuda técnica:** la ruta no tiene middleware `can()` — cualquier usuario autenticado que conozca el ID puede acceder a la pantalla

---

## US-USER-04 — Asignar un rol a un usuario

**Como** administrador de una empresa,  
**quiero** asignarle un rol a un usuario de mi equipo desde un selector,  
**para** definir qué puede ver y hacer en el sistema.

### Criterios de aceptación
- [ ] El selector muestra todos los roles definidos en el tenant activo (no roles de otros tenants)
- [ ] Al guardar, el usuario queda con ese único rol asignado (el rol anterior es reemplazado)
- [ ] El cambio de rol tiene efecto inmediato en el próximo request del usuario
- [ ] El rol asignado se refleja en la lista de usuarios y en la pantalla de edición
- [ ] Solo puede asignar roles quien tenga el permiso "Asignar Roles" (ID 17) o sea admin

### Criterios de aceptación (regla clave)
- [ ] **Un usuario solo puede tener un rol a la vez desde la UI** — si ya tenía un rol, se reemplaza completamente

### Notas técnicas
- Ruta: `PUT /users/{user}/role`
- `UpdateRoleUserAction`: `$user->roles()->sync([$role_id])` — REEMPLAZA todos los roles anteriores
- El selector solo carga roles del tenant activo: `Role::where('tenant_id', $currentTenant)`

---

## US-USER-05 — Asignar un usuario a una sucursal

**Como** administrador de una empresa con varias sucursales,  
**quiero** elegir en qué sucursal trabaja cada usuario,  
**para** que solo vea los datos de su punto de venta y no los de toda la empresa.

### Criterios de aceptación
- [ ] El selector muestra la empresa principal y todas sus sucursales directas
- [ ] La sucursal actual del usuario aparece preseleccionada (con preferencia por la sucursal hija sobre la empresa raíz si tiene ambas)
- [ ] Al guardar, el usuario queda asociado únicamente a esa sucursal dentro del árbol del tenant activo
- [ ] No es posible desvincular al usuario de todos los tenants del scope — siempre debe quedar en al menos uno
- [ ] Si el admin se asigna a sí mismo a una sucursal diferente y su sesión activa ya no es válida, el sistema actualiza automáticamente su sesión al nuevo tenant
- [ ] Requiere el mismo permiso que asignar roles: "Asignar Roles" (ID 17) o ser admin

### Notas técnicas
- Ruta: `PUT /users/{user}/branch`
- `AssignBranchToUserAction`: scope = `current_tenant_id` + hijos directos
- Operación: detach de todo el scope → attach al tenant seleccionado (con validación de scope)
- Guard: si `$user->id === Auth::id()` y `$validTenantIds->isEmpty()` → Exception

---

## US-USER-06 — Eliminar un usuario de la empresa

**Como** administrador de una empresa,  
**quiero** eliminar el acceso de un usuario que ya no pertenece al equipo,  
**para** mantener el listado actualizado y evitar accesos no autorizados.

### Criterios de aceptación
- [ ] Al hacer clic en eliminar, se muestra un diálogo de confirmación con el nombre del usuario
- [ ] El mensaje advierte que la acción elimina el acceso del usuario al sistema
- [ ] Tras confirmar, el usuario desaparece de la lista de usuarios del tenant
- [ ] La eliminación es lógica (soft delete en `users.deleted_at`) — el historial de datos del usuario se preserva
- [ ] Si el usuario estaba activo en sesión, su sesión se invalida automáticamente

### Criterios de aceptación (comportamiento actual)
- [ ] **La eliminación es global**: si el usuario pertenece a múltiples sucursales, queda bloqueado en todas, no solo en la actual

### Notas técnicas
- Ruta: `DELETE /users/{user}`
- `DestroyUserAction`: primero detach del tenant activo → luego `$user->delete()` (soft delete global)
- **Nota de deuda técnica:** la ruta no tiene middleware `can()` en la definición de ruta
- El componente `DeleteDialog` en el frontend muestra el modal de confirmación

---

## US-USER-07 — Ver el rol de un usuario antes de modificarlo

**Como** administrador,  
**quiero** ver claramente qué rol tiene actualmente un usuario antes de cambiarlo,  
**para** no perder la configuración actual por error.

### Criterios de aceptación
- [ ] En la pantalla de edición, la sección "Información del usuario" muestra el rol actual con un badge visual
- [ ] El selector de rol en la sección "Roles Asignables" no muestra el rol actual preseleccionado (es un selector vacío por defecto)
- [ ] Al cambiar el rol y guardar, la pantalla se actualiza con el nuevo rol asignado

### Notas técnicas
- El `UserResource` incluye `roles: [{ id, name }]` — el frontend usa `roles[0].name` para mostrar el primer rol
- `UserAddRole` usa `EasyForm` con un campo select sin valor predeterminado

---

## US-USER-08 — Editar mis propios datos (perfil personal)

**Como** usuario autenticado,  
**quiero** poder editar mi propio nombre, email, teléfono y foto de perfil,  
**para** mantener mis datos actualizados sin depender del administrador.

### Criterios de aceptación
- [ ] El formulario de perfil propio (`/account`) permite editar: nombre, email, teléfono, DNI
- [ ] Un apartado separado permite cambiar la contraseña (solicita la contraseña actual)
- [ ] Puedo subir una foto de perfil desde mi dispositivo (formatos: JPG, PNG, WEBP)
- [ ] La foto se convierte automáticamente a WebP y se almacena en Cloudflare R2
- [ ] Los cambios son instantáneos y se reflejan en el avatar del header

### Notas técnicas
- Ver módulo 01-auth para el detalle técnico completo (`/account` endpoints)
- Este caso pertenece conceptualmente al perfil pero se incluye aquí para claridad del flujo de usuario

---

## US-USER-09 — Editar datos personales de otro usuario (v2.0)

**Como** administrador de una empresa,  
**quiero** poder corregir el nombre o email de un empleado desde el panel de administración,  
**para** mantener los datos del equipo actualizados sin que cada empleado deba hacerlo por su cuenta.

### Criterios de aceptación
- [ ] En la pantalla de edición del usuario, sección "Editar Datos Personales" con campos: nombre y email
- [ ] Solo el email y nombre son editables por el admin — la contraseña no (el empleado la gestiona desde su perfil)
- [ ] El email nuevo debe seguir siendo único en el sistema
- [ ] Los cambios se guardan con confirmación y el usuario afectado los ve reflejados en su próximo request
- [ ] Requiere el permiso "Actualizar Usuario" (ID 14) o ser admin

### Notas técnicas
- **Mejora v2.0** — actualmente `UserPolicy::update` siempre devuelve `false` y no existe `PUT /users/{user}` general
- Requiere habilitar el permiso ID 14 y crear la lógica de actualización correspondiente

---

## US-USER-10 — Asignar múltiples roles a un usuario (v2.0)

**Como** administrador de una empresa con roles que se complementan,  
**quiero** asignar más de un rol a un usuario simultáneamente,  
**para** que un empleado que cumple dos funciones (ej: vendedor y cajero) tenga los permisos de ambos roles.

### Criterios de aceptación
- [ ] La sección de roles en la pantalla de edición usa checkboxes en lugar de un select único
- [ ] Puedo marcar múltiples roles y guardar la selección en un solo paso
- [ ] Los permisos del usuario son la unión de todos sus roles (sin duplicados)
- [ ] El badge de rol en la lista de usuarios muestra todos los roles del usuario separados por coma
- [ ] Al desmarcar todos los roles, el sistema solicita confirmación (el usuario quedaría sin permisos)

### Notas técnicas
- **Mejora v2.0** — actualmente `UpdateRoleUserAction` usa `sync()` que reemplaza con un único rol
- Cambiar a `syncWithoutDetaching()` para roles nuevos + `detach()` para roles quitados
- El trait `HasRoles::getPermissionsViaRoles()` ya soporta múltiples roles — solo falta la UI

---

## US-USER-11 — Invitar usuarios por email en lugar de crear contraseña (v2.0)

**Como** administrador de una empresa,  
**quiero** invitar a un nuevo empleado enviándole un email con un enlace de activación,  
**para** que él mismo configure su contraseña y no tenga que compartírsela por otros medios.

### Criterios de aceptación
- [ ] El formulario de creación de usuario solo solicita: nombre, email y rol a asignar (sin contraseña)
- [ ] Se envía un email de invitación con enlace único válido por 72 horas
- [ ] Al hacer clic en el enlace, el empleado elige su propia contraseña
- [ ] Si el email ya tiene cuenta en GestioNube, se vincula directamente al tenant (sin crear una nueva cuenta)
- [ ] Las invitaciones pendientes aparecen en la lista de usuarios con badge "Pendiente de activación"
- [ ] Las invitaciones vencidas se muestran con opción de reenviar

### Notas técnicas
- **Mejora v2.0** — actualmente el admin debe crear la contraseña del empleado directamente
- Nueva tabla: `invitations` (token, email, tenant_id, role_id, invited_by, expires_at, accepted_at)
- El token debe ser firmado y con tiempo de expiración (similar a password_reset_tokens)

---

## US-USER-12 — Ver indicador de actividad reciente de cada usuario (v2.0)

**Como** administrador de una empresa,  
**quiero** ver cuándo fue la última vez que cada empleado inició sesión,  
**para** identificar cuentas inactivas que podrían necesitar seguimiento o desactivación.

### Criterios de aceptación
- [ ] La lista de usuarios muestra una columna "Última actividad" con el tiempo transcurrido desde el último login
- [ ] Los usuarios que no iniciaron sesión en más de 30 días se marcan con un indicador visual (ej: badge gris "Inactivo")
- [ ] Los usuarios que nunca iniciaron sesión (invitaciones aceptadas pero sin uso) se muestran como "Sin actividad"
- [ ] Hacer clic en el indicador muestra el historial de accesos del usuario

### Notas técnicas
- **Mejora v2.0** — la tabla `sessions` ya tiene `last_activity` (timestamp Unix) y `user_id`
- En v1 la query es `SELECT MAX(last_activity) FROM sessions WHERE user_id = ?`
- En v2.0 con JWT stateless, considerar tabla `login_history` (user_id, tenant_id, ip, user_agent, created_at)

---

## US-USER-13 — Permiso separado para asignar sucursal (v2.0)

**Como** administrador de una empresa,  
**quiero** poder delegar la gestión de qué sucursal tiene cada empleado sin que esa persona también pueda cambiar roles,  
**para** tener una separación de responsabilidades más granular en la gestión del equipo.

### Criterios de aceptación
- [ ] Existe un permiso separado "Asignar Sucursal" (nuevo ID) independiente de "Asignar Roles" (ID 17)
- [ ] Un supervisor sin permiso de "Asignar Roles" puede usar solo el selector de sucursal
- [ ] El endpoint `PUT /users/{user}/branch` verifica "Asignar Sucursal" en lugar de reutilizar "Asignar Roles"
- [ ] Ambos permisos pueden configurarse de forma independiente en los roles del tenant

### Notas técnicas
- **Mejora v2.0** — actualmente `PUT /users/{user}/branch` usa `can('updateRole', 'user')` (mismo que el de roles)
- Requiere: nuevo permiso en tabla `permissions` + actualizar `UserPolicy::updateBranch` + nueva migración
