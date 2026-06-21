# Historias de Usuario — Módulo 17: Tesorería

> **Módulo:** 17-treasury  
> **Fase:** 4 — Finanzas y Reportes  
> **Depende de:** 11-clients-providers, 13-invoice-sales, 16-invoice-purchase, 02-tenant, 03-rbac

---

## US-TRE-01 — Ver el dashboard de tesorería

**Como** administrador o contador,  
**quiero** ver las métricas clave de tesorería en el panel principal,  
**para** conocer el estado financiero actual de la empresa de un vistazo.

### Criterios de aceptación
- [ ] El dashboard muestra: total cobrado en el período, total pagado, saldo neto, facturas pendientes de cobro, facturas pendientes de pago
- [ ] Los datos se cargan rápido (caché Redis en el servidor)
- [ ] Si tengo permiso `Ver Facturas Sucursales`, puedo filtrar por sucursal
- [ ] La lista de transacciones recientes aparece debajo del dashboard

### Notas técnicas
- `GET /treasury` → `DashboardTreasuryAction` (cached) + `GetTransactionsByTypeAction`
- `ClearTreasuryDashboardCacheAction` se llama en cada mutación para mantener datos frescos

---

## US-TRE-02 — Ver el listado de transacciones

**Como** usuario con permiso de ver transacciones,  
**quiero** ver todas las transacciones de la empresa (cobros, pagos y compensaciones),  
**para** tener un registro histórico de todos los movimientos de dinero.

### Criterios de aceptación
- [ ] La lista muestra: número de talonario, fecha, tipo (cobro/pago/compensación), contraparte, monto, estado, medio(s) de pago
- [ ] Puedo filtrar por tipo de transacción (cobro / pago / compensación)
- [ ] Puedo filtrar por medio de pago
- [ ] Puedo buscar por número o contraparte
- [ ] Si tengo permiso `Ver Facturas Sucursales`, puedo filtrar por sucursal
- [ ] Puedo elegir cuántos resultados ver por página

---

## US-TRE-03 — Registrar un cobro de cliente

**Como** usuario con permiso de crear transacciones,  
**quiero** registrar un cobro recibido de un cliente,  
**para** imputarlo contra las facturas pendientes y actualizar el saldo de la cuenta del cliente.

### Criterios de aceptación
- [ ] Selecciono el cliente desde un buscador
- [ ] El sistema muestra automáticamente las facturas pendientes del cliente con sus saldos
- [ ] Puedo seleccionar una o más facturas a imputar en este cobro
- [ ] El monto sugerido se calcula automáticamente como la suma de los saldos de las facturas seleccionadas
- [ ] Puedo pagar con uno o más medios de pago (efectivo, transferencia, cheque, etc.) indicando el monto por cada uno
- [ ] Si el monto pagado supera el total de facturas, el exceso se registra automáticamente como saldo a favor del cliente
- [ ] Puedo usar el saldo a favor existente del cliente como parte del cobro
- [ ] Puedo usar notas de crédito disponibles del cliente como parte del cobro
- [ ] Tras guardar, las facturas imputadas actualizan su estado automáticamente (pagada / parcialmente pagada)
- [ ] Si intento guardar el mismo cobro dos veces en 10 segundos, el sistema devuelve el cobro existente en lugar de crear un duplicado

### Notas técnicas
- `POST /treasury` → `CreateTransactionAction` → `CreateTransactionPipeline` (10 pipes)
- `type = collection`, `amount = SUM(payment_types) + credit_balance_used + credit_notes_used`
- Distribución inteligente: primero cubre facturas de mayor saldo completas, luego distribuye el remanente parcialmente

---

## US-TRE-04 — Registrar un pago a proveedor

**Como** usuario con permiso de crear transacciones,  
**quiero** registrar un pago realizado a un proveedor,  
**para** imputarlo contra las facturas de compra pendientes.

### Criterios de aceptación
- [ ] Selecciono el proveedor, las facturas a imputar y los medios de pago
- [ ] El comportamiento es idéntico al cobro pero en dirección inversa
- [ ] Las facturas de compra imputadas actualizan su estado al guardar

### Notas técnicas
- `POST /treasury` con `type = payment`
- El flujo es el mismo pipeline de 10 pipes que el cobro

---

## US-TRE-05 — Usar notas de crédito como medio de pago

**Como** usuario con permiso de crear transacciones,  
**quiero** aplicar las notas de crédito disponibles de un cliente como parte del pago de sus facturas,  
**para** saldar la deuda sin necesidad de recibir dinero en efectivo o transferencia.

### Criterios de aceptación
- [ ] Al seleccionar un cliente con notas de crédito disponibles, las NC aparecen listadas con su saldo disponible
- [ ] Puedo seleccionar una o más notas de crédito a aplicar
- [ ] El monto de las NC seleccionadas se descuenta del total a cobrar en efectivo
- [ ] Tras guardar, las NC se marcan como usadas (parcial o totalmente)
- [ ] En el detalle de la transacción, las NC usadas aparecen como medio de pago con referencia a su número

### Notas técnicas
- `HandleCreditNotesPipe`: `origin = credit_note_id` en pivot; vincula NC como factura en `invoice_transaction`
- Status de NC recalculado vía `invoice.calculatePaymentStatus()`

---

## US-TRE-06 — Anular una transacción

**Como** usuario con permiso de eliminar transacciones,  
**quiero** anular una transacción registrada por error,  
**para** revertir sus efectos en los saldos de las facturas vinculadas.

### Criterios de aceptación
- [ ] Al anular, la transacción cambia a estado **Anulada** — no se elimina de la base de datos
- [ ] Las facturas que estaban imputadas en esa transacción recalculan automáticamente su estado (pueden volver a "pendiente" o "parcialmente pagada")
- [ ] Si había un movimiento de caja asociado (efecto en el turno), se crea un movimiento compensador automáticamente
- [ ] Se registra en el log de actividades quién anuló la transacción y cuándo

### Notas técnicas
- `POST /treasury/transaction/{id}/annul` → `AnnulTransactionAction`
- `transaction.status = 'anulled'`; `invoice.calculatePaymentStatus()` excluye transacciones anuladas
- No hay rollback manual de pivots — el recálculo dinámico es la fuente de verdad

---

## US-TRE-07 — Compensar saldo manualmente

**Como** usuario con permiso de crear transacciones,  
**quiero** aplicar notas de crédito contra facturas pendientes sin registrar un movimiento de caja,  
**para** saldar deudas por compensación cuando el cliente tiene saldo a su favor por devoluciones.

### Criterios de aceptación
- [ ] Selecciono el cliente/proveedor, las facturas a compensar y las notas de crédito a usar
- [ ] El sistema muestra cuánto puede compensarse (min entre deuda y crédito disponible)
- [ ] La compensación se aplica proporcionalmente entre las notas de crédito seleccionadas
- [ ] Se crea una transacción de tipo **Compensación** sin medios de pago de caja
- [ ] Las facturas y notas de crédito afectadas actualizan su estado

### Notas técnicas
- `POST /treasury/compensate` → `CompensateBalanceAction`
- `type = compensation`, `payment_types = []`, `credit_notes_used = amount`

---

## US-TRE-08 — Compensar saldo automáticamente

**Como** usuario con permiso de crear transacciones,  
**quiero** que el sistema compense automáticamente todas las facturas pendientes con todas las notas de crédito disponibles de un cliente,  
**para** no tener que seleccionar manualmente cada factura y nota de crédito.

### Criterios de aceptación
- [ ] Con un solo clic, el sistema selecciona TODAS las facturas pendientes del cliente (aceptadas, pendientes, parcialmente pagadas, vencidas)
- [ ] Aplica TODAS las notas de crédito disponibles del cliente hasta agotar el crédito o la deuda
- [ ] Se crea una transacción de compensación y los estados se actualizan automáticamente
- [ ] Si no hay notas de crédito disponibles, el sistema muestra un error claro

### Notas técnicas
- `POST /treasury/auto-compensate` → `AutoCompensateBalanceAction`
- Selecciona `invoice_type IN (sale_invoice, purchase_invoice, debit_note)` con status pendiente

---

## US-TRE-09 — Descargar recibo de pago

**Como** usuario con acceso a una transacción,  
**quiero** descargar un recibo PDF de la transacción,  
**para** entregárselo al cliente o proveedor como comprobante del pago/cobro.

### Criterios de aceptación
- [ ] El recibo muestra: número de talonario, fecha, cliente/proveedor, monto, medios de pago usados con sus referencias, facturas imputadas con el monto imputado a cada una
- [ ] El nombre del archivo es descriptivo: `recibo-{number}.pdf`
- [ ] Funciona para cualquier transacción activa (no anulada)

### Notas técnicas
- `GET /treasury/transaction/{id}/receipt` → `GenerateTransactionReceiptPdfAction`

---

## US-TRE-10 — Ver resúmenes de cuenta por cliente/proveedor

**Como** contador o administrador,  
**quiero** ver un resumen de la cuenta corriente de cada cliente y proveedor,  
**para** conocer cuánto me deben, cuánto les debo y qué saldo a favor tiene cada uno.

### Criterios de aceptación
- [ ] La pantalla muestra una lista de todas las contrapartes con: total de facturas, total pagado, saldo pendiente, saldo a favor (crédito)
- [ ] Puedo filtrar por tipo (clientes / proveedores)
- [ ] Puedo filtrar por contraparte específica
- [ ] Puedo filtrar por estado de la cuenta (con deuda / al día / con crédito)
- [ ] Puedo filtrar por rango de fechas
- [ ] Si tengo permiso `Ver Facturas Sucursales`, puedo ver resúmenes de todas las sucursales
- [ ] Puedo exportar los resúmenes a Excel

### Notas técnicas
- `GET /treasury/account-summaries` → `GetAccountSummariesAction`
- `GET /treasury/account-summaries/export` → `GenerateAccountSummariesExcelAction`

---

## US-TRE-11 — Ver el detalle de cuenta de una contraparte

**Como** contador o administrador,  
**quiero** ver el historial completo de transacciones y facturas de un cliente o proveedor específico,  
**para** analizar el comportamiento de pago y resolver disputas.

### Criterios de aceptación
- [ ] La pantalla muestra: todas las facturas del cliente (con su estado, total y saldo), todas las transacciones (con fecha, monto, medios de pago)
- [ ] Puedo ver el saldo corriente calculado factura por factura
- [ ] El saldo total actual es visible claramente

### Notas técnicas
- `GET /treasury/account-detail/{counterparty}` → `GetTransactionsByCounterpartyAction`

---

## US-TRE-12 — Exportar transacciones a Excel

**Como** contador,  
**quiero** exportar las transacciones del período a Excel,  
**para** procesarlas en el sistema contable de la empresa.

### Criterios de aceptación
- [ ] La exportación aplica los mismos filtros del listado activo (tipo, fechas, contraparte)
- [ ] El Excel incluye todas las columnas relevantes: número, fecha, tipo, contraparte, monto, medios de pago, facturas imputadas
- [ ] La descarga comienza inmediatamente (sin espera)

### Notas técnicas
- `GET /treasury/transactions/export` → `GenerateTransactionsExcelAction`

---

## US-TRE-13 — Registrar pago en nombre de una sucursal (multi-tenant)

**Como** administrador con permiso `Gestionar Pagos Sucursales`,  
**quiero** registrar un pago o cobro en nombre de una sucursal específica,  
**para** gestionar centralmente la tesorería de toda la organización.

### Criterios de aceptación
- [ ] En el formulario de creación, aparece un selector de sucursal
- [ ] Puedo elegir cualquier sucursal de mi jerarquía
- [ ] La transacción se registra en la sucursal seleccionada (no en la sucursal activa por defecto)
- [ ] Si no tengo el permiso, el selector no aparece

### Notas técnicas
- `force_tenant_id` parámetro verificado en `CreateTransactionAction`
- Verifica jerarquía con `GetTenantContextAction` y permiso `Gestionar Pagos Sucursales`

---

## US-TRE-14 — Conciliación bancaria (v2.0)

**Como** contador,  
**quiero** importar el extracto bancario de mi cuenta y cruzarlo automáticamente con las transacciones del sistema,  
**para** detectar diferencias y confirmar que todos los movimientos están correctamente registrados.

### Criterios de aceptación
- [ ] Puedo importar extracto en formato CSV con columnas: fecha, descripción, monto, referencia
- [ ] El sistema propone automáticamente el match con transacciones existentes (por fecha + monto + referencia parcial)
- [ ] Los movimientos sin match quedan marcados como "pendiente de conciliación"
- [ ] Puedo crear una transacción directamente desde un movimiento bancario sin match
- [ ] El estado de conciliación se guarda por transacción

### Notas técnicas
- **Mejora v2.0** — no existe actualmente
- Nueva tabla `bank_statements` + `bank_statement_items`
- Algoritmo de matching: fecha ±2 días + monto exacto + Levenshtein de descripción

---

## US-TRE-15 — Portal de pagos online para clientes (v2.0)

**Como** cliente de la empresa,  
**quiero** ver mis facturas pendientes y pagar online,  
**para** no tener que comunicarme con la empresa para cada pago.

### Criterios de aceptación
- [ ] El cliente recibe un link único con token seguro (sin login)
- [ ] Ve sus facturas pendientes con el saldo de cada una
- [ ] Puede seleccionar cuáles pagar y pagar via MercadoPago
- [ ] Al confirmar el pago, el sistema crea automáticamente la transacción de cobro

### Notas técnicas
- **Mejora v2.0** — no existe actualmente
- Token de acceso con TTL de 7 días en `client_payment_links`
- Webhook de MercadoPago → `CreateTransactionAction`
