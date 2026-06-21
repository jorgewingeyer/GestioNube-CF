# 13 — Facturas de Venta y Notas (Invoice Sales & Notes)

> **Fase:** 3 — Ciclo Comercial  
> **Depende de:** 07-products, 08-batches, 09-inventory, 11-clients-providers, 02-tenant, 03-rbac  
> **Dependen de este:** 14-arca, 17-treasury, 19-reports

---

## 1. Propósito y Alcance

Gestiona el ciclo completo de la factura de venta: desde su creación como borrador, la carga de productos, la deducción FIFO del stock al completar, hasta la cancelación con restauración de stock. Incluye el submódulo de **notas de crédito y débito** que referencian una factura de origen.

La autorización fiscal (obtención del CAE de ARCA/AFIP) es un paso **separado** que ocurre después de completar la factura y está documentado en el módulo 14-arca.

### Tipos de comprobante cubiertos por este módulo

| `invoice_type`   | Descripción                     | Prefijo número |
|------------------|---------------------------------|----------------|
| `sale_invoice`   | Factura de venta estándar       | sin prefijo (`00000001`) |
| `remit_sale`     | Remito de venta                 | sin prefijo |
| `credit_note`    | Nota de crédito                 | `NC-00000001` |
| `debit_note`     | Nota de débito                  | `ND-00000001` |

---

## 2. Entidades de Datos

### 2.1 Tabla `invoices` — Columnas completas

Todas las entidades de este módulo comparten la tabla `invoices` discriminadas por `invoice_type`.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | bigint | — | PK |
| `tenant_id` | FK → tenants | — | Tenant emisor |
| `counterparty_id` | FK → counterparties | — | Cliente asociado |
| `invoice_number` | string | — | Número correlativo. Formato: `00000001` (factura), `NC-00000001` (NC), `ND-00000001` (ND) |
| `invoice_date` | date | — | Fecha de emisión |
| `expiration_date` | date | ✓ | Fecha de vencimiento (para presupuestos y NC) |
| `invoice_type` | string | — | Discriminador: `InvoiceTypes` enum |
| `invoice_origin` | string | ✓ | ID de factura de origen (presupuesto convertido, factura original de NC) |
| `currency` | string | ✓ | `ARS` por defecto |
| `status` | string | — | `InvoiceStatus` enum. Default: `draft` |
| `iva_type` | enum | ✓ | `DISCRIMINATED` \| `INCLUDED`. Hardcodeado a `INCLUDED` al crear |
| `tax_tenant_id` | FK → tax_tenant | ✓ | Configuración IVA del tenant para ARCA |
| `discount_type` | string | ✓ | `DiscountType` enum: `fixed` \| `percentage` |
| `discount_value` | decimal | ✓ | Monto fijo o % de descuento global |
| `interest_type` | string | ✓ | `InterestType` enum: `fixed` \| `percentage` |
| `interest_value` | decimal | ✓ | Monto fijo o % de interés |
| `installments` | integer | ✓ | Número de cuotas |
| `reason` | string | ✓ | Motivo de la NC/ND (`NoteReasons` enum) |
| `cae` | string | ✓ | Código de Autorización Electrónica (ARCA) |
| `cae_expiration_date` | date | ✓ | Vencimiento del CAE |
| `cae_result` | string | ✓ | Resultado de la solicitud CAE |
| `cbte_nro` | bigint | ✓ | Número de comprobante ARCA |
| `cbte_tipo` | string | ✓ | Tipo de comprobante ARCA (1=A, 6=B, 11=C, etc.) |
| `PtoVta` | integer | ✓ | Punto de venta ARCA |
| `purchase_order_id` | FK → purchase_orders | ✓ | Orden de compra relacionada (para facturas de compra) |
| `is_reconciled` | boolean | — | Si fue conciliada manualmente. Default: `false` |
| `conciliation_comment` | string | ✓ | Comentario de conciliación |
| `created_at`, `updated_at`, `deleted_at` | timestamps | — | Soft delete activo |

**Columnas que NO existen en la BD (calculadas en PHP en cada lectura):**

| Propiedad calculada | Descripción |
|---------------------|-------------|
| `subtotal` | Base neta sin IVA, después del descuento global |
| `total` | Subtotal + IVA + interés |
| `total_tax` | Total de IVA (recalculado por grupo de tasa si hay descuento global) |
| `total_discounts` | Total de descuentos por línea + descuento global |
| `total_interest` | Monto de interés aplicado |

### 2.2 Tabla `invoice_product` — Pivot de líneas de factura

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | bigint | PK |
| `invoice_id` | FK | Factura |
| `product_id` | FK | Producto |
| `batch_id` | FK → batches | ✓ Lote asignado por FIFO al completar. `null` en DRAFT |
| `quantity` | integer | Cantidad |
| `price` | unsignedInteger | Precio con IVA incluido, en centavos |
| `discount` | float | Descuento porcentual por línea (ej: `5.5`) |
| `tax_value` | float | Alícuota IVA (ej: `21.0`). Snapshot al momento de agregar |
| `margin_id` | FK → margins | ✓ Margen aplicado |
| `update_product_price` | boolean | Si al guardar debe actualizar el precio global del producto |
| `update_product_tax` | boolean | Si al guardar debe actualizar el IVA global del producto |

### 2.3 Enums relevantes

**`InvoiceStatus`** — Estados del ciclo de vida:

| Valor | Label | Contexto |
|-------|-------|---------|
| `draft` | Borrador | Estado inicial. Sin stock deducido |
| `accepted` | Aceptado | Post-completar. Stock deducido |
| `pending` | Pendiente | Usado por treasury (deuda pendiente de cobro) |
| `partially_paid` | Parcialmente Pagado | Cobros parciales registrados |
| `paid` | Pagado | Cobrado en su totalidad |
| `overdue` | Vencido | Deuda vencida |
| `overpaid` | Sobrepagado | Se cobró más de lo facturado |
| `cancelled` | Cancelado | Stock restaurado, no eliminada físicamente |
| `annulled` | Anulado | Anulación fiscal ARCA |
| `deleted` | Eliminado | Soft delete lógico |

**`IvaType`** — Tipo de presentación del IVA:

| Valor | Descripción |
|-------|-------------|
| `INCLUDED` | Precios muestran IVA incluido (B2C, consumidores finales) |
| `DISCRIMINATED` | Precios netos + IVA discriminado (B2B, RI) |

**`DiscountType` / `InterestType`** — `fixed` (monto fijo en centavos) o `percentage` (porcentaje).

---

## 3. Reglas de Negocio

### 3.1 Numeración de comprobantes

- El número de factura se genera como `str_pad(MAX(id)+1, 8, '0', STR_PAD_LEFT)` sin prefijo.
- Notas de crédito: `NC-` + 8 dígitos. Notas de débito: `ND-` + 8 dígitos.
- **Race condition documentada:** `MAX(id) + 1` sin `lockForUpdate()` puede generar duplicados bajo alta concurrencia simultánea. Solución v2.0: secuencias PostgreSQL por tenant y tipo.
- Numeración es **por tenant**, no global.

### 3.2 IVA hardcodeado al crear

`iva_type` siempre se establece como `INCLUDED` al crear. No es configurable en el formulario de creación. Solo puede cambiarse con un `PUT /invoices-sale/{invoice}` posterior.

### 3.3 Cálculo de totales — sin persistencia

Los totales (`subtotal`, `total`, `total_tax`, `total_discounts`, `total_interest`) **nunca se guardan en la BD**. Se calculan en PHP en cada lectura usando `GetInvoiceByIdAction::calculateInvoiceTotals()`.

**Algoritmo por línea (`CalculateInvoiceSaleProductAction`):**
```
net_unit = price / (1 + tax_rate / 100)          # extrae base neta del precio con IVA
discount_amount_unit = net_unit × discount%
discounted_net = net_unit − discount_amount_unit
tax_amount_unit = discounted_net × tax_rate / 100
subtotal_line = discounted_net × quantity          # base neta × cantidad
tax_line = tax_amount_unit × quantity
```

**Descuento global (sobre `subtotal` agregado):**
- `fixed`: descuento máximo = `subtotal` (no puede exceder la base)
- `percentage`: `subtotal × (discount_value / 100)`
- El IVA se **recalcula** sobre la base descontada, agrupado por tasa (`rateGroups`)
- El residuo de redondeo se asigna al grupo de mayor base

**Interés (sobre `totalAfterDiscounts`):**
- Se aplica sobre subtotal-post-descuento + IVA recalculado
- `total_final = subtotalAfterDiscount + recalculated_tax + interest`

### 3.4 Deducción de stock: solo al completar

El stock **no se deduce** al crear la factura ni al agregar productos. La deducción FIFO ocurre únicamente en `InvoiceCompleteAction::execute()` → `CompleteInvoiceFifoPipeline`.

**Pipeline de completar** (6 pipes en `DB::transaction`):
1. `ValidateInvoiceCompletionPipe` — verifica `status = DRAFT` y que haya al menos 1 producto
2. `ProcessProductsFifoPipe` — ejecuta FIFO por cada línea de producto
3. `ConsolidateInventoryActivityPipe` — consolida los movimientos
4. `UpdateInvoiceStatusPipe` — cambia `status → ACCEPTED`
5. `CalculateInvoiceTotalsPipe` — calcula y registra los totales en la actividad
6. `RegisterCompletionActivityPipe` — registra `ActivityTypes::INVOICE_SALE_COMPLETED` en JSON

**Algoritmo FIFO (`getBatchesForFifo`):**
- Ordena lotes por `expiration_date ASC`, luego `created_at ASC`
- Omite lotes con status `EXPIRED` o `DELETED`
- Excluye el lote `no_batch_stock` de la selección FIFO regular
- Si `remaining_quantity > 0` después de agotar lotes reales → descuenta del lote `no_batch_stock`
- Actualiza `branch_stocks.quantity` y `invoice_product.batch_id` para cada línea

### 3.5 Restauración de stock — dos flujos

**Destroy (borrar DRAFT):** `DELETE /invoices-sale/{invoice}`
- Llama `RestoreStockFromInvoiceAction::execute($invoice)` — busca actividad histórica
- Para facturas DRAFT sin completar no existe actividad → log de warning, retorna sin crash
- Luego `DeleteInvoiceAction::execute()` → soft delete (`deleted_at`)
- Limpia caché de treasury

**Cancel (cancelar ACCEPTED+):** `POST /invoices-sale/{invoice}/cancel`
- Llama `CancelInvoiceSaleAction::execute()` → `RestoreStockFromInvoiceAction` + `status = CANCELLED`
- El Action busca la actividad `INVOICE_SALE_COMPLETED` filtrando por `data->invoice_metadata->invoice_id`
- Itera `products_detail[].batches_detail[]` del JSON, incrementa `branch_stocks.quantity`
- Registra una actividad `BATCH_STOCK_RESTORATION`
- Si no encuentra actividad → log de warning, no revienta (edge case: facturas migradas sin actividad)

> **Diferencia clave:** `destroy` elimina el registro (soft delete). `cancel` mantiene el registro con `status = CANCELLED`. Los permisos de ambos usan `can('delete', 'invoice')`.

### 3.6 Agregar el mismo producto dos veces

Igual que en presupuestos: si `product_id` + `margin_id` + `price` coinciden con una línea existente en DRAFT → **acumula cantidad** en lugar de crear duplicado.

### 3.7 Flag `update_product_price` / `update_product_tax`

Cuando el usuario modifica el precio o IVA de un producto en la factura y activa estos flags:
- `update_product_price = true` → el sistema actualiza el `price_sell` del producto en el catálogo global
- `update_product_tax = true` → el sistema actualiza el IVA del producto en el catálogo global

Esto permite ajustar precios desde la factura sin entrar al catálogo.

### 3.8 Flujo ARCA — separado del completar

La autorización fiscal es un paso **posterior e independiente** de completar:
1. Se completa la factura → `status = ACCEPTED`
2. Desde la pantalla de detalle, se hace `POST /fe/cae-request` con `invoice_id`
3. ARCA responde con `cae`, `cae_expiration_date`, `cbte_nro`, `cbte_tipo`, `PtoVta`
4. El sistema guarda esos campos en la misma fila de `invoices`
5. El PDF se puede generar solo con `status = ACCEPTED` (con o sin CAE)

> El módulo 14-arca documenta el proceso de autorización en detalle.

### 3.9 Vista de comprobantes fiscales (`fiscalIndex`)

Vista separada que filtra únicamente facturas con `cae IS NOT NULL`. Permite buscar por `cae`, `cbte_nro`, número de factura y nombre de cliente.

### 3.10 Multi-tenant

- `GetAllInvoiceSaleAction` acepta `$targetTenantId` opcional. Con permiso `Ver Facturas Sucursales`, el usuario puede ver facturas de otras sucursales del grupo.
- `GetCurrentTenantAction` resuelve el tenant activo de la sesión.
- Pagina de 4 items en la lista general, 10 en la lista fiscal y de notas.

### 3.11 Free tier

`IncrementFreetierResourceAction::execute('invoice_sales')` se llama al crear. El límite de facturas del plan gratuito se controla por `.env` y se verifica en middleware.

---

## 4. Flujos Funcionales

### 4.1 Ciclo de vida de una factura de venta

```
[Crear] → DRAFT
            │ agregar productos (sin stock)
            │ editar cabecera (fecha, cliente, IVA)
            ▼
        [Completar] → ACCEPTED (stock deducido FIFO, actividad JSON)
            │
            ├─→ [ARCA authorize] → cae, cbte_nro, PtoVta guardados
            │
            ├─→ [Treasury registra cobros] → PARTIALLY_PAID / PAID
            │
            └─→ [Cancel] → CANCELLED (stock restaurado desde actividad)
                        ↑
         [Destroy si DRAFT] → soft delete (restored si había stock)
```

### 4.2 Creación de una factura

1. `POST /invoices-sale` → `CreateInvoiceSaleAction::execute($data)`
2. Genera número secuencial, `status=DRAFT`, `iva_type='INCLUDED'`
3. Redirect a `/invoices-sale/create/{invoice_id}` para agregar productos

### 4.3 Agregar un producto

1. `POST /invoices-sale/{invoice}/add-product` → `AddProductToInvoiceAction` → `AddProductToInvoicePipeline`
2. Pipes: `ValidateDataPipe → SetProductTaxValuePipe → CheckExistingProductPipe → UpdatePivotDataPipe → AddNewProductPipe`
3. Si mismo `product_id + margin_id + price` → acumula cantidad
4. `batch_id = null` (se asigna al completar)

### 4.4 Editar línea de producto

Tres endpoints independientes, cada uno con su pipeline:
- `PUT .../products/{product}/quantity` → `UpdateProductQuantityPipeline`
- `PUT .../products/{product}/price` → `UpdateProductPricePipeline`
- `PUT .../products/{product}/discount` → `UpdateProductDiscountPipeline`

### 4.5 Completar factura (FIFO)

1. `PUT /invoices-sale/{invoice}/complete`
2. `InvoiceCompleteAction::execute()` → `CompleteInvoiceFifoPipeline` en `DB::transaction`
3. Valida: `status=DRAFT` y `count(products) >= 1`
4. Por cada producto: busca lotes FIFO (expiración ASC), deduce cantidad, asigna `batch_id`
5. Si falta stock después de agotar lotes → usa `no_batch_stock`
6. `status → ACCEPTED`
7. Registra actividad JSON completa (para restauración futura)
8. Limpia caché treasury

### 4.6 Cancelar factura

1. `POST /invoices-sale/{invoice}/cancel`
2. `CancelInvoiceSaleAction::execute()`: busca actividad `INVOICE_SALE_COMPLETED`
3. Lee `products_detail[].batches_detail[]` del JSON
4. Incrementa `branch_stocks.quantity` para cada lote
5. `status → CANCELLED`
6. Registra actividad `BATCH_STOCK_RESTORATION`

### 4.7 Eliminar factura (DRAFT)

1. `DELETE /invoices-sale/{invoice}`
2. `restoreStock()` (no-op para DRAFT), `DeleteInvoiceAction` → soft delete
3. Redirect a lista

### 4.8 Descargar PDF

1. `GET /invoices-sale/{invoice}/download`
2. Solo si `status = ACCEPTED | PAID | PARTIALLY_PAID`
3. `GenerateInvoicePdfAction` carga relaciones (`counterparty`, `products`, `tenant.address`, `taxTenant`)
4. Calcula totales con `GetInvoiceByIdAction::calculateInvoiceTotals()`
5. `Pdf::loadView('pdfs.invoice-sale', $data)` → guarda en R2 como `pdfs/factura-venta-{number}.pdf`
6. Retorna como `Storage::disk()->download()`

---

## 5. Notas de Crédito y Débito (Submódulo `notes`)

### 5.1 Propósito

Una nota de crédito (NC) reduce lo que debe el cliente por una factura ya emitida. Una nota de débito (ND) lo incrementa. Ambas referencias una `invoice_origin` que apunta al `id` de la factura original.

### 5.2 Entidades

Misma tabla `invoices` con `invoice_type = 'credit_note'` o `'debit_note'`.

| Campo heredado de la factura de origen |
|----------------------------------------|
| `currency`, `iva_type`, `tax_tenant_id` |
| `discount_type`, `discount_value`, `interest_type`, `interest_value`, `installments` |
| `counterparty_id` |

Campo propio: `reason` (motivo de la NC/ND).

### 5.3 Flujo de nota de crédito

```
[notes.store] → DRAFT (referencia invoice_origin)
      │ agregar productos (con sus precios/descuentos)
      │
      ▼
[notes.complete] → ACCEPTED
      │
      ▼
[notes.downloadPdf] → PDF descargable
```

### 5.4 Numeración

- NC: `NC-` + `str_pad(lastNumber+1, 8, '0', STR_PAD_LEFT)` por tenant
- ND: `ND-` + mismo formato
- Mismo race condition de concurrencia que las facturas

### 5.5 Reglas de NC/ND

- Solo se pueden descargar en PDF si `status = ACCEPTED`
- Una NC/ND puede tener sus propios productos (no necesariamente los mismos que la factura original)
- Treasury consume las NC como "crédito disponible" para el cliente: `GetCounterpartyCreditNotes`
- **No generan movimientos de stock**: las NC/ND no deducen ni restauran inventario

### 5.6 `GetAllInvoiceSalePaidAction` — selector para NC

Esta action devuelve facturas con `status != DRAFT` para mostrarlas como opciones en el selector de "factura de origen" al crear una NC. Pagina de 10.

---

## 6. API / Endpoints

### Facturas de venta

| Método | Path | Nombre | Guard / Permiso | Descripción |
|--------|------|---------|-----------------|-------------|
| GET | `/invoices-sale` | `invoices-sale` | `viewAnySale` | Lista de facturas (4/pág) |
| GET | `/invoices-sale/fiscal` | `invoices-sale.fiscal` | `viewAnySale` | Solo facturas con CAE (10/pág) |
| GET | `/invoices-sale/create/{id?}` | `invoices-sale.create` | `createSale` | Formulario crear/editar |
| POST | `/invoices-sale` | `invoices-sale.store` | `storeSale` | Crear borrador |
| PUT | `/invoices-sale/{invoice}` | `invoices-sale.update` | `update` | Editar cabecera |
| POST | `/invoices-sale/{invoice}/add-product` | `invoices-sale.addProduct` | `update` | Agregar producto |
| PUT | `/invoices-sale/{invoice}/complete` | `invoices-sale.completed` | `update` | Completar (FIFO + ACCEPTED) |
| DELETE | `/invoices-sale/{invoice}` | `invoices-sale.destroy` | `delete` | Eliminar borrador (soft delete) |
| POST | `/invoices-sale/{invoice}/cancel` | `invoices-sale.cancel` | `delete` | Cancelar (restaura stock) |
| GET | `/invoices-sale/{invoice}/download` | `invoices-sale.downloadPdf` | `view` | Descargar PDF |
| DELETE | `/invoices-sale/{invoice}/products` | `invoices-sale.deleteProduct` | `update` | Quitar producto |
| PUT | `/invoices-sale/{invoice}/products/{p}/quantity` | `invoices-sale.updateProductQuantity` | `update` | Editar cantidad |
| PUT | `/invoices-sale/{invoice}/products/{p}/price` | `invoices-sale.updateProductPrice` | `update` | Editar precio |
| PUT | `/invoices-sale/{invoice}/products/{p}/discount` | `invoices-sale.updateProductDiscount` | `update` | Editar descuento |

### Notas de crédito/débito

| Método | Path | Nombre | Guard | Descripción |
|--------|------|---------|-------|-------------|
| GET | `/notes` | `notes` | `viewAnyCreditNote` | Lista de NC/ND |
| GET | `/notes/create/{id?}` | `notes.create` | `createCreditNote` | Formulario crear |
| POST | `/notes` | `note.store` | `storeCreditNote` | Crear NC/ND |
| PUT | `/notes/{invoice}/complete` | `notes.complete` | `update` | Completar NC |
| GET | `/notes/{invoice}/download` | `notes.downloadPdf` | `view` | PDF |
| POST | `/notes/{invoice}/add-product` | `notes.addProduct` | `update` | Agregar producto |
| PUT | `/notes/{invoice}/products/{p}/quantity` | `notes.updateProductQuantity` | `update` | Editar cantidad |
| PUT | `/notes/{invoice}/products/{p}/price` | `notes.updateProductPrice` | `update` | Editar precio |

---

## 7. Consideraciones de Migración Next.js

### Lógica de cálculo de totales

La lógica de `calculateInvoiceTotals` en `GetInvoiceByIdAction` es compleja (grupos por tasa, descuento global proporcional, recalculo de IVA por grupo). Esta lógica **debe migrar a una función TypeScript en el servidor (Server Action o API Route)**, no al cliente, para que el PDF y la API devuelvan siempre los mismos valores.

### Pipeline FIFO

`CompleteInvoiceFifoPipeline` depende de `lockForUpdate()` en Eloquent + `DB::transaction`. En Next.js esto requerirá un endpoint backend que ejecute toda la transacción atómica (no puede fragmentarse en Server Actions independientes).

### PDF en R2

El PDF se genera con `barryvdh/laravel-dompdf` y se sube a Cloudflare R2. En Next.js se puede usar `@react-pdf/renderer` o mantener un microservicio Laravel solo para generación de PDF, ya que DOMPdf es PHP-only.

### Actividad JSON como fuente de restauración

La restauración de stock lee el JSON de la actividad (`activities.data`). Si se migra la BD, los JSON históricos de actividades deben preservarse íntegros o regenerarse desde un snapshot de `branch_stocks`.

### Caché de treasury

`ClearTreasuryDashboardCacheAction` usa Redis/Laravel cache. En Next.js usar Cloudflare KV o invalidación de cache con `revalidateTag`.

### Estado de factura vs cobros

Los estados `pending`, `paid`, `partially_paid`, `overdue` los gestiona el módulo Treasury, no este módulo. En Next.js la factura sigue un estado calculado en runtime combinando `invoices.status` + `SUM(transactions)`.

---

## 8. Mejoras Propuestas v2.0

### 8.1 Secuencias PostgreSQL para numeración
Reemplazar `MAX(id)+1` por `nextval('invoice_number_seq_{tenant_id}')`. Elimina la race condition bajo concurrencia.

### 8.2 Link de pago online
Generar un link público con token (`invoice.share_token`) para que el cliente pague desde la web sin login. Integrar con MercadoPago o transferencia bancaria.

### 8.3 Envío de factura por email
Al completar y autorizar con ARCA, enviar automáticamente el PDF por email al cliente. Usar `inertia-mailable` + job en queue.

### 8.4 Anulación fiscal desde la UI
Actualmente la anulación ARCA no tiene flujo UI completo. v2.0: botón "Anular comprobante ARCA" que llame a `FECAERequest` con `FchServHasta` nula y actualice `status = ANNULLED`.

### 8.5 Remito de venta vinculado
`remit_sale` existe como `invoice_type` pero no tiene flujo independiente documentado. v2.0: flujo explícito de remito → factura.

### 8.6 IA: sugerencia de descuentos
Con el add-on de IA: analizar historial del cliente y sugerir descuento óptimo al crear la factura, basado en frecuencia de compra y monto histórico.

### 8.7 Configuración de IVA en creación
Permitir que el usuario seleccione `DISCRIMINATED` vs `INCLUDED` al crear la factura, en lugar de hardcodearlo a `INCLUDED`.

### 8.8 Multi-moneda real
`currency` existe pero siempre es `ARS`. v2.0: permitir `USD`, `EUR` con tipo de cambio del día (integración con BCRA o Bluelytics).
