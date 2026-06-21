# Módulo 19 — Reportes

> **Fase:** 4 — Finanzas y Reportes  
> **Depende de:** todos los módulos anteriores (datos de ventas, compras, clientes, proveedores, productos, tesorería)  
> **Feature flag:** `feature:reportes` — todas las rutas están detrás de este middleware

---

## 1. Propósito y Alcance

El módulo de Reportes provee una pantalla unificada desde la cual los usuarios pueden generar y descargar reportes de negocio en formato Excel (`.xlsx`) y PDF. No almacena datos propios — es una capa de consulta y exportación sobre el resto del sistema.

**Funcionalidades actuales:**
- Reporte de ventas con rentabilidad por producto y vendedor
- Libro IVA (ventas + compras) con tres hojas
- Reportes de clientes: lista, fidelización, comportamiento comparativo multi-período
- Reportes de proveedores: lista, productos por proveedor, todos los proveedores con productos
- Reportes de productos: catálogo filtrable, productos con sus proveedores
- Predicción de compras y reposición de stock

**Quién lo usa:** administradores, contadores, gerentes comerciales.

---

## 2. Arquitectura del Módulo

El módulo no tiene modelos propios. Existe un `App\Models\Report` vacío únicamente para anclar la `ReportPolicy`. Toda la lógica vive en `app/Http/Actions/Report/` (15+ clases) y en exportadores de `Maatwebsite\Excel`.

**Página única:** `resources/js/pages/report/report.tsx` — el usuario configura los parámetros de cada reporte y dispara la descarga desde un único formulario con múltiples secciones.

**Patrón de exportación:** cada Action llama a `Excel::download(new XxxExport(...), 'filename.xlsx')`. La descarga comienza inmediatamente, sin queue (por lo que reportes muy grandes pueden causar timeout).

---

## 3. Reportes Disponibles

### 3.1 Reporte de Ventas (`GenerateSalesInvoiceExcelAction`)

**Propósito:** análisis de rentabilidad línea a línea de las facturas de venta.

**Parámetros:**
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `start_date` | date | Sí | Fecha inicio (≤ hoy) |
| `end_date` | date | Sí | Fecha fin (≤ hoy) |
| `user_id` | integer | No | Filtrar por vendedor |
| `tenant_filter_id` | integer | No | Filtrar por sucursal |

**Datos incluidos (18 columnas):**
Factura, Fecha, Cliente, Usuario (vendedor), Producto, Cantidad, Precio Compra (histórico), Total Costo Compra, Precio Catálogo (histórico), Precio Base, Descuento (%), Precio Venta Real, Subtotal, Ganancia/Pérdida Unit., Ganancia/Pérdida Total, Markup Real (%), Valor Neto sin IVA, Margen Utilidad Real (%).

**Regla de precio histórico:** el precio de compra y el precio de catálogo que se muestran son los vigentes en el momento exacto de la venta, no los actuales. Se resuelven via `PriceHistory` usando `invoice_product.created_at` como referencia temporal. Si no hay historial previo a esa fecha, se usa el snapshot más antiguo disponible.

**Regla del vendedor:** el filtro por `user_id` usa `Activity.data->operation = 'finalizacion_factura_venta'` para identificar las facturas de ese usuario, **sin restricción de tenant** — el vendedor pudo haber trabajado en otra sucursal antes de ser transferido.

**Formato condicional:** ganancia/pérdida y markup se colorean en verde (positivo) o rojo (negativo). Margen: verde ≥20%, amarillo 0–20%, rojo negativo.

**Fuente:** `invoice_type IN ('sale_invoice', 'remit_sale')`, `status IN ('accepted', 'paid', 'partially_paid')`.

---

### 3.2 Libro IVA (`GenerateIvaBookExcelAction`)

**Propósito:** reporte fiscal de IVA ventas y compras exportable para presentar a contador.

**Parámetros:**
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `start_date` | date | Sí | Fecha inicio |
| `end_date` | date | Sí | Fecha fin |
| `tenant_filter_id` | integer | No | Filtrar por sucursal |

**Hojas del Excel:**
1. **IVA Ventas** — facturas de venta con columnas de IVA desagregadas por alícuota (10.5%, 21%, 27%)
2. **IVA Compras** — facturas de compra con mismo desglose
3. **IVA Ventas Fiscales** — columnas adicionales para presentación ante AFIP

Alícuotas reconocidas: `10.5`, `21.0`, `27.0` (constantes internas).

---

### 3.3 Reporte de Clientes (`GenerateClientExcelAction`)

**Propósito:** lista completa de clientes del tenant con sus datos.

**Parámetros:** ninguno (usa el tenant activo).

**Datos:** id, nombre, CUIT, email, teléfono, condición IVA, fecha de alta.

---

### 3.4 Fidelización de Clientes (`GenerateClientLoyaltyExcelAction`)

**Propósito:** métricas de lealtad y comportamiento de compra de cada cliente.

**Parámetros:** ninguno.

**Datos incluidos:** nombre, CUIT, cantidad de compras totales, ticket promedio, primera compra, última compra, días desde última compra, meses activo.

**Fuente:** `invoice_type IN ('sale_invoice', 'remit_sale')`, `status IN ('paid', 'accepted', 'partially_paid')`.

---

### 3.5 Comportamiento de Clientes (`GetClientBehaviorAnalysisAction` / `GenerateClientBehaviorExcelAction`)

**Propósito:** comparativo de compras por cliente en múltiples períodos seleccionados por el usuario. Permite detectar clientes con asistencia perfecta (compraron en todos los períodos).

**Parámetros:** `periods` — array de strings `'Y-m'` (ej. `['2026-01', '2026-02', '2026-03']`).

**Datos por cliente:**
- `periods`: mapa de período → `{count, total_in_cents}`
- `total_accumulated`: suma total de todos los períodos (centavos)
- `total_count`: cantidad de facturas
- `average_ticket`: total / count (centavos)
- `is_perfect_attendance`: `true` si compró en TODOS los períodos seleccionados

**Resultado ordenado:** por `total_accumulated DESC`.

**Flujo del endpoint de datos:** `POST /report/clients/behavior/data` → devuelve JSON con los datos para renderizar la tabla en pantalla antes de decidir descargar el Excel.

---

### 3.6 Reporte de Proveedores (`GenerateProviderExcelAction`)

**Propósito:** lista de todos los proveedores del tenant.

**Parámetros:** ninguno.

**Datos:** id, nombre, CUIT, email, teléfono, condición IVA, fecha de alta.

---

### 3.7 Productos por Proveedor (`GetProviderProductSalesAction` / `GenerateProviderProductsExcelAction` / `GenerateProviderProductsPdfAction`)

**Propósito:** qué productos se compraron a un proveedor específico, con detalle por factura y resumen por producto.

**Parámetros:** `provider_id` (requerido, `exists:counterparties,id`).

**Optimización:** `Cache::remember` de 10 minutos por clave `provider_products_tenant_{tenantId}_provider_{providerId}`.

**Join:** `invoice_product → invoices → products → categories`. Solo incluye facturas del tenant activo con `counterparty_id = provider_id`.

**Formatos disponibles:** Excel y PDF.

---

### 3.8 Todos los Proveedores con sus Productos (`GenerateAllProvidersProductsExcelAction` / `GenerateAllProvidersProductsPdfAction`)

**Propósito:** consolidado de todos los proveedores con sus productos, en un solo archivo.

**Parámetros:** ninguno.

**Formatos disponibles:** Excel y PDF.

---

### 3.9 Catálogo de Productos (`GenerateProductExcelAction`)

**Propósito:** exportación del catálogo de productos con filtros opcionales.

**Parámetros:**
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `category_id` | integer | No | Filtrar por categoría |
| `is_active` | boolean | No | Filtrar por estado activo/inactivo |

**Rutas:** `POST /report/products` y `GET /report/products/excel` — ambas llaman la misma action.

---

### 3.10 Productos con sus Proveedores (`GenerateProductsProvidersExcelAction`)

**Propósito:** para cada producto del catálogo, muestra qué proveedores lo suministran.

**Parámetros:** ninguno.

---

### 3.11 Predicción de Compras (`GeneratePurchasePredictionExcelAction`)

**Propósito:** basándose en la velocidad de venta de cada producto, calcula cuándo se agotará el stock y cuánto hay que reponer.

**Parámetros (query string):**
| Campo | Default | Descripción |
|-------|---------|-------------|
| `min_days` | 7 | Días mínimos de historial de ventas para calcular velocidad |
| `days_to_cover` | 30 | Días de stock a cubrir con la compra sugerida |
| `default_stock_min` | 0 | Stock mínimo global cuando el producto no tiene configurado uno propio |
| `default_stock_max` | 0 | Stock máximo global cuando el producto no tiene configurado uno propio |

**Exportador:** `PurchasePredictionExport` (en `app/Exports/`).

---

## 4. Datos de Inicialización de la Página

`ReportController::index()` pre-carga y envía al frontend:

| Prop | Fuente | Descripción |
|------|--------|-------------|
| `providers` | `GetAllProviderAction` → `CounterpartyResource` | Para el selector de proveedor |
| `categories` | `GetAllCategoryForSelectAction` | Para filtro de catálogo de productos |
| `tenantUsers` | `tenant_user` + `Activity` (finalizacion_factura_venta) | Para el selector de vendedor — incluye usuarios históricos que ya no están en el tenant |
| `branches` | `GetTenantContextAction` → `Tenant::whereIn` | Para el selector de sucursal |

**Nota sobre `tenantUsers`:** la lista incluye usuarios que aparecen en actividades históricas de venta aunque ya no pertenezcan al tenant activo. Esto es intencional para poder filtrar ventas de vendedores que fueron transferidos o dados de baja.

---

## 5. API / Endpoints

Todas las rutas están bajo `middleware:feature:reportes`.

| Método | Path | Action | Parámetros |
|--------|------|--------|-----------|
| GET | `/report` | `index` | — |
| GET | `/report/sales` | `generateSalesReport` | start_date, end_date, user_id?, tenant_filter_id? |
| GET | `/report/iva` | `generateIvaReport` | start_date, end_date, tenant_filter_id? |
| GET | `/report/clients` | `generateClientReport` | — |
| GET | `/report/clients/loyalty` | `generateClientLoyaltyReport` | — |
| POST | `/report/clients/behavior/data` | `getClientBehaviorData` | periods[] |
| POST | `/report/clients/behavior/excel` | `generateClientBehaviorExcel` | periods[] |
| GET | `/report/providers` | `generateProviderReport` | — |
| GET | `/report/providers/products/excel` | `generateProviderProductsExcel` | provider_id |
| GET | `/report/providers/products/pdf` | `generateProviderProductsPdf` | provider_id |
| GET | `/report/providers/products-all/excel` | `generateAllProviderProductsExcel` | — |
| GET | `/report/providers/products-all/pdf` | `generateAllProviderProductsPdf` | — |
| POST | `/report/products` | `generateProductReport` | category_id?, is_active? |
| GET | `/report/products/excel` | `generateProductReportExcel` | category_id?, is_active? |
| GET | `/report/products-providers/excel` | `generateProductsProvidersExcel` | — |
| GET | `/report/purchases-prediction/excel` | `generatePurchasePredictionExcel` | min_days?, days_to_cover?, default_stock_min?, default_stock_max? |

**Nota:** el endpoint `generateClientBehaviorData` devuelve JSON (para renderizar la tabla en pantalla), no un archivo. El resto de los endpoints siempre devuelven un archivo de descarga.

---

## 6. Autorización

**Una sola política:** `ReportPolicy::viewAny` verifica el permiso `Ver Reportes`.  
El gate `can('viewAny', Report::class)` protege solo la ruta `GET /report` (la página). Las rutas individuales de descarga no tienen verificación de policy propia — confían en que el usuario que accedió al módulo (pasó el gate inicial) tiene derecho a generar cualquier reporte.

---

## 7. Integraciones con Otros Módulos

| Módulo | Qué consume |
|--------|-------------|
| **Invoice Sales (13)** | `invoice_type IN (sale_invoice, remit_sale)` para reportes de ventas e IVA |
| **Invoice Purchase (16)** | `invoice_type IN (purchase_invoice, remit_purchase)` para IVA compras |
| **Products (07)** | Catálogo, categorías, precio actual vs histórico (`PriceHistory`) |
| **Clients/Providers (11)** | `Counterparty` para reportes de clientes y proveedores |
| **Batches/Inventory (08/09)** | `branch_stocks` para predicción de compras (stock actual) |
| **RBAC (03)** | Permiso `Ver Reportes` |
| **Treasury (17)** | Actividades `finalizacion_factura_venta` para identificar el vendedor por factura |
| **Tenant (02)** | `GetTenantContextAction` para soporte multi-sucursal |

---

## 8. Consideraciones de Migración Next.js

- **Streaming de archivos grandes:** actualmente los Excel se generan sincrónicamente y se devuelven en la respuesta HTTP. Para reportes grandes, esto puede causar timeout en Cloudflare Workers (límite de 30 segundos). En Next.js con Cloudflare, usar Cloudflare Queues: el usuario solicita el reporte → se encola una job → cuando termina, el archivo se sube a R2 → se notifica al usuario con un link de descarga.
- **Librerías Excel:** `Maatwebsite/Excel` es PHP-only. En Next.js usar `ExcelJS` (Node.js) para generar `.xlsx` en Route Handlers, o generar en un Worker con WASM si la lógica debe correr en el edge.
- **Caché de proveedor:** `Cache::remember` de 10 min en `GetProviderProductSalesAction`. Migrar a `unstable_cache` de Next.js o Cloudflare KV con TTL equivalente.
- **PriceHistory para precios históricos:** la lógica de resolver precio histórico al instante de la venta es una regla de negocio crítica — debe reimplementarse exactamente igual en TypeScript.
- **Comportamiento de clientes (JSON endpoint):** este es el único reporte con una etapa de previsualización en pantalla antes de la descarga. En Next.js implementar como Server Action o Route Handler que devuelve JSON para poblar la tabla.
- **Página única de reportes:** el frontend actual tiene todo en `report/report.tsx`. En Next.js se puede mantener como una sola página con tabs por categoría de reporte, usando Server Components para precargar los datos iniciales (proveedores, categorías, usuarios, sucursales).

---

## 9. Mejoras Propuestas v2.0

### 9.1 Generación asíncrona con notificación
Mover todos los reportes a jobs en cola. El usuario solicita el reporte → recibe notificación (email / push) cuando el archivo está listo para descargar desde R2. Elimina los timeouts en reportes grandes.

### 9.2 Builder visual de reportes sin código
Panel drag-and-drop donde el usuario elige dimensiones (fecha, cliente, producto, sucursal) y métricas (ventas, costo, margen) para armar reportes personalizados sin intervención del equipo técnico.

### 9.3 Reportes programados por email
El usuario configura un reporte (ej. "Libro IVA mensual") con una frecuencia (mensual/semanal) y el sistema lo genera y envía automáticamente al email indicado.

### 9.4 Reporte de rentabilidad por sucursal
Comparativo de margen de ganancia entre sucursales para el mismo período, con métricas: ventas totales, costo total, ganancia bruta, margen %.

### 9.5 Reporte de stock crítico con predicción
Integrado en la sección de inventario: productos cuyo stock caerá por debajo del mínimo en los próximos N días según la velocidad de ventas. Genera automáticamente un borrador de OC.

### 9.6 Análisis RFM automático de clientes
Segmentación automática por Recency / Frequency / Monetary con etiquetas: Campeones, Leales, En riesgo, Perdidos. Visible en el panel de clientes y exportable.

### 9.7 Integración con Google Sheets
Sincronización en tiempo real del reporte de ventas a un Google Sheet del cliente, actualizado automáticamente cada día con los datos del día anterior.

### 9.8 Agente IA de análisis de reportes
Después de generar un reporte, el agente de IA resume los insights más importantes en lenguaje natural: "Tu cliente top fue X con $Y en ventas. El producto más rentable fue Z con un margen del W%."
