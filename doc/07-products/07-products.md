# Módulo 07 — Productos y Catálogo

> **Fase:** 2 — Operaciones Core  
> **Depende de:** 02-tenant, 03-rbac  
> **Es requerido por:** 08-batches, 12-budget, 13-invoice-sales, 16-invoice-purchase, 15-purchase-orders

---

## 1. Propósito y Alcance

El módulo de productos gestiona el catálogo de artículos y servicios que la empresa compra y vende. Incluye la jerarquía de categorías, la configuración de márgenes de ganancia por sucursal, el historial de cambios de precio y la actualización masiva de precios.

**Quién lo usa:** administradores de stock, responsables de compras, dueños de la empresa.

**Alcance:**
- CRUD de productos con foto (Cloudflare R2), categoría, precio de compra y venta
- Categorías jerárquicas por tenant (árbol ilimitado)
- Márgenes de ganancia configurables por tenant; uno puede ser el default
- Historial automático de cada cambio de precio, margen o impuesto
- Actualización masiva de precios (por porcentaje o valor fijo)
- Exportación a PDF y Excel
- Cálculo automático de `price_sell` a partir de `price_buy` + margen + impuesto

---

## 2. Entidades de Datos

### 2.1 Tabla `products`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `tenant_id` | bigint FK → tenants | Tenant propietario del producto |
| `name` | varchar 255 | requerido |
| `description` | text | nullable |
| `price_buy` | unsignedInteger | **centavos** (1050 = $10.50) |
| `price_sell` | unsignedInteger | **centavos** |
| `category_id` | bigint FK → categories | nullable; `ON DELETE SET NULL` |
| `image` | varchar | ruta WebP en Cloudflare R2; nullable |
| `barcode` | varchar 255 | nullable |
| `is_active` | boolean | default `true` |
| `deleted_at` | timestamp | soft delete |

### 2.2 Tabla `product_tenant` (pivot multi-tenant)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `product_id` | bigint FK → products | cascade |
| `tenant_id` | bigint FK → tenants | cascade |
| `margin_id` | bigint FK → margins | nullable; `ON DELETE SET NULL` |
| `stock_minimum` | integer | nullable — alerta de stock bajo |
| `stock_maximum` | integer | nullable — límite de reposición |

- Restricción única: `(product_id, tenant_id)`
- **Un mismo producto puede pertenecer a múltiples tenants con márgenes distintos**

### 2.3 Tabla `categories`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `tenant_id` | bigint FK → tenants | cascade |
| `name` | varchar 255 | requerido |
| `description` | varchar 255 | nullable |
| `parent_id` | bigint FK → categories | nullable — árbol auto-referencial |
| `deleted_at` | timestamp | soft delete |

### 2.4 Tabla `margins`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `name` | varchar 255 | |
| `percentage` | decimal(10,2) | Ej: `35.00` para 35% |
| `is_default` | boolean | Solo uno puede ser `true` por tenant |
| `tenant_id` | bigint FK → tenants | |

### 2.5 Tabla `price_histories`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `tenant_id` | bigint FK → tenants | |
| `user_id` | bigint FK → users | nullable; `ON DELETE SET NULL` |
| `product_id` | bigint FK → products | cascade |
| `price_buy` | unsignedInteger | centavos — snapshot al momento del cambio |
| `price_sell` | unsignedInteger | centavos — snapshot |
| `tax_value` | decimal(10,2) | porcentaje de IVA vigente |
| `margin_id` | bigint FK → margins | nullable; `ON DELETE SET NULL` |
| `change_type` | varchar | enum `ChangeType` |

### 2.6 Tabla `price_history_tax`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `price_history_id` | bigint FK → price_histories | cascade |
| `tenant_id` | bigint FK → tenants | cascade |
| `tax_id` | bigint FK → taxes | cascade |
| `value` | decimal(10,2) | porcentaje del impuesto al momento del cambio |

### 2.7 Tabla `product_tax` (pivot impuestos)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `product_id` | bigint FK → products | |
| `tax_id` | bigint FK → taxes | |
| `value` | decimal(10,2) | porcentaje |

### 2.8 Enum `ChangeType`

```
price              → modificación directa del precio
margin             → cambio de margen
tax                → cambio de impuesto
bulk_update        → actualización masiva
initial            → precio inicial al crear el producto
purchase_invoice_init → precio inicial cargado desde factura de compra
```

---

## 3. Reglas de Negocio

### 3.1 Margen por tenant, no por producto global

El `margin_id` vive en el pivot `product_tenant`, no en la tabla `products`. Esto permite que el mismo producto tenga un 30% de margen en la sucursal central y 20% en una sucursal hija.

### 3.2 Cálculo automático de `price_sell`

Si el usuario no ingresa `price_sell` al crear un producto, se calcula automáticamente:

```
1. priceBuyNet = removeTaxFromPrice(price_buy, tax%)
   (se asume que el precio de compra YA incluye el IVA → se extrae)
2. priceSellNet = priceBuyNet + (priceBuyNet × margin%)
3. price_sell   = priceSellNet + (priceSellNet × tax%)
```

Fórmula inversa: si se proporciona `price_sell` directamente, se respeta sin recalcular.

### 3.3 Solo un margen `is_default` por tenant

Al marcar un margen como default, `CreateMarginAction` y `UpdateMarginAction` desmarcan automáticamente todos los otros márgenes del mismo tenant antes de guardar.

### 3.4 Creación implícita de Batch y BranchStock

Al crear un producto, `CreateProductAction` crea automáticamente un batch especial `no_batch_stock` con `quantity=0` para el tenant actual. Esto sirve como "contenedor de stock sin lote asignado". El usuario nunca ve esta lógica en el formulario.

### 3.5 Aislamiento de tenant con dos scopes

`GetAllProductAction` soporta dos modos:
- `scope=current` → solo productos del tenant activo en sesión
- `scope=all` → productos del tenant activo + todos sus tenants padre e hijos (para usuarios con permisos cross-tenant)

Siempre se filtra con `whereHas('tenants', ...)` para garantizar que el usuario solo ve productos a los que su tenant tiene acceso.

### 3.6 Historial automático de precios

Cada vez que cambia `price_buy`, `price_sell`, `margin_id` o un impuesto, `CreatePriceHistoryAction` registra un snapshot completo con el `ChangeType` correspondiente. El usuario que realizó el cambio queda registrado como auditoría.

### 3.7 Actualización masiva de precios

`ProductController@updateMass` permite actualizar precios de múltiples productos a la vez, aplicando un delta (porcentaje o valor fijo) sobre el precio actual. Cada cambio genera su `price_history` con `ChangeType::BULK_UPDATE`.

### 3.8 `ProductPolicy::update()` devuelve `false`

No existe un endpoint `PUT /products/{id}`. Las actualizaciones usan `POST /products/{id}` con `_method=PUT` (method spoofing de Laravel). La policy no verifica `update()` para este flujo.

### 3.9 Categorías jerárquicas

`parent_id` es auto-referencial: una categoría puede tener subcategorías sin límite de profundidad. Al eliminar una categoría padre, `DestroyCategoryAction` destruye recursivamente los hijos primero.

### 3.10 Precios siempre en centavos

`price_buy` y `price_sell` se almacenan como `unsignedInteger` en centavos. La conversión usa `NumberHelper::toInteger()` (entrada) y `NumberHelper::toDecimal()` (salida). Nunca se almacenan floats en BD para estos campos.

---

## 4. Flujos Funcionales

### 4.1 Crear producto

```
POST /products
  │
  ├─ Validar: StoreProductRequest
  │   ├─ name, price_buy, margin_id, tax_id requeridos (salvo que sea fromInvoice)
  │   └─ image: opcional, max 2MB, convertido a WebP
  │
  ├─ CreateProductAction::execute()
  │   ├─ Subir imagen → Cloudflare R2 (si se incluyó)
  │   ├─ Convertir price_buy → centavos
  │   ├─ Si no hay price_sell → CalculatePriceSellAction
  │   ├─ Crear registro en products con tenant_id = current_tenant
  │   ├─ Adjuntar pivot product_tenant con margin_id
  │   ├─ Adjuntar taxes si se proporcionaron (product_tax)
  │   ├─ Crear Batch "no_batch_stock" + BranchStock(qty=0)
  │   └─ Crear price_history con ChangeType::INITIAL
  │
  └─ Redirect a /products con flash de éxito
```

### 4.2 Actualizar producto

```
POST /products/{product} [_method=PUT]
  │
  ├─ Validar: UpdateProductRequest
  │
  ├─ UpdateProductAction::execute()
  │   ├─ Capturar estado actual (para detectar qué cambió)
  │   ├─ Obtener margin_id actual del pivot del tenant
  │   ├─ Actualizar campos en products
  │   ├─ Si cambió margin_id → updateExistingPivot()
  │   ├─ Manejar cambio de imagen (delete old + upload new)
  │   ├─ UpdateProductTaxAction si cambiaron impuestos
  │   └─ Si cambió precio, margen o tax → CreatePriceHistoryAction con ChangeType correcto
  │
  └─ Redirect con flash de éxito
```

### 4.3 Actualización masiva de precios

```
GET  /products/config-update-mass → formulario de configuración
POST /products/update-mass        → ejecutar actualización

  ├─ Recibe: lista de product_ids, tipo (percentage|fixed), valor
  ├─ Para cada producto:
  │   ├─ Calcular nuevo price_sell aplicando delta
  │   ├─ Actualizar products.price_sell
  │   └─ Crear price_history con ChangeType::BULK_UPDATE
  └─ Flash de éxito con conteo de productos actualizados
```

### 4.4 Historial de precios

```
GET /price-history/{product}
  │
  ├─ GetPriceHistoryAction::execute()
  │   ├─ Lista paginada de price_histories con filtros
  │   ├─ Estadísticas: máximo, mínimo, variación promedio
  │   ├─ Alertas de precio (desvíos significativos)
  │   ├─ Top productos con mayor aumento
  │   └─ Análisis por categoría
  │
  └─ Inertia render price-history/index
```

---

## 5. Integraciones con Otros Módulos

| Módulo consumidor | Qué usa de productos |
|-------------------|---------------------|
| **08-batches** | `product_id` en `batches`; al crear producto se crea batch vacío |
| **12-budget** | Productos seleccionables en presupuestos vía `invoice_product` pivot |
| **13-invoice-sales** | Precio y margen para calcular totales; descuenta stock via batch |
| **16-invoice-purchase** | Puede actualizar `price_buy` al registrar factura de compra (`update_product_price`) |
| **15-purchase-orders** | `unit_price` de OC viene del `price_buy` del producto |
| **06-dashboard** | `top_products` del dashboard usa `Product` + `invoice_product` |
| **19-reports** | Ventas por producto, predicción de compras |

---

## 6. API / Endpoints

| Método | Path | Auth | Guard | Descripción |
|--------|------|------|-------|-------------|
| `GET` | `/products` | auth | `can('Ver Productos')` | Lista paginada con filtros |
| `GET` | `/products/create` | auth | `can('Crear Productos')` | Formulario de alta |
| `POST` | `/products` | auth | `can('Crear Productos')` | Crear producto |
| `GET` | `/products/{product}/edit` | auth | `can('Ver Productos')` | Formulario de edición |
| `POST` | `/products/{product}` | auth | policy `ProductPolicy` | Actualizar producto |
| `DELETE` | `/products/{product}` | auth | `can('Eliminar Productos')` | Soft delete |
| `GET` | `/products/download-pdf` | auth | — | Exportar catálogo PDF |
| `GET` | `/products/download-excel` | auth | — | Exportar catálogo Excel |
| `GET` | `/products/config-update-mass` | auth | `can('Actualizar Precios Masivo')` | Config. actualización masiva |
| `POST` | `/products/update-mass` | auth | `can('Actualizar Precios Masivo')` | Ejecutar actualización masiva |
| `GET` | `/category` | auth | `can('Ver Categorias')` | Lista de categorías |
| `POST` | `/category` | auth | `can('Crear Categorias')` | Crear categoría |
| `PUT` | `/category/{category}` | auth | `can('Actualizar Categorias')` | Actualizar categoría |
| `DELETE` | `/category/{category}` | auth | `can('Eliminar Categorias')` | Eliminar categoría (recursivo) |
| `GET` | `/category/options` | auth | — | JSON de opciones para selects |
| `POST` | `/margins` | auth | — | Crear margen |
| `PUT` | `/margins/{margin}` | auth | — | Actualizar margen |
| `DELETE` | `/margins/{margin}` | auth | — | Eliminar margen |

---

## 7. Consideraciones de Migración Next.js

### Almacenamiento de imágenes

R2 ya está integrado en el stack — continúa igual. En Next.js usar una Route Handler para recibir el multipart y hacer PUT directo a R2 con la SDK de Cloudflare. Convertir a WebP en el edge con `@cloudflare/images` o en el cliente antes del upload.

### Cálculo de `price_sell`

Extraer `NumberHelper` como utilidad TypeScript compartida:

```typescript
// lib/pricing.ts
export function removeTaxFromPrice(priceWithTax: number, taxPercent: number): number {
  return priceWithTax / (1 + taxPercent / 100)
}

export function calculateSellPrice(priceBuyCents: number, marginPct: number, taxPct: number): number {
  const net = removeTaxFromPrice(priceBuyCents, taxPct)
  const withMargin = net * (1 + marginPct / 100)
  return Math.round(withMargin * (1 + taxPct / 100))
}
```

### Multi-tenant en Drizzle

El pivot `product_tenant` es crítico. En Drizzle:

```typescript
// Producto accesible para el tenant activo
const products = await db
  .select()
  .from(productsTable)
  .innerJoin(productTenant, eq(productTenant.productId, productsTable.id))
  .where(eq(productTenant.tenantId, currentTenantId))
  .with(productTenant.marginId)
```

Con RLS en PostgreSQL se puede mover el filtro `tenant_id` al nivel de BD.

### Price History

En v2.0 considerar materializar `price_sell` calculado en `price_histories` para evitar recalcular en reportes. La tabla ya existe y tiene la estructura correcta.

### Categorías jerárquicas

En v2.0 evaluar usar `ltree` de PostgreSQL para consultas eficientes de árbol (antepasados, descendientes) sin queries recursivas.

---

## 8. Mejoras Propuestas v2.0

### Imágenes múltiples por producto

Actualmente un producto tiene una sola imagen. En v2.0 soportar galería (hasta 5 imágenes) con imagen principal destacada. Nuevo campo `product_images` o tabla `product_images` con `position`.

### Variantes de producto (tallas, colores)

Para negocios de indumentaria o calzado, soportar `ProductVariant` con atributos configurables (talle, color) y stock/precio independiente por variante.

### Stock mínimo con alertas automáticas

Los campos `stock_minimum` y `stock_maximum` en `product_tenant` ya existen pero no hay alertas implementadas. En v2.0 activar notificaciones cuando `branch_stocks.quantity ≤ stock_minimum`.

### Predicción de precios por IA (add-on IA)

Con el add-on de IA activo, analizar el historial de precios + márgenes del sector para sugerir precio de venta óptimo. La IA recibe los datos calculados por el sistema y sugiere, sin modificar nada automáticamente.

### Código de barras con escáner (v2.0)

En la app móvil (PWA), usar la cámara para escanear `barcode` al crear o buscar productos. Integración con `@zxing/browser`.

### Sincronización con GestioNube Shop

Al activar la integración con `gestionube-shop`, los productos del tenant se sincronizan automáticamente hacia el eCommerce. Cambios en `name`, `price_sell`, `image` y `is_active` disparan un webhook hacia la tienda.
