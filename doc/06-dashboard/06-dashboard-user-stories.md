# Historias de Usuario — Módulo 06: Dashboard

> **Módulo:** 06-dashboard  
> **Fase:** 2 — Operaciones Core  
> **Depende de:** 02-tenant, 03-rbac, 05-suscription

---

## US-DASH-01 — Ver el resumen financiero del negocio al entrar al sistema

**Como** dueño o administrador de una empresa,  
**quiero** ver al ingresar al sistema un resumen con los indicadores más importantes de mi negocio,  
**para** tener una visión rápida del estado financiero sin tener que navegar por múltiples secciones.

### Criterios de aceptación
- [ ] Al acceder a `/dashboard`, se muestran 4 tarjetas de resumen: Cuentas por Cobrar, Cuentas por Pagar, Facturas de Venta emitidas y Flujo de Caja Neto
- [ ] Cada tarjeta muestra el valor formateado en ARS y una descripción breve
- [ ] El flujo de caja neto muestra un indicador visual positivo (verde) o negativo (rojo)
- [ ] Los datos reflejan únicamente el tenant activo en sesión (no datos de otras sucursales)
- [ ] Si los datos tardan más de 2 segundos en cargar, se muestran skeletons de carga en lugar de pantalla en blanco
- [ ] Solo puede acceder quien tenga el permiso "Ver Dashboard" (ID 18)

### Notas técnicas
- Ruta: `GET /dashboard`
- `GetTreasuryMetricsAction`: cuentas por cobrar = facturas ACCEPTED + PARTIALLY_PAID + PENDING; cuentas por pagar = ídem para compras
- Los totales se calculan dinámicamente desde `invoice_product` (no hay columna `total` en `invoices`)

---

## US-DASH-02 — Ver la tendencia de ventas y compras de los últimos 6 meses

**Como** administrador,  
**quiero** ver un gráfico con la evolución mensual de mis ventas y compras durante los últimos 6 meses,  
**para** identificar tendencias, estacionalidades y comparar el desempeño a lo largo del tiempo.

### Criterios de aceptación
- [ ] Un gráfico de líneas o barras muestra las ventas y compras mes a mes (últimos 6 meses)
- [ ] El eje vertical muestra montos en ARS formateados
- [ ] El eje horizontal muestra los meses con formato "Mes AAAA" (ej: "Jun 2026")
- [ ] Al pasar el cursor sobre un punto del gráfico, aparece un tooltip con: mes, monto ventas, monto compras
- [ ] Los meses sin actividad muestran cero (no se omiten)

### Notas técnicas
- `invoiceMetrics.monthly_trends`: array de 6 elementos, uno por mes
- El cálculo aplica descuentos, intereses e IVA por cada factura procesada en chunks de 500
- Si `iva_type = 'excluded'` se multiplica el total por 1.21

---

## US-DASH-03 — Ver la comparación de ventas mes actual vs mes anterior

**Como** administrador,  
**quiero** ver de un vistazo cuánto vendí este mes comparado con el mes anterior,  
**para** saber si el negocio está creciendo, estable o en retroceso sin necesidad de calcular yo mismo.

### Criterios de aceptación
- [ ] Se muestra el monto de ventas del mes actual y del mes anterior
- [ ] Un indicador de porcentaje muestra el cambio: "+15% vs mes anterior" o "-8% vs mes anterior"
- [ ] El indicador es verde si es positivo, rojo si es negativo
- [ ] También se muestra la cantidad de facturas de cada mes (no solo el monto)

### Notas técnicas
- `monthlyComparison`: `{ currentMonth: { total, count, name }, previousMonth: { ... }, percentageChange }`
- `percentageChange = ((current - previous) / previous) * 100`; si previous = 0 devuelve 0

---

## US-DASH-04 — Ver el flujo de caja de los últimos 6 meses

**Como** administrador de una empresa,  
**quiero** ver un gráfico de flujo de caja con los cobros y pagos mes a mes durante los últimos 6 meses,  
**para** entender cuándo entró y salió dinero de mi empresa y planificar el capital de trabajo.

### Criterios de aceptación
- [ ] Un gráfico muestra por mes: ingresos (cobros), egresos (pagos) y flujo neto
- [ ] El flujo neto es la diferencia: ingresos - egresos
- [ ] Los datos provienen de `transactions` reales, no de facturas (son los pagos/cobros efectivamente realizados)
- [ ] Un resumen debajo del gráfico muestra: total ingresos 6 meses, total egresos 6 meses, neto acumulado, promedio mensual de cada uno

### Notas técnicas
- `GetCashFlowSummaryAction`: query SQL con `SUM(amount)` agrupado por `type` y `month`
- `type = 'collection'` → ingresos; `type = 'payment'` → egresos

---

## US-DASH-05 — Ver los productos más vendidos

**Como** administrador o gerente de ventas,  
**quiero** ver cuáles son mis 5 productos más vendidos en los últimos 3 meses,  
**para** identificar qué productos mueven el negocio y asegurar que tengan stock suficiente.

### Criterios de aceptación
- [ ] Una sección "Productos más vendidos" muestra los 5 productos con mayor cantidad vendida en los últimos 3 meses
- [ ] Cada producto muestra: nombre, unidades vendidas (suma de `invoice_product.quantity`) y precio de venta
- [ ] La lista está ordenada de mayor a menor cantidad
- [ ] Si el tenant no tiene ventas en los últimos 3 meses, la sección muestra un estado vacío

### Notas técnicas
- `productMetrics.top_products`: top 5 por `withSum('invoice_product.quantity')` en facturas de venta
- Solo facturas de tipo `SALE_INVOICE` y `REMIT_SALE` en los últimos 3 meses

---

## US-DASH-06 — Ver la actividad reciente de facturas y transacciones

**Como** usuario del sistema,  
**quiero** ver las últimas 10 facturas emitidas y las últimas 10 transacciones registradas,  
**para** tener un feed rápido de lo que pasó recientemente sin tener que ir a cada módulo.

### Criterios de aceptación
- [ ] Una sección "Actividad reciente" muestra dos listas: "Últimas facturas" y "Últimas transacciones"
- [ ] Cada factura muestra: número, tipo (venta/compra/presupuesto), cliente/proveedor, estado, total y fecha
- [ ] Cada transacción muestra: número, tipo (cobro/pago), contraparte, monto y fecha
- [ ] Hacer clic en un elemento navega directamente a ese registro
- [ ] Los estados se muestran con badges de colores consistentes con los módulos correspondientes

### Notas técnicas
- `recent_activity.recent_invoices`: últimas 10 facturas ordenadas por `created_at DESC`, con contraparte y totales calculados
- `recent_activity.recent_transactions`: últimas 10 transacciones con contraparte

---

## US-DASH-07 — Ver contrapartes con saldos pendientes y créditos

**Como** administrador de tesorería,  
**quiero** ver qué clientes y proveedores tienen saldos pendientes o créditos a favor,  
**para** priorizar los cobros y pagos más urgentes del día.

### Criterios de aceptación
- [ ] Una sección "Tesorería" lista las contrapartes con facturas pendientes de cobro o pago
- [ ] Para cada contraparte muestra: nombre, tipo (cliente/proveedor), monto total pendiente
- [ ] Otra sub-sección muestra contrapartes con saldo a favor (crédito)
- [ ] Hacer clic en una contraparte navega a su resumen de cuenta en tesorería

### Notas técnicas
- `treasury.counterpartiesWithPending`: hasta 50 contrapartes con facturas pendientes
- `treasury.counterpartiesWithCredit`: hasta 10 con saldo a favor
- `GetCounterpartiesWithPendingTotalsAction` y `GetCounterpartiesWithCreditTotalsAction`

---

## US-DASH-08 — Ver datos consolidados de todas las sucursales (permiso especial)

**Como** dueño de una empresa con múltiples sucursales,  
**quiero** que el dashboard muestre los KPIs consolidados de toda mi organización,  
**para** tener una visión global del negocio sin tener que cambiar de sucursal una por una.

### Criterios de aceptación
- [ ] Con el permiso "Ver Facturas Sucursales" (ID 93), la sección de tesorería muestra datos agregados de todas las sucursales relacionadas
- [ ] Un indicador visual señala que la vista es "consolidada" (no de una sola sucursal)
- [ ] Las contrapartes con saldo pendiente incluyen las de todas las sucursales visibles
- [ ] Sin el permiso, el dashboard solo muestra datos del tenant activo en sesión

### Notas técnicas
- `DashboardTreasuryAction`: usa `GetTenantContextAction` si tiene "Ver Facturas Sucursales", sino solo `[$currentTenant]`
- Cache key incluye todos los `tenantIds`: `"treasury_dashboard_tenants_{ids_joined}"`

---

## US-DASH-09 — Ver banner de upgrade cuando estoy en el plan gratuito

**Como** usuario en el free tier,  
**quiero** ver un aviso en el dashboard que me indique los límites de mi plan gratuito,  
**para** entender qué restricciones tengo y cuándo debo considerar contratar un plan.

### Criterios de aceptación
- [ ] Si el tenant está en free tier (`isFreeTier = true`), aparece un banner persistente en el dashboard
- [ ] El banner muestra cuántos recursos estoy usando de cada límite (ej: "45/100 productos")
- [ ] El banner tiene un botón "Ver planes" que lleva a la página de suscripción
- [ ] Si ya superé algún límite, ese recurso se marca en rojo con urgencia
- [ ] Al contratar un plan pago, el banner desaparece automáticamente

### Notas técnicas
- `isFreeTier` y `FreeTierResources` se comparten como Inertia shared props en cada request (desde `HandleInertiaRequests`)
- `GetUsedFreeTierForTenantAction` calcula el uso actual de cada recurso

---

## US-DASH-10 — Dashboard personalizable por el usuario (v2.0)

**Como** usuario de GestioNube,  
**quiero** elegir qué widgets aparecen en mi dashboard y en qué orden,  
**para** ver primero la información que más necesito según mi rol en la empresa.

### Criterios de aceptación
- [ ] Un botón "Personalizar dashboard" permite entrar a modo de edición
- [ ] En modo edición puedo activar/desactivar widgets con toggles
- [ ] Puedo reordenar los widgets arrastrándolos (drag & drop)
- [ ] La configuración se guarda por usuario (no por empresa) — cada miembro del equipo puede tener su propio layout
- [ ] Los widgets disponibles dependen de los permisos del usuario (ej: si no tiene "Ver Tesorería", el widget de tesorería no aparece)
- [ ] Un botón "Restablecer" vuelve al layout por defecto

### Notas técnicas
- **Nuevo en v2.0** — actualmente el dashboard es el mismo para todos
- Nueva tabla: `user_dashboard_config` (user_id, tenant_id, config JSON)
- `config` contiene el array de widgets con orden y estado visible/oculto

---

## US-DASH-11 — Alertas inteligentes del negocio generadas por IA (v2.0, requiere add-on IA)

**Como** dueño de una empresa con el add-on de IA activo,  
**quiero** ver en el dashboard una sección de alertas e insights generados automáticamente,  
**para** que el sistema me avise de situaciones importantes que de otro modo pasaría por alto.

### Criterios de aceptación
- [ ] Una sección "Alertas del negocio" aparece en el dashboard cuando el feature `ai_module` está activo
- [ ] La IA genera entre 3 y 5 alertas accionables basadas en los datos reales del tenant, por ejemplo:
  - "Tus ventas de esta semana cayeron 30% — los martes y miércoles tuvieron actividad cero"
  - "El producto X se agota en ~8 días a tu ritmo actual de ventas"
  - "El cliente Y tiene una factura vencida desde hace 45 días por $XX.XXX"
  - "Tu margen promedio de ventas este mes fue del 12% — por debajo de tu histórico del 28%"
- [ ] Cada alerta tiene un botón de acción directo ("Ver factura", "Ver stock", "Ir a tesorería")
- [ ] Las alertas se regeneran cada 4 horas (no en cada recarga de página)
- [ ] Si el add-on de IA no está activo, la sección muestra un teaser con ejemplo de alertas y botón "Activar IA"

### Notas técnicas
- **Nuevo en v2.0** — requiere add-on de IA activo (feature `ai_module` en `tenant_features`)
- La IA recibe un JSON con las métricas calculadas por el sistema y genera las alertas en lenguaje natural
- El LLM NO calcula los números — solo interpreta los datos ya calculados
- Caché de alertas: Cloudflare KV con TTL de 4 horas por tenant

---

## US-DASH-12 — Widget de estado de conexión AFIP/ARCA (v2.0)

**Como** empresa que emite facturas electrónicas,  
**quiero** ver en el dashboard el estado de mi conexión con AFIP/ARCA,  
**para** detectar a tiempo si hay algún problema que impida emitir facturas electrónicas.

### Criterios de aceptación
- [ ] Un widget compacto en el dashboard muestra: estado AFIP (Activo ✅ / Con error ⚠️ / No configurado)
- [ ] Si hay un certificado activo, muestra la fecha de vencimiento del mismo con alerta si vence en menos de 30 días
- [ ] Muestra la última factura emitida exitosamente con AFIP (número y fecha)
- [ ] Si el último intento de emisión falló, muestra el error de forma legible
- [ ] Solo aparece si el tenant tiene al menos un certificado AFIP cargado

### Notas técnicas
- **Nuevo en v2.0** — actualmente no hay widget de AFIP en el dashboard
- Datos desde `arca_certificates`: `valid_to`, `last_used_at`
- El estado de AFIP se cachea por 30 minutos (no se consulta a AFIP en cada carga del dashboard)

---

## US-DASH-13 — Widget de comparación de sucursales (v2.0)

**Como** dueño de una empresa con varias sucursales y el permiso de visibilidad cross-tenant,  
**quiero** ver en el dashboard un ranking de ventas por sucursal del mes actual,  
**para** identificar cuál sucursal está rindiendo mejor y cuál necesita atención.

### Criterios de aceptación
- [ ] Un widget "Ventas por sucursal" muestra todas las sucursales ordenadas por monto de ventas del mes actual
- [ ] Cada sucursal muestra: nombre, monto total de ventas, número de facturas y variación vs mes anterior
- [ ] La sucursal con mejores ventas tiene un indicador visual destacado
- [ ] Solo aparece si el usuario tiene el permiso "Ver Facturas Sucursales" y tiene más de una sucursal
- [ ] Hacer clic en una sucursal cambia el contexto activo a esa sucursal y refresca los datos

### Notas técnicas
- **Nuevo en v2.0** — actualmente el dashboard no desglosa por sucursal aunque se tenga el permiso cross-tenant
- Requiere agregar la sucursal como dimensión en `getInvoiceMetrics()` cuando `allowedTenantIds` contiene más de un ID
