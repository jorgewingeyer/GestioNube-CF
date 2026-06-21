# Módulo 16: Facturación de Compras

> **Dominio:** `invoices-purchase`  
> **Fase:** 3 — Ciclo Comercial  
> **Depende de:** 07-products, 08-batches, 11-clients-providers, 15-purchase-orders, 02-tenant, 03-rbac  
> **Expone hacia:** 17-treasury (transacciones vinculadas a facturas de compra)

---

## 1. Propósito y Alcance

El módulo de Facturación de Compras registra las facturas emitidas por los proveedores al comprar productos. Cubre el ciclo completo: creación del documento, agregado de productos, conciliación contra una OC (si aplica), completado con actualización de stock FIFO, actualización automática de precios de productos desde la factura, generación de PDF y eliminación con restauración de stock.

**Tipos de documento gestionados:**
- `purchase_invoice` — Factura de compra directa
- `remit_purchase` — Remito de compra (generado automáticamente desde OC; se convierte a factura al editar el número)

Ambos tipos se muestran juntos en el listado de "Facturas de Compra".

**Diferencia clave con Invoice Sales:**
- Cuando se completa, el stock se **suma** a los lotes (no se deduce)
- Puede estar vinculada a una OC, y en ese caso requiere **conciliación** antes de completarse
- El precio de compra puede actualizar automáticamente el `price_buy` y `price_sell` del producto

---

## 2. Entidades de Datos

### `invoices` — campos específicos de facturas de compra

> La tabla `invoices` es unificada para todos los tipos. Ver módulo 13 para el schema completo. Campos relevantes para compras:

| Columna | Tipo | Uso en compras |
|---------|------|----------------|
| `id` | bigint PK | |
| `tenant_id` | bigint FK | |
| `counterparty_id` | bigint FK | Proveedor (party_type = provider) |
| `invoice_number` | varchar | Número del comprobante del proveedor; placeholder `OC-{number}` si viene de OC |
| `invoice_date` | date | Fecha del comprobante |
| `invoice_type` | enum | `purchase_invoice` o `remit_purchase` |
| `purchase_order_id` | bigint FK nullable | OC de origen (si existe) |
| `status` | enum | Ver `InvoiceStatus` |
| `iva_type` | enum | `DISCRIMINATED` o `INCLUDED` |
| `tax_tenant_id` | bigint FK nullable | Impuesto preferido del tenant |
| `discount_type` | varchar nullable | Tipo de descuento global |
| `discount_value` | decimal nullable | Valor del descuento |
| `interest_type` | varchar nullable | Tipo de interés |
| `interest_value` | decimal nullable | Valor del interés |
| `is_reconciled` | boolean | Si la factura fue conciliada contra la OC |
| `conciliation_comment` | varchar nullable | Comentario al conciliar |
| `currency` | varchar | Siempre `ARS` |

### `invoice_product` — pivot con campos de compras

| Columna | Tipo | Uso |
|---------|------|-----|
| `invoice_id` | bigint FK | |
| `product_id` | bigint FK | |
| `quantity` | integer | Cantidad recibida |
| `price` | bigint (centavos) | Precio de compra unitario en centavos |
| `discount` | float | % de descuento por línea |
| `tax_value` | float | % de IVA del producto |
| `margin_id` | bigint FK nullable | Margen usado para calcular precio de venta |
| `batch_id` | bigint FK nullable | Lote destino del stock |
| `update_product_price` | boolean | Si verdadero, actualiza `price_buy` del producto al completar |
| `update_product_tax` | boolean | Si verdadero, sincroniza la alícuota IVA del producto al completar |

---

## 3. Reglas de Negocio

### 3.1 Tipos de documento: purchase_invoice vs. remit_purchase
- `purchase_invoice` — creado manualmente por el usuario
- `remit_purchase` — creado automáticamente desde una OC vía `CreateInvoiceFromPurchaseOrderAction`; tiene `invoice_number = 'OC-{number}'` como placeholder; el usuario debe editar el número real del proveedor. No hay un paso de "convertir remito a factura" — son el mismo documento con diferente `invoice_type` solo para distinción semántica
- Ambos tipos aparecen en el listado; el `GetAllInvoicePurchaseAction` filtra por `invoice_type IN (purchase_invoice, remit_purchase)`

### 3.2 Conciliación obligatoria antes de completar (si viene de OC)
`InvoiceCompleteAction` verifica: si `purchase_order_id != null` Y `is_reconciled == false`, lanza `Exception('La factura debe ser conciliada antes de completarse.')`. La conciliación es opcional para facturas sin OC.

La conciliación compara ítems de la OC vs. la factura con `CalculateReconciliationAction`:
| Estado | Criterio |
|--------|---------|
| `matched` | Misma cantidad (tolerancia ±0.01) y mismo precio (tolerancia ±5¢) |
| `price_mismatch` | Misma cantidad pero precio diferente |
| `partial` | Cantidad diferente |
| `missing` | Producto en OC pero no en factura |
| `extra` | Producto en factura pero no en OC |

`ApproveReconciliationAction` solo funciona en status `DRAFT` con `purchase_order_id != null`. Fija `is_reconciled = true` y opcionalmente `conciliation_comment`.

### 3.3 Pipeline de completado FIFO — 7 pipes

`CompleteInvoiceFifoPipeline` ejecuta estos pipes en orden dentro de una `DB::transaction`:

| # | Pipe | Efecto |
|---|------|--------|
| 1 | `ValidateInvoiceCompletionPipe` | Verifica que la factura esté en status válido para completar |
| 2 | `ProcessProductsFifoPipe` | Suma stock a los lotes indicados en `invoice_product.batch_id`; si no hay lote, suma a `no_batch_stock` |
| 3 | `ConsolidateInventoryActivityPipe` | Consolida los movimientos de stock en un único registro de actividad |
| 4 | `UpdateInvoiceStatusPipe` | Cambia `status = ACCEPTED` |
| 5 | `UpdateProductPricesPipe` | Llama a `UpdateProductPricesFromInvoiceAction` — actualiza precios de productos marcados |
| 6 | `CalculateInvoiceTotalsPipe` | Persiste los totales calculados |
| 7 | `RegisterCompletionActivityPipe` | Registra `ActivityTypes::INVOICE_PURCHASE_COMPLETED` con detalle de movimientos |

### 3.4 Actualización automática de precios de productos al completar
Por cada línea de `invoice_product` con `update_product_price = true`:
1. `price_buy` se actualiza al precio del pivot
2. Si `iva_type = DISCRIMINATED` y `tax_value > 0`: se suma el IVA al costo (`price_buy = net_price + net_price × tax%`)
3. Si el producto tiene margen asignado: `price_sell = price_buy × (1 + margin%)`
4. Se registra `PriceHistory` con `ChangeType::PRICE`
5. Si `update_product_tax = true`: se sincroniza la relación `product.taxes` con el valor de `tax_value` del pivot; se registra `PriceHistory` con `ChangeType::TAX`

### 3.5 Restauración de stock al eliminar
`destroy()` en el controller: si la factura está en `ACCEPTED`, llama a `RestoreStockFromPurchaseInvoiceAction` antes de eliminar:
1. Busca la actividad `INVOICE_PURCHASE_COMPLETED` para esta factura en el log de actividades
2. Si existe y tiene `products_detail`: restaura leyendo los movimientos históricos (fuente de verdad)
3. Si no existe (ej: la actividad fue eliminada): fallback a `UpdateBatchQuantitiesFromInvoiceAction($invoice, false)` — usa el estado actual de la factura
4. Registra `ActivityTypes::BATCH_STOCK_RESTORATION`
5. Luego: `invoice.status = DELETED` → `DeleteInvoiceAction` (soft delete)

### 3.6 Paginación de 4 por página
`GetAllInvoicePurchaseAction` pagina de a **4 registros** (la más pequeña de todo el sistema). Diferente a facturas de venta (10) y OC (15).

### 3.7 OC no se marca COMPLETED automáticamente
Al crear una factura desde una OC (`storeFromPurchaseOrder`), la OC permanece en estado `APPROVED`. No hay lógica que cambie la OC a `COMPLETED`. Este es un gap en la implementación actual — la OC debe marcarse manualmente o queda en APPROVED indefinidamente.

### 3.8 invoice_number como placeholder al venir de OC
`CreateInvoiceFromPurchaseOrderAction` asigna `invoice_number = 'OC-{purchaseOrder->number}'` como placeholder. El usuario debe editar el número con el del comprobante real del proveedor antes de completar.

### 3.9 Cálculo del total pagado en el listado
`GetAllInvoicePurchaseAction` usa `withSum` para calcular `total_paid` en la query principal:
```
transactions as total_paid → SUM(invoice_transaction.amount)
WHERE transactions.status NOT IN ('cancelled', 'anulled')
```
Esto permite mostrar el saldo pendiente sin queries adicionales en el frontend.

### 3.10 Soft delete en cascada
`destroy()` hace: restaura stock (si ACCEPTED) → `status = DELETED` → `DeleteInvoiceAction` (soft delete de la factura). Los `invoice_product` no se eliminan — quedan en la tabla pero la factura queda soft-deleted.

---

## 4. Flujos Funcionales

### 4.1 Crear una factura de compra directa
1. `GET /invoices-purchase/create` → Controller carga proveedores (lazy), taxes, márgenes, categorías
2. Usuario selecciona proveedor, ingresa número de comprobante, fecha, tipo de IVA
3. `POST /invoices-purchase` → `StoreInvoicePurchaseRequeste` → `CreateInvoicePurchaseAction`
4. Se crea `Invoice` con `status = DRAFT`, `invoice_type = purchase_invoice`, `currency = ARS`
5. Redirect a `invoices-purchase.create/{invoice_id}` — la misma pantalla muestra el formulario de edición con la factura creada

### 4.2 Crear factura desde OC
1. Desde el detalle de una OC aprobada, botón "Crear Factura de Compra"
2. `POST /invoices-purchase/from-order/{purchase_order}` → `CreateInvoiceFromPurchaseOrderAction`
3. Crea `Invoice` con `invoice_type = REMIT_PURCHASE`, `purchase_order_id`, `is_reconciled = false`, copiando ítems de la OC
4. Redirect a `invoices-purchase.create/{invoice_id}` para que el usuario ajuste el número y los datos

### 4.3 Agregar/editar productos a la factura
- `POST /invoices-purchase/{invoice}/add-product` → `AddProductToInvoiceAction` con `AddProductToInvoicePipeline`
- `PUT /invoices-purchase/{invoice}/products/{product}/quantity` → `UpdateProductQuantityAction` con `UpdateProductQuantityPipeline`
- `PUT /invoices-purchase/{invoice}/products/{product}/price` → `UpdateProductPriceDiscountTaxPipeline`
- `DELETE /invoices-purchase/{invoice}/products` → `DeleteProductFromInvoiceAction` con `DeleteProductFromInvoicePipeline`

Los pipelines de compra son independientes de los de venta (diferentes namespaces y lógica de stock).

### 4.4 Conciliar factura contra OC
1. Si la factura tiene `purchase_order_id`, la pantalla muestra un panel de conciliación
2. `CalculateReconciliationAction::execute($purchaseOrder, $invoice)` compara ítems con tolerancia 0.01 unid / 5¢
3. Usuario revisa las discrepancias y puede comentar
4. `POST /invoices-purchase/{invoice}/approve-reconciliation` → `ApproveReconciliationAction` → `is_reconciled = true`
5. Ahora la factura puede completarse

### 4.5 Completar la factura (suma stock)
1. `PUT /invoices-purchase/{invoice}/complete` → `InvoiceCompleteAction`
2. Guard: si `purchase_order_id != null && !is_reconciled` → error
3. `DB::transaction` → `CompleteInvoiceFifoPipeline` (7 pipes):
   - Suma stock a los lotes referenciados en `invoice_product.batch_id`
   - Actualiza precios de productos marcados con `update_product_price/update_product_tax`
   - Registra actividad `INVOICE_PURCHASE_COMPLETED` con detalle completo
   - `status = ACCEPTED`
4. `ClearTreasuryDashboardCacheAction` — invalida caché del dashboard de tesorería

### 4.6 Descargar PDF
1. `GET /invoices-purchase/{invoice}/download` → `GenerateInvoicePurchasePdfAction`
2. DomPDF → Blade view `pdfs.invoice-purchase`
3. Guardado en R2: `pdfs/factura-compra-{invoice_number}.pdf`
4. `Storage::download($path, 'factura-compra-{invoice_number}.pdf')`

### 4.7 Eliminar factura de compra
1. `DELETE /invoices-purchase/{invoice}` dentro de `DB::transaction`
2. Si `status = ACCEPTED`: `RestoreStockFromPurchaseInvoiceAction` (lee historial o usa estado actual)
3. `RegisterActivityAction::execute(INVOICE_PURCHASE_DELETE, {...})`
4. `invoice.status = DELETED`
5. `DeleteInvoiceAction` (soft delete)
6. Redirect a `invoices-purchase`

---

## 5. Actions y Pipelines

### Actions del dominio `InvoicePurchase`

| Action | Propósito |
|--------|-----------|
| `CreateInvoicePurchaseAction` | Crea factura de compra en DRAFT; copia ítems de OC si `purchase_order_id` presente |
| `CreateInvoiceFromPurchaseOrderAction` | Wrapper para crear `REMIT_PURCHASE` desde una OC, con placeholder de número |
| `GetAllInvoicePurchaseAction` | Lista paginada (4/pág) de facturas con multi-tenant, filtros, `total_paid` |
| `InvoiceCompleteAction` | Orquesta el completado vía pipeline FIFO; verifica conciliación si hay OC |
| `UpdateInvoicePurchaseAction` | Actualiza datos de cabecera de la factura |
| `CalculateInvoiceTotalsAction` | Calcula totales de la factura de compra |
| `CalculateReconciliationAction` | Compara OC vs. factura; retorna items con status + stats |
| `ApproveReconciliationAction` | Fija `is_reconciled = true` + comentario; requiere DRAFT + purchase_order_id |
| `RestoreStockFromPurchaseInvoiceAction` | Revierte stock sumado al completar (lee historial o estado actual) |
| `UpdateProductPricesFromInvoiceAction` | Actualiza `price_buy`/`price_sell`/taxes del producto desde el pivot de la factura |
| `GenerateInvoicePurchasePdfAction` | Genera PDF con DomPDF, guarda en R2 |
| `GetProviderByInvoice` | Retorna el proveedor de la factura (para pre-cargar el selector) |

### CompleteInvoiceFifoPipeline — Pipes en orden

| # | Pipe | Efecto |
|---|------|--------|
| 1 | `ValidateInvoiceCompletionPipe` | Valida que la factura esté en estado completable |
| 2 | `ProcessProductsFifoPipe` | FIFO inverso: suma stock en lotes indicados o `no_batch_stock` |
| 3 | `ConsolidateInventoryActivityPipe` | Agrupa movimientos de stock en un solo log |
| 4 | `UpdateInvoiceStatusPipe` | Cambia status → ACCEPTED |
| 5 | `UpdateProductPricesPipe` | Llama `UpdateProductPricesFromInvoiceAction` |
| 6 | `CalculateInvoiceTotalsPipe` | Calcula y persiste totales |
| 7 | `RegisterCompletionActivityPipe` | Registra `INVOICE_PURCHASE_COMPLETED` con detalle de batch movements |

---

## 6. API / Endpoints

| Método | Path | Nombre | Policy | Descripción |
|--------|------|--------|--------|-------------|
| `GET` | `/invoices-purchase` | `invoices-purchase` | `viewAnyPurchase(Invoice)` | Listado paginado de facturas de compra (4/pág) |
| `GET` | `/invoices-purchase/create/{id?}` | `invoices-purchase.create` | `createPurchase(Invoice)` | Crear/editar factura; `id` = factura existente en DRAFT |
| `POST` | `/invoices-purchase` | `invoices-purchase.store` | `storePurchase(Invoice)` | Crear nueva factura de compra |
| `POST` | `/invoices-purchase/from-order/{po}` | `invoices-purchase.store-from-order` | `storePurchase(Invoice)` | Crear remito desde OC aprobada |
| `PUT` | `/invoices-purchase/{invoice}` | `invoices-purchase.update` | `update(invoice)` | Actualizar cabecera de la factura |
| `DELETE` | `/invoices-purchase/{invoice}` | `invoices-purchase.destroy` | `delete(invoice)` | Eliminar factura (con restauración de stock si ACCEPTED) |
| `POST` | `/invoices-purchase/{invoice}/add-product` | `invoices-purchase.addProduct` | `update(invoice)` | Agregar producto a la factura |
| `PUT` | `/invoices-purchase/{invoice}/products/{p}/quantity` | `invoices-purchase.updateProductQuantity` | `update(invoice)` | Actualizar cantidad de una línea |
| `PUT` | `/invoices-purchase/{invoice}/products/{p}/price` | `invoices-purchase.updateProductPriceDiscountTax` | `update(invoice)` | Actualizar precio/descuento/IVA de una línea |
| `PUT` | `/invoices-purchase/{invoice}/complete` | `invoices-purchase.completed` | `update(invoice)` | Completar: suma stock + actualiza precios |
| `POST` | `/invoices-purchase/{invoice}/approve-reconciliation` | `invoices-purchase.approve-reconciliation` | `update(invoice)` | Conciliar factura contra OC |
| `GET` | `/invoices-purchase/{invoice}/download` | `invoices-purchase.downloadPdf` | `view(invoice)` | Descargar PDF |
| `DELETE` | `/invoices-purchase/{invoice}/products` | `invoices-purchase.deleteProduct` | `update(invoice)` | Eliminar producto de la factura |

---

## 7. Consideraciones de Migración Next.js

### 7.1 Pipeline → Route Handlers + DB Transactions
Los 7 pipes de `CompleteInvoiceFifoPipeline` deben implementarse como una transacción atómica en el Route Handler de Next.js. Cada pipe es una función pura con side effects — mantenerlos como funciones modulares encadenadas.

### 7.2 Conciliación: lógica pura sin framework
`CalculateReconciliationAction` es lógica pura (arrays + comparaciones). Migrar directamente a TypeScript como función de utilidad, sin dependencias de Eloquent. Los datos entran como objetos tipados (Zod schemas).

### 7.3 Actualización de precios: efecto secundario al completar
El pipe `UpdateProductPricesPipe` actualiza datos de productos en el mismo momento que el completado. En Next.js, mantener este comportamiento en la misma transacción. No dividir en un webhook o job separado, ya que el usuario espera que los precios queden actualizados inmediatamente.

### 7.4 Paginación de 4: revisar UX
La paginación de 4 registros por página es muy pequeña para el listado. En v2.0, considerar 15 o 25 por página con filtros más rápidos.

### 7.5 Restauración de stock: JSON como fuente de verdad
`RestoreStockFromPurchaseInvoiceAction` lee el log de actividad JSON para restaurar. En Next.js, mantener el patrón de activity log. Asegurarse de que el log de `INVOICE_PURCHASE_COMPLETED` se escriba de forma inmutable (append-only, sin UPDATE).

### 7.6 OC → COMPLETED: gap a corregir
El paso que debería marcar la OC como `COMPLETED` al crear la factura no existe. En Next.js, agregar este paso en `createInvoiceFromPurchaseOrder()`.

---

## 8. Mejoras Propuestas v2.0

### 8.1 Marcar OC como COMPLETED automáticamente
Al crear una factura desde una OC (y conciliarla), la OC debería pasar automáticamente a `COMPLETED`. Actualmente permanece en `APPROVED` indefinidamente.

### 8.2 Número de comprobante del proveedor con validación
Al crear desde OC, el `invoice_number` queda como `OC-{number}`. Agregar validación que impida completar si el número aún tiene el formato placeholder, forzando al usuario a ingresar el número real.

### 8.3 Historial de compras por proveedor
Vista del historial de todas las compras realizadas a un proveedor: productos, precios históricos, evolución de costos. Permite detectar aumentos y negociar.

### 8.4 Import masivo de facturas de compra (CSV/Excel)
Para empresas con muchas compras, poder importar facturas desde un Excel con columnas: proveedor, número, fecha, productos, cantidades y precios. Útil para migración inicial de datos.

### 8.5 Paginación ajustada y filtros mejorados
Cambiar paginación de 4 a 15/25 por página. Agregar filtros por: rango de fechas, monto mínimo/máximo, estado de conciliación, proveedor.

### 8.6 Reconciliación con diferencias aceptadas automáticamente
Permitir configurar umbrales de tolerancia por tenant: si las diferencias entre OC y factura están dentro del umbral, auto-aprobar la conciliación sin intervención manual.
