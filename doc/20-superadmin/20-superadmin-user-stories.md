# Historias de Usuario — Módulo 20: Superadmin

> **Módulo:** 20-superadmin  
> **Fase:** 5 — Extras y v2.0  
> **Acceso:** usuarios con `users.is_super_admin = true` (equipo interno de GestioNube)

---

## US-SA-01 — Ver el dashboard global de la plataforma

**Como** miembro del equipo de GestioNube,  
**quiero** ver las métricas clave de toda la plataforma en un panel central,  
**para** conocer el estado de la base de clientes y detectar situaciones que requieren atención.

### Criterios de aceptación
- [ ] El dashboard muestra: total de empresas, activas, suspendidas, suscripciones activas
- [ ] Una sección muestra las suscripciones que vencen en los próximos 7 días con el nombre del tenant y el plan
- [ ] Un gráfico muestra la cantidad de nuevas empresas registradas por mes (últimos 12 meses)
- [ ] Se muestra cuántos tenants tiene cada plan (distribución por plan)
- [ ] Un listado de los últimos 10 tenants registrados con su suscripción activa
- [ ] Solo los usuarios con `is_super_admin = true` pueden acceder al panel

### Notas técnicas
- `GET /super-admin/` → `GetDashboardMetricsAction`
- Solo cuenta tenants raíz (`parent_id IS NULL`); las sucursales no se cuentan como empresas separadas

---

## US-SA-02 — Ver el listado de empresas clientes

**Como** miembro del equipo de GestioNube,  
**quiero** ver la lista de todas las empresas registradas en la plataforma,  
**para** tener visión completa de la base de clientes.

### Criterios de aceptación
- [ ] La lista muestra: nombre, CUIT, email, estado (activa/suspendida), cantidad de usuarios, cantidad de sucursales, plan activo
- [ ] Puedo buscar por nombre, email o CUIT (búsqueda insensible a mayúsculas)
- [ ] Puedo filtrar por estado (activas / suspendidas)
- [ ] La lista está paginada (20 por página)
- [ ] Las empresas están ordenadas por fecha de registro (más recientes primero)

### Notas técnicas
- `GET /super-admin/tenants` → `ListTenantsAction` con `ILIKE` en PostgreSQL

---

## US-SA-03 — Ver el detalle de una empresa

**Como** miembro del equipo de GestioNube,  
**quiero** ver todos los datos de una empresa específica en una sola pantalla,  
**para** entender su situación completa antes de tomar cualquier acción.

### Criterios de aceptación
- [ ] La pantalla muestra: datos del tenant (nombre, CUIT, email, teléfono), estado de la cuenta, suscripción activa con fechas y plan, lista de módulos habilitados/deshabilitados, usuarios de la empresa
- [ ] Desde esta pantalla puedo acceder a todas las acciones disponibles (suspender, asignar plan, editar features)

### Notas técnicas
- `GET /super-admin/tenants/{tenant}` → `GetTenantDetailAction`

---

## US-SA-04 — Editar datos básicos de una empresa

**Como** miembro del equipo de GestioNube,  
**quiero** poder editar el nombre, email, CUIT y teléfono de una empresa,  
**para** corregir errores de registro o actualizar datos desactualizados.

### Criterios de aceptación
- [ ] Puedo editar: nombre (requerido), email (requerido, formato válido), CUIT (opcional), teléfono (opcional)
- [ ] Al guardar, los cambios se reflejan inmediatamente en el perfil del tenant

### Notas técnicas
- `PUT /super-admin/tenants/{tenant}` → `Tenant::update`

---

## US-SA-05 — Suspender una empresa

**Como** miembro del equipo de GestioNube,  
**quiero** suspender la cuenta de una empresa,  
**para** bloquear su acceso cuando hay un problema de pago, uso indebido u otra situación que lo requiera.

### Criterios de aceptación
- [ ] Al suspender, puedo ingresar un motivo de suspensión (opcional)
- [ ] La empresa queda con `active = false` y el acceso de sus usuarios queda bloqueado inmediatamente
- [ ] El motivo de suspensión queda registrado en el sistema
- [ ] La acción aparece registrada en el log de auditoría

### Notas técnicas
- `POST /super-admin/tenants/{tenant}/suspend` → `ToggleTenantStatusAction::suspend`
- Verificar que el login del tenant verifique `active = true`

---

## US-SA-06 — Reactivar una empresa suspendida

**Como** miembro del equipo de GestioNube,  
**quiero** reactivar una empresa que estaba suspendida,  
**para** restaurar su acceso cuando la situación que motivó la suspensión fue resuelta.

### Criterios de aceptación
- [ ] La empresa vuelve a `active = true` inmediatamente
- [ ] El campo `suspended_reason` se limpia
- [ ] Los usuarios de la empresa pueden volver a hacer login sin necesidad de cambiar nada más

### Notas técnicas
- `POST /super-admin/tenants/{tenant}/reactivate` → `ToggleTenantStatusAction::reactivate`

---

## US-SA-07 — Enviar email de sugerencia de suscripción

**Como** miembro del equipo de GestioNube,  
**quiero** enviarle un email a una empresa sugiriendo que contrate un plan,  
**para** convertir empresas en el plan gratuito o inactivas a clientes pagos.

### Criterios de aceptación
- [ ] Con un botón, el sistema envía automáticamente un email al tenant con una sugerencia personalizada de suscripción
- [ ] El email se envía al `email` registrado del tenant
- [ ] Recibo confirmación de que el email fue enviado

### Notas técnicas
- `POST /super-admin/tenants/{tenant}/suggest-subscription` → `SendSuscripcionSugerenciaAction`

---

## US-SA-08 — Habilitar o deshabilitar módulos de una empresa

**Como** miembro del equipo de GestioNube,  
**quiero** controlar qué módulos del ERP están disponibles para cada empresa,  
**para** ajustar el acceso según el plan contratado o acuerdos comerciales específicos.

### Criterios de aceptación
- [ ] Veo la lista de los 16 módulos controlables con su estado actual (habilitado/deshabilitado)
- [ ] Puedo cambiar el estado de cualquier módulo con un toggle
- [ ] Al guardar, los cambios tienen efecto inmediato — el usuario del tenant ve o deja de ver el módulo sin reiniciar
- [ ] Si no hay registro en `tenant_features` para un módulo, se considera habilitado por defecto

### Módulos controlables:
Facturas de Venta, Facturas de Compra, Presupuestos, Notas de Crédito/Débito, Facturación Electrónica (AFIP/ARCA), Tesorería, Sistema de Caja, Inventario, Lotes, Transferencias entre Sucursales, Órdenes de Compra, Reportes, Log de Actividad, Gestión de Sucursales, Exportación a Excel, eCommerce.

### Notas técnicas
- `PUT /super-admin/tenants/{tenant}/features` → `UpdateTenantFeaturesAction`
- `TenantFeature::updateOrCreate` para cada key
- `TenantFeature::isEnabled` retorna `true` si no existe registro

---

## US-SA-09 — Asignar un plan a una empresa manualmente

**Como** miembro del equipo de GestioNube,  
**quiero** asignar un plan de suscripción a una empresa directamente desde el panel,  
**para** crear suscripciones de prueba, planes especiales o corregir situaciones de pago fallido.

### Criterios de aceptación
- [ ] Selecciono la empresa, el plan y la cantidad de meses de vigencia
- [ ] Al asignar, las suscripciones activas previas quedan desactivadas automáticamente
- [ ] La nueva suscripción queda con estado AUTHORIZED y `next_payment_date = hoy + N meses`
- [ ] La suscripción queda marcada como `assigned_by_super_admin = true` en metadata para auditoría

### Notas técnicas
- `POST /super-admin/suscriptions/{tenant}/assign` → `AssignPlanToTenantAction`
- Desactiva anteriores con `Suscription::where(...)->update(['active' => false])`

---

## US-SA-10 — Extender la vigencia de una suscripción

**Como** miembro del equipo de GestioNube,  
**quiero** agregar días adicionales a una suscripción activa,  
**para** compensar períodos de inactividad, aplicar extensiones por soporte u otorgar cortesías.

### Criterios de aceptación
- [ ] Ingreso la cantidad de días a agregar
- [ ] Si la suscripción aún está vigente (no vencida), los días se suman a la fecha de vencimiento actual
- [ ] Si la suscripción ya venció, los días se suman desde hoy
- [ ] La nueva fecha de vencimiento aparece inmediatamente en el detalle de la suscripción

### Notas técnicas
- `POST /super-admin/suscriptions/{suscription}/extend` → `ExtendSuscriptionAction`
- Extiende en días (no en meses) — parámetro `days`

---

## US-SA-11 — Revocar una suscripción

**Como** miembro del equipo de GestioNube,  
**quiero** eliminar una suscripción de una empresa,  
**para** cancelar un plan asignado por error o por solicitud del cliente.

### Criterios de aceptación
- [ ] Al revocar, la suscripción queda eliminada
- [ ] La empresa queda sin suscripción activa (pasa al free tier si aplica)

### Notas técnicas
- `DELETE /super-admin/suscriptions/{suscription}` → `RevokeSuscriptionAction`

---

## US-SA-12 — Gestionar planes de suscripción

**Como** miembro del equipo de GestioNube,  
**quiero** crear, editar y eliminar los planes de suscripción disponibles en la plataforma,  
**para** ajustar la oferta comercial sin necesidad de un deploy.

### Criterios de aceptación
- [ ] Puedo crear un nuevo plan con: nombre, precio (en pesos), descripción, orden de aparición, duración, tipo de frecuencia, días de trial, si es recurrente y si se muestra en el landing
- [ ] Puedo editar todos los campos de un plan existente
- [ ] Puedo eliminar un plan que no tenga suscripciones activas
- [ ] Al marcar un plan como `is_free_tier`, ese plan se trata como el plan gratuito del sistema

### Notas técnicas
- `GET/POST /super-admin/plans` y `PUT/DELETE /super-admin/plans/{plan}`

---

## US-SA-13 — Gestionar cupones de descuento

**Como** miembro del equipo de GestioNube,  
**quiero** crear y gestionar cupones de descuento para la suscripción,  
**para** ofrecer precios especiales en campañas de marketing o negociaciones puntuales.

### Criterios de aceptación
- [ ] Puedo crear un cupón con: código, tipo (porcentaje o monto fijo), valor, usos máximos, fecha de inicio y fin, referencia (para identificar la campaña)
- [ ] Puedo activar o desactivar un cupón en cualquier momento sin eliminarlo
- [ ] El sistema muestra cuántas veces se usó cada cupón (`current_uses` vs `max_uses`)
- [ ] No puedo editar el código de un cupón existente (inmutable)

### Notas técnicas
- `GET/POST /super-admin/coupons` y `POST /super-admin/coupons/{coupon}/toggle`

---

## US-SA-14 — Gestionar consultas del landing

**Como** miembro del equipo de GestioNube,  
**quiero** ver y responder los mensajes de consulta que llegan desde el formulario de contacto del sitio web,  
**para** atender a potenciales clientes de manera organizada.

### Criterios de aceptación
- [ ] El listado muestra todos los mensajes con: nombre, email, asunto, estado (pendiente / respondido / cerrado) y fecha
- [ ] Puedo actualizar el estado de una consulta
- [ ] Puedo enviarle una respuesta por email directamente desde el panel
- [ ] Al responder, el estado cambia automáticamente y se registra la fecha de atención (`handled_at`)

### Notas técnicas
- `GET /super-admin/inquiries`, `PATCH /inquiries/{inquiry}/status`, `POST /inquiries/{inquiry}/reply`

---

## US-SA-15 — Gestionar feedback de usuarios del ERP

**Como** miembro del equipo de GestioNube,  
**quiero** ver y responder los mensajes de soporte y feedback enviados por los usuarios del sistema,  
**para** brindar soporte de primer nivel sin salir del panel de administración.

### Criterios de aceptación
- [ ] El listado muestra todos los tickets de feedback con: empresa, usuario, asunto y estado
- [ ] Puedo ver el hilo completo de mensajes (usuario + respuestas del superadmin)
- [ ] Puedo responder directamente desde la pantalla — mi respuesta queda en `feedback_messages` con `is_super_admin = true`
- [ ] Puedo cambiar el estado del ticket (pendiente / en proceso / resuelto / cerrado)
- [ ] En el dashboard principal aparece un contador de feedback sin leer

### Notas técnicas
- `GET/SHOW /super-admin/feedback`, `POST /feedback/{feedback}/reply`, `PATCH /feedback/{feedback}/status`
- `GetUnreadFeedbackCountAction` para el contador en el nav

---

## US-SA-16 — Auditoría de acciones del superadmin (v2.0)

**Como** líder del equipo de GestioNube,  
**quiero** ver un log de todas las acciones realizadas por los superadmins,  
**para** auditar quién suspendió, activó o modificó un tenant y cuándo.

### Criterios de aceptación
- [ ] Cada acción destructiva (suspender, revocar, cambiar features) queda registrada con: quién lo hizo, qué acción fue, sobre qué tenant, cuándo y los valores antes/después
- [ ] El log es consultable y filtrable por acción, operador y rango de fechas
- [ ] No se puede borrar el log de auditoría

### Notas técnicas
- **Mejora v2.0** — actualmente no hay auditoría de acciones del superadmin
- Nueva tabla `superadmin_audit_log` con `user_id, action, entity_type, entity_id, old_value (json), new_value (json), created_at`

---

## US-SA-17 — Impersonación de tenants (v2.0)

**Como** miembro del equipo de soporte de GestioNube,  
**quiero** poder "entrar" en la sesión de un tenant para ver el sistema exactamente como lo ve el usuario,  
**para** diagnosticar y resolver problemas sin pedirle la contraseña al cliente.

### Criterios de aceptación
- [ ] Un botón "Entrar como este tenant" en el panel de detalle del tenant
- [ ] Al hacer clic, mi sesión adopta el contexto del tenant seleccionado (tenant_id de sesión)
- [ ] Un banner visible en todo momento indica "Estás en modo impersonación — Tenant: {nombre}"
- [ ] Un botón me permite volver a mi sesión de superadmin en cualquier momento
- [ ] La acción de impersonación queda registrada en el log de auditoría

### Notas técnicas
- **Mejora v2.0** — no existe actualmente
- Implementar via token de sesión temporal con claim `impersonating_as_tenant = {id}`
- El log de auditoría debe registrar inicio y fin de cada sesión de impersonación
