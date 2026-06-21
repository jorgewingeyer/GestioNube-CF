# Historias de Usuario — Módulo 12: Presupuestos

> **Módulo:** 12-budget  
> **Fase:** 3 — Ciclo Comercial  
> **Depende de:** 07-products, 11-clients-providers, 02-tenant, 03-rbac

---

## US-BUDG-01 — Ver la lista de presupuestos

**Como** vendedor o administrador,  
**quiero** ver todos los presupuestos emitidos por mi empresa,  
**para** hacer seguimiento de cuáles están pendientes de respuesta, cuáles se convirtieron en facturas y cuáles vencieron.

### Criterios de aceptación
- [ ] La lista muestra: número de presupuesto, fecha, nombre del cliente, total calculado y estado
- [ ] Los estados son: Borrador (gris) y Aceptado/Convertido (verde)
- [ ] Puedo buscar por número de presupuesto, fecha o nombre de cliente
- [ ] Puedo filtrar por estado (borrador / aceptado)
- [ ] Puedo ordenar por número, fecha o nombre de cliente
- [ ] Paginación de 10 por página
- [ ] Con el permiso "Ver Facturas Sucursales", veo presupuestos de todas las sucursales y puedo filtrar por sucursal
- [ ] Solo puede acceder quien tenga el permiso "Ver Presupuestos"

### Notas técnicas
- `GetAllBudgetAction`: filtra `invoice_type = 'budget'`, multi-tenant con `GetTenantContextAction`
- Los totales se calculan en PHP sobre los `products` relacionados — no están en la BD
- Búsqueda usa JOIN con `counterparties` solo cuando hay término de búsqueda (optimización)

---

## US-BUDG-02 — Crear un nuevo presupuesto

**Como** vendedor,  
**quiero** crear un presupuesto para un cliente con los productos y precios cotizados,  
**para** enviárselo antes de que tome la decisión de compra.

### Criterios de aceptación
- [ ] Selecciono el cliente de mi cartera (con buscador)
- [ ] Ingreso la fecha de emisión y la fecha de vencimiento de la cotización
- [ ] Selecciono si el IVA está discriminado o incluido en los precios
- [ ] El número de presupuesto se genera automáticamente (`PRES-00000001`)
- [ ] Al guardar, quedo en la pantalla de detalle del presupuesto para agregar productos
- [ ] Solo puede crear presupuestos quien tenga el permiso "Crear Presupuestos"
- [ ] El free tier limita la cantidad de presupuestos que pueden crearse

### Notas técnicas
- `CreateBudgetAction`: genera `invoice_number = 'PRES-' + str_pad(lastNumber + 1, 8, '0', STR_PAD_LEFT)`
- Status inicial: `InvoiceStatus::DRAFT`
- Redirect a `/budget/create/{budget->id}` — el formulario sirve tanto para crear como para editar

---

## US-BUDG-03 — Agregar productos al presupuesto

**Como** vendedor,  
**quiero** agregar los productos que quiero cotizar al presupuesto,  
**para** que el cliente vea exactamente qué está comprando y a qué precio.

### Criterios de aceptación
- [ ] Puedo buscar productos por nombre o código de barras
- [ ] Al seleccionar un producto, se precarga el precio de venta actual del catálogo
- [ ] Puedo ajustar el precio del producto para este presupuesto sin modificar el catálogo
- [ ] Puedo aplicar un descuento porcentual por producto
- [ ] Puedo cambiar la cantidad
- [ ] Si agrego el mismo producto dos veces (con mismo precio y margen), se acumula la cantidad en una sola línea
- [ ] Los totales del presupuesto (subtotal, IVA, total) se actualizan con cada cambio
- [ ] Solo puede agregar productos quien tenga el permiso "Actualizar Presupuestos"

### Notas técnicas
- `AddProductToBudgetAction` → `AddProductToBudgetPipeline` (dentro de `DB::transaction`)
- Pipes: `ValidateDataPipe → SetProductTaxValuePipe → CheckExistingProductPipe → UpdatePivotDataPipe → AddNewProductPipe`
- `batch_id = null` en la pivot: el stock solo se asigna al convertir, nunca al presupuestar
- El precio se guarda en centavos enteros en `invoice_product.price`

---

## US-BUDG-04 — Editar cantidad, precio o descuento de un ítem

**Como** vendedor,  
**quiero** poder modificar la cantidad, el precio o el descuento de un producto ya agregado al presupuesto,  
**para** ajustar la cotización sin tener que eliminar y volver a agregar el ítem.

### Criterios de aceptación
- [ ] Puedo editar la cantidad de un ítem directamente en la tabla del presupuesto
- [ ] Puedo editar el precio de un ítem (sobrescribe el precio del catálogo para este presupuesto)
- [ ] Puedo aplicar un descuento porcentual por línea
- [ ] Al cambiar cualquier valor, los totales del presupuesto se recalculan automáticamente
- [ ] Solo puede editar quien tenga el permiso "Actualizar Presupuestos"

### Notas técnicas
- Tres endpoints independientes: `PUT /budget/{budget}/products/{product}/quantity|price|discount`
- Usan los mismos pipelines de `InvoiceSale`: `UpdateProductQuantityPipeline`, `UpdateProductPricePipeline`, `UpdateProductDiscountPipeline`

---

## US-BUDG-05 — Eliminar un producto del presupuesto

**Como** vendedor,  
**quiero** quitar un producto del presupuesto,  
**para** corregir errores de carga o sacar ítems que el cliente decidió no incluir.

### Criterios de aceptación
- [ ] Un botón "Eliminar" en cada línea de producto lo quita del presupuesto
- [ ] Los totales se recalculan automáticamente al eliminar
- [ ] Solo puede eliminar quien tenga el permiso "Actualizar Presupuestos"

### Notas técnicas
- `DELETE /budget/{budget}/products` con `product_id` en el body
- `DeleteProductFromInvoiceAction` → `DeleteProductFromInvoicePipeline`

---

## US-BUDG-06 — Descargar el presupuesto en PDF

**Como** vendedor,  
**quiero** descargar el presupuesto en formato PDF,  
**para** enviárselo al cliente por email o imprimirlo.

### Criterios de aceptación
- [ ] Un botón "Descargar PDF" genera el presupuesto en formato PDF
- [ ] El PDF incluye: datos del emisor (tenant), datos del cliente, número y fecha del presupuesto, fecha de vencimiento, listado de productos con cantidad, precio unitario, descuento e IVA, y el total
- [ ] El nombre del archivo descargado es `presupuesto-PRES-00000001.pdf`
- [ ] Solo puede descargar quien tenga el permiso "Ver Presupuestos"

### Notas técnicas
- `GET /budget/{budget}/download-pdf` con guard `view`
- `GenerateBudgetPdfAction::execute($budget)` → `Content-Type: application/pdf`

---

## US-BUDG-07 — Convertir el presupuesto en factura de venta

**Como** vendedor,  
**quiero** convertir un presupuesto aceptado por el cliente en una factura de venta con un solo click,  
**para** no tener que volver a cargar todos los productos y precios en la factura.

### Criterios de aceptación
- [ ] El botón "Convertir a Factura" aparece en presupuestos con estado "Borrador" que tienen al menos un producto
- [ ] Al convertir, se crea automáticamente una factura de venta con todos los productos, precios y descuentos del presupuesto
- [ ] El sistema asigna automáticamente los lotes a cada producto usando criterio FIFO (primero en vencer, primero en salir)
- [ ] Soy redirigido a la pantalla de la nueva factura de venta, donde puedo revisarla antes de autorizarla en AFIP
- [ ] El presupuesto queda marcado como "Aceptado" y no puede volver a convertirse
- [ ] Si el presupuesto no tiene productos, aparece un error: "No se puede convertir un presupuesto sin productos"
- [ ] Solo puede convertir quien tenga el permiso "Actualizar Presupuestos"

### Notas técnicas
- `PUT /budget/{budget}/complete` → `BudgetCompleteAction` → `CompleteBudgetFifoPipeline` dentro de `DB::transaction`
- La nueva factura tiene `invoice_origin = budget.id` como referencia de trazabilidad
- El redireccionamiento es a `/invoices-sale/create?invoice_id={nueva_factura.id}` — la factura ya está en estado `ACCEPTED`
- Si el pipeline falla en cualquier paso, toda la transacción se revierte

---

## US-BUDG-08 — Eliminar un presupuesto

**Como** administrador,  
**quiero** eliminar un presupuesto que ya no es relevante,  
**para** mantener la lista de presupuestos limpia sin cotizaciones obsoletas.

### Criterios de aceptación
- [ ] Puedo eliminar presupuestos en cualquier estado (Borrador o Aceptado)
- [ ] La eliminación es un soft delete — el registro permanece en la BD para auditoría
- [ ] Solo puede eliminar quien tenga el permiso "Eliminar Presupuestos"

### Notas técnicas
- `DELETE /budget/{budget}` → `DeleteBudgetAction::execute($budget)` → `$budget->delete()` (soft delete)

---

## US-BUDG-09 — Aplicar descuento global al presupuesto (v2.0 mejorado)

**Como** vendedor,  
**quiero** poder aplicar un descuento global sobre el total del presupuesto (además de los descuentos por línea),  
**para** ofrecer un precio final más competitivo sin tener que ajustar cada producto individualmente.

### Criterios de aceptación
- [ ] Puedo configurar un descuento global: porcentaje (ej: 5%) o monto fijo (ej: $1.000)
- [ ] El descuento global se muestra como una línea separada en el resumen del total: "Descuento comercial: -$X"
- [ ] Puedo configurar también un recargo (interés) global: por cuotas o fijo
- [ ] Los campos de descuento e interés ya existen en la BD (`discount_type`, `discount_value`, `interest_type`, `interest_value`) — solo falta integrarlos en la UI del formulario y en el cálculo de totales mostrado

### Notas técnicas
- **Mejora v2.0** — las columnas ya existen en `invoices` pero no están completamente integradas en el cálculo de totales mostrado en pantalla
- `CalculateBudgetTotalsAction` no aplica el descuento global todavía — solo suma los descuentos por línea
- Al convertir a factura, los campos `discount_type`, `discount_value`, `interest_type`, `interest_value` se copian a la factura de venta

---

## US-BUDG-10 — Plantillas de presupuesto (v2.0)

**Como** vendedor que cotiza los mismos productos o servicios repetidamente,  
**quiero** guardar un presupuesto como plantilla y reutilizarlo fácilmente,  
**para** no tener que cargar los mismos productos y precios cada vez que hago una cotización similar.

### Criterios de aceptación
- [ ] Puedo marcar un presupuesto como "Plantilla" desde su detalle
- [ ] Al crear un nuevo presupuesto, puedo elegir "Crear desde plantilla" y seleccionar una plantilla existente
- [ ] Al usar una plantilla, se copia la lista de productos, precios y descuentos, pero el cliente y la fecha son nuevos
- [ ] Las plantillas no tienen número de presupuesto asignado hasta que se usan para crear uno real
- [ ] Puedo nombrar las plantillas para identificarlas (ej: "Mantenimiento mensual", "Kit de bienvenida")

### Notas técnicas
- **Nuevo en v2.0** — no existe esta funcionalidad
- Nueva columna: `invoices.is_template` (boolean, default false)
- Las plantillas tienen `status = 'draft'` y `counterparty_id` nullable (se asigna al usar la plantilla)

---

## US-BUDG-11 — Aprobación online del presupuesto por el cliente (v2.0)

**Como** vendedor,  
**quiero** enviar el presupuesto al cliente mediante un link único y seguro para que lo apruebe online,  
**para** agilizar el proceso de venta sin necesidad de llamadas ni emails de ida y vuelta.

### Criterios de aceptación
- [ ] Un botón "Compartir con cliente" genera un link único con token de acceso
- [ ] El cliente accede al link y ve el presupuesto en formato web (sin necesitar login)
- [ ] El cliente puede hacer click en "Aprobar presupuesto" o "Rechazar" con un motivo
- [ ] Al aprobar: el sistema cambia el estado del presupuesto, envía una notificación al vendedor y opcionalmente convierte automáticamente a factura
- [ ] Al rechazar: el vendedor recibe notificación con el motivo y el presupuesto queda en estado "Rechazado"
- [ ] El link expira cuando vence el presupuesto (`expiration_date`)

### Notas técnicas
- **Nuevo en v2.0** — no existe esta funcionalidad
- Nueva columna: `invoices.share_token` (varchar unique nullable), `invoices.shared_at` (timestamp nullable)
- Ruta pública: `GET /public/budget/{token}` — sin autenticación, solo con token válido
- Al aprobar: `PUT /public/budget/{token}/approve` → cambia `status = ACCEPTED`

---

## US-BUDG-12 — Presupuesto asistido por IA (v2.0, requiere add-on IA)

**Como** vendedor con el add-on de IA activo,  
**quiero** describir en lenguaje natural lo que necesito cotizar y que la IA genere el borrador del presupuesto,  
**para** acelerar la creación de presupuestos y reducir errores de búsqueda de productos.

### Criterios de aceptación
- [ ] Un campo de texto libre en el formulario de presupuesto permite describir la necesidad: "quiero cotizar 50 sillas de jardín modelo A y 10 mesas plegables"
- [ ] La IA busca los productos en el catálogo que coincidan con la descripción y genera los ítems del presupuesto
- [ ] El resultado es un borrador que el vendedor puede revisar, ajustar y confirmar antes de guardar
- [ ] Si la IA no encuentra un producto en el catálogo, lo indica claramente: "No encontré 'silla jardín modelo X' en tu catálogo"
- [ ] La IA puede sugerir cantidades basadas en pedidos anteriores del mismo cliente
- [ ] Si el add-on no está activo, el campo de texto IA no aparece

### Notas técnicas
- **Nuevo en v2.0** — requiere add-on de IA activo
- Endpoint: `POST /api/budget/ai-suggest` con `{description, counterparty_id, tenant_id}`
- El LLM recibe el catálogo de productos (nombre, SKU, precio) y la descripción, y devuelve los ítems sugeridos en JSON
- Los cálculos de precios y totales los hace el backend — el LLM solo interpreta la descripción y mapea a productos
