# Módulo 12 — Presupuestos (Budget)

> **Fase:** 3 — Ciclo Comercial  
> **Depende de:** 07-products, 11-clients-providers, 02-tenant, 03-rbac  
> **Es requerido por:** 13-invoice-sales (conversión de presupuesto a factura)

---

## 1. Propósito y Alcance

El módulo de presupuestos permite generar cotizaciones para clientes antes de emitir una factura. Un presupuesto agrupa productos con precios, descuentos e impuestos, y puede convertirse en una factura de venta en un solo click mediante un pipeline FIFO de asignación de stock.

**Dato clave:** los presupuestos NO son una entidad separada — son registros en la tabla `invoices` con `invoice_type = 'budget'`. Comparten el mismo modelo `Invoice` que facturas de venta, compras y notas de crédito.

**Quién lo usa:** comerciales, vendedores, administradores.

**Alcance:**
- Crear un presupuesto con datos del cliente, fecha de vencimiento y productos
- Agregar, editar precio/cantidad/descuento y eliminar productos de un presupuesto
- Descargar el presupuesto en PDF
- Convertir el presupuesto a factura de venta (flujo FIFO de stock)
- Eliminar presupuestos en estado borrador

---

## 2. Entidades de Datos

### 2.1 Tabla `invoices` (discriminada por `invoice_type = 'budget'`)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `tenant_id` | bigint FK → tenants | cascade |
| `counterparty_id` | bigint FK → counterparties | cascade — el cliente al que se presupuesta |
| `invoice_number` | varchar | Formato: `PRES-00000001` — autoincremental por tenant |
| `invoice_date` | date | Fecha de emisión del presupuesto |
| `expiration_date` | date nullable | Fecha de validez del presupuesto |
| `invoice_type` | varchar | Siempre `'budget'` en este módulo |
| `invoice_origin` | varchar nullable | ID del presupuesto origen si esta factura fue convertida (se guarda en la factura de venta generada, no en el presupuesto) |
| `status` | varchar | `InvoiceStatus` — solo `DRAFT` o `ACCEPTED` para presupuestos |
| `currency` | varchar | Siempre `'ARS'` por ahora |
| `iva_type` | enum | `'DISCRIMINATED'` (IVA discriminado) o `'INCLUDED'` (precio con IVA incluido) |
| `tax_tenant_id` | bigint FK → tenants nullable | Tenant cuyas configuraciones impositivas se aplican |
| `discount_type` | varchar | Enum `DiscountType` — tipo de descuento global del presupuesto |
| `discount_value` | decimal nullable | Valor del descuento global |
| `interest_type` | varchar | Enum `InterestType` — tipo de recargo global |
| `interest_value` | decimal nullable | Valor del recargo global |
| `installments` | integer | Cantidad de cuotas |
| `deleted_at` | timestamp nullable | Soft delete |

**Columnas que NO existen en la tabla:** `subtotal`, `total`, `total_tax`, `total_discounts`. Los totales se calculan en PHP al momento de leer, no se persisten en BD.

### 2.2 Tabla pivot `invoice_product`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `invoice_id` | bigint FK → invoices | |
| `product_id` | bigint FK → products | |
| `quantity` | integer | Cantidad de unidades |
| `price` | integer (unsigned) | Precio unitario **en centavos**, con IVA incluido |
| `discount` | float | Porcentaje de descuento por línea (0–100) |
| `tax_value` | float | Alícuota de IVA aplicada (ej: 21, 10.5, 0) |
| `margin_id` | bigint FK → margins nullable | Margen aplicado |
| `batch_id` | bigint FK → batches nullable | Nulo en presupuestos; se asigna al convertir a factura (FIFO) |
| `update_product_price` | boolean | Si al convertir se actualiza el precio en el catálogo |
| `update_product_tax` | boolean | Si al convertir se actualiza el impuesto en el catálogo |

### 2.3 Enums relevantes

**`InvoiceStatus`** (estados usados en presupuestos):
```
DRAFT    → Estado inicial al crear
ACCEPTED → Convertido a factura de venta
```

**`InvoiceTypes`** (solo `BUDGET` en este módulo):
```
BUDGET = 'budget'
```

**`DiscountType`** (tipo de descuento global):
```
PERCENTAGE → Porcentaje sobre el total
FIXED      → Monto fijo en centavos
```

**`InterestType`** (tipo de recargo global):
```
PERCENTAGE → Porcentaje sobre el total
FIXED      → Monto fijo en centavos
```

---

## 3. Reglas de Negocio

### 3.1 Numeración autoincremental por tenant

El número de presupuesto sigue el formato `PRES-00000001`. `CreateBudgetAction` obtiene el último presupuesto del tenant y suma 1 al número extraído. Si no existe ninguno, empieza en 1. La numeración es independiente por tenant (cada sucursal tiene su propia secuencia).

### 3.2 Totales calculados en tiempo real (nunca persistidos)

`CalculateBudgetTotalsAction` suma los valores de cada ítem para calcular: `subtotal`, `totalDiscounts`, `totalTax`, `total`. Estos valores **no se guardan en la BD**. Cada vez que se lee un presupuesto se recalcula.

La fórmula por línea (`CalculateBudgetProductAction`):
```
priceWithTax = invoice_product.price  (en centavos, con IVA)
taxRate = tax (del producto, ej: 21%)

subtotal_line = extractNetPrice(priceWithTax) × quantity   ← sin IVA
tax_line      = extractTax(priceWithTax) × quantity
discount_line = subtotal_line × discountPercentage / 100
total_line    = subtotal_line - discount_line + tax_line
```

`CalculateTaxIncludedProductAction` extrae el neto desde el precio con impuesto: `net = price / (1 + taxRate/100)`.

### 3.3 Si el producto ya existe en el presupuesto, se acumula la cantidad

`CheckExistingProductPipe` busca si el producto ya está en el presupuesto con el mismo `margin_id` y `price`. Si ya existe, `UpdatePivotDataPipe` hace `quantity += new_quantity` en lugar de crear una nueva fila. Esto evita duplicados en el presupuesto.

### 3.4 El presupuesto no descuenta stock

Los productos se agregan al presupuesto sin asignar lote (`batch_id = null`). El stock solo se descuenta al **convertir** el presupuesto a factura de venta mediante `CompleteBudgetFifoPipeline`.

### 3.5 Conversión a factura: pipeline FIFO en transacción

Al completar un presupuesto, `BudgetCompleteAction` ejecuta `CompleteBudgetFifoPipeline` dentro de una `DB::transaction`. Los pasos son:

```
1. ValidateBudgetCompletionPipe   → status != ACCEPTED y tiene productos
2. CreateInvoiceFromBudgetPipe    → crea Invoice(type=sale_invoice, invoice_origin=budget.id)
                                    → copia los productos al pivot de la nueva factura (batch_id=null)
3. RegisterInvoiceCreationActivityPipe
4. ProcessProductsFifoPipe        → asigna lotes por FIFO a cada invoice_product
5. ConsolidateInventoryActivityPipe
6. UpdateInvoiceStatusPipe        → factura.status = ACCEPTED
7. UpdateBudgetStatusPipe         → budget.status = ACCEPTED
8. CalculateInvoiceTotalsPipe     → recalcula totales de la factura
9. RegisterBudgetCompletionActivityPipe
10. RegisterCompletionActivityPipe
```

La nueva factura referencia al presupuesto original mediante `invoice_origin = budget.id`.

### 3.6 No se puede completar un presupuesto ya convertido

`ValidateBudgetCompletionPipe` verifica que `budget.status != ACCEPTED`. Si ya fue convertido, lanza una excepción.

### 3.7 No se puede completar un presupuesto sin productos

Si el presupuesto no tiene ningún producto (`products()->count() === 0`), la validación lanza `InvalidArgumentException`.

### 3.8 `iva_type`: DISCRIMINATED vs INCLUDED

- `DISCRIMINATED`: el precio en la pivot tiene el IVA discriminado (se calcula y se muestra separado)
- `INCLUDED`: el precio ya incluye el IVA (el total final no agrega más impuesto)

La lógica de cálculo en `UpdatePivotDataPipe` maneja ambos casos al actualizar cantidades.

### 3.9 Descuento global vs descuento por línea

- **Por línea:** `invoice_product.discount` es un porcentaje (0–100) aplicado sobre el precio de ese ítem
- **Global:** `invoices.discount_value` + `invoices.discount_type` se aplican sobre el total del presupuesto (se copian a la factura de venta al convertir)

### 3.10 Visibilidad multi-sucursal

Con el permiso "Ver Facturas Sucursales", `GetAllBudgetAction` permite ver presupuestos de todas las sucursales del grupo y filtrar por `tenant_id` específico. Sin ese permiso, solo ve los del tenant activo.

### 3.11 Eliminación: soft delete del invoice

`DeleteBudgetAction` hace soft delete del invoice. No hay validación de si el presupuesto ya fue convertido antes de eliminarlo.

---

## 4. Flujos Funcionales

### 4.1 Crear un presupuesto

```
GET /budget/create
  └─ Inertia: clients (lazy), products (lazy, por nombre/barcode), margins, taxConditions, provinces

POST /budget
  │
  ├─ StoreBudgetRequest: counterparty_id, invoice_date, expiration_date?, iva_type, tax_tenant_id?
  │                       discount_type?, discount_value?, interest_type?, interest_value?, installments?
  ├─ CreateBudgetAction::execute($data)
  │   ├─ Genera invoice_number: 'PRES-' + str_pad(lastNumber + 1, 8, '0')
  │   ├─ Invoice::create({...data, status=DRAFT, currency='ARS', invoice_type=BUDGET})
  │   └─ RegisterBudgetCreationActivityAction
  ├─ IncrementFreetierResourceAction('budgets')
  └─ Redirect a /budget/create/{budget->id} (queda en pantalla de edición con el presupuesto creado)
```

### 4.2 Agregar un producto al presupuesto

```
POST /budget/{budget}/add-product
  │
  ├─ AddProductToBudgetRequest: product_id, quantity, price, margin_id?, discount?
  ├─ AddProductToBudgetAction → AddProductToBudgetPipeline (DB::transaction):
  │   ├─ ValidateDataPipe      → verifica campos requeridos
  │   ├─ SetProductTaxValuePipe → carga el impuesto del producto (Product.taxes)
  │   ├─ CheckExistingProductPipe → busca mismo product_id + margin_id + price en el budget
  │   ├─ UpdatePivotDataPipe   → si existe: qty += new_qty; si no: skip
  │   └─ AddNewProductPipe     → si no existe: attach con {qty, price, margin_id, discount, tax_value, batch_id=null}
  └─ Redirect back con flash success
```

### 4.3 Actualizar precio / cantidad / descuento de un ítem

```
PUT /budget/{budget}/products/{product}/quantity   → UpdateProductQuantityAction
PUT /budget/{budget}/products/{product}/price      → UpdateProductPriceAction (InvoiceSale pipeline)
PUT /budget/{budget}/products/{product}/discount   → UpdateProductDiscountAction (InvoiceSale pipeline)
```

Los tres usan los mismos pipelines de InvoiceSale: `UpdateProductQuantityPipeline`, `UpdateProductPricePipeline`, `UpdateProductDiscountPipeline`.

### 4.4 Convertir presupuesto a factura de venta

```
PUT /budget/{budget}/complete
  │
  ├─ BudgetCompleteAction::execute($budget) dentro de DB::transaction
  │   └─ CompleteBudgetFifoPipeline (ver §3.5 para los 10 pasos)
  └─ Redirect a /invoices-sale/create?invoice_id={nueva_factura.id}
     (la nueva factura ya está en estado ACCEPTED)
```

La nueva factura de venta tendrá `invoice_origin = budget.id` para trazabilidad.

### 4.5 Descargar PDF del presupuesto

```
GET /budget/{budget}/download-pdf
  │
  ├─ GenerateBudgetPdfAction::execute($budget)
  └─ Response: application/pdf, filename=presupuesto-{invoice_number}.pdf
```

### 4.6 Eliminar un presupuesto

```
DELETE /budget/{budget}
  │
  ├─ InvoicePolicy::delete → checkTenant + 'Eliminar Presupuestos'
  ├─ DeleteBudgetAction::execute($budget) → $budget->delete() (soft delete)
  └─ Redirect a /budget
```

---

## 5. Integraciones con Otros Módulos

| Módulo | Relación |
|--------|----------|
| **07-products** | `invoice_product` FK; búsqueda de productos por nombre/barcode para agregar al presupuesto |
| **11-clients-providers** | `Invoice.counterparty_id` FK; el presupuesto se emite para un cliente |
| **13-invoice-sales** | Al completar el presupuesto, `CreateInvoiceFromBudgetPipe` crea una `Invoice(type=sale_invoice)` y redirige a la pantalla de factura de venta |
| **08-batches** | `ProcessProductsFifoPipe` asigna lotes por FIFO al convertir a factura (no al presupuestar) |
| **14-arca** | La factura de venta generada puede pasar por el proceso de autorización AFIP/ARCA si el tenant lo requiere |
| **17-treasury** | La factura generada puede vincularse con transacciones de pago |

---

## 6. API / Endpoints

| Método | Path | Nombre | Guard | Descripción |
|--------|------|---------|-------|-------------|
| `GET` | `/budget` | `budget` | `viewAnyBudget` | Lista paginada (10/página) con search, filtro por status y sort |
| `GET` | `/budget/create/{budget_id?}` | `budget.create` | `createBudget` | Formulario (nuevo o edición si se pasa budget_id) |
| `POST` | `/budget` | `budget.store` | `storeBudget` | Crear nuevo presupuesto |
| `PUT` | `/budget/{invoice}` | `budget.update` | `update` (InvoicePolicy) | Editar cabecera del presupuesto |
| `PUT` | `/budget/{budget}/complete` | `budget.complete` | `update` (InvoicePolicy) | Convertir a factura de venta |
| `DELETE` | `/budget/{budget}` | `budget.destroy` | `delete` (InvoicePolicy) | Soft delete |
| `POST` | `/budget/{budget}/add-product` | `budget.addProduct` | `update` | Agregar producto |
| `DELETE` | `/budget/{budget}/products` | `budget.deleteProduct` | `update` | Eliminar producto |
| `PUT` | `/budget/{budget}/products/{product}/quantity` | `budget.updateProductQuantity` | `update` | Cambiar cantidad de un ítem |
| `PUT` | `/budget/{budget}/products/{product}/price` | `budget.updateProductPrice` | `update` | Cambiar precio de un ítem |
| `PUT` | `/budget/{budget}/products/{product}/discount` | `budget.updateProductDiscount` | `update` | Cambiar descuento de un ítem |
| `GET` | `/budget/{budget}/download-pdf` | `budget.downloadPdf` | `view` | Descargar PDF |

### Filtros en listado (`GetAllBudgetAction`)

- `?search=`: búsqueda en `invoice_number`, `invoice_date`, y `counterparty.name` (con JOIN optimizado)
- `?status=`: filtro por `InvoiceStatus`
- `?sort=invoice_number|invoice_date|counterparty.name` + `?direction=asc|desc`
- `?tenant_id=`: filtrar por sucursal específica (solo con permiso "Ver Facturas Sucursales")

---

## 7. Consideraciones de Migración Next.js

### Modelo polimórfico `Invoice` con discriminador

En v2.0 mantener un solo tipo `invoices` con discriminador. Con Drizzle ORM:

```typescript
// Siempre filtrar por invoice_type en queries de presupuesto
const budgets = await db
  .select()
  .from(invoices)
  .where(and(
    eq(invoices.invoiceType, 'budget'),
    inArray(invoices.tenantId, allowedTenantIds)
  ))
```

No crear una tabla separada `budgets` — comparte lógica de totales, items, PDF y estados con facturas.

### Totales calculados en el servidor

Los totales del presupuesto (`subtotal`, `total_tax`, `total`) no existen en la BD y se calculan en cada request. En Next.js implementar la misma lógica como una función pura:

```typescript
function calculateBudgetTotals(items: InvoiceProduct[]): BudgetTotals {
  return items.reduce((acc, item) => {
    const net = item.price / (1 + item.taxValue / 100);
    const discountAmount = net * item.discount / 100;
    const taxAmount = (net - discountAmount) * item.taxValue / 100;
    return {
      subtotal: acc.subtotal + (net - discountAmount) * item.quantity,
      totalDiscounts: acc.totalDiscounts + discountAmount * item.quantity,
      totalTax: acc.totalTax + taxAmount * item.quantity,
      total: acc.total + (net - discountAmount + taxAmount) * item.quantity,
    };
  }, { subtotal: 0, totalDiscounts: 0, totalTax: 0, total: 0 });
}
```

### Pipeline de conversión a factura

El pipeline de `CompleteBudgetFifoPipeline` tiene 10 pasos — en Next.js implementar como una función transaccional:

```typescript
await db.transaction(async (tx) => {
  // 1. Validar
  // 2. Crear invoice(type=sale_invoice)
  // 3. Copiar productos (batch_id=null)
  // 4. Procesar FIFO (asignar lotes)
  // 5. Marcar factura como ACCEPTED
  // 6. Marcar presupuesto como ACCEPTED
  // 7. Registrar actividades
});
```

### Numeración de presupuestos

El patrón actual de `MAX(id) + 1` sin lock puede generar colisiones bajo carga alta. En v2.0 usar una secuencia de PostgreSQL por tenant:

```sql
CREATE SEQUENCE budget_number_tenant_{tenantId};
SELECT NEXTVAL('budget_number_tenant_{tenantId}');
```

O una tabla de contadores atómicos: `INSERT INTO counters(tenant_id, type) ON CONFLICT DO UPDATE SET value = value + 1 RETURNING value`.

---

## 8. Mejoras Propuestas v2.0

### Plantillas de presupuesto

Guardar un presupuesto como "plantilla" para reutilizarlo. Al crear uno nuevo, poder cargar una plantilla y solo ajustar cliente y fecha. Útil para productos o servicios recurrentes (ej: "Mantenimiento mensual de equipos").

### Vencimiento automático y re-envío

Si el presupuesto vence sin que el cliente lo acepte, enviar un email automático: "Tu presupuesto está por vencer — contactá con nosotros para renovarlo". El sistema puede enviar una notificación al vendedor cuando el presupuesto vence.

### Firma digital del cliente (aprobación online)

Enviar al cliente un link con el presupuesto en formato web. El cliente puede aprobarlo con un click (o rechazarlo con un motivo). Al aprobar, el sistema convierte automáticamente el presupuesto en factura y notifica al vendedor.

### Historial de versiones del presupuesto

Cuando se modifica un presupuesto, guardar una snapshot de la versión anterior. El cliente puede ver el histórico de cotizaciones y el vendedor puede comparar versiones para entender qué cambió.

### Descuento por cliente (lista de precios)

Integrar con un sistema de listas de precios: si el cliente tiene asignada una lista con precios especiales o descuentos globales, al agregar ese cliente al presupuesto se aplican automáticamente los precios de su lista.

### Presupuestos por IA (add-on IA)

Con el add-on activo, el vendedor describe en lenguaje natural lo que necesita ("cotización para 50 sillas y 10 mesas de la línea industrial") y la IA busca los productos en el catálogo, sugiere cantidades y precios, y genera el borrador del presupuesto listo para revisar.
