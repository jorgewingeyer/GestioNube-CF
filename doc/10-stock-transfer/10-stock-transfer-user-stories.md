# Historias de Usuario — Módulo 10: Transferencias de Stock

> **Módulo:** 10-stock-transfer  
> **Fase:** 2 — Operaciones Core  
> **Depende de:** 08-batches, 02-tenant, 03-rbac

---

## US-TRANSF-01 — Ver el historial de transferencias entre sucursales

**Como** administrador de una empresa con varias sucursales,  
**quiero** ver todas las transferencias de stock realizadas entre mis sucursales,  
**para** tener trazabilidad completa de qué stock se envió, cuándo, entre qué sucursales y en qué estado está cada transferencia.

### Criterios de aceptación
- [ ] Al ingresar a `/stock-transfers`, se muestra la lista paginada de todas las transferencias del grupo empresarial
- [ ] Cada transferencia muestra: sucursal origen, sucursal destino, estado (badge de color), fecha de creación, usuario que la inició y cantidad total de ítems
- [ ] Los estados tienen colores diferenciados: Pendiente (amarillo), En Tránsito (azul), Completada (verde), Cancelada (gris)
- [ ] Un usuario de la empresa matriz ve todas las transferencias del grupo; un usuario de sucursal ve solo las que involucran a su sucursal
- [ ] Solo pueden acceder usuarios cuyo tenant tiene el feature "transferencias" habilitado

### Notas técnicas
- `GetStockTransfersAction` usa la jerarquía de tenant: carga transferencias donde `source_tenant_id` o `destination_tenant_id` están en el grupo (`parent_id`)
- Paginado: 10 por página con `paginate(10)`
- Relaciones cargadas: `sourceTenant`, `destinationTenant`, `initiator`, `receiver`, `items.product`, `items.batch`

---

## US-TRANSF-02 — Solicitar una transferencia de stock a otra sucursal

**Como** responsable de depósito de una sucursal,  
**quiero** solicitar el envío de stock de lotes específicos a otra sucursal del grupo,  
**para** redistribuir el inventario entre sucursales sin necesidad de hacer una compra nueva.

### Criterios de aceptación
- [ ] El formulario de creación muestra: selector de sucursal destino, lista de productos con stock disponible (>0), y por cada producto sus lotes con la cantidad disponible
- [ ] Solo aparecen como destino las sucursales del mismo grupo empresarial (excluyendo la sucursal actual)
- [ ] Solo aparecen productos que tengan al menos un lote con stock > 0 en la sucursal actual
- [ ] Puedo agregar múltiples ítems en una sola transferencia (múltiples productos/lotes)
- [ ] Cada ítem requiere: producto, lote y cantidad a transferir
- [ ] Si la cantidad solicitada supera el stock disponible del lote, el sistema rechaza la operación con un mensaje claro: "Stock insuficiente en lote L-001. Disponible: 5, Solicitado: 10"
- [ ] Al confirmar, el stock se descuenta inmediatamente de la sucursal origen y la transferencia queda en estado "Pendiente"
- [ ] No se puede solicitar una transferencia si la empresa no tiene sucursales configuradas

### Notas técnicas
- `GetTransferDestinationsAction` calcula los destinos válidos por jerarquía
- `GetAvailableProductsForTransferAction`: productos con `branch_stocks.quantity > 0` y batch existente
- `CreateStockTransferAction`: usa `DB::transaction` + `lockForUpdate` para evitar race conditions
- El stock se deduce en origen en el momento de la creación, no al completar

---

## US-TRANSF-03 — Confirmar la recepción del stock en destino

**Como** responsable de depósito de la sucursal destinataria,  
**quiero** confirmar que recibí el stock de una transferencia pendiente,  
**para** que el inventario de mi sucursal se actualice automáticamente con las unidades recibidas.

### Criterios de aceptación
- [ ] Desde la lista de transferencias puedo ver cuáles están pendientes y me involucran como destino
- [ ] Al hacer clic en "Completar" en una transferencia pendiente, el stock se acredita en mi sucursal
- [ ] La transferencia pasa a estado "Completada" con fecha y usuario de recepción registrados
- [ ] Si el lote no existe en mi sucursal, se crea automáticamente el registro en `branch_stocks`
- [ ] Si el producto no estaba en mi catálogo, se asocia automáticamente al completar
- [ ] No puedo completar una transferencia ya completada o cancelada

### Notas técnicas
- `CompleteStockTransferAction`: dentro de `DB::transaction`
- Guarda snapshot: `dest_quantity_before` y `dest_quantity_after` en cada ítem
- Maneja batch soft-deleted: usa `withTrashed()->restore()` si es necesario
- `$transfer->update({status=COMPLETED, completed_at=now(), received_by=Auth::id()})`

---

## US-TRANSF-04 — Cancelar una transferencia pendiente

**Como** administrador o responsable de depósito,  
**quiero** poder cancelar una transferencia que todavía no fue recibida,  
**para** revertir la reserva de stock y devolver las unidades al inventario de la sucursal origen.

### Criterios de aceptación
- [ ] Puedo cancelar cualquier transferencia en estado "Pendiente" o "En Tránsito"
- [ ] Al cancelar, el stock se devuelve automáticamente a la sucursal origen (increment de las unidades deducidas)
- [ ] La transferencia pasa a estado "Cancelada" con el usuario que la canceló registrado
- [ ] No puedo cancelar una transferencia ya completada
- [ ] No puedo cancelar una transferencia ya cancelada
- [ ] Si el lote fue eliminado entre la creación y la cancelación, el sistema intenta restaurar el BranchStock; si no puede encontrar el batch, registra el error pero no falla con excepción (el stock de ese ítem puede perderse)

### Notas técnicas
- `CancelStockTransferAction`: `DB::transaction` con rollback automático ante excepciones
- Si el usuario que cancela pertenece al tenant destino → se registra en `received_by`
- Bug documentado: si `Batch` no existe ni en `withTrashed()` → el ítem se saltea con `continue` y el stock se pierde; hay `Log::error` pero no excepción

---

## US-TRANSF-05 — Ver el detalle de una transferencia con sus ítems

**Como** administrador o responsable de depósito,  
**quiero** ver el detalle de una transferencia específica con todos sus ítems, cantidades y snapshots de stock,  
**para** entender exactamente qué se movió, cuándo y qué pasó con el stock en cada punto.

### Criterios de aceptación
- [ ] Al hacer clic en una transferencia de la lista, veo su pantalla de detalle
- [ ] El detalle muestra: origen, destino, estado, notas, usuario que la creó, usuario que la recibió/canceló
- [ ] La tabla de ítems muestra: producto, número de lote, cantidad transferida, stock origen antes/después, stock destino antes/después
- [ ] Los snapshots de stock antes/después permiten auditar el impacto sin consultar el inventario actual
- [ ] Los botones de "Completar" y "Cancelar" aparecen según el estado actual de la transferencia

### Notas técnicas
- Los snapshots son columnas en `stock_transfer_items`: `source_quantity_before`, `source_quantity_after` (guardadas al crear), `dest_quantity_before`, `dest_quantity_after` (guardadas al completar)

---

## US-TRANSF-06 — Ver las transferencias que involucraron un lote específico

**Como** responsable de depósito o auditor,  
**quiero** ver el historial de transferencias inter-sucursal de un lote específico,  
**para** rastrear cómo se distribuyó ese lote entre las sucursales a lo largo del tiempo.

### Criterios de aceptación
- [ ] En la pantalla de detalle de un lote (módulo 08), hay una sección "Transferencias" que muestra todas las transferencias que involucraron ese lote
- [ ] Cada fila muestra: fecha, sucursal origen, sucursal destino, cantidad transferida, estado
- [ ] Se muestran tanto las transferencias completadas como las canceladas (para tener el historial completo)
- [ ] Si el lote nunca fue transferido, la sección muestra "Sin transferencias registradas"

### Notas técnicas
- `GetStockTransfersForBatchAction::execute($batchId)`: filtra por `items.batch_id`
- Carga relaciones: `items`, `destinationTenant`, `sourceTenant`, `initiator`, `receiver`

---

## US-TRANSF-07 — Flujo de tres estados con handshake explícito (v2.0)

**Como** dueño de una empresa donde las transferencias implican un proceso logístico real (flete, transportista),  
**quiero** que la transferencia tenga un estado intermedio "En Tránsito" que indique que la mercadería ya salió del origen pero todavía no llegó al destino,  
**para** tener mayor precisión sobre el estado físico de la mercadería en cada momento.

### Criterios de aceptación
- [ ] El flujo es: Pendiente → En Tránsito → Completada (o Cancelada desde cualquier estado previo)
- [ ] El origen tiene un botón "Marcar como enviado" que cambia el estado a "En Tránsito"
- [ ] Solo el destino puede "Completar" (marcar como recibido)
- [ ] Se registra el usuario y la fecha de cada transición de estado
- [ ] En "En Tránsito" pueden adjuntarse observaciones (ej: número de remito del flete)

### Notas técnicas
- **Mejora v2.0** — el estado `IN_TRANSIT` ya existe en `StockTransferStatus` pero no se asigna en ninguna Action actual
- Requiere nuevas columnas: `shipped_at`, `shipped_by`, `in_transit_notes`
- Requiere nueva Action: `MarkAsInTransitStockTransferAction`

---

## US-TRANSF-08 — Permisos RBAC granulares para transferencias (v2.0)

**Como** administrador de un negocio,  
**quiero** controlar quién puede crear, completar y cancelar transferencias de forma independiente,  
**para** que los operadores de depósito puedan solicitar envíos, pero solo los jefes puedan confirmar recepciones o cancelar.

### Criterios de aceptación
- [ ] Existen los permisos: "Crear Transferencias", "Completar Transferencias", "Cancelar Transferencias", "Ver Transferencias"
- [ ] Un operador con "Crear Transferencias" puede iniciar una transferencia pero NO puede completarla ni cancelarla
- [ ] Un jefe de sucursal con "Completar Transferencias" puede confirmar recepciones
- [ ] El administrador tiene todos los permisos de transferencia por defecto
- [ ] Si el usuario no tiene el permiso requerido, los botones de acción no aparecen (y el endpoint devuelve 403)

### Notas técnicas
- **Mejora v2.0** — actualmente no hay `StockTransferPolicy` ni guards de permiso RBAC; el acceso es todo-o-nada por feature flag
- Requiere: crear `StockTransferPolicy` con métodos `create`, `complete`, `cancel`, `viewAny`
- Agregar los permisos en `PermissionSeeder` y en las vistas React

---

## US-TRANSF-09 — Notificación a sucursal destino al crear una transferencia (v2.0)

**Como** responsable de depósito de la sucursal destinataria,  
**quiero** recibir una notificación cuando la sucursal origen me envía un stock,  
**para** saber cuándo esperar la mercadería y no tener que revisar manualmente el listado de transferencias.

### Criterios de aceptación
- [ ] Al crear una transferencia, los usuarios de la sucursal destino reciben una notificación in-app: "La sucursal X te envió N ítems. Confirmá la recepción cuando llegue."
- [ ] La notificación incluye un enlace directo a la transferencia
- [ ] Opcionalmente, se puede configurar un email adicional para transferencias (para el jefe de sucursal)
- [ ] Si el feature de notificaciones no está activo, este comportamiento se omite silenciosamente

### Notas técnicas
- **Nuevo en v2.0** — no existe sistema de notificaciones actualmente
- Implementar con Laravel Notifications → canal `database` (in-app) + `mail` (opcional)
- Disparar desde `CreateStockTransferAction` después del commit de la transacción (o via `event` para desacoplar)

---

## US-TRANSF-10 — Transferencias visibles como movimientos en el historial de inventario (v2.0)

**Como** responsable de depósito,  
**quiero** que las transferencias recibidas y enviadas aparezcan en el historial de movimientos de inventario de cada producto,  
**para** tener una vista unificada de todas las entradas y salidas, incluyendo las inter-sucursales.

### Criterios de aceptación
- [ ] En el historial de movimientos del módulo 09, aparecen las transferencias con tipo "Transferencia enviada" (rojo, salida) y "Transferencia recibida" (verde, entrada)
- [ ] Cada movimiento muestra: sucursal contraparte, número de lote, cantidad y referencia a la transferencia
- [ ] Al hacer clic en el movimiento de transferencia, navego directamente al detalle de esa transferencia
- [ ] Las transferencias canceladas también aparecen en el historial, marcadas como "Transferencia revertida"

### Notas técnicas
- **Nuevo en v2.0** — actualmente las transferencias NO generan registros en `activities` ni en el historial de movimientos
- Implementar con la tabla `inventory_movements` propuesta en módulo 09 (Alternativa B):
  - Al CREAR: INSERT con `direction='out'`, `movement_type='transfer'`, `reference_type='stock_transfer'` en tenant origen
  - Al COMPLETAR: INSERT con `direction='in'`, `movement_type='transfer'` en tenant destino
  - Al CANCELAR: INSERT compensatorio `direction='in'` en tenant origen, marcar el `direction='out'` original como revertido
