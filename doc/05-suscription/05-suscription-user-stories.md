# Historias de Usuario — Módulo 05: Suscripciones y Planes

> **Módulo:** 05-suscription  
> **Fase:** 1 — Fundación  
> **Depende de:** 02-tenant

---

## US-SUB-01 — Ver mi plan actual y los planes disponibles

**Como** administrador de una empresa,  
**quiero** ver en qué plan estoy actualmente y cuáles son las opciones disponibles para contratar,  
**para** decidir si necesito cambiar o actualizar mi suscripción.

### Criterios de aceptación
- [ ] La página de suscripción muestra el plan activo con: nombre, fecha de inicio, próximo vencimiento o fecha de cobro, monto pagado y estado
- [ ] Si estoy en el plan gratuito, se muestra un banner destacado indicando los límites del free tier
- [ ] Los planes disponibles se muestran ordenados con su precio, duración, días de prueba y descripción
- [ ] Se resalta visualmente el plan actual (si ya tengo uno)
- [ ] El ahorro por elegir planes más largos se muestra claramente (ej: "Ahorrás 10% eligiendo Trimestral")
- [ ] Si hay un cupón aplicado en la sesión, el precio final con descuento se muestra en cada plan

### Notas técnicas
- Ruta: `GET /suscription`
- `GetActiveSuscriptionAction::execute()` → suscripción activa con plan y cupón
- `GetAvailablePlansAction` → planes activos ordenados por `order`

---

## US-SUB-02 — Aplicar un cupón de descuento

**Como** usuario que tiene un código de descuento,  
**quiero** ingresar mi cupón antes de contratar un plan,  
**para** obtener el precio reducido al momento del pago.

### Criterios de aceptación
- [ ] Existe un campo para ingresar el código del cupón en la página de suscripción
- [ ] Al validar el cupón, se muestra el descuento aplicado y el precio final con el ahorro destacado
- [ ] Si el cupón no existe, está vencido o agotado, se muestra un error claro
- [ ] El cupón queda guardado en la sesión hasta que el usuario complete el pago o salga de la página
- [ ] El descuento puede ser un porcentaje (`%`) o un monto fijo en ARS

### Notas técnicas
- Ruta: `POST /suscription/validate-coupon`
- `GetCouponByCode::execute($code)` → valida active, max_uses, fechas
- El `coupon_id` se guarda en `session()->flash()`

---

## US-SUB-03 — Contratar un plan pago con MercadoPago

**Como** administrador que quiere acceder a todas las funcionalidades,  
**quiero** contratar un plan pago siendo redirigido a MercadoPago para completar el pago de forma segura,  
**para** activar mi suscripción sin compartir mis datos bancarios con GestioNube.

### Criterios de aceptación
- [ ] Al elegir un plan y hacer clic en "Contratar", soy redirigido al checkout de MercadoPago
- [ ] El checkout muestra el nombre del plan, el precio final (con descuento si aplica) y los días de prueba gratuita
- [ ] Durante el período de prueba no se realiza ningún cobro
- [ ] Tras pagar exitosamente, soy redirigido al sistema con un mensaje de confirmación y mi plan activo
- [ ] Si el pago falla, soy redirigido con un mensaje de error y la posibilidad de intentar nuevamente
- [ ] Si el pago queda pendiente (ej: transferencia), veo una pantalla de "Pago en proceso" y recibiré una notificación cuando se confirme
- [ ] El cobro es recurrente automático según el ciclo del plan (mensual, trimestral, semestral)

### Notas técnicas
- Ruta: `POST /suscription/create-preference-url` → crear suscripción en BD (PENDING) → redirect a `init_point` de MP
- Tipo de suscripción en MP: **preapproval** (cobro recurrente), no preference de pago único
- `external_reference = "plan_{id}_{timestamp}_{sub_id}"` es la clave de correlación con el webhook

---

## US-SUB-04 — Ver confirmación de pago exitoso

**Como** usuario que acaba de pagar un plan,  
**quiero** ver una confirmación clara de que mi suscripción fue activada,  
**para** saber que puedo comenzar a usar todas las funcionalidades sin restricciones.

### Criterios de aceptación
- [ ] Tras el pago exitoso en MercadoPago, soy redirigido a la pantalla de suscripción con mensaje de éxito
- [ ] El plan activo aparece actualizado inmediatamente con las nuevas fechas
- [ ] El banner de "free tier" desaparece si estaba en modo gratuito
- [ ] Recibo un email de confirmación con el detalle de la suscripción contratada

### Notas técnicas
- Ruta: `GET /suscription/success?preapproval_id=...`
- `ActivateSubscriptionFromMercadoPago::execute()` actualiza el registro a `status=AUTHORIZED, active=true`
- El webhook de MP también activa la suscripción de forma asíncrona (doble mecanismo de seguridad)

---

## US-SUB-05 — Cancelar mi suscripción activa

**Como** administrador de una empresa,  
**quiero** poder cancelar mi suscripción desde el panel de GestioNube,  
**para** dejar de ser cobrado en el próximo ciclo sin necesidad de llamar a soporte.

### Criterios de aceptación
- [ ] En la página de suscripción, botón "Cancelar suscripción" visible cuando hay un plan activo
- [ ] Se muestra un diálogo de confirmación con advertencia sobre la pérdida de acceso
- [ ] La cancelación se confirma tanto en MercadoPago (deja de cobrar) como en la BD del sistema
- [ ] Tras cancelar, el plan sigue activo hasta que vence el período ya pagado (no se pierde acceso inmediatamente)
- [ ] Si la cancelación en MercadoPago falla por error de API, igual se registra en el sistema con una advertencia para soporte

### Notas técnicas
- Ruta: `POST /suscription/cancel`
- MercadoPago se actualiza primero (con try/catch que loguea warning si falla)
- `subscription->update([status='cancelled', active=false])`

---

## US-SUB-06 — Operar con restricciones del free tier

**Como** usuario en el plan gratuito,  
**quiero** poder usar GestioNube dentro de los límites del free tier,  
**para** evaluar el sistema antes de decidir si contratar un plan pago.

### Criterios de aceptación
- [ ] En el header o dashboard, un indicador visible de "Plan Gratuito" con los límites actuales de uso
- [ ] Cuando alcanzo el límite de un recurso (ej: máximo de facturas), recibo un mensaje específico: "Alcanzaste el límite de X facturas en el plan gratuito"
- [ ] El mensaje de límite incluye un botón "Ver planes" que lleva a la página de suscripción
- [ ] Los recursos ya creados siguen siendo accesibles aunque haya llegado al límite (solo se bloquea crear nuevos)
- [ ] La prop `isFreeTier` se comparte en cada request y el frontend la usa para mostrar restricciones

### Notas técnicas
- `IsFreeTierAction::execute()` → retorna `true` si no hay suscripción activa
- Tabla `free_tiers`: define los límites por tenant/resource
- Los límites actuales vienen de `.env` → en v2.0 migrar a `plan_limits` en BD (ver US-SUB-12)

---

## US-SUB-07 — Recibir alerta previa al vencimiento de la suscripción

**Como** administrador con un plan activo,  
**quiero** recibir una notificación antes de que venza mi suscripción o se realice el próximo cobro,  
**para** no ser tomado por sorpresa y tener tiempo de actualizar mi método de pago si es necesario.

### Criterios de aceptación
- [ ] Se envía un email recordatorio 7 días antes de la próxima fecha de cobro (`next_payment_date`)
- [ ] El email muestra: plan, monto a cobrar, fecha y método de pago configurado en MercadoPago
- [ ] Si el cobro automático falla, se envía un email de alerta inmediata con link para actualizar el pago
- [ ] Una notificación in-app también aparece en los 3 días previos al vencimiento

### Notas técnicas
- Requiere un comando o job programado: `artisan schedule:run` cada día verifica `next_payment_date - 7 días`
- En v2.0: Cloudflare Cron Triggers + notificación via tabla `notifications`

---

## US-SUB-08 — Ver historial de mis pagos y suscripciones anteriores

**Como** administrador de una empresa,  
**quiero** ver el historial completo de suscripciones y pagos de mi empresa,  
**para** tener un registro de lo que pagué y poder descargar comprobantes.

### Criterios de aceptación
- [ ] En la página de suscripción, sección "Historial" con todas las suscripciones anteriores
- [ ] Cada entrada muestra: plan, período, monto pagado, estado y fecha
- [ ] Si hay URL de comprobante (`invoice_url`), botón para descargarlo
- [ ] Los estados se muestran con badges de colores: activa (verde), cancelada (gris), pausada (naranja)

### Notas técnicas
- `GetSubscriptionHistoryAction::execute()` → todas las suscripciones del tenant ordenadas por fecha
- Campo `invoice_url` en `suscriptions` contiene el link al comprobante de MP

---

## US-SUB-09 — Activar el Add-on de Inteligencia Artificial (v2.0)

**Como** administrador con cualquier plan de GestioNube,  
**quiero** contratar el add-on de IA de forma independiente a mi plan actual,  
**para** desbloquear el módulo de inteligencia artificial sin necesitar cambiar mi plan base.

### Criterios de aceptación
- [ ] En la página de suscripción, sección separada "Módulo IA" con su propio precio y descripción
- [ ] El add-on se puede contratar estando en cualquier plan: Mensual, Trimestral, Semestral o incluso Free Tier
- [ ] El pago se realiza igual que los planes base: vía MercadoPago con cobro recurrente mensual
- [ ] Una vez activado, el feature `ai_module` se habilita en el tenant y el módulo de IA aparece en la navegación
- [ ] El add-on tiene su propia suscripción independiente en la BD (`plan_type='addon'`) — se pueden cancelar por separado
- [ ] Si el tenant ya tiene el add-on activo, se muestra su estado (activo / próximo cobro) en la sección correspondiente

### Notas técnicas
- **Nuevo en v2.0** — nuevo plan `id=4, plan_type='addon'` en tabla `plans`
- Nueva columna: `plans.plan_type` ('base' | 'addon') y `suscriptions.plan_type`
- Al activar: insertar o actualizar `tenant_features` con `feature='ai_module', enabled=true`
- `GetActiveSuscriptionAction` debe retornar array de suscripciones (base + addon si existe)

---

## US-SUB-10 — Ver qué incluye el Add-on de IA antes de contratarlo

**Como** administrador evaluando el add-on de IA,  
**quiero** ver exactamente qué funcionalidades desbloquea antes de pagar,  
**para** decidir si el costo se justifica para mi negocio.

### Criterios de aceptación
- [ ] La sección del add-on de IA muestra la lista completa de funcionalidades incluidas:
  - Análisis de rentabilidad en lenguaje natural
  - Predicciones de cuándo se agota el stock por producto
  - Detección automática de anomalías en ventas
  - Sugerencias de precio basadas en márgenes
  - Asistente contable para consultas sobre estados financieros
  - Resumen semanal de KPIs por email
- [ ] Un botón "Ver demo" o "Ver ejemplo" muestra una captura o GIF animado del chat de IA en acción
- [ ] La sección indica "Compatible con todos los planes" para que quede claro que no necesitan cambiar su plan base

### Notas técnicas
- **Nuevo en v2.0** — contenido de marketing del add-on
- El demo puede ser estático (imágenes/video) o interactivo (modo demo sin datos reales)

---

## US-SUB-11 — Cancelar el Add-on de IA independientemente del plan base

**Como** administrador con el add-on de IA activo,  
**quiero** cancelar el add-on sin cancelar mi plan base,  
**para** dejar de pagar por la IA sin perder el resto de las funcionalidades del ERP.

### Criterios de aceptación
- [ ] En la sección del add-on, botón "Cancelar add-on de IA" separado del botón de cancelar el plan base
- [ ] Al cancelar el add-on, el módulo de IA sigue accesible hasta que vence el período ya pagado
- [ ] Tras el vencimiento, el feature `ai_module` se deshabilita en `tenant_features`
- [ ] El plan base permanece activo e inalterado
- [ ] El usuario recibe confirmación de cancelación por email

### Notas técnicas
- **Nuevo en v2.0** — la suscripción del addon (`plan_type='addon'`) se cancela de forma independiente
- `tenant_features` se actualiza: `enabled=false` para `ai_module` cuando vence o se cancela

---

## US-SUB-12 — Límites de uso configurables por plan desde superadmin (v2.0)

**Como** operador de GestioNube (superadmin),  
**quiero** configurar los límites del free tier y de cada plan desde el panel de administración,  
**para** ajustar las restricciones sin necesidad de modificar variables de entorno o redesplegar.

### Criterios de aceptación
- [ ] En el panel de superadmin, sección "Límites de Plan" donde se configura por plan y por recurso: facturas, productos, usuarios, sucursales
- [ ] Los límites se guardan en BD y toman efecto inmediatamente
- [ ] Un tenant específico puede tener un límite personalizado (override del plan)
- [ ] Los cambios de límite no afectan retroactivamente los recursos ya creados

### Notas técnicas
- **Mejora v2.0** — actualmente los límites del free tier están en `.env` (`FREE_TIER_MAX_INVOICES`, etc.)
- Nueva tabla: `plan_limits` (plan_id, resource VARCHAR, max_count INT) o ampliar `free_tiers` existente
- El check de límite se hace antes de cada creación: `FreeTierLimitChecker::check($resource, $tenant_id)`

---

## US-SUB-13 — Descuento por combo plan base + add-on de IA (v2.0)

**Como** usuario que quiere contratar el plan Semestral junto con el add-on de IA,  
**quiero** recibir un descuento por contratar ambos juntos,  
**para** que la combinación resulte más económica que contratarlos por separado.

### Criterios de aceptación
- [ ] Al tener el add-on de IA en el carrito junto con un plan de 3 meses o más, se aplica automáticamente un descuento combo
- [ ] El descuento se muestra visiblemente: "Combo IA + Semestral — 15% de descuento en el add-on"
- [ ] El descuento se implementa como un cupón generado automáticamente (tipo `percentage`, aplicado al precio del addon)
- [ ] Los descuentos combo se configuran desde el panel de superadmin

### Notas técnicas
- **Nuevo en v2.0** — requiere lógica de cupones automáticos basada en combinación de planes
- Implementar como regla: `si plan_base.duration >= 3 meses → generar coupon 15% para addon`
- O definir precio especial del addon por plan base en una tabla `plan_addon_pricing`
