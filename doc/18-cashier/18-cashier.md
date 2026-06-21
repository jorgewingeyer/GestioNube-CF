# Módulo 18 — Caja (Cashier)

> **Fase:** 4 — Finanzas y Reportes  
> **Depende de:** 17-treasury, 02-tenant, 03-rbac  
> **Feature flag:** `feature:caja` — todas las rutas están detrás de este middleware; deshabilitado por defecto

---

## 1. Propósito y Alcance

El módulo de Caja permite gestionar la apertura y cierre de turnos de caja por sucursal, registrar movimientos manuales de efectivo (ingresos/egresos) y vincular automáticamente cada transacción de tesorería al turno abierto. Ofrece un cuadre al cierre con diferencia entre lo contado físicamente y lo calculado por el sistema.

**Quién lo usa:** cajeros, administradores de sucursal.  
**Funcionalidades clave:** abrir/cerrar turno, registrar movimientos manuales, exportar resumen en PDF/Excel, ver historial de turnos, CRUD de cajas.

---

## 2. Entidades de Datos

### 2.1 `cash_registers` — Cajas físicas

```
id                  bigint PK
tenant_id           FK → tenants.id CASCADE
name                varchar(100)
description         varchar(255)  nullable
is_active           boolean       default true
created_at / updated_at
```

Índices: `tenant_id`, `(tenant_id, is_active)`.

### 2.2 `cash_shifts` — Turnos de caja

```
id                          bigint PK
tenant_id                   FK → tenants.id CASCADE
cash_register_id            FK → cash_registers.id CASCADE
opened_by_user_id           FK → users.id RESTRICT
closed_by_user_id           FK → users.id nullable RESTRICT
status                      ENUM('open', 'closed')   default 'open'
shift_number                unsignedInteger nullable
opening_balance             bigint          (centavos)
closing_balance_counted     bigint nullable (centavos — lo que el cajero cuenta físicamente)
closing_balance_calculated  bigint nullable (centavos — lo que el sistema calcula)
difference                  bigint nullable (centavos — counted − calculated; positivo=sobrante, negativo=faltante)
opened_at                   timestamp
closed_at                   timestamp nullable
closing_notes               text nullable
created_at / updated_at
```

Constraints: `UNIQUE(cash_register_id, shift_number)`.  
Índices: `tenant_id`, `cash_register_id`, `(cash_register_id, status)`, `opened_by_user_id`, `(tenant_id, status)`.  
Sin soft delete.

### 2.3 `cash_movements` — Movimientos del turno

```
id               bigint PK
tenant_id        FK → tenants.id CASCADE
cash_shift_id    FK → cash_shifts.id CASCADE
user_id          FK → users.id RESTRICT
type             ENUM('income', 'expense')
origin           ENUM('manual', 'transaction')  default 'manual'
transaction_id   FK → transactions.id nullable  NULL ON DELETE
payment_type_id  FK → payment_types.id nullable NULL ON DELETE
amount           bigint  (centavos, siempre positivo)
concept          varchar(255)
reference        varchar(100) nullable
movement_date    date
created_at / updated_at
```

Índices: `cash_shift_id`, `tenant_id`, `transaction_id`, `movement_date`, `user_id`.  
Sin soft delete.

---

## 3. Reglas de Negocio

### 3.1 Feature flag
Todas las rutas `/caja/*` están protegidas por `middleware:feature:caja`. Si el flag está deshabilitado en `.env`, el módulo entero es inaccesible.

### 3.2 Un solo turno abierto por caja
`OpenCashShiftAction` usa `lockForUpdate()` sobre `CashRegister` antes de verificar que no exista un turno con `status = 'open'`. Si ya hay uno, lanza excepción. El lock previene duplicados bajo concurrencia.

### 3.3 Continuidad del saldo de apertura
- Si existe un turno cerrado anterior: `opening_balance = lastClosedShift.closing_balance_calculated` (el saldo calculado por el sistema, **no editable por el usuario**).
- Si es el primer turno de la caja: el usuario ingresa el monto inicial en pesos; la Action lo multiplica por 100 para almacenarlo en centavos.

### 3.4 Numeración de turno
`shift_number` se calcula como `MAX(shift_number) + 1` filtrado por `cash_register_id`. El constraint `UNIQUE(cash_register_id, shift_number)` garantiza unicidad. El número es secuencial por caja, no global.

### 3.5 Saldo calculado al cierre — SOLO efectivo
`closing_balance_calculated = opening_balance + (sum of income movements where payment_type.is_cash = true) − (sum of expense movements where payment_type.is_cash = true)`.  
**Los medios de pago no efectivo (transferencias, tarjetas, cheques) NO afectan el saldo calculado** — solo se registran como movimientos informativos. El cuadre físico aplica únicamente al efectivo.

### 3.6 Diferencia al cierre
`difference = closing_balance_counted − closing_balance_calculated`.  
Positivo = sobrante (el cajero tiene más efectivo del esperado).  
Negativo = faltante (el cajero tiene menos efectivo del esperado).

### 3.7 Vinculación automática de transacciones al turno
`LinkTransactionToShiftAction` (llamado en `LinkTransactionToCashShiftPipe`, el pipe 10 de `CreateTransactionPipeline`) crea **un `CashMovement` por cada `payment_type` de la transacción**:
- `type = collection` → `CashMovement.type = 'income'`
- `type = payment` → `CashMovement.type = 'expense'`
- `origin = 'transaction'`

Si no hay turno abierto, retorna silenciosamente `[]` sin error. No bloquea la creación de la transacción.

### 3.8 Movimientos compensadores por anulación
Al anular una transacción (`AnnulTransactionAction` → `CreateCompensatingMovementAction`), se crean movimientos inversos para cada `CashMovement` original de esa transacción. El movimiento compensador **solo se crea si el turno original está aún ABIERTO**. Si el turno ya fue cerrado, no se genera ningún movimiento compensador.

### 3.9 Sin soft delete en tablas de caja
`cash_registers`, `cash_shifts` y `cash_movements` no tienen `deleted_at`. Los registros no se eliminan de la BD — los registros abiertos se cierran, las cajas se deshabilitan (`is_active = false`).

---

## 4. Flujos Funcionales

### 4.1 Abrir turno

```
Usuario solicita abrir turno
  → CashShiftController::open()
  → Verifica permiso 'Abrir Turno' (CashShiftPolicy::open)
  → OpenCashShiftAction::execute()
      → DB::transaction
      → CashRegister::lockForUpdate() — bloqueo anti-concurrencia
      → Verifica no haya turno open (CashRegister::activeShift)
      → opening_balance = lastClosedShift.closing_balance_calculated ?? input * 100
      → shift_number = MAX(shift_number) + 1 para esa caja
      → CashShift::create(status='open', opened_at=now)
  ← Redirige a /caja con el turno activo
```

### 4.2 Registrar movimiento manual

```
Usuario registra ingreso/egreso manual
  → CashMovementController::store()
  → Verifica permiso 'Registrar Movimiento de Caja'
  → CreateCashMovementAction::execute()
      → Verifica turno abierto para el tenant
      → Verifica que el turno pertenece al tenant actual
      → CashMovement::create(origin='manual', type=income|expense, amount=round(input*100))
  ← Actualiza el resumen del turno en tiempo real
```

### 4.3 Cerrar turno

```
Usuario cuenta el efectivo e ingresa el monto contado
  → CashShiftController::close()
  → Verifica permiso 'Cerrar Turno' (CashShiftPolicy::close)
  → CloseCashShiftAction::execute()
      → closing_balance_calculated = opening_balance + Σ(income, is_cash=true) − Σ(expense, is_cash=true)
      → closing_balance_counted = input * 100
      → difference = counted − calculated
      → CashShift::update(status='closed', closed_at=now, closed_by_user_id)
  ← Redirige al historial de turnos
```

### 4.4 Vinculación automática al registrar una transacción de tesorería

```
CreateTransactionPipeline
  → ... pipes 1-9 ...
  → Pipe 10: LinkTransactionToCashShiftPipe
      → LinkTransactionToShiftAction::execute(transaction)
          → Busca CashShift abierto del tenant
          → Si no hay turno abierto: retorna [] (silencioso)
          → Por cada PaymentType de la transacción:
              → CashMovement::create(
                    cash_shift_id = openShift.id,
                    transaction_id = transaction.id,
                    payment_type_id = paymentType.id,
                    type = collection→'income' | payment→'expense',
                    origin = 'transaction',
                    amount = pivot.amount,
                    concept = 'Transacción #{number}'
                )
```

### 4.5 Resumen del turno (GetShiftSummaryAction)

La action devuelve tres conjuntos de totales:

| Nivel | Descripción |
|-------|-------------|
| **Global** | Todos los medios de pago: total_income, total_expense, net_movement, balance_end |
| **Cash (efectivo)** | Solo `payment_types.is_cash = true`: cash_income, cash_expense, cash_net, closing_balance_calculated |
| **Non-cash** | Solo `payment_types.is_cash = false`: non_cash_income, non_cash_expense |

También entrega:
- Breakdown por medio de pago (ordenado: efectivo primero)
- Subtotales por origen: `transaction` (cobros/pagos automáticos) vs `manual` (ingresos/egresos manuales)

---

## 5. Actions — Resumen

| Action | Descripción |
|--------|-------------|
| `OpenCashShiftAction` | Abre un turno con lockForUpdate para evitar duplicados |
| `CloseCashShiftAction` | Calcula balance y diferencia; cierra el turno |
| `GetShiftSummaryAction` | Resumen multi-nivel por medio de pago y origen |
| `CreateCashMovementAction` | Crea movimiento manual (ingreso/egreso) |
| `LinkTransactionToShiftAction` | Crea un CashMovement por payment_type de la transacción |
| `CreateCompensatingMovementAction` | Movimientos inversos al anular transacción (solo si turno aún abierto) |
| `GetShiftHistoryAction` | Historial paginado con filtros (caja, estado, fechas) |
| `GenerateShiftPdfAction` | PDF del resumen del turno (DomPDF + Blade) |
| `GenerateShiftExcelAction` | Excel de los movimientos del turno |

---

## 6. API / Endpoints

Todas las rutas están bajo el prefijo `/caja` y el middleware `feature:caja`.

| Método | Path | Controlador | Permiso |
|--------|------|-------------|---------|
| GET | `/caja` | `CashShiftController::index` | `Ver Caja` |
| GET | `/caja/registers` | `CashRegisterController::index` | `Gestionar Cajas` |
| POST | `/caja/registers` | `CashRegisterController::store` | `Gestionar Cajas` |
| PUT | `/caja/registers/{cashRegister}` | `CashRegisterController::update` | `Gestionar Cajas` |
| DELETE | `/caja/registers/{cashRegister}` | `CashRegisterController::destroy` | `Gestionar Cajas` |
| POST | `/caja/shifts` | `CashShiftController::open` | `Abrir Turno` |
| GET | `/caja/shifts/history` | `CashShiftController::history` | `Ver Historial de Caja` |
| GET | `/caja/shifts/{cashShift}` | `CashShiftController::show` | `Ver Caja` |
| POST | `/caja/shifts/{cashShift}/close` | `CashShiftController::close` | `Cerrar Turno` |
| GET | `/caja/shifts/{cashShift}/pdf` | `CashShiftController::downloadPdf` | `Exportar Caja` |
| GET | `/caja/shifts/{cashShift}/excel` | `CashShiftController::downloadExcel` | `Exportar Caja` |
| POST | `/caja/movements` | `CashMovementController::store` | `Registrar Movimiento de Caja` |

---

## 7. Integraciones con Otros Módulos

**Depende de:**
- **Treasury (17):** `LinkTransactionToCashShiftPipe` es pipe 10 de `CreateTransactionPipeline`. `CreateCompensatingMovementAction` se llama desde `AnnulTransactionAction`.
- **PaymentType (Treasury):** `PaymentType.is_cash` determina qué movimientos afectan el saldo calculado.
- **Tenant (02):** Cada `CashRegister` pertenece a un tenant. Multi-tenant: solo ve cajas de su tenant activo.
- **RBAC (03):** 7 permisos específicos de caja en `CashShiftPolicy`.

**Expone a:**
- Ningún módulo consume datos de caja directamente. Es un módulo terminal.

---

## 8. Consideraciones de Migración Next.js

- **WebSocket / polling:** El resumen del turno activo se actualiza en tiempo real en la UI actual. En Next.js, implementar via polling (SWR con `refreshInterval`) o WebSocket para eventos de `CashMovement::created`.
- **Feature flag:** El flag `feature:caja` debe mapearse a un permiso o configuración del tenant en Next.js. Si el flag está apagado, las rutas `/caja/*` devuelven 404.
- **Números en centavos:** La API siempre devuelve importes en centavos. El frontend debe dividir por 100 para mostrar y multiplicar por 100 antes de enviar.
- **PDF/Excel:** Generar desde el backend (Next.js Route Handler) con una librería equivalente (jsPDF + ExcelJS) o delegar a un servicio externo.
- **lockForUpdate:** La lógica de lock para apertura de turno debe implementarse en la capa de base de datos (transacción + SELECT FOR UPDATE) — no hay alternativa frontend.

---

## 9. Mejoras Propuestas v2.0

### 9.1 Habilitación por plan de suscripción
Actualmente el feature flag es global en `.env`. En v2.0, habilitar/deshabilitar la caja por tenant desde el panel de suscripción, con `tenant_features.caja = true/false`.

### 9.2 Múltiples cajas por sucursal con asignación de usuario
Actualmente cualquier usuario con permiso puede abrir cualquier caja. En v2.0, asignar cajeros a cajas específicas (`cash_register_user` pivot) y que el usuario solo pueda abrir la caja asignada.

### 9.3 Movimientos compensadores para turnos cerrados
El sistema actual ignora silenciosamente los movimientos compensadores si el turno ya fue cerrado. En v2.0, notificar al administrador con un flag `requires_manual_adjustment = true` en el turno afectado para que pueda hacer la corrección contable manualmente.

### 9.4 Justificación de diferencias al cierre
En v2.0, si `difference != 0`, requerir que el cajero ingrese una justificación obligatoria antes de cerrar. Guardar en `cash_shifts.difference_notes`.

### 9.5 Dashboard de caja en tiempo real
Panel que muestra el estado de todas las cajas de la sucursal: cuáles están abiertas, quién las abrió, balance actual estimado. Útil para supervisores.

### 9.6 Apertura de turno con monto inicial editable
Actualmente si hay un turno cerrado anterior, `opening_balance = lastClosedShift.closing_balance_calculated` y no es editable. En v2.0, permitir al supervisor sobrescribir el saldo inicial (con motivo obligatorio) para casos de retiros de caja entre turnos.
