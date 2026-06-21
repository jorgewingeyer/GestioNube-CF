# Historias de Usuario — Módulo 15: Órdenes de Compra

> **Módulo:** 15-purchase-orders  
> **Fase:** 3 — Ciclo Comercial  
> **Depende de:** 07-products, 11-clients-providers, 02-tenant, 03-rbac

---

## US-OC-01 — Ver el listado de órdenes de compra

**Como** cualquier usuario con acceso al módulo,  
**quiero** ver la lista de órdenes de compra de mi empresa,  
**para** conocer el estado de las compras pendientes y aprobadas.

### Criterios de aceptación
- [ ] La lista muestra: número de OC, proveedor, fecha, fecha esperada, total, estado
- [ ] Se muestra el estado con color/etiqueta según el tipo (borrador, pendiente, aprobada, rechazada, completada)
- [ ] La lista está paginada (15 por página), ordenada por más reciente primero
- [ ] Puedo filtrar por estado
- [ ] Si tengo el permiso `Gestionar Órdenes de Compra Sucursales`, puedo filtrar por sucursal y ver OC de toda la jerarquía

### Notas técnicas
- `GET /purchase-orders` → `GetAllPurchaseOrderAction`
- Incluye relaciones: `tenant`, `counterparty`, `user`, `invoices`

---

## US-OC-02 — Crear una nueva orden de compra

**Como** usuario con permiso `Crear Orden de Compra`,  
**quiero** crear una nueva orden de compra para un proveedor,  
**para** formalizar la solicitud de productos con precio y cantidad acordados.

### Criterios de aceptación
- [ ] Puedo seleccionar el proveedor desde un buscador (búsqueda lazy al abrir el selector)
- [ ] Puedo ingresar fecha de la OC y fecha esperada de entrega (opcional)
- [ ] Puedo agregar uno o más productos con cantidad y precio unitario
- [ ] El total se calcula automáticamente al agregar/modificar ítems
- [ ] El número de OC se genera automáticamente (`OC-N`) al guardar
- [ ] La OC se crea en estado **Borrador** — no requiere aprobación para guardarse
- [ ] Puedo agregar notas generales y notas por línea de producto
- [ ] Al guardar exitosamente, me redirige al detalle de la OC creada

### Notas técnicas
- `POST /purchase-orders` → `StorePurchaseOrderRequest` → `CreatePurchaseOrderAction` (en `DB::transaction`)
- Búsqueda de productos: `GET /purchase-orders/products/search?search=` → `GetAllProductsByNameAndBarcodeAction`

---

## US-OC-03 — Ver el detalle de una orden de compra

**Como** usuario con acceso al módulo,  
**quiero** ver el detalle completo de una orden de compra,  
**para** revisar sus productos, precios, estado y el historial de acciones disponibles.

### Criterios de aceptación
- [ ] Muestra: número, proveedor, fechas, estado, total, notas y todos los ítems con cantidad y precio
- [ ] Muestra el nombre del usuario que creó la OC
- [ ] Si la OC fue rechazada, muestra el motivo de rechazo
- [ ] Los botones de acción disponibles cambian según el estado actual de la OC:
  - DRAFT → botones "Finalizar" y "Editar" y "Eliminar"
  - PENDING_APPROVAL → botones "Aprobar", "Rechazar", "Devolver a borrador"
  - APPROVED → botón "Generar factura de compra" y "Descargar PDF"
  - REJECTED/COMPLETED → solo "Descargar PDF" (si aplica)
- [ ] Si no tengo el permiso para una acción, el botón no aparece

---

## US-OC-04 — Editar una orden de compra

**Como** usuario con permiso `Editar Orden de Compra`,  
**quiero** modificar los datos de una orden de compra existente,  
**para** corregir errores o actualizar cantidades y precios antes de enviarla a aprobación.

### Criterios de aceptación
- [ ] Puedo cambiar el proveedor, fechas, notas y los ítems de la OC
- [ ] Puedo agregar y eliminar productos de la OC
- [ ] El total se recalcula automáticamente
- [ ] Al guardar, el estado no cambia (permanece en el estado actual)
- [ ] El sistema confirma el guardado con un mensaje de éxito

### Notas técnicas
- `PUT /purchase-orders/{id}` → `UpdatePurchaseOrderAction`
- No valida el estado; permite editar en cualquier estado

---

## US-OC-05 — Finalizar una orden de compra (enviar a aprobación)

**Como** usuario con permiso `Editar Orden de Compra`,  
**quiero** finalizar una orden de compra en borrador para enviarla a aprobación,  
**para** que el responsable pueda revisarla y aprobarla o rechazarla.

### Criterios de aceptación
- [ ] Solo puedo finalizar una OC que esté en estado **Borrador**
- [ ] Al finalizar, el estado cambia a **Pendiente de Aprobación**
- [ ] El botón de finalización no está disponible si la OC ya fue enviada, aprobada o rechazada
- [ ] Aparece una confirmación de éxito tras la acción

### Notas técnicas
- `POST /purchase-orders/{id}/finalize` → `FinalizePurchaseOrderAction`
- Valida: `status === DRAFT` (sino lanza error)

---

## US-OC-06 — Aprobar una orden de compra

**Como** usuario con permiso `Aprobar Orden de Compra`,  
**quiero** aprobar una orden de compra que está pendiente de revisión,  
**para** autorizar la compra y permitir que se proceda con la facturación.

### Criterios de aceptación
- [ ] Solo puedo aprobar OC en estado **Pendiente de Aprobación**
- [ ] Al aprobar, el estado cambia a **Aprobada**
- [ ] El botón "Aprobar" solo aparece si tengo el permiso correspondiente
- [ ] Aparece confirmación de éxito

### Notas técnicas
- `POST /purchase-orders/{id}/approve` → `ApprovePurchaseOrderAction`
- Policy `approve(purchaseOrder)` verifica permiso `Aprobar Orden de Compra`

---

## US-OC-07 — Rechazar una orden de compra

**Como** usuario con permiso `Rechazar Orden de Compra`,  
**quiero** rechazar una orden de compra con un motivo claro,  
**para** informar al solicitante por qué no fue aprobada y qué debe corregir.

### Criterios de aceptación
- [ ] Solo puedo rechazar OC en estado **Pendiente de Aprobación**
- [ ] Debo ingresar obligatoriamente el motivo de rechazo (campo texto requerido)
- [ ] Al rechazar, el estado cambia a **Rechazada** y el motivo queda guardado
- [ ] En el detalle de la OC rechazada, el motivo es visible para el solicitante
- [ ] El botón "Rechazar" solo aparece si tengo el permiso correspondiente

### Notas técnicas
- `POST /purchase-orders/{id}/reject` → Controller valida `reason` → `RejectPurchaseOrderAction`
- Guarda `rejection_reason` en la tabla

---

## US-OC-08 — Devolver una orden de compra a borrador

**Como** usuario con permiso `Devolver Orden de Compra`,  
**quiero** devolver una OC pendiente de aprobación a estado borrador,  
**para** que el solicitante pueda corregirla y volver a enviarla.

### Criterios de aceptación
- [ ] Solo puedo revertir OC en estado **Pendiente de Aprobación**
- [ ] Al revertir, el estado vuelve a **Borrador**
- [ ] El solicitante puede entonces editar y volver a finalizar la OC
- [ ] Aparece confirmación de éxito

### Notas técnicas
- `POST /purchase-orders/{id}/revert` → `RevertToDraftPurchaseOrderAction`

---

## US-OC-09 — Descargar el PDF de una orden de compra

**Como** usuario con acceso a la OC,  
**quiero** descargar el PDF de la orden de compra,  
**para** enviárselo al proveedor por email o adjuntarlo a una comunicación formal.

### Criterios de aceptación
- [ ] Puedo descargar PDF de OC en estado **Borrador**, **Aprobada** o **Completada**
- [ ] No puedo descargar PDF de una OC rechazada o pendiente de aprobación
- [ ] El PDF incluye: número de OC, datos del tenant emisor (logo, CUIT, dirección), datos del proveedor, listado de ítems con cantidades y precios, total y notas
- [ ] Si la OC está en borrador, el PDF incluye una marca visual de "BORRADOR"
- [ ] El archivo se descarga con nombre `orden-compra-{number}.pdf`

### Notas técnicas
- `GET /purchase-orders/{id}/download` → `GeneratePurchaseOrderPdfAction`
- DomPDF + Blade view `pdfs.purchase-order`; almacenado en R2 `pdfs/purchase-orders/`
- Solo para estados `DRAFT | APPROVED | COMPLETED`

---

## US-OC-10 — Eliminar una orden de compra

**Como** usuario con permiso `Eliminar Orden de Compra`,  
**quiero** eliminar una orden de compra,  
**para** removerla del listado si fue creada por error o ya no es necesaria.

### Criterios de aceptación
- [ ] Puedo eliminar OC en cualquier estado que no esté completada (comportamiento actual del código)
- [ ] La eliminación es soft delete (la OC puede recuperarse a nivel de base de datos)
- [ ] Tras eliminar, me redirige al listado con confirmación de éxito
- [ ] Los ítems de la OC también quedan soft-deleted en cascada

### Notas técnicas
- `DELETE /purchase-orders/{id}` → `DeletePurchaseOrderAction`
- Soft delete en `purchase_orders.deleted_at`; CASCADE en `purchase_order_items`

---

## US-OC-11 — Convertir una OC aprobada en factura de compra

**Como** usuario con permiso de crear facturas de compra,  
**quiero** generar automáticamente una factura de compra a partir de una orden aprobada,  
**para** registrar la recepción de la mercadería sin volver a ingresar los datos manualmente.

### Criterios de aceptación
- [ ] Solo se puede convertir una OC con estado **Aprobada**
- [ ] Al convertir, se crea una factura de compra con los mismos ítems, cantidades y precios de la OC
- [ ] La OC pasa automáticamente a estado **Completada**
- [ ] La factura de compra creada queda vinculada a la OC mediante `invoice.purchase_order_id`
- [ ] En el detalle de la factura de compra, aparece referencia a la OC de origen
- [ ] El usuario puede ajustar precios y cantidades en la factura generada antes de completarla

### Notas técnicas
- `POST /invoices-purchase/from-order/{purchase_order}` → `CreateInvoiceFromPurchaseOrderAction`
- La acción está en el controlador de facturas de compra, no en el de OC

---

## US-OC-12 — Gestionar órdenes de compra de sucursales

**Como** usuario con permiso `Gestionar Órdenes de Compra Sucursales`,  
**quiero** ver y gestionar las órdenes de compra de todas las sucursales de mi empresa,  
**para** tener visibilidad centralizada de las compras de toda la organización.

### Criterios de aceptación
- [ ] El listado muestra OC de todas las sucursales de la jerarquía
- [ ] Puedo filtrar el listado por sucursal usando el selector de tenant
- [ ] Cada OC muestra la sucursal a la que pertenece
- [ ] Puedo aprobar, rechazar y gestionar OC de cualquier sucursal visible

### Notas técnicas
- `GetAllPurchaseOrderAction` y `getAllowedTenantIds()` verifican el permiso y expanden con `GetTenantContextAction`
- El filtro `?tenant_id=X` en la URL filtra por una sucursal específica

---

## US-OC-13 — Recepción parcial de mercadería (v2.0)

**Como** encargado de depósito,  
**quiero** registrar la recepción parcial de una orden de compra,  
**para** generar facturas de compra por los ítems recibidos y mantener pendiente el saldo.

### Criterios de aceptación
- [ ] Puedo indicar qué ítems se recibieron y en qué cantidad (puede ser menor a la ordenada)
- [ ] Se genera una factura de compra solo por los ítems/cantidades recibidas
- [ ] La OC permanece en estado **Aprobada** con las cantidades pendientes hasta que se recibe todo
- [ ] Al recibir el último ítem pendiente, la OC pasa a **Completada**
- [ ] El sistema muestra el saldo pendiente por producto en el detalle de la OC

### Notas técnicas
- **Mejora v2.0** — actualmente la conversión es todo o nada
- Requiere nueva columna `purchase_order_items.received_quantity` (integer, default 0)
- Nueva acción: `RegisterPartialReceiptAction`

---

## US-OC-14 — Alertas de OC pendientes de aprobación (v2.0)

**Como** aprobador,  
**quiero** recibir una notificación cuando hay una orden de compra esperando mi aprobación,  
**para** no perder de vista las solicitudes pendientes sin tener que revisar el sistema constantemente.

### Criterios de aceptación
- [ ] Al finalizar una OC (DRAFT → PENDING_APPROVAL), se envía notificación a los usuarios con permiso `Aprobar Orden de Compra`
- [ ] La notificación aparece en el centro de notificaciones del sistema
- [ ] Opcionalmente, se envía email al aprobador
- [ ] El link de la notificación lleva directamente al detalle de la OC

### Notas técnicas
- **Mejora v2.0** — actualmente `ApprovePurchaseOrderAction` tiene comentario "Here we could trigger notifications, etc."
- Usar `Notification::send()` con canal `database` y opcionalmente `mail`
