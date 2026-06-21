# Historias de Usuario — Módulo 07: Productos y Catálogo

> **Módulo:** 07-products  
> **Fase:** 2 — Operaciones Core  
> **Depende de:** 02-tenant, 03-rbac

---

## US-PROD-01 — Ver el catálogo de productos del negocio

**Como** usuario con acceso al módulo de productos,  
**quiero** ver la lista completa de productos del negocio con sus precios, categorías y stock actual,  
**para** conocer rápidamente qué tengo disponible para vender o reponer.

### Criterios de aceptación
- [ ] Al acceder a `/products`, se muestra una tabla paginada con: nombre, categoría, precio de compra, precio de venta, margen, stock total y estado (activo/inactivo)
- [ ] Puedo filtrar por: nombre/descripción/código de barras, categoría, estado (activo/inactivo)
- [ ] Puedo ordenar por: nombre, precio de venta, precio de compra, stock (ascendente o descendente)
- [ ] El stock mostrado es la suma de `branch_stocks.quantity` para el tenant activo en sesión
- [ ] Solo ve el catálogo quien tenga el permiso "Ver Productos"

### Notas técnicas
- `GetAllProductAction` con `scope=current` (solo tenant activo)
- `ProductFilter`: `search`, `status`, `categoryId`, `sort`
- Paginado a 10 registros/página

---

## US-PROD-02 — Crear un nuevo producto en el catálogo

**Como** administrador o responsable de compras,  
**quiero** dar de alta un nuevo producto con sus datos de precio, margen y categoría,  
**para** que quede disponible para facturar y controlar su stock.

### Criterios de aceptación
- [ ] El formulario pide: nombre, descripción (opcional), categoría (opcional), precio de compra, margen de ganancia, impuesto, código de barras (opcional) e imagen (opcional)
- [ ] Si no ingreso el precio de venta, el sistema lo calcula automáticamente: aplica el margen al precio neto de compra y suma el impuesto
- [ ] La fórmula de cálculo se muestra en tiempo real mientras ingreso el precio de compra y margen
- [ ] Si subo una imagen, se acepta JPG/PNG/WebP hasta 2MB (4096×4096px máximo)
- [ ] Al guardar, el producto queda activo y disponible para seleccionar en facturas y presupuestos
- [ ] Solo puede crear productos quien tenga el permiso "Crear Productos"

### Notas técnicas
- `CalculatePriceSellAction`: extrae IVA del `price_buy`, aplica margen%, suma IVA
- `CreateProductAction` crea automáticamente un batch `no_batch_stock` con quantity=0
- Imagen se sube a Cloudflare R2; se guarda la ruta en `products.image`

---

## US-PROD-03 — Editar un producto existente

**Como** administrador,  
**quiero** poder modificar los datos de un producto (precio, margen, categoría, imagen),  
**para** mantener el catálogo actualizado cuando cambian los costos o condiciones comerciales.

### Criterios de aceptación
- [ ] Al editar un producto, veo todos sus datos actuales precargados
- [ ] Puedo modificar: nombre, descripción, categoría, precio de compra, margen, impuesto, precio de venta, código de barras e imagen
- [ ] Si cambio el precio de compra, margen o impuesto, el sistema registra automáticamente un historial de precio con el tipo de cambio correspondiente
- [ ] Si cambio la imagen, la anterior se elimina del almacenamiento
- [ ] Solo puede editar quien el sistema autorice según la política de productos

### Notas técnicas
- `UpdateProductAction` detecta qué campos cambiaron antes de persistir
- Determina `ChangeType`: `price`, `margin` o `tax` según qué cambió
- `ProductPolicy::update()` devuelve `false` — la autorización se hace en el controller con `can('Actualizar Productos')`

---

## US-PROD-04 — Eliminar un producto del catálogo

**Como** administrador,  
**quiero** poder eliminar un producto que ya no comercializo,  
**para** mantener el catálogo limpio sin perder el historial de ventas asociado.

### Criterios de aceptación
- [ ] Al eliminar un producto, este deja de aparecer en el catálogo y en los selects de facturas
- [ ] El historial de ventas e inventario existente se mantiene (soft delete)
- [ ] Se muestra una confirmación antes de eliminar
- [ ] Solo puede eliminar quien tenga el permiso "Eliminar Productos"

### Notas técnicas
- Soft delete: `products.deleted_at` se establece, no se borra el registro
- Las facturas y lotes existentes mantienen su FK (sin cascade delete)

---

## US-PROD-05 — Actualizar precios de múltiples productos a la vez

**Como** administrador,  
**quiero** actualizar el precio de venta de un grupo de productos aplicando un aumento porcentual o fijo,  
**para** ahorrar tiempo cuando suben los costos sin tener que editar producto por producto.

### Criterios de aceptación
- [ ] Puedo seleccionar productos por categoría, o marcarlos individualmente
- [ ] Elijo el tipo de actualización: porcentaje (ej: +15%) o valor fijo (ej: +$500)
- [ ] Veo una vista previa del precio actual y el nuevo precio antes de confirmar
- [ ] Al confirmar, todos los precios se actualizan y se registra un historial por cada producto con tipo `bulk_update`
- [ ] Solo puede ejecutar esta acción quien tenga el permiso "Actualizar Precios Masivo"

### Notas técnicas
- Rutas: `GET /products/config-update-mass` + `POST /products/update-mass`
- `CalculatePriceSellAction::executeUpdate(price, 'percentage'|'fixed', value)`

---

## US-PROD-06 — Ver el historial de cambios de precio de un producto

**Como** administrador o dueño del negocio,  
**quiero** ver todos los cambios de precio que tuvo un producto a lo largo del tiempo,  
**para** entender cómo evolucionó su rentabilidad y quién realizó cada modificación.

### Criterios de aceptación
- [ ] Una sección "Historial de precios" muestra cada cambio con: fecha, precio anterior, precio nuevo, margen, tipo de cambio y usuario responsable
- [ ] El tipo de cambio se muestra en lenguaje claro: "Cambio de precio", "Cambio de margen", "Actualización masiva", etc.
- [ ] Estadísticas: precio máximo histórico, precio mínimo, variación promedio
- [ ] Solo puede ver el historial quien tenga el permiso "Ver Historial de Precios"

### Notas técnicas
- `GetPriceHistoryAction` orquesta: lista paginada + estadísticas + alertas + análisis por categoría
- `price_history_tax` guarda el detalle de impuestos de cada snapshot

---

## US-PROD-07 — Gestionar categorías de productos

**Como** administrador,  
**quiero** crear, editar y organizar las categorías del catálogo,  
**para** agrupar los productos de forma coherente y facilitar la búsqueda.

### Criterios de aceptación
- [ ] Puedo crear categorías con nombre y descripción
- [ ] Puedo asignar una categoría padre para crear una jerarquía de subcategorías (sin límite de niveles)
- [ ] Puedo editar el nombre, descripción y categoría padre de cualquier categoría existente
- [ ] Al eliminar una categoría, sus subcategorías también se eliminan en cascada
- [ ] Los productos asociados a la categoría eliminada quedan sin categoría (`category_id = NULL`)
- [ ] Permisos independientes para ver, crear, editar y eliminar categorías

### Notas técnicas
- `DestroyCategoryAction` elimina recursivamente hijos antes de eliminar el padre
- `ON DELETE SET NULL` en `products.category_id` → productos quedan sin categoría, no se borran

---

## US-PROD-08 — Configurar márgenes de ganancia por sucursal

**Como** dueño de una empresa con múltiples sucursales,  
**quiero** que cada sucursal pueda tener su propio margen de ganancia configurado,  
**para** manejar precios de venta diferenciados según la estrategia comercial de cada punto de venta.

### Criterios de aceptación
- [ ] Puedo crear múltiples márgenes (ej: "Minorista 35%", "Mayorista 20%", "Empleados 10%")
- [ ] Puedo marcar uno como default — ese se aplica automáticamente al agregar nuevos productos
- [ ] El margen de un producto puede cambiarse desde la pantalla de edición del producto
- [ ] El margen vive en el pivot `product_tenant`: diferentes sucursales pueden tener márgenes distintos para el mismo producto
- [ ] Solo puede existir un margen `is_default` por tenant; al marcar uno nuevo como default, el anterior deja de serlo automáticamente

### Notas técnicas
- `CreateMarginAction` y `UpdateMarginAction` gestionan la exclusividad del default
- `GetDefaultMarginAction` retorna el margen default para precargar en formularios de nuevo producto

---

## US-PROD-09 — Exportar el catálogo de productos

**Como** administrador,  
**quiero** exportar el catálogo de productos a PDF o Excel,  
**para** compartirlo con clientes o proveedores o usarlo en análisis externos.

### Criterios de aceptación
- [ ] El export a PDF incluye: nombre, descripción, precio de venta y código de barras
- [ ] El export a Excel incluye: todos los campos del catálogo, stock actual y última modificación de precio
- [ ] Los filtros aplicados en la lista se respetan en el export
- [ ] El archivo se descarga directamente sin necesidad de esperar en cola

### Notas técnicas
- `GET /products/download-pdf` y `GET /products/download-excel`
- Los archivos se generan síncronamente; si el catálogo crece, considerar colas para Excel

---

## US-PROD-10 — Galería de imágenes múltiples por producto (v2.0)

**Como** administrador de un negocio que vende online,  
**quiero** agregar hasta 5 fotos por producto y elegir cuál es la imagen principal,  
**para** mostrar el producto desde diferentes ángulos en el catálogo y en la tienda online.

### Criterios de aceptación
- [ ] En el formulario de producto, puedo subir hasta 5 imágenes
- [ ] Puedo reordenar las imágenes y marcar una como "principal"
- [ ] La imagen principal se usa en las listas y en la sincronización con GestioNube Shop
- [ ] Al eliminar una imagen, se borra del almacenamiento R2
- [ ] Si el producto se sincroniza con la tienda online, todas las imágenes se envían

### Notas técnicas
- **Nuevo en v2.0** — actualmente un solo campo `products.image`
- Nueva tabla: `product_images` (product_id, url, position, is_primary)
- Sincronización con `gestionube-shop` vía webhook al guardar cambios

---

## US-PROD-11 — Ver sugerencia de precio óptimo por IA (v2.0, requiere add-on IA)

**Como** administrador con el add-on de IA activo,  
**quiero** recibir una sugerencia de precio de venta basada en el historial de precios y los márgenes del negocio,  
**para** tomar decisiones más informadas al definir precios sin tener que analizar manualmente el historial.

### Criterios de aceptación
- [ ] En la pantalla de edición de precio de un producto, aparece una sección "Sugerencia IA"
- [ ] La IA muestra: precio sugerido, margen resultante, comparativa con el histórico del mismo producto
- [ ] Incluye una explicación breve en lenguaje natural: "Tu margen actual es 18% — históricamente fue 25%. Subir $X te acercaría a ese nivel manteniendo competitividad."
- [ ] El usuario puede aceptar la sugerencia con un click o ignorarla
- [ ] La sugerencia no modifica ningún precio automáticamente — solo es un input para la decisión del usuario
- [ ] Si el add-on de IA no está activo, se muestra un teaser con botón "Activar IA"

### Notas técnicas
- **Nuevo en v2.0** — requiere add-on de IA activo (`tenant_features.feature = 'ai_module'`)
- La IA recibe: `price_histories` del producto, `margins` del tenant, métricas de ventas
- El LLM solo interpreta y sugiere — no calcula directamente (los números los pasa el sistema)
- Cache de sugerencia: 24 horas por producto+tenant (KV de Cloudflare)

---

## US-PROD-12 — Alertas automáticas de stock mínimo (v2.0)

**Como** responsable de compras,  
**quiero** configurar un stock mínimo por producto y que el sistema me avise cuando lo alcanzo,  
**para** reponer a tiempo sin tener que revisar el inventario manualmente todos los días.

### Criterios de aceptación
- [ ] En la pantalla de edición del producto, puedo configurar stock mínimo y stock máximo por sucursal
- [ ] Cuando `branch_stocks.quantity ≤ stock_minimum`, aparece una alerta en el dashboard y/o se envía una notificación
- [ ] La alerta incluye: nombre del producto, stock actual, stock mínimo configurado y un botón directo para crear una OC
- [ ] Puedo configurar si la alerta llega por notificación in-app, email o ambas
- [ ] Si el add-on de IA está activo, la alerta también incluye la predicción de cuántos días de stock quedan

### Notas técnicas
- **Mejora v2.0** — los campos `stock_minimum` y `stock_maximum` ya existen en `product_tenant` pero no tienen lógica de alerta implementada
- Job programado que verifica stock vs mínimo y dispara notificaciones (Cloudflare Cron Trigger en v2.0)
- Si add-on IA activo: incluye estimación basada en velocidad de rotación de los últimos 30 días

---

## US-PROD-13 — Escanear código de barras para buscar o crear productos (v2.0)

**Como** operador que trabaja en el depósito,  
**quiero** escanear el código de barras de un producto con la cámara del celular,  
**para** encontrar rápidamente el producto en el sistema sin tener que escribir su nombre.

### Criterios de aceptación
- [ ] Desde el listado de productos (en mobile), un botón "Escanear" activa la cámara
- [ ] Si el código existe, navego directamente al producto escaneado
- [ ] Si el código no existe, se abre el formulario de nuevo producto con el barcode precargado
- [ ] Funciona tanto en la app web (PWA) como en el flujo de selección de productos en facturas
- [ ] Solo requiere permisos de cámara del navegador, sin apps adicionales

### Notas técnicas
- **Nuevo en v2.0** — integración con `@zxing/browser` para escaneo desde navegador
- Campo `products.barcode` ya existe en la BD

---

## US-PROD-14 — Sincronización del catálogo con GestioNube Shop (v2.0)

**Como** dueño de un negocio con tienda online GestioNube Shop,  
**quiero** que cuando creo o modifico un producto en el ERP, los cambios se reflejen automáticamente en mi tienda online,  
**para** no tener que actualizar el catálogo en dos lugares distintos.

### Criterios de aceptación
- [ ] Al activar la integración con GestioNube Shop, los productos del tenant se sincronizan automáticamente
- [ ] Los cambios que se sincronizan: nombre, descripción, precio de venta, imagen principal, estado (activo/inactivo)
- [ ] El stock disponible se actualiza en la tienda cada vez que hay un movimiento de inventario
- [ ] Los productos marcados como `is_active=false` se deshabilitan en la tienda (no se eliminan)
- [ ] Si la sincronización falla, se registra el error y se reintenta en el próximo ciclo
- [ ] Un panel en la configuración muestra el estado de sincronización de cada producto

### Notas técnicas
- **Nuevo en v2.0** — integración ERP → GestioNube Shop vía REST API + OAuth2 (machine-to-machine)
- Evento: `ProductUpdated` → webhook a la tienda
- Columna a agregar: `products.shop_product_id` (ID externo en la tienda online)
