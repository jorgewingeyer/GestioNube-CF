# Módulo 08 — Lotes (Batches)

> **Fase:** 2 — Operaciones Core  
> **Depende de:** 07-products, 02-tenant, 03-rbac  
> **Es requerido por:** 09-inventory, 10-stock-transfer, 13-invoice-sales, 16-invoice-purchase

---

## 1. Propósito y Alcance

El módulo de lotes gestiona los ingresos de mercadería al stock. Cada ingreso se identifica como un **lote** (`Batch`) con número de lote, fecha de vencimiento y código de barras opcional. La cantidad disponible de ese lote en cada sucursal vive en `BranchStock` — el lote en sí no tiene cantidad.

**Filosofía de diseño:**
- `Batch` es una entidad **global**: la crea un tenant pero puede ser recibida por otras sucursales vía transferencia
- `BranchStock` es la **source of truth del stock**: contiene la `quantity` real por sucursal
- Nunca se lee `batches.quantity` porque esa columna no existe — siempre se lee `branch_stocks.quantity`

**Quién lo usa:** responsables de depósito, compradores, administradores de stock.

**Alcance:**
- CRUD de lotes (alta, edición de metadata, ajuste de cantidad, baja)
- Ajuste manual de cantidad en un lote (correcciones de inventario)
- Descuento automático de stock al emitir facturas de venta
- Restauración de stock al anular facturas
- Estadísticas: lotes próximos a vencer, lotes agotados, lotes con stock crítico
- Exportación a Excel

---

## 2. Entidades de Datos

### 2.1 Tabla `batches`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `product_id` | bigint FK → products | cascade |
| `tenant_id` | bigint FK → tenants | Tenant que CREÓ el lote (origen) |
| `batch_number` | varchar | Ej: `"LOTE-2024-001"` — único solo por `product_id` |
| `barcode` | varchar | nullable — código de barras del lote |
| `expiration_date` | date | Fecha de vencimiento |
| `status` | enum `BatchStatus` | Calculado según stock y vencimiento |
| `deleted_at` | timestamp | Soft delete |

**No existe columna `quantity` en `batches`.**

### 2.2 Tabla `branch_stocks`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `tenant_id` | bigint FK → tenants | Sucursal que POSEE este stock |
| `batch_id` | bigint FK → batches | |
| `product_id` | bigint FK → products | Denormalizado para queries eficientes |
| `quantity` | integer | Stock actual — puede ser negativo |
| `deleted_at` | timestamp | Soft delete |

- Restricción única: `UNIQUE(tenant_id, batch_id)` — una sucursal tiene como máximo un registro por lote
- Índices: `(tenant_id, product_id)` y `(tenant_id, batch_id)`

### 2.3 Enum `BatchStatus`

```
ACTIVE        → lote con stock disponible (estado normal)
NEGATIVE      → stock negativo (permitido en ciertas operaciones)
EXPIRING_SOON → vence en menos de 30 días
EXPIRED       → fecha de vencimiento pasada
DELETED       → eliminado (soft delete)
DISABLED      → deshabilitado manualmente
DEPLETED      → stock = 0 (agotado)
```

---

## 3. Reglas de Negocio

### 3.1 Batch global, stock local

Un `Batch` se crea asociado a un tenant (el origen), pero su stock puede distribuirse a otros tenants mediante transferencias. Cada sucursal que recibe unidades del lote tiene su propio registro en `branch_stocks`.

```
Lote "LOTE-001" (producto X, creado por sucursal A)
  ├── branch_stocks(tenant_id=A, batch_id=1, qty=50) ← quedan 50 en sucursal A
  └── branch_stocks(tenant_id=B, batch_id=1, qty=20) ← 20 fueron transferidas a B
```

### 3.2 El stock puede ser negativo

`BatchStatus::NEGATIVE` existe como estado válido. El sistema no bloquea operaciones que llevan el stock por debajo de cero. Esto permite registrar salidas antes de confirmar el ingreso correspondiente.

### 3.3 `batch_number` único por producto, no globalmente

Un mismo `batch_number` puede existir en diferentes productos. La combinación `(product_id, batch_number)` es la clave de negocio. Al intentar crear un lote con `batch_number` ya existente para el mismo producto, `CreateBatchAction` devuelve el lote existente en lugar de crear uno nuevo.

### 3.4 Descuento de stock al facturar

Cuando una factura de venta se completa (`InvoiceStatus::ACCEPTED`), `UpdateBatchQuantitiesFromInvoiceAction` descuenta la cantidad de `branch_stocks` para cada ítem que tenga `invoice_product.batch_id != null`.

Al anular la factura, la misma Action con `$add=true` restaura el stock.

```php
// Descuento (emitir factura)
UpdateBatchQuantitiesFromInvoiceAction::execute($invoice, $add = false)

// Restauración (anular factura)
UpdateBatchQuantitiesFromInvoiceAction::execute($invoice, $add = true)
```

Si `invoice_product.batch_id` es null, no se afecta el stock (operación sin control de lote).

### 3.5 Cálculo del stock visible en el módulo

El inventario calcula el stock sumando `branch_stocks.quantity` de lotes en estados:
- `ACTIVE`, `NEGATIVE`, `EXPIRING_SOON`, `EXPIRED`

Los estados `DELETED` y `DISABLED` **no** se incluyen en el cálculo del stock visible.

### 3.6 Soft delete en cascada

Al hacer soft delete de un `Batch`, los registros de `BranchStock` asociados también se marcan con `deleted_at`. `CompleteStockTransferAction` verifica `withTrashed()` para restaurar registros eliminados si es necesario.

### 3.7 Batch especial `no_batch_stock`

Al crear un producto, `CreateProductAction` crea automáticamente un batch con `batch_number = 'no_batch_stock'` y un `BranchStock(quantity=0)`. Este batch actúa como contenedor para movimientos que no especifican lote. El usuario nunca lo ve directamente.

---

## 4. Flujos Funcionales

### 4.1 Crear un lote (ingreso de mercadería)

```
POST /batch
  │
  ├─ Validar: StoreBatchRequest
  │   ├─ product_id: required|exists:products,id
  │   ├─ batch_number: required|string|max:255
  │   ├─ barcode: nullable|string|max:255
  │   ├─ quantity: nullable|integer (default 0)
  │   └─ expiration_date: required|date
  │
  ├─ CreateBatchAction::execute()
  │   ├─ Buscar si ya existe: Batch.where(product_id, batch_number).first()
  │   ├─ Si no existe → crear nuevo Batch
  │   ├─ Buscar BranchStock(tenant_id=current, batch_id)
  │   ├─ Si existe → branchStock.increment('quantity', qty)
  │   ├─ Si no existe → BranchStock.create({tenant_id, batch_id, product_id, qty})
  │   └─ Registrar actividad
  │
  └─ Redirect a /batch con flash de éxito
```

### 4.2 Ajuste manual de cantidad

```
PUT /batch/{batch}/quantity
  │
  ├─ Validar nueva cantidad
  ├─ UpdateBatchQuantityAction
  │   ├─ Obtener BranchStock del tenant activo para este batch
  │   ├─ Actualizar quantity al nuevo valor (no incremento — reemplazo)
  │   └─ Registrar actividad de ajuste
  └─ Response JSON {success}
```

### 4.3 Descuento automático de stock por factura

```
[Evento: Invoice pasa a ACCEPTED]
  │
  ├─ UpdateBatchQuantitiesFromInvoiceAction::execute($invoice, add=false)
  │   ├─ Obtener invoice_products WHERE batch_id IS NOT NULL
  │   ├─ Para cada ítem:
  │   │   ├─ BranchStock.where(tenant_id=$invoice->tenant_id, batch_id=$item->batch_id)
  │   │   ├─ Si existe → branchStock.decrement('quantity', $item->quantity)
  │   │   └─ Si no existe y $add=true → BranchStock.create(...)
  │   └─ Registrar actividad solo si es restauración
```

### 4.4 Eliminar un lote

```
DELETE /batch/{batch}
  │
  ├─ BatchPolicy::delete() → checkTenant + 'Eliminar Lotes'
  ├─ DestroyBatchAction
  │   ├─ Registrar actividad de eliminación
  │   └─ $batch->delete() → soft delete en batches y branch_stocks asociados
  └─ Redirect con flash de éxito
```

### 4.5 Estadísticas de lotes (widget dashboard)

```
DashboardBatchAction::execute()
  ├─ Lotes próximos a vencer (< 30 días): count + lista
  ├─ Lotes vencidos con stock > 0: count + lista
  ├─ Lotes agotados (quantity = 0): count
  ├─ Lotes con stock negativo: count
  └─ Stock total del tenant (suma de branch_stocks)
```

---

## 5. Integraciones con Otros Módulos

| Módulo | Relación |
|--------|----------|
| **07-products** | `Batch.product_id` FK; al crear producto se crea batch vacío |
| **09-inventory** | Inventory lee `branch_stocks` + `batches` para mostrar el stock y sus movimientos |
| **10-stock-transfer** | `StockTransferItem.batch_id` FK; al transferir se deduce de `branch_stocks` del origen |
| **13-invoice-sales** | `invoice_product.batch_id`; al emitir/anular factura se ajusta `branch_stocks` |
| **16-invoice-purchase** | Al registrar factura de compra puede crear un nuevo lote o incrementar uno existente |
| **06-dashboard** | `DashboardBatchAction` provee estadísticas de alertas de vencimiento |

---

## 6. API / Endpoints

| Método | Path | Auth | Guard | Descripción |
|--------|------|------|-------|-------------|
| `GET` | `/batch` | auth | `can('Ver Lotes')` | Lista paginada de lotes con stock |
| `POST` | `/batch` | auth | `can('Crear Lotes')` | Crear lote + registrar cantidad |
| `GET` | `/batch/{batch}/edit` | auth | `can('Ver Lotes')` | Formulario de edición |
| `PUT` | `/batch/{batch}` | auth | `can('Actualizar Lotes')` | Actualizar metadata del lote |
| `PUT` | `/batch/{batch}/quantity` | auth | `can('Actualizar Lotes')` | Ajuste manual de cantidad |
| `DELETE` | `/batch/{batch}` | auth | `can('Eliminar Lotes')` | Soft delete del lote |
| `GET` | `/batch/download-excel` | auth | `can('Ver Lotes')` | Exportar lotes a Excel |

### Autorización (`BatchPolicy`)

```
viewAny  → 'Ver Lotes'
view     → 'Ver Lotes' + tenant check
create   → 'Crear Lotes'
update   → 'Actualizar Lotes' + tenant check
delete   → 'Eliminar Lotes' + tenant check
restore  → false (no implementado)
forceDelete → false
```

---

## 7. Consideraciones de Migración Next.js

### Source of truth sin ambigüedad

En v2.0 mantener la misma separación `Batch` (metadata) / `BranchStock` (cantidad). Con Drizzle:

```typescript
// Nunca leer batches.quantity (no existe)
// Siempre usar branch_stocks.quantity para el tenant activo
const stock = await db
  .select({ quantity: branchStocks.quantity })
  .from(branchStocks)
  .where(and(
    eq(branchStocks.tenantId, currentTenantId),
    eq(branchStocks.batchId, batchId)
  ))
  .limit(1)
```

### Descuento transaccional

La operación de descuento de stock al facturar debe ser atómica. En Next.js usar una transacción de BD:

```typescript
await db.transaction(async (tx) => {
  // 1. Verificar que la factura existe y tiene status correcto
  // 2. Para cada invoice_product con batch_id:
  //    UPDATE branch_stocks SET quantity = quantity - $qty
  //    WHERE tenant_id = $tenantId AND batch_id = $batchId
  // 3. Registrar actividad
})
```

### Validación de stock disponible

Actualmente el sistema permite stock negativo sin advertencia. En v2.0 agregar una validación configurable: si `branch_stocks.quantity - qty_facturada < 0`, mostrar un warning (no bloquear por defecto, pero configurable por tenant).

### Batch `no_batch_stock`

Este batch especial creado al dar de alta un producto debe mantenerse en v2.0. Identificarlo por `batch_number = 'no_batch_stock'` y excluirlo de las vistas de usuario pero usarlo como contenedor de stock sin lote asignado.

### Cloudflare D1 vs PostgreSQL

Las operaciones de ajuste de cantidad (`UPDATE branch_stocks SET quantity = quantity - X`) son seguras con D1 si se usan dentro de transacciones. Para volúmenes altos de concurrencia (múltiples facturas simultáneas), Hyperdrive + PostgreSQL es más robusto.

---

## 8. Mejoras Propuestas v2.0

### Validación de stock antes de facturar (configurable)

Agregar una configuración por tenant: `require_stock_on_invoice`. Si está activa, el sistema bloquea la emisión de una factura cuando el stock del lote seleccionado es insuficiente. Por defecto desactivada (comportamiento actual: permite negativos).

### Alertas de vencimiento con anticipación configurable

Los lotes en estado `EXPIRING_SOON` actualmente usan un umbral fijo de 30 días. En v2.0 hacer este umbral configurable por tenant (ej: 7, 15, 30, 60 días) y enviar una notificación automática al responsable de compras.

### FIFO automático en selección de lote en facturas

Al facturar un producto, sugerir automáticamente el lote más antiguo (por `expiration_date ASC`) para respetar FIFO y minimizar vencimientos. El usuario puede cambiar el lote sugerido.

### Predicción de agotamiento por IA (add-on IA)

Con el add-on de IA activo, analizar la velocidad de consumo de cada lote y predecir cuándo se agotará:

- "El lote LOTE-001 del producto X se agota en ~12 días a tu ritmo actual de ventas"
- "Quedan 8 días para que venza LOTE-003 y todavía tiene 45 unidades — considerá hacer una promoción"

La predicción usa la velocidad de rotación de los últimos 30/60/90 días calculada en el backend. El LLM solo interpreta y redacta el mensaje.

### Código QR en etiquetas de lote

Generar un QR o código de barras imprimible por lote, que al escanearse en la app abra directamente los detalles del lote (stock actual, vencimiento, movimientos recientes). Útil para control físico del depósito.

### Inventario físico (conteo cíclico)

Funcionalidad para realizar un inventario físico: el sistema congela el stock actual como referencia, el operador ingresa las cantidades reales contadas, y se generan los ajustes automáticamente con `ChangeType::PHYSICAL_COUNT`.
