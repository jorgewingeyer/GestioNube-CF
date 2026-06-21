# Historias de Usuario — Módulo 18: Caja

> **Módulo:** 18-cashier  
> **Fase:** 4 — Finanzas y Reportes  
> **Depende de:** 17-treasury, 02-tenant, 03-rbac  
> **Feature flag:** `feature:caja` — deshabilitado por defecto

---

## US-CAJ-01 — Ver el estado actual de la caja

**Como** cajero o supervisor,  
**quiero** ver el turno activo de la caja con su balance y movimientos del día,  
**para** conocer de un vistazo cuánto dinero hay en caja y qué movimientos se realizaron.

### Criterios de aceptación
- [ ] Si hay un turno abierto, veo: saldo de apertura, total de ingresos, total de egresos, saldo actual estimado (solo efectivo), número de turno y quién lo abrió
- [ ] Veo la lista de movimientos del turno con: concepto, tipo (ingreso/egreso), medio de pago, monto, origen (transacción automática / movimiento manual) y hora
- [ ] Si no hay turno abierto, veo un botón prominente para abrir uno
- [ ] No veo cajas de otras sucursales

### Notas técnicas
- `GET /caja` → `CashShiftController::index` + `GetShiftSummaryAction`
- Permiso: `Ver Caja`

---

## US-CAJ-02 — Abrir un turno de caja

**Como** cajero con permiso de abrir turno,  
**quiero** abrir un nuevo turno de caja,  
**para** iniciar el registro de movimientos de efectivo del día.

### Criterios de aceptación
- [ ] Si es el primer turno de la caja, ingreso el saldo inicial en pesos
- [ ] Si ya hubo turnos anteriores, el saldo inicial se toma automáticamente del saldo calculado del último turno cerrado (no lo puedo modificar)
- [ ] Si ya hay un turno abierto para esta caja, el sistema impide abrir otro y muestra un error claro
- [ ] El turno queda registrado con mi nombre, la fecha y hora exacta de apertura, y el número de turno correlativo
- [ ] Bajo concurrencia (dos usuarios intentando abrir al mismo tiempo), solo uno logra abrir — el otro recibe un error

### Notas técnicas
- `POST /caja/shifts` → `OpenCashShiftAction`
- `lockForUpdate()` en `CashRegister` previene duplicados bajo concurrencia
- `shift_number = MAX(shift_number)+1` por `cash_register_id` con constraint `UNIQUE`
- Si hay turno cerrado previo: `opening_balance = lastClosedShift.closing_balance_calculated` (no editable)
- Si es el primero: `opening_balance = request.amount * 100`

---

## US-CAJ-03 — Registrar un ingreso manual de caja

**Como** cajero con permiso de registrar movimientos,  
**quiero** registrar un ingreso de dinero en la caja que no proviene de un cobro de cliente,  
**para** reflejar correctamente todo el efectivo que entra durante el turno.

### Criterios de aceptación
- [ ] Puedo ingresar: concepto (descripción libre), monto en pesos, referencia opcional
- [ ] El ingreso queda registrado inmediatamente como movimiento del turno activo
- [ ] El saldo estimado de la caja se actualiza en pantalla
- [ ] Solo puedo registrar si hay un turno abierto — si no hay, el sistema muestra error

### Notas técnicas
- `POST /caja/movements` → `CreateCashMovementAction`
- `type = 'income'`, `origin = 'manual'`
- `amount = round(input * 100)` almacenado en centavos
- Permiso: `Registrar Movimiento de Caja`

---

## US-CAJ-04 — Registrar un egreso manual de caja

**Como** cajero con permiso de registrar movimientos,  
**quiero** registrar una salida de dinero de la caja que no corresponde a un pago a proveedor,  
**para** contabilizar retiros, gastos operativos u otras salidas de efectivo durante el turno.

### Criterios de aceptación
- [ ] Puedo ingresar: concepto (descripción libre), monto en pesos, referencia opcional
- [ ] El egreso queda registrado inmediatamente como movimiento del turno activo
- [ ] El saldo estimado de la caja se reduce en pantalla
- [ ] Solo puedo registrar si hay un turno abierto

### Notas técnicas
- `POST /caja/movements` → `CreateCashMovementAction`
- `type = 'expense'`, `origin = 'manual'`
- Permiso: `Registrar Movimiento de Caja`

---

## US-CAJ-05 — Ver cómo se vinculan los cobros y pagos al turno

**Como** cajero o supervisor,  
**quiero** ver en el turno activo todos los cobros y pagos de tesorería que se registraron mientras el turno estaba abierto,  
**para** tener visibilidad del efectivo y los demás medios de pago que entraron o salieron por transacciones con clientes y proveedores.

### Criterios de aceptación
- [ ] Cada transacción de tesorería (cobro o pago) aparece desglosada en el turno por medio de pago
- [ ] Si una transacción usó efectivo + transferencia, aparecen dos líneas separadas en el turno
- [ ] El origen `Transacción` es visible y diferenciable de los movimientos manuales
- [ ] Si no había turno abierto cuando se registró la transacción, esa transacción NO aparece en el turno

### Notas técnicas
- `LinkTransactionToShiftAction` crea un `CashMovement` por cada `payment_type` de la transacción
- `origin = 'transaction'`, `transaction_id = transaction.id`
- Si no hay turno abierto: retorna silenciosamente `[]`, la transacción se crea igual

---

## US-CAJ-06 — Cerrar el turno de caja

**Como** cajero con permiso de cerrar turno,  
**quiero** cerrar el turno activo ingresando el monto físico contado en caja,  
**para** registrar el cuadre del día y detectar sobrantes o faltantes de efectivo.

### Criterios de aceptación
- [ ] Ingreso el monto físico que cuento en la caja (en pesos)
- [ ] El sistema calcula automáticamente el saldo esperado basado en apertura + ingresos de efectivo − egresos de efectivo
- [ ] Veo la diferencia entre lo contado y lo calculado antes de confirmar el cierre
- [ ] Si la diferencia es positiva, el sistema la muestra como **sobrante**; si es negativa, como **faltante**
- [ ] Puedo agregar una nota de cierre opcional
- [ ] Al confirmar, el turno queda cerrado con la hora exacta de cierre y mi nombre

### Notas técnicas
- `POST /caja/shifts/{cashShift}/close` → `CloseCashShiftAction`
- `closing_balance_calculated = opening_balance + Σ(income, is_cash=true) − Σ(expense, is_cash=true)`
- **Solo los medios de pago con `is_cash = true` afectan el saldo calculado**
- `difference = closing_balance_counted − closing_balance_calculated`
- Permiso: `Cerrar Turno`

---

## US-CAJ-07 — Ver el resumen detallado del turno

**Como** supervisor o administrador,  
**quiero** ver el resumen completo de un turno de caja,  
**para** analizar los movimientos por medio de pago y por tipo de origen.

### Criterios de aceptación
- [ ] Veo totales globales: total de ingresos, total de egresos, movimiento neto (todos los medios de pago)
- [ ] Veo totales de efectivo: ingresos en efectivo, egresos en efectivo, saldo calculado final
- [ ] Veo totales de medios no efectivos: ingresos y egresos en transferencia, tarjeta, cheque, etc.
- [ ] Veo un desglose por medio de pago (el efectivo aparece primero) con ingreso, egreso y neto de cada uno
- [ ] Veo subtotales por origen: cuánto corresponde a transacciones automáticas de tesorería vs. movimientos manuales

### Notas técnicas
- `GET /caja/shifts/{cashShift}` → `CashShiftController::show` → `GetShiftSummaryAction`
- Permiso: `Ver Caja`

---

## US-CAJ-08 — Ver el historial de turnos cerrados

**Como** supervisor o administrador con permiso de historial,  
**quiero** ver los turnos de caja anteriores con sus resúmenes de apertura, cierre y diferencias,  
**para** auditar el desempeño de la caja y detectar irregularidades históricas.

### Criterios de aceptación
- [ ] La lista muestra: número de turno, fecha de apertura/cierre, cajero que abrió/cerró, saldo apertura, saldo calculado, saldo contado, diferencia
- [ ] La diferencia aparece con color: verde si cero, amarillo si sobrante, rojo si faltante
- [ ] Puedo filtrar por caja, por cajero y por rango de fechas
- [ ] La lista está paginada
- [ ] Puedo hacer clic en un turno para ver su detalle completo (movimientos + resumen)

### Notas técnicas
- `GET /caja/shifts/history` → `CashShiftController::history` → `GetShiftHistoryAction`
- Por defecto muestra `status = closed`
- Permiso: `Ver Historial de Caja`

---

## US-CAJ-09 — Descargar el resumen del turno en PDF

**Como** supervisor o cajero con permiso de exportar,  
**quiero** descargar el resumen del turno en PDF,  
**para** imprimirlo como comprobante del cierre de caja o archivarlo digitalmente.

### Criterios de aceptación
- [ ] El PDF incluye: nombre de la caja, número de turno, fecha/hora de apertura y cierre, cajero, resumen por medio de pago, saldo calculado vs. contado, diferencia y nota de cierre
- [ ] El nombre del archivo es descriptivo: `turno-{shift_number}-{fecha}.pdf`
- [ ] Funciona para turnos cerrados y también para el turno activo (resumen parcial)

### Notas técnicas
- `GET /caja/shifts/{cashShift}/pdf` → `CashShiftController::downloadPdf` → `GenerateShiftPdfAction`
- DomPDF + Blade
- Permiso: `Exportar Caja`

---

## US-CAJ-10 — Descargar los movimientos del turno en Excel

**Como** contador o supervisor con permiso de exportar,  
**quiero** descargar el detalle de movimientos del turno en Excel,  
**para** procesarlo en el sistema contable externo o compartirlo con el área de finanzas.

### Criterios de aceptación
- [ ] El Excel incluye todas las columnas: fecha/hora, concepto, tipo (ingreso/egreso), origen (manual/transacción), medio de pago, monto, referencia, usuario que lo registró
- [ ] El archivo tiene una hoja de resumen y una hoja de detalle de movimientos
- [ ] El nombre del archivo incluye el número de turno y la fecha

### Notas técnicas
- `GET /caja/shifts/{cashShift}/excel` → `CashShiftController::downloadExcel` → `GenerateShiftExcelAction`
- Permiso: `Exportar Caja`

---

## US-CAJ-11 — Gestionar cajas físicas (CRUD)

**Como** administrador con permiso de gestionar cajas,  
**quiero** crear, editar y deshabilitar las cajas físicas de la sucursal,  
**para** reflejar la configuración real de puntos de cobro de mi negocio.

### Criterios de aceptación
- [ ] Puedo crear una caja con nombre y descripción opcional
- [ ] Puedo editar el nombre y descripción de una caja existente
- [ ] Puedo deshabilitar una caja (`is_active = false`) — no se pueden abrir turnos en cajas inactivas
- [ ] No puedo eliminar una caja que tenga turnos con movimientos (restricción de integridad)
- [ ] La lista de cajas muestra el estado (activa/inactiva) y si tiene un turno abierto

### Notas técnicas
- `GET/POST /caja/registers` + `PUT/DELETE /caja/registers/{cashRegister}` → `CashRegisterController`
- Permiso: `Gestionar Cajas`

---

## US-CAJ-12 — Compensación automática de movimientos al anular transacción

**Como** sistema,  
**quiero** crear movimientos compensadores en el turno activo cuando se anula una transacción,  
**para** mantener el saldo de caja correcto sin intervención manual del cajero.

### Criterios de aceptación
- [ ] Al anular una transacción de tesorería, si el turno de caja en el que se registró **sigue abierto**, se crean automáticamente movimientos inversos (un compensador por cada movimiento original)
- [ ] Si el turno original ya fue cerrado, **no** se crean compensadores (el cajero del turno que lo anula debe hacer el ajuste manual)
- [ ] Los movimientos compensadores tienen `origin = 'transaction'` y concept que indica que es una compensación por anulación

### Notas técnicas
- `AnnulTransactionAction` → `CreateCompensatingMovementAction`
- Lógica: `originalMovement.cashShift.status == 'open'` → crear compensador; si no, skip
- Los movimientos compensadores invierten `type`: income → expense y viceversa

---

## US-CAJ-13 — Habilitación de caja por plan de suscripción (v2.0)

**Como** administrador del sistema,  
**quiero** habilitar o deshabilitar el módulo de caja por tenant desde el panel de suscripciones,  
**para** que las empresas del plan básico no accedan a la funcionalidad de caja.

### Criterios de aceptación
- [ ] En el panel de superadmin, puedo activar/desactivar `feature:caja` por tenant individualmente
- [ ] Si el feature está desactivado para un tenant, todas las rutas `/caja/*` devuelven 403 o 404
- [ ] El estado del feature se refleja en tiempo real sin reiniciar el servidor

### Notas técnicas
- **Mejora v2.0** — actualmente el flag es global en `.env`
- Migrar a `tenant_features.caja = boolean` con middleware que consulta la BD del tenant activo

---

## US-CAJ-14 — Justificación de diferencias al cierre (v2.0)

**Como** sistema,  
**quiero** requerir una justificación cuando el cajero cierra con diferencia (sobrante o faltante),  
**para** mantener un registro auditado de por qué ocurrió la diferencia y quién la reconoció.

### Criterios de aceptación
- [ ] Si `difference != 0`, el campo de nota de cierre es **obligatorio** antes de poder cerrar
- [ ] La nota queda guardada en `cash_shifts.closing_notes`
- [ ] En el historial, las diferencias con justificación se marcan como "justificada"; sin justificación (turnos anteriores) como "sin justificación"

### Notas técnicas
- **Mejora v2.0** — actualmente `closing_notes` es opcional siempre
- Validación en `CloseCashShiftAction`: si `counted != calculated` → `closing_notes` requerido

---

## US-CAJ-15 — Panel de cajas en tiempo real para supervisores (v2.0)

**Como** supervisor de la sucursal,  
**quiero** ver en un panel el estado de todas las cajas de la sucursal de un vistazo,  
**para** monitorear qué cajas están activas, cuánto dinero tienen y detectar anomalías sin revisar cada turno individualmente.

### Criterios de aceptación
- [ ] El panel muestra una tarjeta por caja con: estado (abierta/cerrada), cajero activo, hora de apertura, saldo de apertura, saldo actual estimado (efectivo), cantidad de movimientos del turno
- [ ] Las cajas cerradas o inactivas aparecen en un estado visual diferenciado
- [ ] El panel se actualiza en tiempo real (polling o WebSocket)

### Notas técnicas
- **Mejora v2.0** — actualmente no existe panel multi-caja
- Implementar via polling con SWR o SSE para actualización en tiempo real
