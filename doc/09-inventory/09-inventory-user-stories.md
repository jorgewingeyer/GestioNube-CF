# Historias de Usuario — Módulo 09: Inventario

> **Módulo:** 09-inventory  
> **Fase:** 2 — Operaciones Core  
> **Depende de:** 08-batches, 07-products, 02-tenant, 03-rbac

---

## US-INV-01 — Ver el estado general del inventario

**Como** dueño o administrador del negocio,  
**quiero** ver un resumen del estado de mi inventario al entrar a la sección,  
**para** conocer de un vistazo cuántos productos tengo, cuánto vale el stock y qué alertas críticas hay.

### Criterios de aceptación
- [ ] Al ingresar a `/inventory`, se muestran 6 tarjetas de estadísticas:
  - Total de productos en el catálogo
  - Valor total del inventario en ARS
  - Cantidad de productos con stock bajo (< 10 unidades)
  - Cantidad de productos sin stock
  - Lotes próximos a vencer (en los próximos 30 días)
  - Total de movimientos registrados
- [ ] Los números se actualizan al cambiar filtros de fecha
- [ ] Solo puede acceder quien tenga el permiso "Ver Inventario"

### Notas técnicas
- `GetInventoryStatsAction::executeWithProducts()` calcula las 6 métricas
- `total_stock_value` = `SUM(branch_stocks.quantity × products.price_sell)` en centavos
- `expiring_soon_batches`: batch con `status=ACTIVE` y `expiration_date ≤ ahora + 30 días`

---

## US-INV-02 — Ver la lista de productos con su stock actual

**Como** responsable de depósito o compras,  
**quiero** ver todos los productos con su stock actual, estado y valor,  
**para** identificar rápidamente qué necesito reponer y qué tengo en exceso.

### Criterios de aceptación
- [ ] La lista muestra por producto: nombre, categoría, stock total, estado del stock y valor del stock
- [ ] El estado del stock se indica con color: Saludable (verde, ≥ 10), Bajo (naranja, 1-9), Sin stock (rojo, 0)
- [ ] Puedo filtrar por: categoría, estado de stock (saludable/bajo/sin stock)
- [ ] Puedo filtrar por rango de fechas para ver las entradas y salidas del período
- [ ] El stock mostrado es la suma de todas las unidades en lotes activos (ACTIVE, EXPIRING_SOON, EXPIRED, NEGATIVE) para el tenant activo

### Notas técnicas
- `GetProductsInventoryInfoAction::execute()` carga productos con sus `branchStocks` → batches
- Caché 120 segundos sin filtros de fecha; sin caché con filtros activos
- `InventoryCalculatorAction::determineStockStatus()`: `=0 → 'out'`, `<10 → 'low'`, `≥10 → 'healthy'`
- Los estados `DELETED` y `DISABLED` de batch se excluyen del cálculo de stock

---

## US-INV-03 — Ver el detalle de stock de un producto

**Como** responsable de depósito,  
**quiero** ver el detalle de stock de un producto específico con todos sus lotes,  
**para** saber exactamente en qué lotes está distribuido el stock y cuándo vence cada uno.

### Criterios de aceptación
- [ ] Al hacer clic en un producto de la lista, veo la pantalla de detalle del producto
- [ ] Se muestra una tabla de lotes activos con: número de lote, código de barras, fecha de vencimiento, estado del lote y cantidad disponible
- [ ] Los lotes están ordenados por fecha de vencimiento (más próxima primero)
- [ ] Los lotes en estado "Por vencer" y "Vencido" se destacan visualmente
- [ ] Se muestra el stock total (suma de todos los lotes) y el valor total del producto

### Notas técnicas
- Ruta: `GET /inventory/product/{productId}`
- `GetProductInventoryDetailAction::execute($tenantId, $productId)`
- Si el producto no existe o no pertenece al tenant: `abort(404)`

---

## US-INV-04 — Ver el historial de movimientos de un producto

**Como** responsable de depósito o auditor interno,  
**quiero** ver todos los movimientos de stock (entradas y salidas) de un producto,  
**para** entender por qué cambió el stock y verificar que los movimientos son correctos.

### Criterios de aceptación
- [ ] En el detalle del producto, sección "Historial de movimientos" muestra cada entrada y salida
- [ ] Cada movimiento muestra: fecha, descripción legible del tipo (ej: "Venta — Factura #123"), cantidad (+/-), referencia a la factura (si aplica)
- [ ] Las entradas se muestran en verde con signo `+`, las salidas en rojo con signo `-`
- [ ] Los movimientos pueden filtrarse por rango de fechas
- [ ] Al hacer clic en un movimiento vinculado a una factura, navego directamente a esa factura

### Notas técnicas
- `GetProductMovementsAction` → `activities` donde `activity_type` es de inventario
- `TransformActivityToMovementAction` convierte cada `Activity` en un objeto `Movement`
- `MovementDescriptionAction` genera el texto legible según `activity_type` e `invoice.type`
- Clasificación entrada/salida: `purchase_invoice/remit_purchase` → entrada; `sale_invoice/remit_sale` → salida; `credit_note` según signo de `quantity_changed`

---

## US-INV-05 — Filtrar el inventario por período de tiempo

**Como** administrador,  
**quiero** poder ver las entradas y salidas de inventario dentro de un período específico,  
**para** analizar la rotación de stock en una fecha o rango determinado (ej: el último mes, un trimestre).

### Criterios de aceptación
- [ ] Puedo seleccionar fecha desde y fecha hasta para filtrar los movimientos del período
- [ ] Con el filtro activo, las columnas "Entradas" y "Salidas" de la lista muestran solo los movimientos del período elegido
- [ ] El stock total y el valor del inventario se mantienen al valor actual (no son afectados por el filtro de fecha)
- [ ] Si no hay movimientos en el período seleccionado, la columna muestra `0` (no se omite el producto)

### Notas técnicas
- Parámetros: `?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`
- Con filtros activos, el caché se desactiva: `GetAllInfoAction` va directo a BD
- El filtro afecta `GetProductsInventoryInfoAction::execute($tenantId, $dateFrom, $dateTo)`

---

## US-INV-06 — Exportar inventario en formato resumido

**Como** administrador o gerente,  
**quiero** exportar el inventario en formato Excel resumido (una fila por producto),  
**para** analizarlo en una planilla, compartirlo con el equipo o usarlo en una reunión de planificación.

### Criterios de aceptación
- [ ] Un botón "Exportar resumen" descarga un Excel con una fila por producto
- [ ] Columnas incluidas: nombre, categoría, stock actual, valor del stock, total entradas y total salidas del período filtrado
- [ ] Los filtros activos (categoría, estado de stock, rango de fechas) se respetan en el export
- [ ] El archivo se descarga directamente (no hay pantalla de espera)

### Notas técnicas
- `GET /inventory/export/summary`
- `ExportInventorySummaryAction::execute($from, $to, $filters)`
- Generación síncrona — si el inventario es muy grande puede hacer timeout

---

## US-INV-07 — Exportar inventario en formato detallado por lote

**Como** responsable de depósito,  
**quiero** exportar el inventario detallado con una fila por lote,  
**para** tener un informe completo de cada número de lote, su fecha de vencimiento y su stock, ya sea para auditoría o para revisión de vencimientos.

### Criterios de aceptación
- [ ] Un botón "Exportar detallado" descarga un Excel con una fila por lote
- [ ] Columnas incluidas: nombre del producto, número de lote, código de barras, fecha de vencimiento, estado del lote, stock actual en este lote
- [ ] Los lotes vencidos y por vencer se destacan con color en el Excel
- [ ] Los filtros activos se respetan en el export

### Notas técnicas
- `GET /inventory/export/detailed`
- `ExportInventoryDetailedAction::execute($from, $to, $filters)`
- Una fila por `BranchStock` activo (no por `Batch` globalmente)

---

## US-INV-08 — Ver alertas de lotes próximos a vencer desde el inventario

**Como** responsable de compras,  
**quiero** ver en el inventario qué lotes están por vencer en los próximos 30 días,  
**para** planificar su venta o disposición antes de que sean invendibles.

### Criterios de aceptación
- [ ] Las estadísticas de inventario muestran el conteo de lotes próximos a vencer
- [ ] Al hacer clic en el contador, puedo filtrar la lista de productos para mostrar solo los que tienen lotes próximos a vencer
- [ ] En el detalle de cada producto, los lotes por vencer (< 30 días) se muestran con un badge naranja
- [ ] Los lotes ya vencidos con stock > 0 se muestran con badge rojo

### Notas técnicas
- `expiring_soon_batches` en stats: `BranchStock.whereHas('batch', fn → status=ACTIVE AND expiration_date ≤ +30d AND > now)`
- El umbral de 30 días es fijo en el código actual

---

## US-INV-09 — Umbral de stock bajo configurable por producto (v2.0)

**Como** dueño de un negocio con productos de naturaleza muy diferente,  
**quiero** que el umbral de "stock bajo" sea configurable para cada producto,  
**para** que el sistema me avise cuando queda poco stock de acuerdo a la demanda real de cada artículo (no todos necesitan 10 unidades).

### Criterios de aceptación
- [ ] En la pantalla de edición del producto (módulo 07), puedo configurar `stock_minimum` como el umbral de alerta de "stock bajo" para ese producto y sucursal
- [ ] Si `stock_minimum` está configurado, se usa como umbral para clasificar el stock como bajo en el inventario
- [ ] Si `stock_minimum` no está configurado, el fallback es 10 unidades (comportamiento actual)
- [ ] El estado del stock en la lista de inventario usa el umbral configurado para cada producto

### Notas técnicas
- **Mejora v2.0** — los campos `product_tenant.stock_minimum` y `stock_maximum` ya existen en la BD pero no se usan en el cálculo de `stock_status`
- Cambio en `InventoryCalculatorAction::determineStockStatus()`: recibir `?int $stockMinimum = null`
- No require migración de BD — solo lógica de aplicación

---

## US-INV-10 — Ver inventario consolidado de todas las sucursales (v2.0)

**Como** dueño de una empresa con múltiples sucursales y el permiso "Ver Facturas Sucursales",  
**quiero** ver el stock de cada sucursal en columnas separadas dentro del inventario,  
**para** saber dónde está concentrado el stock y facilitar la decisión de transferencias.

### Criterios de aceptación
- [ ] Con el permiso "Ver Facturas Sucursales", el inventario muestra columnas de stock por sucursal: `Sucursal A | Sucursal B | Total`
- [ ] Puedo filtrar para ver solo una sucursal específica o la vista consolidada de todas
- [ ] Un producto sin stock en una sucursal muestra `0`, no se omite
- [ ] Al identificar que el stock está concentrado en una sucursal y falta en otra, puedo iniciar una transferencia con un botón directo

### Notas técnicas
- **Nuevo en v2.0** — actualmente el inventario solo muestra el tenant activo en sesión
- Requiere detectar el permiso "Ver Facturas Sucursales" y, si está activo, agrupar `branch_stocks.quantity` por `tenant_id`
- Se integra con `GetTenantContextAction` para obtener los `tenantIds` permitidos

---

## US-INV-11 — Ver métricas de rotación de stock (v2.0)

**Como** gerente comercial,  
**quiero** ver la rotación de cada producto (frecuencia de ventas respecto al stock promedio),  
**para** identificar qué productos se mueven bien y cuáles tienen stock parado que inmoviliza capital.

### Criterios de aceptación
- [ ] Una columna "Rotación" en la lista de inventario muestra el índice de rotación del período seleccionado
- [ ] El índice se muestra como: "Alta" (rota > X veces), "Media", "Baja" (rota < Y veces)
- [ ] Un producto con rotación baja y stock alto aparece marcado como "Posible exceso"
- [ ] Un producto con rotación alta y stock bajo aparece marcado como "Riesgo de quiebre"
- [ ] Puedo ordenar la lista por rotación para ver los extremos rápidamente

### Notas técnicas
- **Nuevo en v2.0** — no existe este cálculo actualmente
- Fórmula: `rotación = ventas_del_período / stock_promedio_del_período`
- `ventas_del_período`: SUM(`invoice_product.quantity`) donde factura.type IN ('sale_invoice', 'remit_sale') y `invoice.tenant_id = currentTenant`
- `stock_promedio`: `(stock_inicio_período + stock_fin_período) / 2` — requiere snapshots históricos

---

## US-INV-12 — Alertas inteligentes de inventario por IA (v2.0, requiere add-on IA)

**Como** responsable de compras con el add-on de IA activo,  
**quiero** recibir alertas automáticas sobre situaciones de riesgo en el inventario,  
**para** actuar antes de que se produzcan quiebres de stock o pérdidas por vencimiento.

### Criterios de aceptación
- [ ] Una sección "Alertas de Inventario" aparece al tener el add-on de IA activo
- [ ] La IA genera alertas accionables como:
  - "El producto X se agota en ~5 días — última compra fue hace 45 días"
  - "Tenés 120 unidades del lote L-003 de Y que vencen en 8 días — considerá una promoción o ajuste de precio"
  - "Los productos de la categoría 'Lácteos' tienen rotación 40% menor que el mes pasado"
- [ ] Cada alerta tiene un botón de acción directo: "Ver producto", "Crear OC", "Ajustar precio"
- [ ] Las alertas se regeneran cada 4 horas con datos frescos
- [ ] Si el add-on de IA no está activo, aparece un teaser con ejemplo de alertas

### Notas técnicas
- **Nuevo en v2.0** — requiere add-on de IA (`tenant_features.feature = 'ai_module'`)
- El sistema calcula los datos (stock, velocidad de consumo, días hasta agotamiento)
- El LLM solo genera el texto de la alerta — no calcula nada
- Caché de alertas en Cloudflare KV: TTL 4 horas por tenant
