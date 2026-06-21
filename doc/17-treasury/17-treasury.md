# Módulo 17: Tesorería

> **Dominio:** `treasury`  
> **Fase:** 4 — Finanzas y Reportes  
> **Depende de:** 11-clients-providers, 13-invoice-sales, 16-invoice-purchase, 02-tenant, 03-rbac  
> **Expone hacia:** 18-cashier (movimientos de caja vinculados a transacciones)

---

## 1. Propósito y Alcance

El módulo de Tesorería registra todos los movimientos de dinero de la empresa: cobros a clientes, pagos a proveedores y compensaciones de saldo. Cada transacción puede estar vinculada a una o más facturas (distribuida inteligentemente) y a uno o más medios de pago. Soporta saldo a favor, notas de crédito como medio de pago y compensación automática o manual de saldos.

**Tipos de operación:**
- **Cobro** (`collection`) — dinero recibido de un cliente
- **Pago** (`payment`) — dinero pagado a un proveedor
- **Compensación** (`compensation`) — aplicación de notas de crédito contra facturas pendientes, sin movimiento de caja

El dashboard de tesorería muestra métricas en tiempo real con caché Redis.

---

## 2. Entidades de Datos

### `transactions`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `counterparty_id` | bigint FK → counterparties | Cliente o proveedor |
| `tenant_id` | bigint FK → tenants | Tenant donde se registra |
| `number` | integer | Talonario secuencial por tenant (1, 2, 3…); campo de display |
| `type` | varchar | Enum: `payment | collection | compensation` |
| `status` | varchar | `pending | paid | cancelled | anulled` (default: `paid`) |
| `amount` | integer (centavos) | Monto total de la transacción |
| `operation_date` | date | Fecha de la operación |
| `description` | varchar nullable | Observación libre |
| `created_at` / `updated_at` | timestamp | |

> **Nota:** `transactions` NO tiene `deleted_at`. Las transacciones no se eliminan — se anulan cambiando `status = anulled`.

### `payment_types`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `tenant_id` | bigint FK → tenants | |
| `name` | varchar | Ej: "Efectivo", "Transferencia", "Cheque", etc. |
| `is_cash` | boolean | Si representa efectivo físico (vinculado a caja) |
| `deleted_at` | timestamp nullable | Soft delete |
| `created_at` / `updated_at` | timestamp | |

### `payment_type_transaction` (pivot)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `payment_type_id` | bigint FK → payment_types | |
| `transaction_id` | bigint FK → transactions | |
| `amount` | integer (centavos) | Monto pagado con este medio |
| `currency` | varchar (default ARS) | |
| `payment_reference` | varchar nullable | Número de transferencia, cheque, etc. |
| `origin` | bigint nullable | Ver §3.4 — uso polimórfico |
| `created_at` / `updated_at` | timestamp | |

### `invoice_transaction` (pivot)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `invoice_id` | bigint FK → invoices | Factura imputada |
| `transaction_id` | bigint FK → transactions | |
| `amount` | integer (centavos) | Monto imputado a esta factura específica |
| `currency` | varchar (default ARS) | |
| `created_at` / `updated_at` | timestamp | |

### `tenant_transaction` (pivot)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `tenant_id` | bigint FK → tenants | |
| `transaction_id` | bigint FK → transactions | |
| `created_at` / `updated_at` | timestamp | |

> Este pivot permite que una transacción quede asociada a múltiples tenants (para jerarquías padre-hijo). `AttachTenantToTransactionPipe` lo gestiona.

---

## 3. Reglas de Negocio

### 3.1 Tipos de transacción
| Tipo | Dirección | Uso |
|------|-----------|-----|
| `collection` | Cliente → Empresa | Cobros: el cliente paga una o más facturas de venta |
| `payment` | Empresa → Proveedor | Pagos: la empresa paga facturas de compra al proveedor |
| `compensation` | Sin movimiento de caja | Aplica notas de crédito contra facturas pendientes |

### 3.2 Numeración de talonario (integer secuencial)
`generateTransactionNumber(tenantId)`: `MAX(number) + 1` por tenant. Si no hay transacciones previas → comienza en `1`. La numeración es un entero simple (no formateado con ceros). No hay constraint `UNIQUE` en la base de datos — la generación no está protegida contra concurrencia estricta.

### 3.3 Deduplicación de doble submit
Antes de crear, `CreateTransactionAction` busca si existe una transacción con el mismo `tenant_id + counterparty_id + amount + operation_date` creada en los últimos 10 segundos y con `status != cancelled`. Si existe, retorna la existente sin crear una nueva (idempotencia ante doble envío del formulario).

### 3.4 `payment_type_transaction.origin` — campo polimórfico
`origin` es `bigint` en la BD pero el código lo usa como:
- `null` — pago regular con este medio
- `{credit_note_id}` (integer) — monto proveniente de una nota de crédito específica
- No se usa como string aunque el nombre implique polimorfismo

> **Deuda técnica:** el código en algunos comentarios referencia `origin = 'credit_balance'` o `'payment'` como strings, pero en producción solo se usan `null` y IDs de notas de crédito (integers). La columna es `bigint`.

### 3.5 Pipeline de creación (10 pipes)

`CreateTransactionPipeline` ejecuta dentro de `DB::transaction` (manual con `beginTransaction/commit/rollBack`):

| # | Pipe | Efecto |
|---|------|--------|
| 1 | `ValidateTransactionDataPipe` | Valida campos requeridos y consistencia |
| 2 | `CreateTransactionPipe` | Crea el registro `Transaction` con status `paid` |
| 3 | `AttachInvoicesToTransactionPipe` | Vincula facturas al pivot `invoice_transaction` con el monto imputado a cada una |
| 4 | `HandleExcessPaymentPipe` | Si el monto > suma de facturas, crea/usa el PaymentType "Saldo a Favor - Exceso de Pago" y registra el exceso como medio de pago especial |
| 5 | `AttachPaymentTypesToTransactionPipe` | Vincula los medios de pago reales (efectivo, transferencia, etc.) con sus montos |
| 6 | `AttachTenantToTransactionPipe` | Asocia el tenant a la transacción via `tenant_transaction` |
| 7 | `HandleCreditBalancePipe` | Si `credit_balance_used > 0`, registra el uso del saldo a favor como medio de pago |
| 8 | `HandleCreditNotesPipe` | Si hay notas de crédito seleccionadas: crea/usa PaymentType "Notas de Crédito", las vincula con `origin = credit_note_id`, actualiza status de cada nota de crédito |
| 9 | `UpdateInvoicesStatusPipe` | Recalcula y actualiza `status` de todas las facturas afectadas usando `invoice.calculatePaymentStatus()` |
| 10 | `LinkTransactionToCashShiftPipe` | Si `TenantFeature::isEnabled($tenantId, 'caja')`: vincula la transacción al turno de caja activo, creando `CashMovement` |

### 3.6 Distribución inteligente del monto entre facturas
`DistributePaymentAmountAction` usa dos pasadas:
1. **Primera pasada** (mayor balance primero): intenta cubrir facturas completas comenzando por las de mayor saldo. Si `remaining >= balance`, la cubre completamente.
2. **Segunda pasada**: con el remanente, cubre parcialmente las facturas que quedaron sin pagar en la primera pasada.

Retorna `invoice_distributions[]` con `amount_applied`, `is_fully_paid`, `is_partial_payment`, `new_balance`, más `excess_amount` si sobra dinero.

### 3.7 Exceso de pago → Saldo a Favor automático
Si el monto pagado supera la suma de las facturas seleccionadas, `HandleExcessPaymentPipe` crea automáticamente el PaymentType "Saldo a Favor - Exceso de Pago" (con `firstOrCreate`) y registra el exceso como un medio de pago adicional en `payment_type_transaction` con `payment_reference = 'EXCESO_PAGO_{number}'`. Este exceso queda disponible como saldo a favor para futuras transacciones.

### 3.8 Notas de crédito como medio de pago
Al crear una transacción, el usuario puede seleccionar notas de crédito disponibles del cliente/proveedor. `HandleCreditNotesPipe`:
- Por cada nota de crédito seleccionada: attach al PaymentType "Notas de Crédito" con `origin = credit_note_id`
- Vincula la nota de crédito como si fuera una factura más en `invoice_transaction` para el cálculo de `total_paid`
- Recalcula el status de cada nota de crédito usada

### 3.9 Anulación de transacción
`AnnulTransactionAction`:
1. Verifica que no esté ya anulada
2. Cambia `transaction.status = 'anulled'` (valor de `InvoiceStatus::ANULLED`)
3. Para cada factura vinculada: llama `invoice.calculatePaymentStatus()` (que ya excluye transacciones `anulled`) → si cambió, hace `Invoice::where('id', $id)->update(['status' => newStatus])`
4. Registra actividad `TREASURY_TRANSACTION_ANULLED`
5. Si `caja` habilitado: crea `CreateCompensatingMovementAction` en el turno activo
6. `ClearTreasuryDashboardCacheAction`

El balance de las facturas se recalcula dinámicamente — no hay que actualizar pivots ni guardar datos históricos.

### 3.10 Compensación manual vs. automática
| Tipo | Endpoint | Comportamiento |
|------|----------|---------------|
| Manual | `POST /treasury/compensate` | Usuario selecciona facturas específicas Y notas de crédito específicas. Distribuye proporcionalmente entre NC. |
| Automática | `POST /treasury/auto-compensate` | Selecciona TODAS las facturas pendientes (PENDING/ACCEPTED/PARTIALLY_PAID/OVERDUE) y TODAS las NC disponibles del cliente/proveedor. Delega a `CompensateBalanceAction`. |

Ambas crean una transacción de tipo `COMPENSATION` con `payment_types = []` (sin medio de pago de caja).

### 3.11 Dashboard de tesorería — caché Redis
`DashboardTreasuryAction` usa `Cache::remember()` para el dashboard. La caché se invalida con `ClearTreasuryDashboardCacheAction` en cada:
- Creación de transacción
- Anulación de transacción
- Completado de factura de venta o compra

### 3.12 Multi-tenant
`CreateTransactionAction` verifica permiso `Gestionar Pagos Sucursales` para el parámetro `force_tenant_id`. Si presente, la transacción se registra en el tenant forzado (verificando jerarquía). `AttachTenantToTransactionPipe` usa el `targetTenant` resultante.

El listado de transacciones filtra por `Ver Facturas Sucursales` con `GetTenantContextAction`.

---

## 4. Flujos Funcionales

### 4.1 Registrar un cobro o pago
1. `GET /treasury/create?type=collection&counterparty_id=X&invoice_ids[]=Y` → Controller carga la pantalla
2. Parámetros progresivos en la URL: el usuario primero elige `type`, luego `counterparty_id`, luego `invoice_ids`
3. Al seleccionar `counterparty_id`: carga facturas pendientes + saldo a favor + notas de crédito disponibles
4. Al seleccionar `invoice_ids`: calcula el total sugerido (`InvoicesTotalsCalulation`) + carga medios de pago
5. Usuario completa: montos por medio de pago, referencia de pago, opcionalmente usa saldo a favor o NC
6. `POST /treasury` → `StoreTreasuryRequest`:
   - `amount = SUM(payment_types[*].amount) + credit_balance_used + credit_notes_used`
   - `CreateTransactionAction::execute($validated, $forceTenantId)`
7. Pipeline de 10 pipes → `DB::commit`
8. `IncrementFreetierResourceAction('transactions')`
9. `ClearTreasuryDashboardCacheAction`
10. Redirect con flash success + transacción en sesión

### 4.2 Compensar saldo (manual)
1. `POST /treasury/compensate` → `StoreCompensationRequest`
2. `CompensateBalanceAction::execute({counterparty_id, invoice_ids, credit_note_ids, operation_date})`
3. Calcula montos disponibles en NC → distribuye proporcionalmente entre NC → distribuye entre facturas
4. `CreateTransactionAction` con `type=compensation, payment_types=[], credit_notes_used=amount`

### 4.3 Auto-compensar saldo
1. `POST /treasury/auto-compensate` → `StoreAutoCompensationRequest`
2. `AutoCompensateBalanceAction` selecciona todas las facturas pendientes + todas las NC disponibles
3. Delega a `CompensateBalanceAction`

### 4.4 Anular una transacción
1. `POST /treasury/transaction/{id}/annul`
2. `AnnulTransactionAction::execute($transaction)` → `DB::transaction`
3. `status = anulled` → recalcular facturas → registrar actividad → compensating cash movement (si caja)

### 4.5 Ver resumen de cuentas
1. `GET /treasury/account-summaries[?entity_type=client&counterparty_id=X]`
2. `GetAccountSummariesAction::execute($request)` → por cada contraparte: saldo pendiente, pagado, crédito disponible
3. Exportable a Excel via `GET /treasury/account-summaries/export`

### 4.6 Ver detalle de cuenta de una contraparte
1. `GET /treasury/account-detail/{counterparty}`
2. Historial completo de transacciones + facturas de ese cliente/proveedor

### 4.7 Descargar recibo PDF
1. `GET /treasury/transaction/{id}/receipt`
2. `GenerateTransactionReceiptPdfAction::execute($transactionId)`
3. DomPDF → PDF del recibo con detalles de la transacción

---

## 5. Actions del Dominio

| Action | Propósito |
|--------|-----------|
| `CreateTransactionAction` | Orquesta creación vía `CreateTransactionPipeline`; incluye deduplicación y generación de número |
| `AnnulTransactionAction` | Anula transacción, recalcula facturas, crea movimiento compensador en caja |
| `CompensateBalanceAction` | Compensación manual: NC específicas contra facturas específicas |
| `AutoCompensateBalanceAction` | Compensación automática: todas las NC contra todas las facturas pendientes |
| `DistributePaymentAmountAction` | Distribución inteligente en dos pasadas (fully paid first) |
| `GetAccountSummariesAction` | Resúmenes de cuenta por contraparte con totales agregados |
| `GetTransactionsByTypeAction` | Listado filtrado por tipo, búsqueda, medio de pago, tenant |
| `GetCounterpartyCreditBalanceImprovedAction` | Saldo a favor disponible de una contraparte |
| `GetCounterpartyCreditNotes` | Notas de crédito disponibles (con saldo > 0) de una contraparte |
| `GetInvoicesByCounterparty` | Facturas pendientes de una contraparte para el selector |
| `InvoicesTotalsCalulation` | Suma de saldos de las facturas seleccionadas (monto sugerido) |
| `GetPaymentsType` | Lista de medios de pago del tenant activo |
| `DashboardTreasuryAction` | Métricas del dashboard (cached Redis) |
| `ClearTreasuryDashboardCacheAction` | Invalida caché del dashboard |
| `GenerateTransactionReceiptPdfAction` | PDF del recibo de pago/cobro |
| `GenerateTransactionsExcelAction` | Excel de transacciones con filtros |
| `GenerateAccountSummariesExcelAction` | Excel de resúmenes de cuentas |

---

## 6. API / Endpoints

| Método | Path | Nombre | Policy | Descripción |
|--------|------|--------|--------|-------------|
| `GET` | `/treasury` | `treasury.index` | `viewAny(Transaction)` | Dashboard + listado de transacciones |
| `GET` | `/treasury/create` | `treasury.create` | `create(Transaction)` | Formulario de creación (progresivo con query params) |
| `POST` | `/treasury` | `treasury.store` | `store(Transaction)` | Crear transacción (cobro/pago) |
| `POST` | `/treasury/compensate` | `treasury.compensate` | `store(Transaction)` | Compensación manual de saldo |
| `POST` | `/treasury/auto-compensate` | `treasury.auto-compensate` | `store(Transaction)` | Compensación automática de saldo |
| `POST` | `/treasury/transaction/{id}/annul` | `treasury.transaction.annul` | `delete(transaction)` | Anular transacción |
| `GET` | `/treasury/account-summaries` | `treasury.account-summaries` | `accountSummaries(Transaction)` | Resúmenes de cuenta |
| `GET` | `/treasury/account-detail/{counterparty}` | `treasury.account-detail` | `accountSummaries(Transaction)` | Detalle de cuenta de una contraparte |
| `GET` | `/treasury/transaction/{id}/receipt` | `treasury.download-receipt` | (ninguna) | Recibo PDF de una transacción |
| `GET` | `/treasury/account-summaries/export` | `treasury.account-summaries.export` | `accountSummaries(Transaction)` | Excel de resúmenes |
| `GET` | `/treasury/transactions/export` | `treasury.transactions.export` | `viewAny(Transaction)` | Excel de transacciones |

### Permisos RBAC para Tesorería
| Permiso | Descripción |
|---------|-------------|
| `Ver Transacciones` | Ver listado y dashboard |
| `Crear Transacciones` | Registrar cobros y pagos |
| `Eliminar Transacciones` | Anular transacciones |
| `Ver Resumen de Cuenta` | Ver resúmenes de cuenta por contraparte |
| `Ver Facturas Sucursales` | Ver transacciones de toda la jerarquía |
| `Gestionar Pagos Sucursales` | Crear transacciones en sucursales específicas (`force_tenant_id`) |

---

## 7. Consideraciones de Migración Next.js

### 7.1 Pipeline de 10 pasos → Transacción atómica con funciones modulares
Los 10 pipes deben implementarse como funciones TypeScript puras encadenadas dentro de una transacción de base de datos. La lógica de distribución (`DistributePaymentAmountAction`) es puramente matemática — migrar directamente a TypeScript.

### 7.2 `calculatePaymentStatus()` — cálculo dinámico de status de factura
El recálculo del status de cada factura afectada depende de `invoice.calculatePaymentStatus()` que computa el balance en tiempo real (excluye transacciones `anulled`). En Next.js, este método debe existir en el servidor (Route Handler) como función pura que recibe los datos de la factura y sus transacciones.

### 7.3 Dashboard con caché → React Server Components + revalidation
El dashboard de tesorería cacheado puede implementarse en Next.js con:
- `unstable_cache` (Next.js 14+) o Redis para el mismo TTL
- Invalidación vía `revalidateTag('treasury-dashboard')` en cada mutación

### 7.4 `payment_type_transaction.origin` — aclarar semántica
El campo `origin bigint` tiene dos usos: `null` (pago regular) y `{credit_note_id}` (integer). En Next.js, definir dos campos separados en el schema: `credit_note_id: integer nullable` y eliminar el campo polimórfico.

### 7.5 Formulario progresivo → URL state management
El formulario de creación de tesorería usa query params progresivos (`?type=...&counterparty_id=...&invoice_ids[]=...`). En Next.js con App Router, implementar con `useSearchParams` y `router.push()` para mantener la misma UX sin recargas completas.

### 7.6 No hay soft delete en transacciones
Las transacciones nunca se eliminan — solo se anulan. En la migración, mantener esta invariante: no agregar `deleted_at` a la tabla. El soft delete de payment_types sí existe y debe preservarse.

---

## 8. Mejoras Propuestas v2.0

### 8.1 Conciliación bancaria
Importar extracto bancario (CSV/OFX del banco) y emparejar automáticamente con transacciones existentes. Las transacciones sin match quedan pendientes de conciliación manual.

### 8.2 Cheques diferidos
Soporte nativo para cheques diferidos: fecha de cobro/pago distinta a la fecha de emisión. El PaymentType "Cheque" tendría `deferred_date` y el sistema controlaría cuándo afectan efectivamente el saldo.

### 8.3 Multi-moneda (ARS + USD)
Registrar transacciones en dólares con tipo de cambio configurable. El resumen de cuenta mostraría saldos en ARS y USD por separado, con opción de convertir usando el tipo de cambio del día.

### 8.4 Programación de pagos (fechas de vencimiento)
Al crear un pago, poder programarlo para una fecha futura. El dashboard mostraría pagos próximos a vencer (próximos 7/15/30 días) para gestionar el cash flow.

### 8.5 Numeración como constraint UNIQUE en BD
Actualmente no hay `UNIQUE(tenant_id, number)` en `transactions`. Con alta concurrencia (Cloudflare Workers) el riesgo de colisión es real. Usar una secuencia PostgreSQL: `CREATE SEQUENCE treasury_number_seq`.

### 8.6 Portal de pagos para clientes
El cliente recibe un link de pago donde puede ver sus facturas pendientes y pagar online via MercadoPago. El pago se registra automáticamente como una transacción de tipo `collection`.
