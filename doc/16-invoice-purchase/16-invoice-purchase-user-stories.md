# Historias de Usuario — Módulo 16: Facturación de Compras

> **Módulo:** 16-invoice-purchase  
> **Fase:** 3 — Ciclo Comercial  
> **Depende de:** 07-products, 08-batches, 11-clients-providers, 15-purchase-orders, 02-tenant, 03-rbac

---

## US-IPC-01 — Ver el listado de facturas de compra

**Como** usuario con acceso al módulo,  
**quiero** ver la lista de facturas de compra de mi empresa,  
**para** conocer el estado de las compras registradas, los importes y cuánto queda por pagar.

### Criterios de aceptación
- [ ] La lista muestra: número de comprobante, proveedor, fecha, total, monto pagado, saldo pendiente y estado
- [ ] El estado tiene etiqueta con color (borrador, aceptado, pagado, parcialmente pagado, etc.)
- [ ] Puedo buscar por número de comprobante, fecha o proveedor
- [ ] Puedo filtrar por estado
- [ ] Puedo ordenar por fecha o nombre del proveedor
- [ ] La lista está paginada
- [ ] Si tengo permiso `Ver Facturas Sucursales`, puedo filtrar por sucursal y ver facturas de toda la jerarquía

### Notas técnicas
- `GET /invoices-purchase` → `GetAllInvoicePurchaseAction`
- Filtra `invoice_type IN (purchase_invoice, remit_purchase)` 
- Paginación: 4 por página (la más pequeña del sistema)
- `total_paid` calculado en la query principal via `withSum`

---

## US-IPC-02 — Crear una factura de compra directa

**Como** usuario con permiso de crear facturas de compra,  
**quiero** registrar una factura recibida de un proveedor,  
**para** tener un registro del gasto y actualizar el stock de los productos recibidos.

### Criterios de aceptación
- [ ] Puedo seleccionar el proveedor, ingresar el número de comprobante del proveedor, la fecha y el tipo de IVA (discriminado o incluido)
- [ ] La factura se crea en estado **Borrador** — el stock no se modifica hasta completarla
- [ ] Tras crear, puedo seguir agregando productos en la misma pantalla
- [ ] El sistema incrementa el contador del plan de facturación de compras del tenant (freetier)

### Notas técnicas
- `POST /invoices-purchase` → `CreateInvoicePurchaseAction`
- Estado inicial: `DRAFT`, moneda: `ARS`, `invoice_type = purchase_invoice`

---

## US-IPC-03 — Crear una factura de compra desde una Orden de Compra

**Como** usuario con permiso de crear facturas de compra,  
**quiero** crear automáticamente una factura de compra a partir de una OC aprobada,  
**para** no tener que volver a ingresar los productos y precios ya definidos en la OC.

### Criterios de aceptación
- [ ] Solo puedo hacer esto desde una OC con estado **Aprobada**
- [ ] La factura se crea automáticamente con los ítems, cantidades y precios de la OC
- [ ] El número de comprobante se pre-completa con un placeholder (`OC-{número}`), que debo reemplazar con el número real del proveedor
- [ ] La factura queda en **Borrador** para que pueda ajustar detalles antes de completarla
- [ ] Veo un panel de conciliación que compara la OC con la factura

### Notas técnicas
- `POST /invoices-purchase/from-order/{purchase_order}` → `CreateInvoiceFromPurchaseOrderAction`
- `invoice_type = remit_purchase`, `iva_type = INCLUDED`, `is_reconciled = false`
- Copia ítems vía `AddProductToInvoicePipeline` iterando `purchaseOrder.items`

---

## US-IPC-04 — Agregar productos a una factura de compra

**Como** usuario con acceso de edición a la factura,  
**quiero** agregar productos a una factura de compra en borrador,  
**para** registrar exactamente qué se compró, en qué cantidad y a qué precio.

### Criterios de aceptación
- [ ] Puedo buscar productos por nombre o código de barras
- [ ] Por cada línea de producto puedo ingresar: cantidad, precio unitario de compra, descuento, alícuota IVA y lote destino
- [ ] Puedo marcar si el precio de compra debe actualizar el precio de compra del producto en el catálogo al completar la factura
- [ ] Puedo marcar si la alícuota IVA debe actualizarse en el producto al completar
- [ ] El total de la factura se recalcula automáticamente al agregar cada producto

### Notas técnicas
- `POST /invoices-purchase/{invoice}/add-product` → `AddProductToInvoiceAction` + `AddProductToInvoicePipeline`
- Flags en el pivot: `update_product_price`, `update_product_tax`

---

## US-IPC-05 — Editar líneas de productos de la factura

**Como** usuario con acceso de edición,  
**quiero** modificar cantidad, precio o descuento de un producto ya agregado a la factura,  
**para** corregir errores de carga antes de completar la factura.

### Criterios de aceptación
- [ ] Puedo cambiar la cantidad de una línea de producto
- [ ] Puedo cambiar el precio unitario, descuento o IVA de una línea
- [ ] Puedo eliminar un producto de la factura
- [ ] Los totales se recalculan automáticamente tras cada cambio

### Notas técnicas
- Cantidad: `PUT /invoices-purchase/{invoice}/products/{product}/quantity` → `UpdateProductQuantityPipeline`
- Precio/descuento/IVA: `PUT /invoices-purchase/{invoice}/products/{product}/price` → `UpdateProductPriceDiscountTaxPipeline`
- Eliminar: `DELETE /invoices-purchase/{invoice}/products` → `DeleteProductFromInvoicePipeline`

---

## US-IPC-06 — Conciliar una factura con su Orden de Compra

**Como** usuario con acceso de edición a la factura,  
**quiero** ver comparación ítem a ítem entre la OC y la factura recibida,  
**para** verificar que el proveedor entregó lo acordado a los precios pactados antes de aprobar el gasto.

### Criterios de aceptación
- [ ] El panel de conciliación muestra cada producto con: cantidad ordenada, cantidad facturada, precio OC, precio facturado, estado (correcto/descuadre/faltante/extra)
- [ ] Estados posibles de cada ítem:
  - ✅ **Correcto** — misma cantidad y precio (tolerancia ±5 centavos)
  - ⚠️ **Descuadre de precio** — misma cantidad pero precio diferente
  - 🔶 **Parcial** — cantidad diferente a la ordenada
  - ❌ **Faltante** — en la OC pero no en la factura
  - ➕ **Extra** — en la factura pero no en la OC
- [ ] Un resumen muestra: total de ítems, correctos, faltantes, descuadres
- [ ] Puedo agregar un comentario al aprobar la conciliación
- [ ] Al aprobar, la factura queda habilitada para completarse

### Notas técnicas
- `CalculateReconciliationAction` — se carga en el view de `invoices-purchase.create`
- `POST /invoices-purchase/{invoice}/approve-reconciliation` → `ApproveReconciliationAction` → `is_reconciled = true`
- Solo para status `DRAFT` con `purchase_order_id != null`

---

## US-IPC-07 — Completar una factura de compra (ingresar stock)

**Como** usuario con acceso de edición a la factura,  
**quiero** completar la factura de compra,  
**para** que el stock de los productos ingrese al inventario y quede registrado el gasto.

### Criterios de aceptación
- [ ] Si la factura proviene de una OC, **debo haberla conciliado primero** — si no, recibo un error claro
- [ ] Al completar, el stock de cada producto se suma al lote indicado en cada línea
- [ ] Si un producto tiene `update_product_price` marcado, su precio de compra se actualiza automáticamente en el catálogo
- [ ] Si tiene `update_product_tax` marcado, la alícuota IVA del producto se sincroniza
- [ ] La factura pasa a estado **Aceptada**
- [ ] El dashboard de tesorería se actualiza (caché invalidado)

### Notas técnicas
- `PUT /invoices-purchase/{invoice}/complete` → `InvoiceCompleteAction` → `CompleteInvoiceFifoPipeline` (7 pipes)
- Guard en `InvoiceCompleteAction`: `purchase_order_id != null && !is_reconciled` → Exception
- En el pipe 2 (`ProcessProductsFifoPipe`): suma stock a `branch_stocks.quantity` del lote indicado o al lote `no_batch_stock`
- `ClearTreasuryDashboardCacheAction` tras completar

---

## US-IPC-08 — Actualizar precio del catálogo desde la factura de compra

**Como** comprador o administrador,  
**quiero** que al completar una factura de compra, el precio de costo del producto se actualice automáticamente,  
**para** mantener el catálogo con los precios de compra actuales sin actualizar producto por producto.

### Criterios de aceptación
- [ ] Al agregar un producto a la factura, puedo marcar el checkbox "Actualizar precio de compra"
- [ ] Al completar la factura, el `price_buy` del producto se actualiza con el precio de la factura
- [ ] Si el IVA está discriminado, el IVA se suma al precio neto para calcular el costo total real
- [ ] El `price_sell` se recalcula automáticamente usando el margen asignado al producto en el tenant
- [ ] Se crea un registro de historial de precios para auditoría
- [ ] Si marco "Actualizar IVA", la alícuota del producto también se sincroniza

### Notas técnicas
- `invoice_product.update_product_price = true` → `UpdateProductPricesFromInvoiceAction::updateProductPrice()`
- `invoice_product.update_product_tax = true` → `updateProductTax()`
- Historial: `CreatePriceHistoryAction::execute($product, ChangeType::PRICE/TAX, ...)`

---

## US-IPC-09 — Descargar el PDF de una factura de compra

**Como** usuario con acceso a la factura,  
**quiero** descargar el PDF de la factura de compra,  
**para** archivarla, adjuntarla en un sistema contable externo o enviarla al administrador.

### Criterios de aceptación
- [ ] El PDF incluye: número de comprobante, datos del proveedor, datos del tenant, lista de productos con cantidades y precios, totales con IVA y descuentos
- [ ] El nombre del archivo descargado es `factura-compra-{invoice_number}.pdf`
- [ ] Funciona para facturas en cualquier estado (borrador, aceptada, pagada, etc.)

### Notas técnicas
- `GET /invoices-purchase/{invoice}/download` → `GenerateInvoicePurchasePdfAction`
- DomPDF + Blade `pdfs.invoice-purchase`; guardado en R2

---

## US-IPC-10 — Eliminar una factura de compra

**Como** usuario con permiso de eliminar facturas,  
**quiero** eliminar una factura de compra,  
**para** removerla del sistema si fue ingresada por error.

### Criterios de aceptación
- [ ] Si la factura estaba **Aceptada** (stock ya sumado), el sistema revierte el stock automáticamente antes de eliminar
- [ ] La reversión de stock usa el historial de la actividad de completado para ser precisa
- [ ] La factura queda en estado Eliminado (soft delete) — no se pierde para auditoría
- [ ] Se registra una actividad `INVOICE_PURCHASE_DELETE` con el detalle del comprobante

### Notas técnicas
- `DELETE /invoices-purchase/{invoice}` → `DB::transaction`: RestoreStock → RegisterActivity → status=DELETED → SoftDelete
- `RestoreStockFromPurchaseInvoiceAction`: busca `INVOICE_PURCHASE_COMPLETED` en activities; fallback al estado actual

---

## US-IPC-11 — Ver facturas de compra de múltiples sucursales

**Como** usuario con permiso `Ver Facturas Sucursales`,  
**quiero** ver las facturas de compra de todas las sucursales de mi empresa,  
**para** tener visibilidad centralizada del gasto de compras de toda la organización.

### Criterios de aceptación
- [ ] El listado muestra facturas de todas las sucursales de la jerarquía
- [ ] Puedo filtrar por sucursal con el selector de tenant
- [ ] Cada factura muestra a qué sucursal pertenece

---

## US-IPC-12 — Número de comprobante real requerido antes de completar (v2.0)

**Como** sistema,  
**quiero** impedir que se complete una factura con número de comprobante placeholder (`OC-{número}`),  
**para** garantizar que todas las facturas completadas tienen un número real del proveedor.

### Criterios de aceptación
- [ ] Si `invoice_number` tiene el formato `OC-{texto}` y el `invoice_type = remit_purchase`, el sistema bloquea el completado con un error claro
- [ ] El error indica: "Debe ingresar el número de comprobante real del proveedor antes de completar"

### Notas técnicas
- **Mejora v2.0** — actualmente no hay validación sobre el placeholder
- Validación en `ValidateInvoiceCompletionPipe` o en `InvoiceCompleteAction`

---

## US-IPC-13 — OC se marca como Completada al conciliar la factura (v2.0)

**Como** sistema,  
**quiero** marcar la OC como Completada cuando la factura de compra asociada es conciliada y completada,  
**para** reflejar el estado real del ciclo de compra en el listado de órdenes.

### Criterios de aceptación
- [ ] Al aprobar la conciliación y completar la factura, la OC asociada pasa automáticamente a `COMPLETED`
- [ ] Si la factura se elimina después de completada, la OC vuelve a `APPROVED`

### Notas técnicas
- **Mejora v2.0** — actualmente es un gap: la OC permanece en `APPROVED` indefinidamente
- La actualización de OC debe estar en `CompleteInvoiceFifoPipeline` o en `ApproveReconciliationAction` como efecto secundario

---

## US-IPC-14 — Importación masiva de facturas de compra (v2.0)

**Como** administrador,  
**quiero** importar múltiples facturas de compra desde un archivo Excel,  
**para** registrar rápidamente el historial de compras al migrar desde otro sistema.

### Criterios de aceptación
- [ ] El template Excel incluye columnas: proveedor (CUIT o nombre), número de comprobante, fecha, productos (columnas: código, nombre, cantidad, precio, IVA)
- [ ] El sistema valida cada fila antes de importar: proveedor existente, producto existente, formatos correctos
- [ ] Si hay errores, se muestra un reporte con las filas problemáticas; las filas válidas se importan
- [ ] Las facturas importadas quedan en estado **Aceptado** (stock ya ingresado) o en **Borrador** (pendiente de confirmación), configurable al importar

### Notas técnicas
- **Mejora v2.0** — no existe actualmente
- Job en queue `invoice_imports` para no bloquear la respuesta HTTP
- Notificación al usuario cuando termina la importación
