# Módulo 15: Órdenes de Compra

> **Dominio:** `purchase-orders`  
> **Fase:** 3 — Ciclo Comercial  
> **Depende de:** 07-products, 11-clients-providers, 02-tenant, 03-rbac  
> **Expone hacia:** 16-invoice-purchase (conversión directa de OC a factura de compra)

---

## 1. Propósito y Alcance

El módulo de Órdenes de Compra (OC) permite a las empresas formalizar la solicitud de compra de productos a proveedores. Cubre el ciclo de vida completo de una OC: creación (borrador), finalización para aprobación, aprobación o rechazo por un superior, generación de PDF para enviar al proveedor, y conversión directa a factura de compra cuando los productos son recibidos.

**Quién lo usa:**
- **Comprador/Solicitante**: crea la OC en estado borrador, la finaliza para revisión
- **Aprobador (supervisor/gerente)**: aprueba o rechaza la OC con motivo
- **Administrador/Contable**: convierte la OC aprobada en factura de compra

**Flujo de aprobación multi-nivel:**  
`DRAFT → PENDING_APPROVAL → APPROVED → (factura de compra) → COMPLETED`  
Con desvíos: `PENDING_APPROVAL → REJECTED` o `PENDING_APPROVAL → DRAFT` (reverted)

---

## 2. Entidades de Datos

### `purchase_orders` (migración: 2026-02-26)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `tenant_id` | bigint FK → tenants | |
| `counterparty_id` | bigint FK → counterparties | Proveedor de la OC |
| `user_id` | bigint FK → users | Creador de la OC |
| `number` | varchar | Formato: `OC-1`, `OC-2`, ... (sequential por tenant) |
| `date` | date | Fecha de emisión de la OC |
| `expected_date` | date nullable | Fecha esperada de entrega |
| `status` | varchar | Ver enum `PurchaseOrderStatus` |
| `total` | bigint | Total en centavos; suma directa de items (sin IVA diferenciado) |
| `notes` | text nullable | Observaciones generales |
| `rejection_reason` | text nullable | Motivo de rechazo (solo cuando status = REJECTED) |
| `deleted_at` | timestamp nullable | Soft delete |
| `created_at` / `updated_at` | timestamp | |

### `purchase_order_items` (migración: 2026-02-26, modificada 2026-03-05)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `purchase_order_id` | bigint FK → purchase_orders CASCADE | |
| `product_id` | bigint FK → products | |
| `quantity` | integer | Originalmente `decimal(10,2)`, cambiado a `integer` (migración 2026-03-05) |
| `unit_price` | bigint | Precio unitario en centavos |
| `total` | bigint | `quantity × unit_price` en centavos |
| `notes` | text nullable | Notas por línea de producto |
| `deleted_at` | timestamp nullable | Soft delete |
| `created_at` / `updated_at` | timestamp | |

### Enum `PurchaseOrderStatus` (7 casos)

| Valor | Label | Transiciones posibles |
|-------|-------|-----------------------|
| `draft` | Borrador | → `pending_approval` (finalize) |
| `pending_approval` | Pendiente de Aprobación | → `approved`, `rejected`, `draft` (revert) |
| `approved` | Aprobada | → `completed` (al generar factura de compra) |
| `rejected` | Rechazada | Estado terminal |
| `pending_review` | Pendiente de Revisión | Estado auxiliar (actualmente no hay acción que lo asigne) |
| `conciliated` | Conciliada | Estado auxiliar (actualmente no hay acción que lo asigne) |
| `completed` | Completada | Estado terminal; OC convertida a factura de compra |

> **Nota:** `PENDING_REVIEW` y `CONCILIATED` están definidos en el enum pero no hay Actions que los asignen actualmente. Son estados reservados para flujos futuros.

### Campo en `invoices` relacionado

| Columna | Tipo | Notas |
|---------|------|-------|
| `purchase_order_id` | bigint FK nullable → purchase_orders | En la factura de compra que se creó desde la OC |

---

## 3. Reglas de Negocio

### 3.1 Numeración automática de OC
`GeneratePurchaseOrderNumberAction` genera `OC-{n}` donde `n` es el número extraído de la última OC del tenant (`WHERE number LIKE 'OC-%' ORDER BY id DESC`). Si no hay OC previas, comienza en `OC-1`. No usa padding de ceros (es `OC-1`, no `OC-00001`).

**Riesgo de gap:** si dos OC se crean simultáneamente con el mismo tenant y ambas leen `OC-N` antes de que la primera se guarde, puede haber colisión de número. No hay lock de base de datos ni `UNIQUE` constraint en `number`.

### 3.2 Total persiste en la tabla (a diferencia de facturas)
A diferencia de `invoices`, las órdenes de compra SÍ persisten el `total` en la tabla `purchase_orders`. Se calcula en `CreatePurchaseOrderAction` como suma de `quantity × unit_price` de los items. No hay impuestos diferenciados: el precio unitario se ingresa tal cual.

### 3.3 Máquina de estados estricta
Cada Action verifica el estado actual antes de ejecutar la transición:
- `FinalizePurchaseOrderAction`: solo acepta `DRAFT` → `PENDING_APPROVAL`
- `ApprovePurchaseOrderAction`: solo acepta `PENDING_APPROVAL` → `APPROVED`
- `RejectPurchaseOrderAction`: solo acepta `PENDING_APPROVAL` → `REJECTED`
- `RevertToDraftPurchaseOrderAction`: solo acepta `PENDING_APPROVAL` → `DRAFT`

Si el estado no es el esperado, lanza `Exception` con mensaje descriptivo. Las excepciones son capturadas en el controller y retornadas como flash `error`.

### 3.4 Control de acceso multi-tenant para OC
`getAllowedTenantIds()` en el controller aplica:
- Si el usuario tiene `Gestionar Órdenes de Compra Sucursales` → puede ver OC de toda la jerarquía del tenant (`GetTenantContextAction`)
- De lo contrario → solo ve OC de su tenant actual

El permiso `Ver Facturas Sucursales` también habilita la vista multi-sucursal en el listado.

### 3.5 PDF: solo para estados DRAFT, APPROVED o COMPLETED
`GeneratePurchaseOrderPdfAction` rechaza la generación si el status es `PENDING_APPROVAL`, `REJECTED`, `PENDING_REVIEW` o `CONCILIATED`. El PDF incluye si la OC es borrador (`isDraft`) para mostrar la marca de agua "BORRADOR" en el documento.

El PDF se genera con DomPDF, se guarda en R2 en `pdfs/purchase-orders/orden-compra-{number}.pdf` y el controller retorna `Storage::download()`.

### 3.6 Soft delete en OC e items
Tanto `purchase_orders` como `purchase_order_items` tienen `SoftDeletes`. `DeletePurchaseOrderAction` hace soft delete de la OC; los items se soft-deletan en cascada por la regla `cascadeOnDelete()` de la FK en la migración.

### 3.7 Conversión a factura de compra
Cuando una OC está `APPROVED`, puede convertirse en factura de compra mediante `CreateInvoiceFromPurchaseOrderAction` (en el dominio `InvoicePurchase`). Al crear la factura:
- Se asocia `invoice.purchase_order_id = purchase_order.id`
- La OC pasa a estado `COMPLETED`
- Los productos de la OC se copian como `invoice_product` con los precios de la OC

La ruta es `POST /invoices-purchase/from-order/{purchase_order}` — está en el controller de facturas de compra, no en el de órdenes de compra.

### 3.8 Edición de OC
`UpdatePurchaseOrderAction` permite editar la OC en cualquier estado (no valida estado). El controller requiere permiso `Editar Orden de Compra`. Los campos editables son los mismos que en creación: counterparty, date, expected_date, notes, items.

### 3.9 Cantidad como integer
La migración original usó `decimal(10,2)` para `quantity`, pero fue cambiada a `integer` (migración 2026-03-05). El modelo castea `quantity` a `integer`. No se admiten cantidades fraccionarias en OC.

---

## 4. Flujos Funcionales

### 4.1 Crear una Orden de Compra
1. Usuario navega a `GET /purchase-orders/create` → Controller carga provincias, márgenes, impuestos del tenant
2. Proveedores se cargan lazy (`Inertia::lazy`)
3. Usuario selecciona proveedor, fecha, productos y cantidades
4. `POST /purchase-orders` → `StorePurchaseOrderRequest` valida los datos
5. Controller llama: `GetCurrentTenantAction` → `GeneratePurchaseOrderNumberAction` → `CreatePurchaseOrderAction`
6. `CreatePurchaseOrderAction` (dentro de `DB::transaction`): crea `PurchaseOrder` con `status=DRAFT, total=0`, luego itera `items` creando cada `PurchaseOrderItem` y acumulando el total, finalmente actualiza `total` en la OC
7. Redirect a `purchase-orders.show` con flash `success`

### 4.2 Finalizar (enviar a aprobación)
1. En la pantalla de detalle, usuario hace `POST /purchase-orders/{id}/finalize`
2. `FinalizePurchaseOrderAction::execute(allowedTenantIds, purchaseOrder)`:
   - Verifica tenant access
   - Verifica `status === DRAFT`
   - Actualiza `status = PENDING_APPROVAL`
3. Flash `success: 'Orden de compra finalizada y enviada a aprobación.'`

### 4.3 Aprobar
1. Usuario con permiso `Aprobar Orden de Compra` hace `POST /purchase-orders/{id}/approve`
2. `ApprovePurchaseOrderAction`: verifica tenant + `status === PENDING_APPROVAL` → actualiza `status = APPROVED`

### 4.4 Rechazar
1. Usuario con permiso `Rechazar Orden de Compra` hace `POST /purchase-orders/{id}/reject` con `{ reason: "..." }`
2. Controller valida `reason` requerido
3. `RejectPurchaseOrderAction`: verifica tenant + `status === PENDING_APPROVAL` → actualiza `status = REJECTED` + `rejection_reason`

### 4.5 Revertir a borrador
1. `POST /purchase-orders/{id}/revert`
2. `RevertToDraftPurchaseOrderAction`: `status === PENDING_APPROVAL` → `status = DRAFT`
3. Útil si el solicitante necesita corregir la OC antes de reenviarla a aprobación

### 4.6 Descargar PDF
1. `GET /purchase-orders/{id}/download`
2. `GeneratePurchaseOrderPdfAction`: verifica tenant + status permitido (DRAFT/APPROVED/COMPLETED)
3. Carga relaciones: `counterparty.addresses.location.province`, `items.product`, `tenant.address.location.province`
4. `Pdf::loadView('pdfs.purchase-order', data)` → `setPaper('A4', 'portrait')` → guarda en R2
5. `Storage::download($path)`

### 4.7 Eliminar OC
1. `DELETE /purchase-orders/{id}` requiere permiso `Eliminar Orden de Compra`
2. `DeletePurchaseOrderAction`: verifica tenant → soft delete de la OC
3. Redirect a `purchase-orders.index`

### 4.8 Convertir a factura de compra (desde InvoicePurchase)
1. `POST /invoices-purchase/from-order/{purchase_order}` → `InvoicesPurchaseController::storeFromPurchaseOrder()`
2. `CreateInvoiceFromPurchaseOrderAction::execute($purchaseOrder)`
3. La OC pasa a `COMPLETED`; se crea la factura con `purchase_order_id` asociado

---

## 5. Integraciones con Otros Módulos

| Módulo | Tipo | Detalle |
|--------|------|---------|
| `11-clients-providers` | Consume | `Counterparty` como proveedor (`counterparty_id`); búsqueda lazy con `FindProvidersAction` |
| `07-products` | Consume | Items de la OC referencian `product_id`; búsqueda por nombre/barcode vía `GetAllProductsByNameAndBarcodeAction` |
| `02-tenant` | Consume | Multi-tenant: numeración por tenant, acceso por `tenant_id`, jerarquía con `GetTenantContextAction` |
| `16-invoice-purchase` | Expone | `CreateInvoiceFromPurchaseOrderAction` consume la OC para generar la factura de compra |

---

## 6. API / Endpoints

| Método | Path | Nombre de Ruta | Policy check | Descripción |
|--------|------|---------------|--------------|-------------|
| `GET` | `/purchase-orders` | `purchase-orders.index` | `viewAny(PurchaseOrder)` | Listado paginado (15 por página) con filtro de tenant |
| `GET` | `/purchase-orders/create` | `purchase-orders.create` | `create(PurchaseOrder)` | Formulario de creación |
| `POST` | `/purchase-orders` | `purchase-orders.store` | `create(PurchaseOrder)` | Crear OC; genera número automático |
| `GET` | `/purchase-orders/{id}` | `purchase-orders.show` | `view(purchaseOrder)` | Detalle de la OC |
| `PUT` | `/purchase-orders/{id}` | `purchase-orders.update` | `update(purchaseOrder)` | Actualizar OC |
| `DELETE` | `/purchase-orders/{id}` | `purchase-orders.destroy` | `delete(purchaseOrder)` | Eliminar OC (soft delete) |
| `POST` | `/purchase-orders/{id}/approve` | `purchase-orders.approve` | `approve(purchaseOrder)` | Aprobar OC pendiente |
| `POST` | `/purchase-orders/{id}/reject` | `purchase-orders.reject` | `reject(purchaseOrder)` | Rechazar OC; body: `{ reason }` |
| `POST` | `/purchase-orders/{id}/finalize` | `purchase-orders.finalize` | `update(purchaseOrder)` | Finalizar borrador → PENDING_APPROVAL |
| `POST` | `/purchase-orders/{id}/revert` | `purchase-orders.revert` | `revertToDraft(purchaseOrder)` | Devolver a borrador |
| `GET` | `/purchase-orders/{id}/download` | `purchase-orders.download` | `view(purchaseOrder)` | Descargar PDF |
| `GET` | `/purchase-orders/products/search` | `purchase-orders.products.search` | (ninguna) | Búsqueda de productos para agregar a OC |

### Permisos RBAC para OC
| Permiso | Descripción |
|---------|-------------|
| `Crear Orden de Compra` | Crear nueva OC |
| `Editar Orden de Compra` | Modificar OC existente |
| `Eliminar Orden de Compra` | Soft delete de OC |
| `Aprobar Orden de Compra` | Aprobar OC en PENDING_APPROVAL |
| `Rechazar Orden de Compra` | Rechazar OC con motivo |
| `Devolver Orden de Compra` | Revertir OC a DRAFT |
| `Gestionar Órdenes de Compra Sucursales` | Ver y gestionar OC de toda la jerarquía de tenants |

---

## 7. Consideraciones de Migración Next.js

### 7.1 Máquina de estados en el servidor
Las transiciones de estado deben implementarse como Route Handlers separados (igual que ahora), nunca como un PATCH genérico de estado. Cada transición tiene validación propia y efectos secundarios (ej: conversión a factura).

### 7.2 Numeración de OC — riesgo de concurrencia
La numeración actual usa `SELECT MAX(number) + 1` sin lock. En Next.js con múltiples instancias (Cloudflare Workers), el riesgo de colisión aumenta. Opciones:
- Usar una secuencia de PostgreSQL dedicada: `CREATE SEQUENCE purchase_order_number_seq`
- O usar `SELECT ... FOR UPDATE` con lock de fila en una tabla de contadores por tenant

### 7.3 Total persiste vs. calculado
A diferencia de `invoices`, el total de la OC está persisted. En Next.js, mantener esta decisión: calcular al crear/actualizar items y persistir en `purchase_orders.total`. No calcular on-the-fly para las OC.

### 7.4 PDF con DomPDF → Alternativa edge-compatible
DomPDF (PHP) no tiene equivalente directo en Cloudflare Workers. Opciones para v2.0:
- `@react-pdf/renderer` (Next.js RSC) para generar PDFs en el servidor
- Microservicio dedicado (Node.js + Puppeteer) como en la estrategia ARCA

### 7.5 Lazy loading de proveedores y ubicaciones
El controller usa `Inertia::lazy()` para proveedores y ubicaciones. En Next.js, implementar con streaming o suspense boundaries para la misma experiencia.

---

## 8. Mejoras Propuestas v2.0

### 8.1 Workflow de aprobación configurable
Actualmente hay un solo nivel de aprobación. v2.0: workflow multi-nivel configurable por tenant (ej: > $X requiere aprobación del gerente; > $Y requiere del CEO). Definido como reglas en la configuración del tenant.

### 8.2 Solicitud de cotización (RFQ) a múltiples proveedores
Enviar la misma OC a múltiples proveedores y comparar respuestas. El módulo genera un PDF de solicitud de cotización, el proveedor responde (manual o por portal), y el usuario elige la mejor oferta.

### 8.3 Portal de proveedores
El proveedor recibe la OC por email con un link de acceso (token seguro, sin login). Puede confirmar recepción, indicar fecha de entrega y cargar el remito electrónico. El estado de la OC se actualiza automáticamente.

### 8.4 Generación automática de OC desde stock mínimo
El `AgentInventarioPredictivo` (v2.0) crea borradores de OC automáticamente cuando el stock de un producto cae por debajo del mínimo configurado, seleccionando el proveedor habitual del producto.

### 8.5 Historial de precios por proveedor
Al agregar un producto a la OC, mostrar el historial de precios de ese producto con ese proveedor específico. Permite detectar aumentos y negociar mejor.

### 8.6 Recepción parcial de mercadería
Actualmente la conversión OC → factura es todo o nada. v2.0: marcar ítems como recibidos parcialmente, generando facturas de compra múltiples para la misma OC y actualizando las cantidades pendientes.
