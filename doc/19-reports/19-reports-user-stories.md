# Historias de Usuario — Módulo 19: Reportes

> **Módulo:** 19-reports  
> **Fase:** 4 — Finanzas y Reportes  
> **Depende de:** todos los módulos anteriores  
> **Feature flag:** `feature:reportes` — deshabilitado por defecto  
> **Permiso único:** `Ver Reportes`

---

## US-REP-01 — Acceder al panel de reportes

**Como** usuario con permiso de ver reportes,  
**quiero** acceder a la pantalla de reportes,  
**para** ver qué exportaciones están disponibles y configurar los parámetros antes de generar cada reporte.

### Criterios de aceptación
- [ ] El menú de navegación muestra el módulo "Reportes" solo si tengo el permiso `Ver Reportes`
- [ ] Al entrar, la pantalla muestra todas las categorías de reportes disponibles
- [ ] Los selectores de sucursal, usuario y categoría están pre-cargados con los datos del sistema
- [ ] Si el feature `feature:reportes` está deshabilitado para mi tenant, el módulo no es accesible

### Notas técnicas
- `GET /report` → `ReportController::index` → `Inertia::render('report/report')`
- Pre-carga: proveedores, categorías de productos, usuarios con actividad de venta, sucursales de la jerarquía

---

## US-REP-02 — Generar reporte de ventas con rentabilidad

**Como** gerente comercial o administrador,  
**quiero** exportar a Excel un reporte de ventas con el margen de ganancia por línea de producto,  
**para** analizar qué productos y qué vendedores son más rentables en un período determinado.

### Criterios de aceptación
- [ ] Ingreso el rango de fechas (inicio y fin, ambas ≤ hoy)
- [ ] Opcionalmente puedo filtrar por vendedor o por sucursal
- [ ] El Excel descarga inmediatamente con 18 columnas:
  - Factura, Fecha, Cliente, Usuario, Producto, Cantidad
  - Precio de Compra (histórico al momento de la venta)
  - Total Costo, Precio Catálogo (histórico), Precio Base, Descuento (%)
  - Precio Venta Real, Subtotal
  - Ganancia/Pérdida Unit., Ganancia/Pérdida Total
  - Markup Real (%), Valor Neto sin IVA, Margen Utilidad Real (%)
- [ ] Los valores de ganancia/pérdida están en verde (positivo) o rojo (negativo)
- [ ] El precio de compra que aparece es el vigente al momento de la venta, no el actual
- [ ] Si filtro por un vendedor que fue transferido de sucursal, sus ventas anteriores igual aparecen
- [ ] El archivo se llama `reporte-facturas-ventas-{timestamp}.xlsx`

### Notas técnicas
- `GET /report/sales` → `GenerateSalesInvoiceExcelAction`
- Solo incluye `invoice_type IN (sale_invoice, remit_sale)` con `status IN (accepted, paid, partially_paid)`
- Precio histórico: `PriceHistory` ordenado por `created_at`; se toma el último registro anterior a `invoice_product.created_at`
- Filtro por vendedor: via `Activity.data->operation = 'finalizacion_factura_venta'` sin restricción de tenant

---

## US-REP-03 — Generar Libro IVA (ventas + compras)

**Como** contador o administrador,  
**quiero** exportar el Libro IVA del período seleccionado en Excel,  
**para** tener el registro fiscal de IVA ventas y compras en el formato que mi contador necesita.

### Criterios de aceptación
- [ ] Ingreso el rango de fechas y opcionalmente filtro por sucursal
- [ ] El Excel tiene 3 hojas:
  - **IVA Ventas**: todas las facturas de venta del período con IVA desagregado por alícuota (10.5%, 21%, 27%)
  - **IVA Compras**: todas las facturas de compra con el mismo desglose
  - **IVA Ventas Fiscales**: columnas adicionales para presentación ante AFIP
- [ ] El archivo se llama `libro-iva-{timestamp}.xlsx`

### Notas técnicas
- `GET /report/iva` → `GenerateIvaBookExcelAction` → `IvaBookExport` (3 hojas via `WithMultipleSheets`)
- Alícuotas: 10.5, 21.0, 27.0 (constantes internas)

---

## US-REP-04 — Exportar listado de clientes

**Como** administrador o responsable comercial,  
**quiero** exportar la lista completa de clientes a Excel,  
**para** procesarla en sistemas externos o compartirla con el equipo comercial.

### Criterios de aceptación
- [ ] El reporte incluye todos los clientes del tenant activo
- [ ] Columnas: id, nombre, CUIT, email, teléfono, condición IVA, fecha de alta
- [ ] El archivo se descarga inmediatamente
- [ ] No hay filtros — se exportan todos los clientes

### Notas técnicas
- `GET /report/clients` → `GenerateClientExcelAction`

---

## US-REP-05 — Exportar reporte de fidelización de clientes

**Como** gerente comercial,  
**quiero** exportar un reporte de fidelización de mis clientes,  
**para** identificar quiénes son los más activos, cuánto compran en promedio y cuándo fue su última compra.

### Criterios de aceptación
- [ ] Por cada cliente, el reporte muestra: nombre, CUIT, cantidad de compras totales, ticket promedio, fecha de primera compra, fecha de última compra, días desde última compra, meses activo
- [ ] Los clientes están ordenados por total acumulado de compras (mayor primero)
- [ ] Solo incluye facturas con estado pagado, aceptado o parcialmente pagado

### Notas técnicas
- `GET /report/clients/loyalty` → `GenerateClientLoyaltyExcelAction`

---

## US-REP-06 — Analizar comportamiento de clientes por período

**Como** gerente comercial,  
**quiero** ver en pantalla (y exportar a Excel) cómo compraron mis clientes en múltiples períodos seleccionados,  
**para** identificar tendencias y detectar clientes con asistencia perfecta (compraron en TODOS los meses elegidos).

### Criterios de aceptación
- [ ] Selecciono uno o más períodos en formato mes-año (ej. enero 2026, febrero 2026, marzo 2026)
- [ ] La tabla en pantalla muestra, por cada cliente: su nombre, sus compras en cada período seleccionado (cantidad de facturas y monto), ticket promedio acumulado, y si tiene "asistencia perfecta"
- [ ] Los clientes se ordenan por total acumulado (mayor primero)
- [ ] Un cliente tiene "asistencia perfecta" si compró en TODOS los períodos seleccionados
- [ ] Puedo exportar la misma tabla a Excel
- [ ] Solo aparecen clientes que tuvieron al menos una compra en alguno de los períodos seleccionados

### Notas técnicas
- `POST /report/clients/behavior/data` → `GetClientBehaviorAnalysisAction` → devuelve JSON (previsualización)
- `POST /report/clients/behavior/excel` → `GenerateClientBehaviorExcelAction` → descarga
- `periods` = array de strings `'Y-m'`

---

## US-REP-07 — Exportar listado de proveedores

**Como** administrador o encargado de compras,  
**quiero** exportar la lista de proveedores a Excel,  
**para** tener un directorio actualizado para compartir con el área de compras.

### Criterios de aceptación
- [ ] Incluye todos los proveedores del tenant activo
- [ ] Columnas: id, nombre, CUIT, email, teléfono, condición IVA, fecha de alta

### Notas técnicas
- `GET /report/providers` → `GenerateProviderExcelAction`

---

## US-REP-08 — Exportar productos de un proveedor específico

**Como** encargado de compras,  
**quiero** exportar (o imprimir en PDF) qué productos compré históricamente a un proveedor determinado,  
**para** negociar condiciones con ese proveedor con datos reales de compras pasadas.

### Criterios de aceptación
- [ ] Selecciono un proveedor del selector (cargado en la página)
- [ ] El reporte muestra todas las líneas de compra asociadas a ese proveedor: número de factura, fecha, producto, categoría, cantidad, precio y total de línea
- [ ] También muestra un resumen por producto: total comprado (unidades y $)
- [ ] Disponible en Excel y PDF
- [ ] Los nombres de archivo incluyen el timestamp

### Notas técnicas
- `GET /report/providers/products/excel` → `GenerateProviderProductsExcelAction`
- `GET /report/providers/products/pdf` → `GenerateProviderProductsPdfAction`
- Parámetro requerido: `provider_id` (debe existir en `counterparties`)
- `Cache::remember` de 10 minutos para la query de detalle

---

## US-REP-09 — Exportar todos los proveedores con sus productos

**Como** encargado de compras,  
**quiero** exportar un consolidado de todos los proveedores con sus productos en un único archivo,  
**para** tener una vista global de mi catálogo de compras por proveedor.

### Criterios de aceptación
- [ ] El archivo incluye todos los proveedores del tenant y los productos asociados a cada uno
- [ ] Disponible en Excel y PDF
- [ ] No requiere seleccionar ningún proveedor en particular

### Notas técnicas
- `GET /report/providers/products-all/excel` → `GenerateAllProvidersProductsExcelAction`
- `GET /report/providers/products-all/pdf` → `GenerateAllProvidersProductsPdfAction`

---

## US-REP-10 — Exportar catálogo de productos

**Como** administrador o encargado de ventas,  
**quiero** exportar el catálogo de productos a Excel con filtros opcionales,  
**para** tener una lista actualizada de productos para compartir o analizar.

### Criterios de aceptación
- [ ] Opcionalmente puedo filtrar por categoría
- [ ] Opcionalmente puedo filtrar por estado (activos / inactivos / todos)
- [ ] El Excel incluye: nombre, descripción, código de barras, precio de compra actual, precio de venta actual, categoría, estado

### Notas técnicas
- `POST /report/products` o `GET /report/products/excel` → `GenerateProductExcelAction`
- Ambas rutas llaman la misma action con los mismos parámetros opcionales

---

## US-REP-11 — Exportar productos con sus proveedores

**Como** encargado de compras,  
**quiero** exportar un listado de todos los productos del catálogo con los proveedores que los suministran,  
**para** saber rápidamente a quién comprarle cada producto.

### Criterios de aceptación
- [ ] El reporte muestra cada producto y sus proveedores asociados
- [ ] Si un producto tiene múltiples proveedores, aparece una línea por proveedor

### Notas técnicas
- `GET /report/products-providers/excel` → `GenerateProductsProvidersExcelAction`

---

## US-REP-12 — Generar predicción de compras y sugerencias de reposición

**Como** encargado de compras,  
**quiero** exportar un reporte que me diga qué productos tengo que comprar y en qué cantidad,  
**para** evitar roturas de stock en los próximos días.

### Criterios de aceptación
- [ ] Puedo configurar cuántos días de stock quiero cubrir con la compra (default: 30 días)
- [ ] Puedo configurar cuántos días mínimos de historial de ventas se usan para calcular la velocidad de consumo (default: 7 días)
- [ ] Puedo establecer un stock mínimo y máximo global para los productos que no tienen configurado uno propio
- [ ] El Excel muestra por producto: stock actual, velocidad de ventas diaria, días de stock restante, cantidad sugerida a comprar para cubrir el período configurado
- [ ] Los productos sin historial de ventas o con stock suficiente no aparecen en el reporte

### Notas técnicas
- `GET /report/purchases-prediction/excel` → `GeneratePurchasePredictionExcelAction`
- Query params: `min_days` (7), `days_to_cover` (30), `default_stock_min` (0), `default_stock_max` (0)
- Exportador: `PurchasePredictionExport` en `app/Exports/`

---

## US-REP-13 — Ver reportes de múltiples sucursales

**Como** administrador con acceso a múltiples sucursales,  
**quiero** filtrar los reportes por sucursal específica,  
**para** analizar el desempeño de cada sucursal de forma independiente.

### Criterios de aceptación
- [ ] En los reportes que lo soportan (ventas, IVA), aparece un selector de sucursal
- [ ] El selector muestra todas las sucursales de mi jerarquía
- [ ] Si no selecciono una sucursal, el reporte incluye datos de todas las sucursales de la jerarquía
- [ ] Si no tengo acceso a múltiples sucursales, el selector no aparece

### Notas técnicas
- `tenant_filter_id` como parámetro opcional en ventas e IVA
- `GetTenantContextAction` determina las sucursales visibles

---

## US-REP-14 — Reportes programados por email (v2.0)

**Como** gerente o contador,  
**quiero** configurar que ciertos reportes se generen y me lleguen automáticamente por email en una frecuencia determinada,  
**para** recibir información sin tener que entrar al sistema.

### Criterios de aceptación
- [ ] Puedo configurar cualquier reporte disponible con: frecuencia (diaria, semanal, mensual), destinatarios (emails), formato (Excel o PDF)
- [ ] El primer día hábil del mes recibo el Libro IVA del mes anterior automáticamente
- [ ] Puedo pausar o eliminar una programación

### Notas técnicas
- **Mejora v2.0** — no existe actualmente
- Nueva tabla `scheduled_reports` con `report_type, params (json), frequency, emails (array), next_run_at`
- Cloudflare Cron Trigger o Laravel Scheduler para disparar la generación

---

## US-REP-15 — Builder visual de reportes sin código (v2.0)

**Como** usuario avanzado,  
**quiero** construir mis propios reportes seleccionando dimensiones y métricas de una lista,  
**para** obtener exactamente los datos que necesito sin depender del equipo técnico para agregar un nuevo reporte.

### Criterios de aceptación
- [ ] Panel drag-and-drop donde selecciono columnas de datos (fecha, cliente, producto, sucursal, etc.)
- [ ] Selecciono métricas de agregación (suma, promedio, conteo)
- [ ] Configuro filtros (rango de fechas, estado, categoría)
- [ ] Previsualizo los primeros 10 resultados antes de exportar
- [ ] Puedo guardar mi reporte personalizado con un nombre y reutilizarlo

### Notas técnicas
- **Mejora v2.0** — no existe actualmente
- Motor de queries dinámicas con lista blanca de columnas y métricas permitidas (nunca SQL directo del usuario)
