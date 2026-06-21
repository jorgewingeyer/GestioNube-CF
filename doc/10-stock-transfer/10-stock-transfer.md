# Módulo 10 — Transferencias de Stock entre Sucursales

> **Fase:** 2 — Operaciones Core  
> **Depende de:** 08-batches, 02-tenant, 03-rbac  
> **Es requerido por:** 09-inventory (movimientos de transferencia)

---

## 1. Propósito y Alcance

El módulo permite mover stock de lotes entre sucursales de la misma empresa (jerarquía tenant padre-hijos). La sucursal de **origen** deduce el stock al crear la transferencia; la sucursal de **destino** lo recibe al completarla.

**Quién lo usa:** responsables de depósito, administradores con acceso a múltiples sucursales.

**Feature flag:** el módulo está protegido por `TenantFeature::isEnabled($tenantId, 'transferencias')`. Si el feature está deshabilitado, las rutas devuelven 403.

**Alcance:**
- Crear una solicitud de transferencia (ítems de lotes con cantidad)
- Listar transferencias donde el tenant es origen o destino
- Completar una transferencia (acreditar stock en destino)
- Cancelar una transferencia (revertir la deducción en origen)

---

## 2. Entidades de Datos

### 2.1 Tabla `stock_transfers`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `source_tenant_id` | bigint FK → tenants | Sucursal que envía el stock |
| `destination_tenant_id` | bigint FK → tenants | Sucursal que recibe el stock |
| `status` | varchar | Enum `StockTransferStatus` |
| `initiated_by` | bigint FK → users | Usuario que creó la transferencia (columna renombrada de `user_id` en migración 2026-03-15) |
| `received_by` | bigint FK → users nullable | Usuario que completó o canceló la recepción |
| `notes` | text nullable | Observaciones libres |
| `completed_at` | timestamp nullable | Momento en que se completó |
| `deleted_at` | timestamp nullable | Soft delete |
| `created_at` / `updated_at` | timestamps | |

### 2.2 Tabla `stock_transfer_items`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `stock_transfer_id` | bigint FK → stock_transfers | cascade |
| `product_id` | bigint FK → products | Denormalizado para queries |
| `batch_id` | bigint FK → batches nullable | Lote específico a transferir |
| `quantity` | integer | Unidades a transferir |
| `source_quantity_before` | integer | Stock en origen ANTES de deducir (snapshot) |
| `source_quantity_after` | integer | Stock en origen DESPUÉS de deducir (snapshot) |
| `dest_quantity_before` | integer nullable | Stock en destino ANTES de acreditar (se guarda al completar) |
| `dest_quantity_after` | integer nullable | Stock en destino DESPUÉS de acreditar (se guarda al completar) |

Los snapshots de cantidad permiten auditar el estado del stock en cada punto del proceso sin necesidad de consultar `branch_stocks` histórico.

### 2.3 Enum `StockTransferStatus`

```
PENDING     → Creada y reservada (stock deducido del origen, no llegó al destino todavía)
IN_TRANSIT  → En tránsito (estado intermedio disponible, no usado en el flujo actual MVP)
COMPLETED   → Recibida y acreditada en destino
CANCELLED   → Cancelada (stock revertido al origen)
```

El flujo actual del MVP usa solo `PENDING → COMPLETED` o `PENDING → CANCELLED`. El estado `IN_TRANSIT` existe en el enum pero no se asigna automáticamente en ninguna acción.

---

## 3. Reglas de Negocio

### 3.1 Solo entre tenants de la misma jerarquía

Las transferencias solo son posibles entre un tenant y sus sucursales (mismo `parent_id`). `GetTransferDestinationsAction` devuelve todos los tenants de la misma raíz (`parent_id ?? id`) excluyendo al tenant actual.

```php
// Tenants elegibles como destino:
Tenant::where('id', $rootId)
    ->orWhere('parent_id', $rootId)
    ->where('id', '!=', $tenantId)
```

Si la empresa no tiene sucursales hijas ni padre, la lista de destinos estará vacía y no puede crear transferencias.

### 3.2 El stock se deduce en origen al CREAR (no al completar)

Al llamar `CreateStockTransferAction`, el stock se deduce de `branch_stocks` del tenant de origen **inmediatamente**, antes de que el destino lo confirme. Esto reserva las unidades y previene que se facturen mientras están en tránsito.

Si la transferencia se cancela, `CancelStockTransferAction` devuelve el stock al origen mediante `increment('quantity', $item->quantity)`.

### 3.3 Validación de stock disponible ANTES de crear

`CreateStockTransferAction` valida `$stock->quantity >= $item['quantity']` antes de deducir. Si el stock es insuficiente, lanza una `Exception` con el nombre del producto y lote, y se hace rollback de toda la transacción.

```php
if ($stock->quantity < $item['quantity']) {
    throw new Exception("Stock insuficiente en el lote {$batchNumber}. Disponible: {$stock->quantity}, Solicitado: {$item['quantity']}");
}
```

Nota: a diferencia de las facturas, las transferencias **sí** bloquean si no hay stock suficiente.

### 3.4 Solo se pueden transferir lotes propios del tenant origen

`GetAvailableProductsForTransferAction` devuelve solo productos con `branch_stocks.quantity > 0` y `tenant_id = currentTenant`. El usuario no puede seleccionar lotes de otras sucursales para enviar.

### 3.5 Al completar: se adopta el producto en el destino

`CompleteStockTransferAction` ejecuta `$destinationTenant->associatedProducts()->syncWithoutDetaching([$item->product_id])` para asegurar que el producto esté en el catálogo del tenant destino (si no estaba previamente).

### 3.6 Manejo de batch eliminado en cancel/complete

Si un lote fue soft-deleted entre que se creó y se completó/canceló la transferencia, las acciones usan `Batch::withTrashed()->find()` y `BranchStock::withTrashed()->first()`. Al encontrar un `BranchStock` con `deleted_at`, lo restauran antes de incrementar la cantidad.

### 3.7 No hay política dedicada (StockTransferPolicy no existe)

El acceso está protegido únicamente por el middleware `feature:transferencias` a nivel de ruta. No hay `StockTransferPolicy` ni guards de permiso RBAC individuales para crear/completar/cancelar. Cualquier usuario autenticado del tenant con el feature activo puede realizar todas las operaciones.

### 3.8 Visibilidad de transferencias

`GetStockTransfersAction` muestra todas las transferencias donde el tenant es origen O destino, basado en la jerarquía completa del tenant:

```php
$rootId = $currentTenant->parent_id ?? $currentTenant->id;
$allowedTenantIds = Tenant::where('id', $rootId)->orWhere('parent_id', $rootId)->pluck('id');

StockTransfer::whereIn('source_tenant_id', $allowedTenantIds)
    ->orWhereIn('destination_tenant_id', $allowedTenantIds)
```

Un usuario en la empresa raíz ve TODAS las transferencias del grupo. Un usuario en una sucursal ve solo las de su sucursal.

---

## 4. Flujos Funcionales

### 4.1 Crear una transferencia

```
GET /stock-transfers/create
  │
  ├─ GetTransferDestinationsAction → tenants hermanos/padre
  └─ GetAvailableProductsForTransferAction → productos con stock > 0 (con lotes)

POST /stock-transfers
  │
  ├─ Validar:
  │   ├─ destination_tenant_id: required|exists:tenants,id
  │   ├─ notes: nullable|string
  │   └─ items[]: [{product_id, batch_id, quantity}]
  │
  ├─ CreateStockTransferAction (dentro de DB::transaction)
  │   ├─ StockTransfer::create({source, dest, status=PENDING, initiated_by=Auth::id()})
  │   ├─ Por cada ítem:
  │   │   ├─ BranchStock.where(tenant=origen, batch_id).lockForUpdate()
  │   │   ├─ Si no existe → throw Exception
  │   │   ├─ Si product_id no coincide → throw Exception
  │   │   ├─ Si quantity < solicitada → throw Exception (con nombre de producto y lote)
  │   │   ├─ StockTransferItem::create({..., source_quantity_before, source_quantity_after})
  │   │   └─ BranchStock.decrement('quantity', qty) ← stock deducido aquí
  │   └─ return $transfer
  │
  └─ Redirect a stock-transfers.index con flash 'success'
```

Si cualquier ítem falla la validación → rollback total (no se crea nada).

### 4.2 Completar una transferencia (recibir en destino)

```
POST /stock-transfers/{transfer}/complete
  │
  ├─ CompleteStockTransferAction (dentro de DB::transaction)
  │   ├─ Verificar: status != COMPLETED y != CANCELLED
  │   ├─ Por cada ítem:
  │   │   ├─ Asociar producto al destino: syncWithoutDetaching()
  │   │   ├─ Batch::withTrashed()->find($item->batch_id) ← tolera batch eliminado
  │   │   ├─ BranchStock::withTrashed()->where(tenant=dest, batch_id)
  │   │   ├─ Si existe y estaba eliminado → restore() + increment()
  │   │   ├─ Si existe y activo → increment('quantity', qty)
  │   │   ├─ Si no existe → BranchStock::create({tenant=dest, batch_id, product_id, qty})
  │   │   └─ $item->update({dest_quantity_before, dest_quantity_after}) ← snapshot guardado
  │   └─ $transfer->update({status=COMPLETED, completed_at=now(), received_by=Auth::id()})
  │
  └─ Redirect back con flash 'success'
```

### 4.3 Cancelar una transferencia

```
POST /stock-transfers/{transfer}/cancel
  │
  ├─ CancelStockTransferAction (dentro de DB::transaction)
  │   ├─ Verificar: status != COMPLETED y != CANCELLED
  │   ├─ Por cada ítem:
  │   │   ├─ Batch::withTrashed()->find($item->batch_id)
  │   │   ├─ Si no se encuentra batch (ni en trash) → Log::error + continue ← stock perdido
  │   │   ├─ BranchStock::withTrashed()->where(tenant=origen, batch_id)
  │   │   ├─ Si existe y eliminado → restore() + increment()
  │   │   ├─ Si existe y activo → increment('quantity', qty) ← devolver stock
  │   │   └─ Si no existe → BranchStock::create({tenant=origen, batch_id, product_id, qty})
  │   └─ $transfer->update({status=CANCELLED, received_by=Auth::id() si es del destino})
  │
  └─ Redirect back con flash 'success'
```

**Bug potencial:** si el `Batch` no se encuentra ni con `withTrashed()`, el ítem se saltea con `continue` y el stock de esas unidades se pierde permanentemente. Hay un `Log::error` registrando el evento pero no hay compensación.

### 4.4 Ver historial de transferencias de un lote

`GetStockTransfersForBatchAction::execute($batchId)` devuelve todas las transferencias que contengan un ítem con ese `batch_id`. Se usa en la pantalla de detalle de lote para mostrar el historial de movimientos inter-sucursal.

---

## 5. Integraciones con Otros Módulos

| Módulo | Relación |
|--------|----------|
| **08-batches** | `StockTransferItem.batch_id` FK a `batches`; al crear transferencia se lee `branch_stocks` del lote |
| **02-tenant** | Las transferencias solo ocurren entre tenants de la misma jerarquía |
| **09-inventory** | El módulo de inventario puede mostrar transferencias como movimientos de stock (actualmente no integrado — las actividades de transferencia no están en `ACTIVITY_TYPES` de `GetProductMovementsAction`) |
| **07-products** | Al completar, el producto se adopta automáticamente en el catálogo del tenant destino |

**Importante:** las transferencias de stock **no generan una actividad** en la tabla `activities`. Esto significa que el historial de movimientos de inventario (módulo 09) no incluye transferencias. Es una limitación conocida del sistema actual.

---

## 6. API / Endpoints

| Método | Path | Nombre | Descripción |
|--------|------|---------|-------------|
| `GET` | `/stock-transfers` | `stock-transfers.index` | Lista paginada (10 por página) de todas las transferencias del grupo |
| `GET` | `/stock-transfers/create` | `stock-transfers.create` | Formulario de nueva transferencia (con destinos y productos disponibles) |
| `POST` | `/stock-transfers` | `stock-transfers.store` | Crear transferencia y deducir stock del origen |
| `POST` | `/stock-transfers/{transfer}/complete` | `stock-transfers.complete` | Acreditar stock en destino y cerrar la transferencia |
| `POST` | `/stock-transfers/{transfer}/cancel` | `stock-transfers.cancel` | Revertir la deducción en origen y cancelar |

Todas las rutas están dentro del grupo `middleware('feature:transferencias')`.

### Páginas React

| Componente | Ruta | Descripción |
|-----------|------|-------------|
| `stock-transfer/index` | `/stock-transfers` | Lista con estado, origen, destino, usuario e ítems |
| `stock-transfer/create` | `/stock-transfers/create` | Formulario multi-ítem con selector de destino, producto y lote |

---

## 7. Consideraciones de Migración Next.js

### Transacciones y locks

La operación de crear una transferencia usa `SELECT ... FOR UPDATE` sobre `branch_stocks`. En Next.js con Drizzle + PostgreSQL:

```typescript
await db.transaction(async (tx) => {
  const stock = await tx
    .select()
    .from(branchStocks)
    .where(and(eq(branchStocks.tenantId, sourceTenantId), eq(branchStocks.batchId, batchId)))
    .for('update')
    .limit(1);

  if (!stock[0] || stock[0].quantity < requestedQty) {
    throw new Error(`Stock insuficiente en lote ${batchNumber}`);
  }

  await tx.update(branchStocks)
    .set({ quantity: sql`${branchStocks.quantity} - ${requestedQty}` })
    .where(and(eq(branchStocks.tenantId, sourceTenantId), eq(branchStocks.batchId, batchId)));
});
```

Con Cloudflare D1 no hay soporte de `SELECT FOR UPDATE`. Si se migra a D1, usar serialización de transacciones o un lock optimista con check de versión.

### Feature flag en middleware

El middleware `feature:transferencias` en Laravel mapea a una verificación de `tenant_features`. En Next.js implementar como middleware de ruta:

```typescript
// middleware.ts
if (path.startsWith('/stock-transfers')) {
  const isEnabled = await isFeatureEnabled(tenantId, 'transferencias');
  if (!isEnabled) return NextResponse.json({ error: 'Feature no habilitado' }, { status: 403 });
}
```

### Flujo de dos pasos (crear → completar)

El status `IN_TRANSIT` existe en el enum pero no se usa. En v2.0 considerar un flujo explícito de tres estados: `PENDING → IN_TRANSIT → COMPLETED`, donde el origen marca "enviado" (IN_TRANSIT) y el destino marca "recibido" (COMPLETED). Esto permitiría un handshake más claro entre sucursales.

### Integrar transferencias en el historial de movimientos

Actualmente las transferencias no generan actividad. En v2.0 (con la tabla `inventory_movements` propuesta en módulo 09), al crear una transferencia insertar:
- `direction='out'`, `movement_type='transfer'`, `reference_type='stock_transfer'`, `reference_id=transfer.id` en el tenant de origen
- `direction='in'`, `movement_type='transfer'`, `reference_type='stock_transfer'`, `reference_id=transfer.id` en el tenant de destino (al completar)

### Bug: stock perdido si batch no existe al cancelar

Si el `Batch` fue hard-deleted (no existe ni en `withTrashed()`), `CancelStockTransferAction` saltea ese ítem y el stock se pierde. En v2.0 usar FKs que impidan hard-delete de batches referenciados en transferencias pendientes, o lanzar una excepción en lugar de `continue`.

---

## 8. Mejoras Propuestas v2.0

### Flujo de tres estados con handshake explícito

Actualmente el origen crea y el destino completa en un solo click. Para operaciones reales de logística, un flujo `PENDING → IN_TRANSIT → COMPLETED` aclara quién hizo qué:
- Origen crea → `PENDING` (stock reservado)
- Origen confirma envío → `IN_TRANSIT` (mercadería en camino)
- Destino confirma recepción → `COMPLETED` (stock acreditado)

Esto permite distinguir "pedí el envío" de "ya salió físicamente".

### RBAC específico para transferencias

Actualmente no hay permisos RBAC granulares — el feature flag es todo-o-nada. En v2.0 agregar permisos:
- `"Crear Transferencias"` — puede iniciar una transferencia
- `"Completar Transferencias"` — puede confirmar la recepción
- `"Cancelar Transferencias"` — puede revertir

Esto permite, por ejemplo, que un depósito origine la solicitud y solo el jefe de sucursal la confirme.

### Notificación a la sucursal destino

Al crear una transferencia, enviar una notificación in-app (y opcionalmente email) a los usuarios de la sucursal destino: "La sucursal X te envió N unidades del lote L-001 del producto Y. Confirmá la recepción cuando llegue."

### QR de bulto para tracking físico

Generar un PDF con QR al crear la transferencia. Al escanear el QR en el destino, la app abre directamente la pantalla de confirmación de esa transferencia.

### Registro en historial de movimientos de inventario

Integrar las transferencias como movimientos en el historial del módulo 09 (Alternativa B — tabla `inventory_movements`):
- Origen ve: `-N unidades | Transferencia enviada a Sucursal B`
- Destino ve: `+N unidades | Transferencia recibida de Sucursal A`

### Validación de capacidad máxima en destino

Si el producto tiene `product_tenant.stock_maximum` configurado en el tenant destino, validar que la cantidad transferida no exceda ese máximo. Aviso configurable: solo advertencia o bloqueo.
