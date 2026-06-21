# Historias de Usuario — Módulo 13: Facturas de Venta y Notas

> **Módulo:** 13-invoice-sales  
> **Fase:** 3 — Ciclo Comercial  
> **Depende de:** 07-products, 08-batches, 11-clients-providers, 02-tenant, 03-rbac

---

## US-INV-01 — Ver la lista de facturas de venta

**Como** vendedor o administrador,  
**quiero** ver todas las facturas de venta emitidas por mi empresa,  
**para** controlar el estado de cobro, detectar deudas vencidas y acceder al detalle de cada factura.

### Criterios de aceptación
- [ ] La lista muestra: número de factura, fecha, nombre del cliente, total calculado, estado y monto pagado
- [ ] Los estados se muestran con colores: Borrador (gris), Aceptado (azul), Pagado (verde), Cancelado (rojo), Vencido (naranja)
- [ ] Puedo buscar por número de factura, fecha o nombre de cliente
- [ ] Puedo filtrar por estado
- [ ] Puedo ordenar por número, fecha o nombre de cliente
- [ ] Paginación de 4 por página en la vista general
- [ ] Con el permiso "Ver Facturas Sucursales", puedo seleccionar otra sucursal del grupo para ver sus facturas
- [ ] Solo puede acceder quien tenga el permiso "Ver Facturas Ventas"

### Notas técnicas
- `GetAllInvoiceSaleAction`: filtra `invoice_type IN (sale_invoice, remit_sale)`, multi-tenant opcional con `$targetTenantId`
- Incluye `withSum('transactions as total_paid')` excluyendo transacciones cancelled/annulled
- Los totales se calculan en PHP — no están en la BD

---

## US-INV-02 — Ver comprobantes fiscales (con CAE)

**Como** contador o administrador,  
**quiero** ver el registro de todos los comprobantes fiscales autorizados ante ARCA/AFIP,  
**para** hacer el seguimiento contable y de cumplimiento fiscal.

### Criterios de aceptación
- [ ] La lista muestra solo facturas que tienen CAE asignado (`cae IS NOT NULL`)
- [ ] Muestra: número de comprobante ARCA (`cbte_nro`), CAE, vencimiento del CAE, nombre del cliente y estado
- [ ] Puedo buscar por número de factura, CAE, `cbte_nro` o nombre de cliente
- [ ] Puedo filtrar por estado
- [ ] Paginación de 10 por página
- [ ] Solo puede acceder quien tenga el permiso "Ver Facturas Ventas"

### Notas técnicas
- `GetAllFiscalInvoiceSaleAction`: filtra `cae IS NOT NULL` y `invoice_type IN (sale_invoice, remit_sale)`
- Sólo usa `tenant_id` del tenant actual (sin jerarquía multi-tenant)

---

## US-INV-03 — Crear una nueva factura de venta

**Como** vendedor,  
**quiero** crear una nueva factura de venta seleccionando el cliente,  
**para** iniciar el proceso de facturación y luego cargar los productos.

### Criterios de aceptación
- [ ] Selecciono el cliente de mi cartera (con buscador por nombre o CUIT)
- [ ] Ingreso la fecha de emisión
- [ ] Puedo opcionalmente ingresar: moneda, descuento global (fijo o %), recargo (fijo o %), número de cuotas
- [ ] El número de factura se genera automáticamente de forma correlativa (`00000001`)
- [ ] Al crear, soy redirigido al formulario de la factura para agregar productos
- [ ] Si creo la factura desde "convertir presupuesto", los productos ya están cargados
- [ ] Solo puede crear facturas quien tenga el permiso "Crear Facturas Ventas"
- [ ] El free tier limita la cantidad de facturas que pueden crearse

### Notas técnicas
- `CreateInvoiceSaleAction`: número = `str_pad(lastNumber+1, 8, '0', STR_PAD_LEFT)`, `iva_type = 'INCLUDED'` hardcodeado, `status = DRAFT`
- `IncrementFreetierResourceAction('invoice_sales')` al crear
- Si `invoice_origin` apunta a un presupuesto, los productos ya vienen cargados del `CompleteBudgetFifoPipeline`

---

## US-INV-04 — Agregar productos a la factura

**Como** vendedor,  
**quiero** agregar los productos que se están vendiendo a la factura,  
**para** que quede documentado exactamente qué se facturó y a qué precio.

### Criterios de aceptación
- [ ] Puedo buscar productos por nombre o código de barras
- [ ] Al seleccionar un producto, se precarga el precio de venta actual del catálogo
- [ ] Puedo modificar el precio del producto para esta factura sin afectar el catálogo
- [ ] Puedo aplicar un descuento porcentual por línea
- [ ] Puedo cambiar la cantidad
- [ ] Si activo "Actualizar precio en catálogo", el precio se actualizará globalmente al guardar
- [ ] Si agrego el mismo producto dos veces (con mismo precio y margen), se acumula la cantidad
- [ ] Los totales de la factura (subtotal, IVA, total) se recalculan con cada cambio
- [ ] El lote se asigna automáticamente al completar (no ahora)
- [ ] Solo puede agregar productos quien tenga el permiso "Actualizar Facturas Ventas"

### Notas técnicas
- `AddProductToInvoiceAction` → `AddProductToInvoicePipeline`
- Pipes: `ValidateDataPipe → SetProductTaxValuePipe → CheckExistingProductPipe → UpdatePivotDataPipe → AddNewProductPipe`
- `batch_id = null` en `invoice_product` hasta que se complete
- `tax_value` se guarda como snapshot en el pivot (no se actualiza si cambia el IVA del catálogo)

---

## US-INV-05 — Editar cantidad, precio o descuento de un ítem

**Como** vendedor,  
**quiero** poder modificar las líneas de la factura antes de completarla,  
**para** corregir errores sin tener que eliminar y volver a agregar el ítem.

### Criterios de aceptación
- [ ] Puedo editar la cantidad de cualquier línea de producto
- [ ] Puedo editar el precio unitario (sobrescribe el precio del catálogo para esta factura)
- [ ] Puedo editar el descuento porcentual por línea
- [ ] Al cambiar cualquier valor, los totales se recalculan automáticamente
- [ ] Solo se puede editar en facturas con estado "Borrador"
- [ ] Solo puede editar quien tenga el permiso "Actualizar Facturas Ventas"

### Notas técnicas
- Tres endpoints independientes con sus pipelines:
  - `PUT .../products/{product}/quantity` → `UpdateProductQuantityPipeline`
  - `PUT .../products/{product}/price` → `UpdateProductPricePipeline`
  - `PUT .../products/{product}/discount` → `UpdateProductDiscountPipeline`

---

## US-INV-06 — Completar la factura (deducir stock con FIFO)

**Como** vendedor,  
**quiero** completar la factura cuando el pedido está listo para salir,  
**para** registrar definitivamente la venta y descontar el stock del inventario.

### Criterios de aceptación
- [ ] Al completar, el sistema descuenta el stock de cada producto usando criterio FIFO (los lotes más próximos a vencer se consumen primero)
- [ ] Si el stock no alcanza con lotes normales, el sistema usa el stock sin lote como respaldo
- [ ] El estado de la factura cambia a "Aceptado"
- [ ] Los lotes asignados quedan registrados en cada línea de la factura (para futura restauración si se cancela)
- [ ] No se puede completar una factura sin productos
- [ ] No se puede completar una factura que no esté en estado Borrador
- [ ] Puedo ver qué lotes fueron asignados a cada producto en el detalle de la factura completada
- [ ] Solo puede completar quien tenga el permiso "Actualizar Facturas Ventas"

### Notas técnicas
- `InvoiceCompleteAction` → `CompleteInvoiceFifoPipeline` dentro de `DB::transaction`
- 6 pipes: Validate → ProcessFIFO → Consolidate → UpdateStatus → CalculateTotals → RegisterActivity
- La actividad `INVOICE_SALE_COMPLETED` almacena el JSON completo con lotes y cantidades deducidas
- Post-completar: limpia caché del dashboard de tesorería

---

## US-INV-07 — Cancelar una factura (restaurar stock)

**Como** administrador,  
**quiero** poder cancelar una factura ya completada,  
**para** revertir la venta y devolver el stock al inventario en los mismos lotes que se habían deducido.

### Criterios de aceptación
- [ ] Al cancelar, el stock de cada lote afectado vuelve a su cantidad anterior
- [ ] El estado de la factura cambia a "Cancelado" pero el registro permanece en el sistema
- [ ] Si la factura tenía cobros registrados en tesorería, el saldo del cliente se actualiza
- [ ] Se registra una actividad de restauración de stock con el detalle de los lotes revertidos
- [ ] Solo puede cancelar quien tenga el permiso "Eliminar Facturas Ventas"

### Notas técnicas
- `CancelInvoiceSaleAction::execute()` → `RestoreStockFromInvoiceAction` + `status = CANCELLED`
- `RestoreStockFromInvoiceAction` lee el JSON de la actividad `INVOICE_SALE_COMPLETED` para saber qué lotes restaurar
- Si no hay actividad histórica (ej: factura migrada) → warning en logs, no revienta
- La cancelación registra una nueva actividad `BATCH_STOCK_RESTORATION`

---

## US-INV-08 — Eliminar una factura borrador

**Como** vendedor,  
**quiero** eliminar una factura que creé por error antes de completarla,  
**para** mantener la lista de facturas limpia sin borradores obsoletos.

### Criterios de aceptación
- [ ] Solo se pueden eliminar facturas en estado "Borrador"
- [ ] La eliminación es un soft delete — el registro permanece en la BD por auditoría
- [ ] No se restaura stock (los borradores no tienen stock deducido)
- [ ] Solo puede eliminar quien tenga el permiso "Eliminar Facturas Ventas"

### Notas técnicas
- `DELETE /invoices-sale/{invoice}` → `restoreStock()` (no-op para DRAFT) + `DeleteInvoiceAction` → soft delete

---

## US-INV-09 — Descargar la factura en PDF

**Como** vendedor o administrador,  
**quiero** descargar la factura en formato PDF,  
**para** enviársela al cliente o archivarla.

### Criterios de aceptación
- [ ] Solo se puede descargar facturas en estado Aceptado, Pagado o Parcialmente Pagado
- [ ] El PDF incluye: datos del emisor, datos del cliente, número y fecha de la factura, IVA aplicado, listado de productos, descuentos, recargos y total
- [ ] Si la factura tiene CAE, el PDF incluye el código y el QR de verificación AFIP
- [ ] El nombre del archivo descargado es `factura-venta-{numero}.pdf`
- [ ] Solo puede descargar quien tenga el permiso "Ver Facturas Ventas"

### Notas técnicas
- `GenerateInvoicePdfAction`: usa `barryvdh/laravel-dompdf`, Blade view `pdfs.invoice-sale`
- Guarda el PDF en Cloudflare R2 en `pdfs/factura-venta-{number}.pdf`
- Usa `GetInvoiceByIdAction::calculateInvoiceTotals()` para consistencia con la UI

---

## US-INV-10 — Autorizar la factura ante ARCA (obtener CAE)

**Como** administrador o contador con acceso ARCA,  
**quiero** autorizar la factura ante AFIP/ARCA para obtener el CAE,  
**para** que el comprobante tenga validez fiscal.

### Criterios de aceptación
- [ ] El botón "Autorizar ante AFIP" aparece en facturas con estado "Aceptado"
- [ ] Al autorizar, el sistema envía la factura a ARCA y recibe el CAE, número de comprobante y vencimiento
- [ ] Si ARCA devuelve error, se muestra el mensaje de error específico (ej: "CUIT del receptor no válido")
- [ ] Una vez autorizada, se muestra el CAE y la fecha de vencimiento en el detalle de la factura
- [ ] Si el tenant no tiene certificado ARCA configurado, aparece un mensaje orientando a configurarlo
- [ ] Solo puede autorizar quien tenga acceso a la sección ARCA (módulo 14)

### Notas técnicas
- `POST /fe/cae-request` con `invoice_id` → `FeCaeRequestAction` → guarda `cae`, `cae_expiration_date`, `cbte_nro`, `cbte_tipo`, `PtoVta` en la factura
- Flujo detallado en módulo 14-arca

---

## US-INV-11 — Crear una nota de crédito

**Como** vendedor o administrador,  
**quiero** emitir una nota de crédito referenciando una factura de venta,  
**para** reducir el monto que debe el cliente por devoluciones, descuentos posteriores o errores de facturación.

### Criterios de aceptación
- [ ] Selecciono la factura de origen de la nota de crédito (solo facturas con estado != Borrador)
- [ ] Ingreso el motivo de la nota de crédito
- [ ] Agrego los productos y cantidades que corresponden al crédito
- [ ] El número de NC se genera automáticamente (`NC-00000001`)
- [ ] La nota de crédito hereda el cliente, moneda e IVA de la factura de origen
- [ ] Al completar la NC, el crédito queda disponible para compensar deudas del cliente en tesorería
- [ ] Solo puede crear NC quien tenga el permiso "Crear Notas Crédito"

### Notas técnicas
- `CreateNoteAction`: `invoice_type = 'credit_note'`, `invoice_origin = factura.id`, hereda configuraciones de la factura
- `CompleteNoteAction` → `status = ACCEPTED`
- Las NC no generan movimientos de stock (no hay pipeline FIFO)
- Treasury consume las NC vía `GetCounterpartyCreditNotes`

---

## US-INV-12 — Crear una nota de débito

**Como** administrador o contador,  
**quiero** emitir una nota de débito referenciando una factura existente,  
**para** aumentar el monto que debe el cliente por cargos adicionales, penalidades o diferencias de precio.

### Criterios de aceptación
- [ ] Selecciono la factura de origen
- [ ] Ingreso el motivo de la nota de débito
- [ ] Agrego los productos o conceptos con sus montos
- [ ] El número de ND se genera automáticamente (`ND-00000001`)
- [ ] Al completar, la deuda del cliente en tesorería se incrementa por el monto de la ND
- [ ] Solo puede crear ND quien tenga el permiso "Crear Notas Crédito" (misma policy que NC)

### Notas técnicas
- `CreateNoteAction`: `invoice_type = 'debit_note'`
- Misma infraestructura que NC, diferente `invoice_type`

---

## US-INV-13 — Ver el listado de notas de crédito y débito

**Como** contador o administrador,  
**quiero** ver todas las notas de crédito y débito emitidas,  
**para** hacer seguimiento de los ajustes realizados a las facturas.

### Criterios de aceptación
- [ ] La lista muestra: número de NC/ND, tipo (crédito/débito), factura de origen, cliente, fecha, monto y estado
- [ ] Puedo buscar por número de NC, cliente o número de factura de origen
- [ ] Puedo filtrar por tipo (crédito/débito) y estado
- [ ] Paginación de 10 por página
- [ ] Solo puede acceder quien tenga el permiso "Ver Notas Crédito"

### Notas técnicas
- `GetAllNotesAction`: filtra `invoice_type IN (credit_note, debit_note)`
- También carga facturas de venta pagadas para el selector de "factura de origen"

---

## US-INV-14 — Descargar nota de crédito en PDF

**Como** vendedor o contador,  
**quiero** descargar la nota de crédito en PDF,  
**para** enviársela al cliente o archivarla junto con la factura original.

### Criterios de aceptación
- [ ] Solo se puede descargar una NC que esté en estado "Aceptado"
- [ ] El PDF incluye: número de NC, factura de origen referenciada, motivo, productos/conceptos y total
- [ ] El nombre del archivo es `{NC-00000001}.pdf`
- [ ] Solo puede descargar quien tenga el permiso "Ver Notas Crédito"

### Notas técnicas
- `GenerateNotePdfAction::execute($invoice)` → guarda en R2
- Filename: `{invoice->invoice_number}.pdf`

---

## US-INV-15 — Aplicar descuento global a la factura (v2.0 mejorado)

**Como** vendedor,  
**quiero** aplicar un descuento comercial global sobre el total de la factura,  
**para** ofrecer un precio final competitivo sin modificar cada línea individualmente.

### Criterios de aceptación
- [ ] Puedo configurar un descuento global: porcentaje (ej: 10%) o monto fijo (ej: $5.000)
- [ ] El descuento se muestra como línea separada: "Descuento comercial: -$X"
- [ ] El IVA se recalcula sobre la base descontada (no simplemente se reduce el total)
- [ ] Puedo ver claramente: subtotal, descuento global, subtotal neto, IVA sobre base descontada, recargo y total final
- [ ] Los campos ya existen en la BD — solo falta mejorar la UI para mostrar el desglose completo

### Notas técnicas
- Las columnas `discount_type`, `discount_value`, `interest_type`, `interest_value` ya existen en `invoices`
- `GetInvoiceByIdAction::calculateInvoiceTotals()` ya implementa el recalculo de IVA por `rateGroups`
- Mejora v2.0: mejorar la presentación visual del desglose en la pantalla de factura

---

## US-INV-16 — Configurar IVA discriminado vs. incluido (v2.0)

**Como** administrador,  
**quiero** elegir si el IVA se muestra discriminado o incluido en la factura,  
**para** que el comprobante sea correcto según el tipo de cliente (Responsable Inscripto vs. Consumidor Final).

### Criterios de aceptación
- [ ] Al crear la factura, puedo seleccionar: "IVA Incluido" o "IVA Discriminado"
- [ ] Si selecciono el cliente y es Responsable Inscripto, el sistema sugiere "Discriminado" automáticamente
- [ ] Si selecciono Consumidor Final, el sistema sugiere "Incluido"
- [ ] El PDF genera el formato correcto según la selección
- [ ] Actualmente `iva_type` siempre se crea como `INCLUDED` — esta mejora lo hace configurable en la creación

### Notas técnicas
- **Mejora v2.0** — actualmente `iva_type` está hardcodeado a `INCLUDED` en `CreateInvoiceSaleAction`
- La columna ya existe: `invoices.iva_type` (enum: `DISCRIMINATED | INCLUDED`)
- La letra del comprobante ARCA (A, B, C) depende de `iva_type` + condición fiscal del cliente

---

## US-INV-17 — Link de pago online (v2.0)

**Como** vendedor,  
**quiero** enviar al cliente un link para que pague la factura online,  
**para** agilizar el cobro sin necesidad de coordinar transferencias manualmente.

### Criterios de aceptación
- [ ] Un botón "Generar link de pago" en facturas ACCEPTED genera un link único y seguro
- [ ] El cliente accede al link y ve el detalle de la factura con opciones de pago (MercadoPago, transferencia)
- [ ] Al pagar, la factura se marca automáticamente como pagada en tesorería
- [ ] El link expira al vencimiento de la factura (`expiration_date`)
- [ ] Se puede reenviar el link por email directamente desde la UI

### Notas técnicas
- **Nuevo en v2.0**
- Nueva columna: `invoices.payment_token` (varchar unique nullable)
- Ruta pública: `GET /pay/{token}` — sin login, solo token
- `POST /pay/{token}/mp-webhook` ← webhook de MercadoPago para confirmar pago automático

---

## US-INV-18 — Envío automático de factura por email (v2.0)

**Como** administrador,  
**quiero** que al completar y autorizar una factura, el sistema la envíe automáticamente por email al cliente,  
**para** evitar tener que enviarla manualmente cada vez.

### Criterios de aceptación
- [ ] Configuración por tenant: "Enviar factura por email automáticamente: Sí / No"
- [ ] Si está activado, al obtener el CAE la factura se envía por email al cliente (con el PDF adjunto)
- [ ] Si el cliente no tiene email, aparece un aviso al completar: "No se pudo enviar el email — el cliente no tiene dirección configurada"
- [ ] Puedo reenviar manualmente en cualquier momento desde el detalle de la factura

### Notas técnicas
- **Nuevo en v2.0**
- Job `SendInvoiceEmailJob` disparado al recibir CAE exitoso
- Usa `inertia-mailable` + Blade para el template de email
- Nueva tabla `tenant_settings.auto_send_invoice_email` (boolean)

---

## US-INV-19 — Anulación fiscal ante ARCA (v2.0)

**Como** contador,  
**quiero** anular un comprobante ya autorizado ante ARCA directamente desde la UI,  
**para** cumplir con el proceso de anulación fiscal sin depender de herramientas externas.

### Criterios de aceptación
- [ ] El botón "Anular ante AFIP" aparece solo en facturas con CAE asignado
- [ ] Al anular, el sistema envía la solicitud a ARCA y cambia el estado a "Anulado"
- [ ] El PDF de la factura muestra el sello "ANULADO"
- [ ] Se registra la anulación en el historial de actividades

### Notas técnicas
- **Mejora v2.0** — existe `InvoiceStatus::ANULLED` pero no hay flujo UI completo
- Integración con `FECAERequest` usando tipo de operación de baja

---

## US-INV-20 — Asistente IA para generación de factura (v2.0, requiere add-on IA)

**Como** vendedor con el add-on de IA activo,  
**quiero** describir en lenguaje natural lo que vendí y que la IA genere los ítems de la factura,  
**para** acelerar la carga y reducir errores en facturas repetitivas.

### Criterios de aceptación
- [ ] Un campo de texto en la pantalla de factura permite: "Vendí 20 unidades de Producto A a $1500 y 5 unidades de Producto B con 10% de descuento"
- [ ] La IA interpreta la descripción y agrega automáticamente los ítems al borrador
- [ ] El vendedor puede revisar, ajustar y confirmar antes de completar
- [ ] Si la IA no identifica un producto del catálogo, lo indica: "No encontré 'Producto X' en tu catálogo"
- [ ] Si el add-on no está activo, el campo de IA no aparece

### Notas técnicas
- **Nuevo en v2.0** — requiere add-on de IA activo
- El LLM interpreta la descripción y mapea a productos del catálogo; los cálculos los hace el backend
- Mismo principio que `US-BUDG-12` del módulo 12
