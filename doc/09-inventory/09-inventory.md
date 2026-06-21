# Módulo 09 — Inventario

> **Fase:** 2 — Operaciones Core  
> **Depende de:** 08-batches, 07-products, 02-tenant, 03-rbac  
> **Es requerido por:** 06-dashboard (widget de alertas), 19-reports (predicción de compras)

---

## 1. Propósito y Alcance

El módulo de inventario es una **capa de visualización y análisis sobre los datos de lotes**. No tiene tablas propias: lee `batches` y `branch_stocks` (del módulo 08-batches) y los presenta de forma consolidada para el tenant activo.

**Filosofía de diseño:**
- Solo lectura — no crea ni modifica stock; eso lo hacen los módulos 08-batches, 13-invoice-sales y 16-invoice-purchase
- Cache de 2 minutos para la lista de productos cuando no hay filtros de fecha activos
- Un único permiso: "Ver Inventario" — no hay granularidad de acciones (todo el módulo o nada)

**Quién lo usa:** dueños, administradores, responsables de depósito y compras.

**Alcance:**
- Vista consolidada del stock por producto: suma de `branch_stocks.quantity` de todos los lotes del tenant
- Estadísticas de inventario: valor total, productos con stock bajo, productos sin stock, lotes por vencer
- Historial de movimientos por producto (derivado de la tabla `activities`)
- Filtrado por fecha, categoría y estado de stock
- Exportación a Excel: resumen y detallado
- Detalle de un producto específico: lotes activos, cantidades, fechas de vencimiento y movimientos recientes

---

## 2. Fuentes de Datos

El inventario no tiene tablas propias. Agrega desde:

| Sección | Tablas | Origen |
|---------|--------|--------|
| Lista de productos con stock | `products`, `branch_stocks`, `batches` | 07-products, 08-batches |
| Estadísticas de stock bajo/agotado | `branch_stocks`, `products` | 08-batches |
| Lotes próximos a vencer | `branch_stocks`, `batches` | 08-batches |
| Historial de movimientos | `activities` | Sistema de actividad |
| Categorías para filtros | `categories` | 07-products |

### Relación crítica: producto → lotes → stock

```
Product
  └── has many → Batch (via product_id)
                   └── has many → BranchStock (via batch_id)
                                    └── quantity ← AQUÍ ESTÁ EL STOCK
```

El stock de un producto = `SUM(branch_stocks.quantity)` donde `tenant_id = current_tenant` y el batch tiene status válido (`ACTIVE`, `NEGATIVE`, `EXPIRING_SOON`, `EXPIRED`). Los estados `DELETED` y `DISABLED` se excluyen del cálculo.

---

## 3. Reglas de Negocio

### 3.1 Umbral de stock — hardcodeado en 10 unidades

`InventoryCalculatorAction::determineStockStatus(int $currentStock)` clasifica el stock así:

```
=== 0   → 'out'   (sin stock)
< 10    → 'low'   (stock bajo)
>= 10   → 'healthy' (stock saludable)
```

El umbral de 10 unidades está hardcodeado. No es configurable por tenant ni por producto en la versión actual. Los campos `stock_minimum` y `stock_maximum` de `product_tenant` existen pero no se usan aquí — ver US-INV-09.

### 3.2 Caché de 2 minutos para la lista de productos

`GetAllInfoAction` usa caché cuando no hay filtros de fecha:

```php
// Clave: "inventory_products_{tenantId}"
// TTL: 120 segundos (el comentario del código dice "5 minutos" pero el valor real es 120s)
Cache::remember("inventory_products_{$tenantId}", 120, fn() => ...)
```

Al aplicar filtros de fecha (`date_from` / `date_to`), el caché se desactiva para garantizar datos precisos.

### 3.3 Valor total del inventario en centavos

`GetInventoryStatsAction` calcula el valor total como:

```
total_stock_value = SUM(branch_stocks.quantity × products.price_sell)
```

`price_sell` está en centavos → el resultado también está en centavos. La conversión a pesos la hace el frontend.

**Nota:** hay un bug potencial en `GetInventoryStatsAction::execute()` (no el `executeWithProducts`): multiplica `currentStock × price_sell` y luego aplica `× 100` a la suma total. Si `price_sell` ya está en centavos, el resultado estaría multiplicado por 100 de más. En producción se usa `executeWithProducts` (que no aplica el ×100), así que no afecta al usuario.

### 3.4 Movimientos derivados de `activities` — arquitectura JSON

El historial de movimientos de inventario **no tiene tabla propia**. Se construye leyendo `activities.data` (columna JSON) y transformando cada registro con `TransformActivityToMovementAction`.

#### Tipos de actividad rastreados para inventario

`GetProductMovementsAction::ACTIVITY_TYPES` define exactamente qué eventos se incluyen:

| `activity_type` | Trigger | Efecto en stock |
|----------------|---------|-----------------|
| `invoice_sale_completed` | Factura de venta completada | Descuenta stock por lote |
| `invoice_purchase_completed` | Factura de compra completada | Ingresa stock por lote |
| `invoice_remit_sale_completed` | Remito de venta completado | Descuenta stock |
| `invoice_remit_purchase_completed` | Remito de compra completado | Ingresa stock |
| `budget_completed` | Presupuesto convertido a factura | Descuenta stock |
| `batch_stock_restoration` | Anulación de factura de venta | Restaura stock (efecto positivo) |
| `batch_stock_adjustment_increase` | Ajuste manual positivo | Ingresa stock |
| `batch_stock_adjustment_decrease` | Ajuste manual negativo | Descuenta stock |

> `BATCH_STOCK_INCREASE` y `BATCH_STOCK_DEDUCTION` están **comentados** en el array — los movimientos de facturas se capturan via los tipos `INVOICE_*_COMPLETED` que ya incluyen el detalle completo.

#### Estructura del JSON en `activities.data`

El JSON no tiene un schema fijo — evolucionó con el tiempo y tiene dos formatos ("nuevo" y "legacy"). Los campos clave según tipo de actividad:

**Para `invoice_sale_completed` / `invoice_purchase_completed`:**
```json
{
  "invoice_metadata": {
    "invoice_id": 42,
    "invoice_number": "A-0001-00000123",
    "invoice_type": "sale_invoice"
  },
  "products_detail": [
    {
      "product_id": 15,
      "quantity_processed": 3,
      "batches_detail": [
        {
          "batch_id": 7,
          "batch_number": "LOTE-001",
          "quantity_before": 10,
          "quantity_after": 7,
          "quantity_deducted": 3,
          "expiration_date": "2025-12-31"
        }
      ]
    }
  ],
  "financial_summary": {
    "total_amount": 15000
  },
  "processing_summary": {
    "processing_direction": "decrease"   ← "increase" para compras
  }
}
```

**Para `batch_stock_adjustment_increase` / `_decrease` (ajuste manual):**
```json
{
  "operation": "batch_quantity_adjustment",
  "batch_data": {
    "id": 7,
    "product_id": 15,
    "batch_number": "LOTE-001"
  },
  "quantity_adjustment": {
    "original_quantity": 10,
    "final_quantity": 15,
    "difference": 5,
    "reason": "Corrección por inventario físico"
  }
}
```

**Para `batch_stock_restoration` (anulación de factura):**
```json
{
  "invoice_id": 42,
  "invoice_number": "A-0001-00000123",
  "products_detail": [
    {
      "product_id": 15,
      "total_quantity_restored": 3,
      "batches_detail": [
        {
          "batch_id": 7,
          "batch_number": "LOTE-001",
          "quantity_before": 7,
          "quantity_after": 10,
          "quantity_restored": 3
        }
      ]
    }
  ]
}
```

#### Cómo se extrae el `product_id` de cada actividad

`GetProductMovementsAction::extractProductIds()` busca el `product_id` en cuatro ubicaciones posibles del JSON (el schema evolucionó):
1. `data.product_id` (formato directo)
2. `data.batch_data.product_id` (ajustes manuales)
3. `data.products_detail[].product_id` (formato legacy)
4. `data.invoice_metadata.products_detail[].product_id` (formato nuevo)

#### Limitación crítica: filtrado en memoria PHP

`GetProductMovementsAction::getForProduct()` carga **todas las activities del tenant** en memoria y filtra por `product_id` en PHP, porque filtrar dentro del JSON en SQL es complejo e ineficiente. El comentario del código lo reconoce explícitamente:

> *"While fetching all might seem inefficient, filtering JSON in SQL can be slower and complex depending on the database engine and indexing. For a single tenant, this is usually acceptable."*

Esto escala mal cuando un tenant tiene miles de actividades — ver §8 para alternativas.

### 3.5 Descripción legible de movimientos

`MovementDescriptionAction::execute($movement)` genera el texto que ve el usuario. Prioriza el tipo de factura sobre el `activity_type`:

| Condición | Descripción generada |
|-----------|---------------------|
| `invoice.type = purchase_invoice` | `"Ingreso de mercadería: +N unidades (Lote: X) - Factura: #123"` |
| `invoice.type = sale_invoice` | `"Venta realizada: -N unidades (Lote: X) - Factura: #123"` |
| `invoice.type = sale_invoice_restored` | `"Restauración por eliminación de factura: +N unidades"` |
| `invoice.type = credit_note, qty > 0` | `"Nota de crédito - Devolución: +N unidades"` |
| `activity_type = batch_stock_adjustment_decrease` | `"Ajuste de stock (reducción): -N unidades - Razón: ..."` |
| `activity_type = batch_stock_adjustment_increase` | `"Ajuste de stock (aumento): +N unidades - Razón: ..."` |
| Varios lotes afectados | `"... (3 lotes afectados)"` en lugar del número de lote individual |

### 3.6 Cálculo de entradas y salidas totales

`InventoryCalculatorAction::calculateProductEntryExits($movements)` clasifica cada movimiento:

| Tipo de actividad / factura | Clasificación |
|-----------------------------|---------------|
| `purchase_invoice`, `remit_purchase` | Entrada |
| `sale_invoice`, `remit_sale` | Salida |
| `credit_note` con `quantity_changed > 0` | Entrada (devolución) |
| `credit_note` con `quantity_changed < 0` | Salida |
| `BATCH_STOCK_DEDUCTION`, `BATCH_STOCK_ADJUSTMENT_DECREASE` | Salida |
| `BATCH_STOCK_INCREASE`, `BATCH_STOCK_ADJUSTMENT_INCREASE` | Entrada |

### 3.6 Lotes próximos a vencer — umbral fijo de 30 días

`GetInventoryStatsAction::getAdditionalStats()` cuenta los `BranchStock` cuyo batch tiene:
- `status = ACTIVE`
- `expiration_date <= now() + 30 días`
- `expiration_date > now()`

El umbral de 30 días también está hardcodeado.

### 3.7 Solo un permiso para todo el módulo

`InventoryPolicy` solo implementa `index()`. No hay policies para `showProduct` o los exports. Todos comparten el mismo permiso "Ver Inventario" verificado al entrar al módulo.

---

## 4. Flujos Funcionales

### 4.1 Vista principal de inventario

```
GET /inventory?date_from=&date_to=
  │
  ├─ Middleware: auth + InventoryPolicy::index() → 'Ver Inventario'
  │
  ├─ GetAllInfoAction::execute($dateFrom, $dateTo)
  │   ├─ Si hay filtro de fecha:
  │   │   └─ GetProductsInventoryInfoAction::execute($tenantId, $from, $to) → directo a BD
  │   └─ Si no hay filtro:
  │       └─ Cache::remember("inventory_products_{id}", 120s) → GetProductsInventoryInfoAction
  │
  ├─ GetInventoryStatsAction::executeWithProducts($tenantId, $products)
  │   ├─ total_products: count
  │   ├─ total_stock_value: sum(stock_value)
  │   ├─ low_stock_products: count donde stock_status='low'
  │   ├─ out_of_stock_products: count donde stock_status='out'
  │   ├─ expiring_soon_batches: query a branch_stocks con batch activo en próx. 30 días
  │   └─ total_movements: count de activities relevantes
  │
  ├─ GetAllCategoryAction::execute() → árbol de categorías para filtros
  │
  └─ Inertia::render('inventory/inventory', {
        inventory_stats, products, categories, filters
     })
```

Datos que llegan al frontend por producto:
```
{
  id, name, category_name, image,
  current_stock,        // suma de branch_stocks.quantity
  stock_value,          // current_stock × price_sell (en centavos)
  stock_status,         // 'out' | 'low' | 'healthy'
  batches: [            // lotes activos del producto en este tenant
    { batch_number, expiration_date, status, quantity }
  ],
  total_entries,        // suma de entradas en el período filtrado
  total_exits,          // suma de salidas en el período filtrado
}
```

### 4.2 Detalle de un producto

```
GET /inventory/product/{productId}
  │
  ├─ GetProductInventoryDetailAction::execute($tenantId, $productId)
  │   ├─ Datos del producto (nombre, precio, imagen, categoría)
  │   ├─ Lotes activos para este tenant con stock actual
  │   ├─ Historial de movimientos → GetProductMovementsAction
  │   │   └─ Activities del producto → TransformActivityToMovementAction (cada una)
  │   │       └─ MovementDescriptionAction → texto legible del movimiento
  │   └─ Totales: entradas, salidas, stock actual
  │
  └─ Inertia::render('inventory/product-movements', { product })
```

### 4.3 Exportación a Excel

```
GET /inventory/export/summary?search=&category_id=&stock_status=&date_from=&date_to=
  └─ ExportInventorySummaryAction::execute($from, $to, $filters)
     → Excel con una fila por producto: nombre, categoría, stock, valor, entradas, salidas

GET /inventory/export/detailed?...mismos filtros...
  └─ ExportInventoryDetailedAction::execute($from, $to, $filters)
     → Excel con una fila por LOTE: producto, número de lote, vencimiento, stock, movimientos
```

Ambos exports son síncronos — generan el archivo directamente en la request sin cola.

---

## 5. Integraciones con Otros Módulos

| Módulo | Relación |
|--------|----------|
| **07-products** | Datos del producto (nombre, precio, categoría, imagen) |
| **08-batches** | Fuente del stock: `batches` + `branch_stocks` — el inventario los lee pero no los modifica |
| **13-invoice-sales** | Las facturas de venta generan actividades de `BATCH_STOCK_DEDUCTION` que aparecen como salidas en el historial |
| **16-invoice-purchase** | Las facturas de compra generan `BATCH_STOCK_INCREASE` — aparecen como entradas |
| **06-dashboard** | El dashboard usa `DashboardBatchAction` (del módulo 08-batches) para sus stats — el módulo de inventario no alimenta directamente el dashboard |
| **19-reports** | El reporte de predicción de compras usa velocidad de consumo derivada de los movimientos de inventario |

---

## 6. API / Endpoints

| Método | Path | Auth | Guard | Respuesta |
|--------|------|------|-------|-----------|
| `GET` | `/inventory` | auth | `InventoryPolicy::index` = `can('Ver Inventario')` | Inertia render |
| `GET` | `/inventory/product/{productId}` | auth | heredado de `can('Ver Inventario')` | Inertia render |
| `GET` | `/inventory/export/summary` | auth | heredado | Excel download |
| `GET` | `/inventory/export/detailed` | auth | heredado | Excel download |

**Nota de seguridad:** `showProduct` y los exports no tienen `can()` explícito en la ruta ni en la policy — heredan la protección del middleware `auth` pero no verifican el permiso "Ver Inventario" individualmente. Un usuario autenticado sin ese permiso podría acceder directamente a esas rutas por URL.

---

## 7. Consideraciones de Migración Next.js

### Server Component con datos agregados en SQL

En Next.js reemplazar el procesamiento en PHP por queries SQL eficientes:

```typescript
// En vez de cargar todos los productos y calcular en PHP:
const inventoryData = await db
  .select({
    productId: products.id,
    productName: products.name,
    currentStock: sql<number>`COALESCE(SUM(${branchStocks.quantity}), 0)`,
    stockValue: sql<number>`COALESCE(SUM(${branchStocks.quantity}) * ${products.priceSell}, 0)`,
  })
  .from(products)
  .leftJoin(branchStocks, and(
    eq(branchStocks.productId, products.id),
    eq(branchStocks.tenantId, currentTenantId)
  ))
  .leftJoin(batches, and(
    eq(batches.id, branchStocks.batchId),
    inArray(batches.status, ['active', 'negative', 'expiring_soon', 'expired'])
  ))
  .where(eq(products.tenantId, currentTenantId))
  .groupBy(products.id)
```

Esto es mucho más eficiente que el approach de Laravel de cargar todos los modelos en memoria.

### Caché con React `cache()` y Cloudflare KV

```typescript
// lib/inventory.ts
import { cache } from 'react'

export const getInventoryProducts = cache(async (tenantId: number) => {
  const cacheKey = `inventory:${tenantId}`
  const cached = await kv.get(cacheKey)
  if (cached) return JSON.parse(cached)
  
  const data = await computeInventory(tenantId)
  await kv.put(cacheKey, JSON.stringify(data), { expirationTtl: 120 })
  return data
})
```

Invalidar la caché cuando cambia un `branch_stocks` del tenant: evento `InventoryChanged` → `kv.delete('inventory:{tenantId}')`.

### Umbral de stock configurable

En v2.0 leer el umbral desde `product_tenant.stock_minimum` en vez de un valor fijo:

```typescript
const stockStatus = (qty: number, stockMin?: number) => {
  const threshold = stockMin ?? 10  // fallback al valor actual
  if (qty === 0) return 'out'
  if (qty < threshold) return 'low'
  return 'healthy'
}
```

### Historial de movimientos sin tabla `activities`

En v2.0 evaluar crear una tabla `inventory_movements` con estructura tipada en lugar de derivar movimientos de `activities.data` (JSON genérico). Más eficiente y más fácil de querier con filtros complejos.

### Corrección del bug de valor de inventario

El `GetInventoryStatsAction::execute()` tiene un `× 100` incorrecto en el cálculo de `total_stock_value`. En v2.0 calcular directamente en SQL: `SUM(branch_stocks.quantity × products.price_sell)` ya da el valor en centavos.

### Exports con streaming

Para inventarios grandes, los exports síncronos pueden timeout. En v2.0 usar streaming:
- Next.js Route Handler con `ReadableStream`
- Cloudflare R2 para almacenar temporalmente el Excel y entregar un link de descarga

---

## 8. Alternativas para el Historial de Movimientos de Inventario

El sistema actual usa `activities.data` (JSON polimórfico) como fuente de verdad del historial de movimientos. A continuación se analizan cuatro alternativas para v2.0, con sus pros, contras y recomendación.

---

### Alternativa A — Mantener `activities` con JSON indexado (mejora incremental)

**Descripción:** mantener la tabla `activities` pero agregar una columna `product_id` directa en ella y un índice compuesto `(tenant_id, product_id, activity_type)`.

**Cambios necesarios:**
- Agregar `product_id` como columna nullable en `activities`
- Poblarla al registrar cada actividad de inventario
- Eliminar el filtrado en memoria — la query filtra por `product_id` directamente en SQL

```sql
-- Índice propuesto
CREATE INDEX activities_inventory_idx ON activities(tenant_id, product_id, activity_type, created_at DESC);
```

**Pros:**
- Migración mínima — no cambia la arquitectura
- El JSON sigue disponible para datos extra (lotes afectados, cantidades antes/después)
- Compatible con el sistema de auditoría existente

**Contras:**
- El JSON interno sigue siendo frágil y sin schema fijo
- Agregar filtros sobre campos dentro del JSON sigue siendo costoso
- Dos fuentes de datos para el mismo dato (`product_id` en JSON y en columna)

**Recomendación:** válido como solución de corto plazo si la migración a Next.js no es inmediata.

---

### Alternativa B — Tabla dedicada `inventory_movements` ⭐ (recomendada para v2.0)

**Descripción:** crear una tabla tipada específica para movimientos de inventario. Las actividades de facturas/ajustes escriben en ella al mismo tiempo que en `activities`.

```sql
CREATE TABLE inventory_movements (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES tenants(id),
  product_id      BIGINT NOT NULL REFERENCES products(id),
  batch_id        BIGINT REFERENCES batches(id),
  movement_type   VARCHAR(50) NOT NULL,  -- 'sale', 'purchase', 'adjustment', 'transfer', 'restoration', 'credit_note'
  direction       VARCHAR(10) NOT NULL,  -- 'in' | 'out'
  quantity        INTEGER NOT NULL,      -- siempre positivo
  quantity_before INTEGER,
  quantity_after  INTEGER,
  reference_type  VARCHAR(50),           -- 'invoice', 'stock_transfer', 'manual'
  reference_id    BIGINT,               -- FK polimórfica al documento origen
  reference_number VARCHAR(100),         -- ej: "A-0001-00000123"
  user_id         BIGINT REFERENCES users(id),
  notes           TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  INDEX (tenant_id, product_id, created_at DESC),
  INDEX (tenant_id, batch_id),
  INDEX (reference_type, reference_id)
);
```

**Cómo se alimenta:**
- Al completar una factura de venta → INSERT en `inventory_movements` por cada `invoice_product` con `batch_id`
- Al completar una factura de compra → INSERT con `direction='in'`
- Al hacer ajuste manual de cantidad → INSERT con `movement_type='adjustment'`
- Al anular una factura → INSERT con `direction='in'` y `movement_type='restoration'`
- Al completar una transferencia → dos INSERTs: uno `direction='out'` en origen, uno `direction='in'` en destino

**Pros:**
- Queries eficientes con índices tipados — sin JSON en hot paths
- Schema rígido = imposible que falte un campo por cambio de formato
- Fácil de agregar en SQL: `SUM(quantity) WHERE direction='in'` para entradas totales
- Permite filtrar por tipo de movimiento, rango de fechas, lote, factura directamente en SQL
- Base para exportes rápidos y reportes de rotación

**Contras:**
- Requiere migración y backfill de datos históricos desde `activities`
- Duplica información con `activities` (solución: dejar `activities` solo para auditoría no-inventario)
- Más código de escritura (cada módulo que afecta stock debe escribir aquí)

**Recomendación: esta es la alternativa óptima para v2.0.** La tabla `activities` pasa a ser solo log de auditoría general; `inventory_movements` es la fuente de verdad del historial de stock.

---

### Alternativa C — Derivar movimientos desde tablas fuente

**Descripción:** en lugar de un log, calcular los movimientos en tiempo real haciendo JOINs entre `invoice_product`, `branch_stocks`, `stock_transfer_items` y las tablas de ajustes.

```typescript
// Ejemplo en Drizzle
const movements = await db
  .select({
    date: invoices.invoiceDate,
    type: sql`'sale'`,
    direction: sql`'out'`,
    quantity: invoiceProduct.quantity,
    reference: invoices.invoiceNumber,
  })
  .from(invoiceProduct)
  .innerJoin(invoices, eq(invoices.id, invoiceProduct.invoiceId))
  .where(and(
    eq(invoiceProduct.productId, productId),
    eq(invoices.tenantId, tenantId),
    inArray(invoices.invoiceType, ['sale_invoice', 'remit_sale'])
  ))
  // UNION con compras, ajustes, transferencias...
```

**Pros:**
- No hay datos duplicados — siempre de la fuente de verdad
- Retroactivo: muestra todo el historial sin necesidad de backfill

**Contras:**
- UNION de 5-6 tablas por cada consulta — costoso para volúmenes altos
- Si se anula una factura, hay que inferir el tipo de movimiento por el estado de la factura
- Difícil de paginar eficientemente
- Las transferencias y ajustes manuales no tienen una tabla unificada

**Recomendación:** útil para reportes puntuales, no como base del historial en tiempo real.

---

### Alternativa D — Event Sourcing con tabla de eventos tipados

**Descripción:** cada acción que afecta el stock emite un evento tipado con payload estructurado. Una proyección materializada (`inventory_snapshots`) mantiene el stock actual.

```typescript
// Event store
type InventoryEvent =
  | { type: 'StockAdded';      productId: number; batchId: number; qty: number; source: 'purchase' | 'adjustment'; refId: number }
  | { type: 'StockRemoved';    productId: number; batchId: number; qty: number; source: 'sale' | 'adjustment'; refId: number }
  | { type: 'StockTransferred'; productId: number; batchId: number; qty: number; fromTenant: number; toTenant: number }
  | { type: 'StockRestored';   productId: number; batchId: number; qty: number; refId: number }
```

**Pros:**
- Historial completo e inmutable — nunca se pierde información
- Permite reconstruir el estado del stock en cualquier punto del pasado
- Desacoplado: los módulos emiten eventos, el inventario los consume

**Contras:**
- Complejidad arquitectónica alta — event sourcing requiere un patrón de diseño consistente en todos los módulos
- Overhead operativo: mantener proyecciones actualizadas
- Sobrediseño para el problema actual (las necesidades son relativamente simples)

**Recomendación:** solo si el sistema va a soportar auditorías regulatorias estrictas o reconstitución de estado histórico. Para GestioNube v2.0 es más de lo necesario.

---

### Decisión recomendada para v2.0

**Implementar Alternativa B** (`inventory_movements`) por su balance óptimo entre simplicidad y eficiencia:

1. En la migración a Next.js, al re-implementar los módulos de facturas y ajustes, cada acción que afecte `branch_stocks` también inserta en `inventory_movements`
2. La tabla `activities` se mantiene para auditoría general (acciones de usuario, cambios de configuración), pero NO como fuente de movimientos de inventario
3. Hacer backfill de `inventory_movements` desde `activities` historicas como paso de migración

---

## 9. Otras Mejoras Propuestas v2.0

### Umbral de stock bajo configurable por producto

Usar `product_tenant.stock_minimum` (ya existe en BD) como umbral en lugar del fijo de 10 unidades.

### Vista de inventario consolidada multi-sucursal

Para usuarios con "Ver Facturas Sucursales": columnas por sucursal (`Sucursal A | B | Total`) en la lista de inventario.

### Calculadora de rotación de inventario

Agregar métrica `ventas_período / stock_promedio` para identificar productos de alta/baja rotación.

### Inventario en tiempo real por invalidación de caché

En lugar de TTL fijo de 2 minutos: invalidar la caché exactamente cuando cambia un `branch_stocks` del tenant (`InventoryChanged` event → `kv.delete('inventory:{tenantId}')`).

### Predicción de agotamiento por IA (add-on IA)

Con el add-on activo: días estimados hasta agotamiento por producto, recomendación de cantidad a pedir, identificación de productos sin movimiento en 60+ días.

### Mapa de depósito

Campo `Batch.location` (ej: "Estante A3, Fila 2") para filtrar y ordenar por ubicación física. Útil para picking y control de depósito.
