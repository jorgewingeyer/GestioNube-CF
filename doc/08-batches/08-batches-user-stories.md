# Historias de Usuario — Módulo 08: Lotes (Batches)

> **Módulo:** 08-batches  
> **Fase:** 2 — Operaciones Core  
> **Depende de:** 07-products, 02-tenant, 03-rbac

---

## US-BATCH-01 — Ver el listado de lotes con su stock actual

**Como** responsable de depósito o compras,  
**quiero** ver todos los lotes activos con su stock disponible por sucursal,  
**para** conocer qué mercadería tengo en stock, en qué lotes y cuándo vence.

### Criterios de aceptación
- [ ] Al acceder a `/batch`, se muestra la lista de lotes del tenant activo con: nombre del producto, número de lote, código de barras, fecha de vencimiento, stock actual y estado del lote
- [ ] El estado del lote se muestra con un badge de color: Activo (verde), Por vencer (naranja), Vencido (rojo), Agotado (gris)
- [ ] Puedo filtrar por producto, número de lote, estado y rango de fecha de vencimiento
- [ ] Solo ve los lotes quien tenga el permiso "Ver Lotes"

### Notas técnicas
- `GetAllBatchAction` agrega `branch_stocks.quantity` para el tenant activo
- El stock mostrado es la suma de `branch_stocks` donde `tenant_id = current_tenant` y `batch_id = batch.id`

---

## US-BATCH-02 — Crear un lote al ingresar mercadería

**Como** responsable de depósito,  
**quiero** registrar el ingreso de mercadería indicando el número de lote, la cantidad y la fecha de vencimiento,  
**para** tener trazabilidad completa del stock: saber de qué compra proviene cada unidad.

### Criterios de aceptación
- [ ] El formulario pide: producto, número de lote, cantidad, fecha de vencimiento y código de barras (opcional)
- [ ] Si el número de lote ya existe para ese producto, el sistema suma la cantidad al stock existente en lugar de crear un lote nuevo
- [ ] Al guardar, el stock del tenant activo se incrementa inmediatamente
- [ ] Solo puede crear lotes quien tenga el permiso "Crear Lotes"

### Notas técnicas
- `CreateBatchAction`: busca `Batch.where(product_id, batch_number)` → si existe, upsert en `branch_stocks`; si no, crea `Batch` + `BranchStock`
- Cantidad se guarda en `branch_stocks.quantity`, nunca en `batches`

---

## US-BATCH-03 — Editar los datos de un lote existente

**Como** responsable de depósito,  
**quiero** poder corregir el número de lote, código de barras o fecha de vencimiento de un lote ya registrado,  
**para** rectificar errores de carga sin perder el historial de movimientos.

### Criterios de aceptación
- [ ] Puedo editar: número de lote, código de barras y fecha de vencimiento
- [ ] No puedo cambiar el producto ni el tenant origen del lote
- [ ] Al cambiar la fecha de vencimiento, el estado del lote se recalcula automáticamente
- [ ] Solo puede editar lotes quien tenga el permiso "Actualizar Lotes"

### Notas técnicas
- `UpdateBatchAction` actualiza solo la metadata del lote, no la cantidad
- Para cambiar cantidad se usa el endpoint separado `PUT /batch/{batch}/quantity`

---

## US-BATCH-04 — Ajustar manualmente la cantidad de un lote

**Como** responsable de depósito,  
**quiero** poder corregir la cantidad de un lote cuando detecté una diferencia entre el sistema y el stock físico real,  
**para** que el sistema refleje la realidad del depósito.

### Criterios de aceptación
- [ ] Puedo ingresar directamente la nueva cantidad (reemplazo, no incremento)
- [ ] El sistema muestra la cantidad actual antes de pedir la nueva
- [ ] Se registra la actividad del ajuste con el usuario, fecha y cantidades anterior/nueva
- [ ] Solo puede ajustar cantidades quien tenga el permiso "Actualizar Lotes"

### Notas técnicas
- `PUT /batch/{batch}/quantity` con el nuevo valor
- `UpdateBatchQuantityAction` hace `update({quantity: newQty})`, no `increment()`
- La actividad queda registrada en `activities` para auditoría

---

## US-BATCH-05 — Ver el descuento automático de stock al emitir facturas

**Como** responsable de stock,  
**quiero** que al emitir una factura de venta con un lote específico, ese stock se descuente automáticamente,  
**para** que el inventario siempre refleje el stock real sin necesidad de ajustes manuales.

### Criterios de aceptación
- [ ] Al completar una factura de venta que incluye productos con lote asignado, el stock de ese lote se descuenta automáticamente
- [ ] Si la factura se anula, el stock se restaura automáticamente
- [ ] Si el stock resultante quedaría en negativo, se muestra un aviso (pero no bloquea por defecto)
- [ ] El historial de movimientos del lote muestra la factura que causó el movimiento

### Notas técnicas
- `UpdateBatchQuantitiesFromInvoiceAction::execute($invoice, $add=false)` al emitir
- `UpdateBatchQuantitiesFromInvoiceAction::execute($invoice, $add=true)` al anular
- Solo afecta productos que tienen `invoice_product.batch_id != null`

---

## US-BATCH-06 — Eliminar un lote sin stock

**Como** responsable de depósito,  
**quiero** poder eliminar un lote que ya no tiene stock ni movimientos recientes,  
**para** mantener el listado limpio sin registros obsoletos.

### Criterios de aceptación
- [ ] Puedo eliminar un lote desde el listado o desde su pantalla de edición
- [ ] El sistema advierte si el lote tiene stock mayor a cero antes de permitir la eliminación
- [ ] La eliminación es un soft delete — el historial de movimientos se mantiene
- [ ] Solo puede eliminar lotes quien tenga el permiso "Eliminar Lotes"

### Notas técnicas
- `DestroyBatchAction` hace soft delete en `batches` y en los `branch_stocks` asociados
- Los registros de `invoice_product` con ese `batch_id` no se ven afectados

---

## US-BATCH-07 — Ver alertas de lotes próximos a vencer

**Como** responsable de depósito,  
**quiero** ver qué lotes están próximos a vencerse o ya vencidos,  
**para** priorizar su venta o disposición antes de que sean invendibles.

### Criterios de aceptación
- [ ] Una sección de alertas muestra: lotes que vencen en los próximos 30 días con stock > 0
- [ ] Los lotes ya vencidos con stock > 0 aparecen destacados como urgentes
- [ ] Cada alerta muestra: producto, número de lote, cantidad disponible, fecha de vencimiento y días restantes
- [ ] Desde la alerta puedo ir directamente al lote para ajustar su precio o gestionar su salida

### Notas técnicas
- `DashboardBatchAction::execute()` calcula: próximos a vencer (< 30 días), vencidos con stock, agotados, negativos
- El umbral de 30 días está hardcodeado actualmente → ver US-BATCH-10 para hacerlo configurable

---

## US-BATCH-08 — Exportar el listado de lotes a Excel

**Como** administrador,  
**quiero** exportar el listado completo de lotes a Excel,  
**para** analizarlo en una planilla o compartirlo con el equipo de compras.

### Criterios de aceptación
- [ ] El Excel incluye por fila: producto, número de lote, código de barras, fecha de vencimiento, stock actual y estado
- [ ] Los filtros aplicados en el listado se respetan en el export
- [ ] El archivo se descarga directamente sin pasar por cola
- [ ] Solo puede exportar quien tenga el permiso "Ver Lotes"

### Notas técnicas
- `GenerateBatchExcelAction` — genera el Excel con `maatwebsite/excel` o similar
- Ruta: `GET /batch/download-excel`

---

## US-BATCH-09 — Validación de stock disponible antes de facturar (v2.0)

**Como** responsable de ventas,  
**quiero** que el sistema me avise cuando intento facturar más unidades de un lote de las que hay disponibles,  
**para** evitar comprometer stock que no tengo y mantener la coherencia con el inventario físico.

### Criterios de aceptación
- [ ] Si la cantidad a facturar supera el stock disponible del lote seleccionado, aparece un aviso claro: "Stock insuficiente — Disponible: X, Facturando: Y"
- [ ] El comportamiento al superar el stock es configurable por tenant: solo advertencia (permite continuar) o bloqueo (no permite emitir la factura)
- [ ] La configuración se puede cambiar desde la pantalla de configuración del tenant
- [ ] Si el add-on de IA está activo, el sistema sugiere lotes alternativos con stock suficiente

### Notas técnicas
- **Mejora v2.0** — actualmente el sistema permite negativos sin advertencia
- Nueva configuración en `tenant_features` o tabla de configuración: `require_stock_on_invoice` (boolean, default false)
- La validación se ejecuta en el endpoint de creación de factura, antes de persistir

---

## US-BATCH-10 — Alertas de vencimiento con umbral configurable (v2.0)

**Como** dueño de una empresa con productos perecederos,  
**quiero** configurar con cuántos días de anticipación me avisa el sistema sobre lotes próximos a vencer,  
**para** adaptar el umbral de alerta a la naturaleza de mis productos (algunos necesitan 60 días, otros con 7 es suficiente).

### Criterios de aceptación
- [ ] En la configuración del tenant, puedo definir el umbral de alerta de vencimiento en días (ej: 7, 15, 30, 60, 90)
- [ ] El estado `EXPIRING_SOON` y las alertas del dashboard se calculan usando ese umbral
- [ ] Si no configuro nada, el valor por defecto es 30 días (comportamiento actual)
- [ ] El umbral configurable aplica tanto al dashboard como a las notificaciones por email

### Notas técnicas
- **Mejora v2.0** — actualmente el umbral de 30 días está hardcodeado
- Nueva columna: `tenants.batch_expiry_alert_days` (integer, default 30)
- O nueva entrada en una tabla de configuración de tenant

---

## US-BATCH-11 — Predicción de agotamiento de lote por IA (v2.0, requiere add-on IA)

**Como** responsable de compras con el add-on de IA activo,  
**quiero** saber cuándo se va a agotar cada lote basándome en la velocidad de consumo histórica,  
**para** planificar las reposiciones con anticipación suficiente.

### Criterios de aceptación
- [ ] En el listado de lotes, una columna "Agotamiento estimado" muestra cuántos días le quedan a cada lote
- [ ] Al hacer hover o click sobre el estimado, aparece el detalle: "Consumo promedio: 5 uds/día — Stock actual: 35 uds — Se agota en ~7 días"
- [ ] Si el lote está en riesgo (se agota antes de que pueda llegar un reaprovisionamiento), aparece con un ícono de urgencia
- [ ] Los lotes de productos sin movimientos en los últimos 30 días no muestran estimación ("Sin consumo reciente")
- [ ] Si el add-on de IA no está activo, la columna no aparece

### Notas técnicas
- **Nuevo en v2.0** — requiere add-on de IA activo (`ai_module` en `tenant_features`)
- El sistema calcula la velocidad de consumo desde `activities` o desde `invoice_product` (últimos 30, 60 o 90 días)
- El LLM recibe: `{product, batch_number, current_qty, avg_daily_consumption, lead_time_days}` y genera el texto de la alerta
- El LLM NO hace los cálculos matemáticos — solo redacta el mensaje basándose en los datos ya calculados

---

## US-BATCH-12 — Inventario físico con conteo cíclico (v2.0)

**Como** administrador del depósito,  
**quiero** poder realizar un inventario físico comparando el stock del sistema contra el contado manualmente,  
**para** detectar diferencias y corregirlas con un registro de auditoría claro.

### Criterios de aceptación
- [ ] Puedo iniciar una sesión de "Inventario físico" que congela el stock actual como referencia
- [ ] Durante la sesión, ingreso las cantidades físicas contadas por lote
- [ ] Al finalizar, el sistema muestra las diferencias entre el stock del sistema y el contado: sobrantes y faltantes
- [ ] Puedo aprobar los ajustes: se actualizan los `branch_stocks` y se registra cada diferencia con tipo `ChangeType::PHYSICAL_COUNT` en la actividad
- [ ] El informe final del inventario es exportable a Excel con todas las diferencias

### Notas técnicas
- **Nuevo en v2.0** — no existe esta funcionalidad actualmente
- Nueva tabla: `stock_count_sessions` (tenant_id, user_id, status, reference_date, notes)
- Nueva tabla: `stock_count_items` (session_id, batch_id, product_id, system_quantity, counted_quantity, difference)
- Al aprobar: `UPDATE branch_stocks SET quantity = counted_quantity WHERE batch_id = ...` dentro de transacción
