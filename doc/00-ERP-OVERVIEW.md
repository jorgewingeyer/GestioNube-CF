# GestioNube ERP — Visión General y Hoja de Ruta v2.0

> **Documento:** Alcance actual, arquitectura y propuestas de mejora para la migración a Next.js + Cloudflare  
> **Fecha:** Junio 2026  
> **Estado:** En planificación

---

## 1. ¿Qué es GestioNube?

GestioNube es un ERP multi-tenant SaaS orientado a PYMEs argentinas. Gestiona el ciclo completo de operaciones: desde el inventario y las compras hasta la facturación electrónica AFIP/ARCA, la tesorería, los reportes de negocio y la caja diaria. El sistema soporta estructuras de empresa con múltiples sucursales (jerarquía padre-hijo) y control de acceso basado en roles.

La versión actual está construida sobre **Laravel 13 + React 19 + Inertia.js** y se aloja en servidores tradicionales. La nueva versión migrará a **Next.js 15 (App Router) + Cloudflare** (Workers, D1/Hyperdrive, R2, Pages) para alcanzar mayor escala, menor latencia y costos operativos reducidos.

---

## 2. Módulos del Sistema Actual

### 2.1 Autenticación y Cuentas (`auth`, `account`)
- Registro, login, recuperación de contraseña
- Perfil de usuario: datos personales, contraseña, avatar
- Eliminación de cuenta

### 2.2 Multi-Tenant y Sucursales (`tenant`, `branch`)
- Cada empresa es un `Tenant` con logo y configuración propia
- Soporte de sucursales (tenants hijo con `parent_id`)
- Selector de sucursal activa en la navegación
- Roles y permisos configurables por empresa (RBAC con 21 políticas)
- Impuestos preferidos por tenant

### 2.3 Suscripciones y Planes (`suscription`, `plan`)
- Integración con **MercadoPago** para cobro recurrente
- Free tier con límites configurados por `.env`
- Validación de cupones de descuento
- Flujo completo: crear preferencia → redirect → éxito / falla / pendiente

### 2.4 Dashboard (`dashboard`)
- Métricas clave del negocio en tiempo real
- Datos cargados vía endpoint separado (`/dashboard/data`) para lazy loading
- KPIs: ventas del mes, cobros pendientes, stock crítico, movimientos recientes

### 2.5 Productos y Catálogo (`products`, `category`, `margins`, `price-history`)
- ABM de productos con foto (Cloudflare R2), categoría, márgenes de ganancia
- Actualización masiva de precios
- Historial de precios con impuestos asociados (`PriceHistory`, `PriceHistoryTax`)
- Exportación a PDF y Excel
- Márgenes configurables por producto y tenant

### 2.6 Inventario (`inventory`, `batch`)
- Control de stock por lote (`Batch`) con fecha de vencimiento y número de lote
- Inventario consolidado por sucursal (`BranchStock`)
- Movimientos de inventario: ingresos, egresos, ajustes
- Estadísticas de inventario (stock total, valor, rotación)
- Exportación detallada y resumida a Excel
- Calculadora de inventario

### 2.7 Transferencias de Stock (`stock-transfer`)
- Transferencias de productos entre sucursales
- Estados: borrador → en tránsito → completada / cancelada
- Integración con lotes específicos

### 2.8 Clientes y Proveedores (`clients`, `providers`)
- Modelo unificado `Counterparty` para clientes y proveedores
- ABM completo con búsqueda y attach a tenant
- Datos fiscales (CUIT, condición IVA)
- Direcciones y contactos asociados

### 2.9 Presupuestos (`budget`)
- Creación de presupuestos con productos
- Estados: borrador → completado
- Conversión a factura de venta
- Generación de PDF
- Cálculo de totales con impuestos

### 2.10 Facturación de Ventas (`invoices-sale`)
- Facturas A, B, C, M, X con tipo de comprobante correcto según AFIP
- Notas de crédito
- Integración con **AFIP/ARCA** vía WSFE (webservice de factura electrónica)
- Autorización CAE en tiempo real
- QR AFIP en PDF de factura
- Descuento global por grupos de IVA
- Cancelación y restauración de stock
- Exportación de libro IVA a Excel

### 2.11 Facturación de Compras (`invoices-purchase`)
- Registro de facturas de proveedores
- Reconciliación y aprobación de reconciliación
- Actualización de precios de productos desde factura
- Generación de PDF
- Creación de factura desde orden de compra

### 2.12 Órdenes de Compra (`purchase-orders`)
- Flujo completo: borrador → aprobada → rechazada → finalizada
- Numeración automática de OC
- Generación de PDF de OC
- Conversión directa a factura de compra

### 2.13 Tesorería (`treasury`)
- Registro de transacciones (pagos y cobros) vinculados a facturas o independientes
- Resúmenes de cuenta por contraparte (saldo corriente, deuda, crédito)
- Detalle de cuenta por contraparte con historial de movimientos
- Distribución automática y manual de pagos entre facturas pendientes
- Compensación de saldo acreedor/deudor
- Recibos en PDF
- Exportación a Excel (transacciones y resúmenes de cuenta)

### 2.14 Caja (`cashier`)
- Apertura y cierre de turno
- Registro de movimientos de caja por turno
- Historial de turnos y movimientos
- Vinculación de transacciones a turno de caja

### 2.15 Reportes (`report`)
- Comportamiento de clientes: frecuencia, ticket promedio, RFM
- Lealtad de clientes (con exportación Excel)
- Ventas por producto (ranking, rotación)
- Ventas por proveedor y productos por proveedor
- Todos los proveedores con sus productos
- Predicción de compras con configuración de stock mínimo y reposición
- Libro IVA ventas exportable

### 2.16 Integración AFIP/ARCA (`arca`)
- Gestión de certificados digitales (`ArcaCertificate`)
- Login tickets WSAA (`ArcaLoginTicket`, `ArcaLoginTicketRequest`)
- Autorización de CAE (WSFE)
- Consulta de comprobantes autorizados
- Probe de conectividad y dummy test
- Consulta de puntos de venta y condiciones IVA receptor

### 2.17 Usuarios y Roles (`users`)
- ABM de usuarios por tenant
- Asignación de roles y permisos granulares
- Control de acceso basado en roles (RBAC)

### 2.18 Notificaciones y Actividad (`activity`, `notifications`)
- Log de actividad del sistema
- Centro de notificaciones

### 2.19 Superadmin (`super-admin`)
- Panel de gestión global de tenants y planes
- Gestión de suscripciones desde el panel administrativo

### 2.20 Feedback (`feedback`)
- Sistema interno de feedback de usuarios
- Mensajes de consulta desde el landing

---

## 3. Stack Tecnológico Actual

| Capa | Tecnología |
|------|-----------|
| Backend | PHP 8.4 + Laravel 13 |
| Frontend | React 19 + Inertia.js v2 |
| Base de datos | PostgreSQL (primaria) |
| Colas | Laravel Queue (driver DB) |
| Almacenamiento | Cloudflare R2 |
| CSS | Tailwind CSS 4 + shadcn/ui + Radix UI |
| Testing | Pest 4 + PHPUnit 12 |
| Bundler | Vite 6 |
| Facturación electrónica | AFIP WSFE (SOAP) |
| Pagos | MercadoPago |
| Locale | `es_AR` / `America/Argentina/Buenos_Aires` |

---

## 4. Stack Propuesto para v2.0 (Next.js + Cloudflare)

| Capa | Tecnología Propuesta | Justificación |
|------|---------------------|---------------|
| Framework | Next.js 15 (App Router) | SSR/SSG/RSC, edge-ready |
| Runtime/Deploy | Cloudflare Workers + Pages | Latencia global mínima, sin servidores |
| Base de datos | Cloudflare D1 (SQLite) + Hyperdrive (PostgreSQL) | D1 para operaciones edge, Hyperdrive para PG existente |
| Almacenamiento | Cloudflare R2 (ya usado) | Sin cambio |
| API Backend | Hono.js o Next.js Route Handlers | Ligero, edge-compatible |
| ORM | Drizzle ORM | Compatible con D1 y edge |
| Auth | Clerk o NextAuth v5 | Multi-tenant aware, edge-compatible |
| Estilos | Tailwind CSS 4 + shadcn/ui | Continúa el stack actual |
| AI | Cloudflare Workers AI + Vercel AI SDK | Integración nativa en el edge |
| Estado global | Zustand / Jotai | Ligero, compatible con RSC |
| Validación | Zod | Schema-first, compartido entre cliente y servidor |
| Pagos | MercadoPago SDK | Sin cambio |
| Facturación | Integración AFIP/ARCA (reescrita en TS) | Misma lógica, nuevo runtime |
| Testing | Vitest + Playwright | Edge-compatible |

---

## 5. Propuestas de Mejora y Diferenciación v2.0

### 5.1 IA Integrada en el Núcleo del ERP

La característica diferenciadora de v2.0 será la integración profunda de IA generativa y agentes autónomos. No como un chatbot, sino como un copiloto operativo que trabaja dentro de cada módulo.

#### Agente de Tesorería Inteligente
- Analiza el flujo de caja proyectado a 30/60/90 días basándose en facturas pendientes y patrones históricos
- Sugiere automáticamente cuáles facturas priorizar para cobro según comportamiento del cliente
- Detecta anomalías en pagos (cliente que habitualmente paga en 15 días y lleva 45 días de mora)
- Genera resúmenes automáticos de la situación financiera en lenguaje natural

#### Agente de Inventario Predictivo
- Predice ruptura de stock basándose en velocidad de rotación, estacionalidad y lead time del proveedor
- Genera órdenes de compra borrador automáticamente cuando un producto se acerca al punto de reposición
- Sugiere el proveedor óptimo basado en precio, calidad histórica y tiempo de entrega
- Detecta productos de baja rotación con riesgo de vencimiento

#### Agente de Facturación Asistida
- Completa datos de factura (productos, cantidades, precios) a partir de texto libre o foto de remito
- Sugiere el tipo de comprobante correcto (A/B/C) automáticamente según condición IVA del cliente
- Valida coherencia de precios contra histórico y alerta desviaciones
- Detecta posibles errores antes de autorizar el CAE

#### Copiloto de Ventas
- Analiza qué clientes no compraron en X días y sugiere acciones de reactivación
- Identifica patrones de compra: "Este cliente siempre compra producto A y B juntos, nunca le ofreciste C"
- Genera reportes ejecutivos en PDF/email con insights en lenguaje natural
- Segmenta clientes automáticamente por comportamiento (RFM + clusters ML)

#### Asistente de Compras
- Compara precios históricos de proveedores y detecta aumentos injustificados
- Consolida múltiples necesidades de compra en una sola OC optimizada por proveedor
- Alerta cuando el precio de una factura de compra difiere significativamente del histórico

#### Chatbot ERP (interfaz conversacional)
- El usuario puede hacer preguntas en lenguaje natural: "¿Cuánto vendí en mayo?", "¿Quiénes me deben más de $100.000?"
- Ejecuta queries en tiempo real y responde con datos + gráficos inline
- Permite crear transacciones, facturas y ajustes de stock via chat confirmado por el usuario

### 5.2 Mejoras de UX/Producto

#### Dashboard Ejecutivo Renovado
- Widgets configurables por usuario (drag-and-drop)
- Gráficos de tendencia interactivos (ventas, stock, flujo de caja)
- Alertas proactivas en tiempo real (stock crítico, facturas vencidas, caja descuadrada)
- Vista mobile-first nativa con PWA offline para consultas sin conexión

#### Facturación Electrónica Mejorada
- Firma de facturas por lotes (autorización masiva de CAE)
- Reintento automático ante fallos AFIP con queue persistente
- Soporte de notas de débito (actualmente ausente)
- Portal del cliente: los clientes pueden ver y descargar sus facturas online

#### Tesorería Avanzada
- Conciliación bancaria (importar extracto CSV/OFX del banco y matchear con transacciones)
- Presupuesto vs real: seguimiento de gastos contra presupuesto planificado
- Multi-moneda (soporte ARS + USD blue/oficial con tipo de cambio configurable)
- Cheques diferidos: gestión del portafolio de cheques recibidos y emitidos

#### Inventario y Logística
- Código QR/barcode nativo en la app móvil para escaneo de productos
- Mapa de depósito: ubicaciones físicas de productos dentro del almacén
- Gestión de devoluciones con historial de motivos
- Alertas de vencimiento de lotes con anticipación configurable

#### Compras y Proveedores
- Portal de proveedores: el proveedor puede ver sus OC y cargar el remito electrónico
- Comparación de cotizaciones de múltiples proveedores (RFQ — Request for Quotation)
- Historial de cumplimiento de proveedores (entregas a tiempo, calidad)

#### Reportes y Business Intelligence
- Builder visual de reportes sin código (drag-and-drop de dimensiones y métricas)
- Exportación programada: reportes enviados por email en fechas configuradas
- Benchmarking: comparación de métricas propias contra industria (anónimo)
- Integración con Google Sheets / Excel Online (sync en tiempo real)

### 5.3 Infraestructura y Operaciones

#### Arquitectura Edge-First
- Deploy global en Cloudflare Workers (<50ms latencia desde Argentina)
- Cache inteligente de queries frecuentes con invalidación granular
- Jobs y colas con Cloudflare Queues (sustituye Laravel Queue)
- Cron jobs con Cloudflare Cron Triggers

#### Observabilidad
- Logs estructurados en Cloudflare Logpush → Grafana / Datadog
- Trazas distribuidas de cada request (OpenTelemetry)
- Alertas automáticas ante errores o degradación de performance
- Dashboard de salud del sistema en el panel superadmin

#### Multi-Tenant Mejorado
- Onboarding guiado (wizard de configuración inicial para nuevas empresas)
- Planes y límites dinámicos configurables desde superadmin sin deploy
- API pública documentada (OpenAPI) para integraciones de terceros
- Webhooks configurables por evento (factura autorizada, pago recibido, etc.)

#### Seguridad
- 2FA (TOTP) en login
- Auditoría completa de acciones (quién hizo qué y cuándo)
- Cifrado en reposo para datos fiscales sensibles
- Cumplimiento GDPR/LPDP Argentina para datos personales

### 5.4 Integraciones Estratégicas

#### GestioNube Shop (eCommerce Propio) ⭐
Se desarrollará un **eCommerce propio como proyecto independiente** (`gestionube-shop`) que se conecta al ERP mediante API REST. Este proyecto no es un plugin de TiendaNube ni WooCommerce — es una tienda online nativa del ecosistema GestioNube.

**Flujo de sincronización:**
- **Productos → Shop:** el ERP empuja catálogo de productos (nombre, precio, descripción, imágenes, stock disponible) hacia la tienda vía webhook o polling
- **Stock → Shop:** cada movimiento de inventario en el ERP (venta, ajuste, transferencia) actualiza el stock en tiempo real en la tienda
- **Pedidos → ERP:** cada pedido confirmado en la tienda genera automáticamente una factura de venta en el ERP y descuenta stock
- **Clientes → ambos:** los clientes creados en la tienda se sincronizan como contrapartes en el ERP y viceversa
- **Pagos → ERP:** los pagos recibidos en la tienda (MercadoPago, transferencia) crean transacciones en el módulo de Tesorería

**Datos sincronizados:**
| Entidad | Dirección | Frecuencia |
|---------|-----------|-----------|
| Productos (precio, descripción, imagen) | ERP → Shop | On-change (webhook) |
| Stock disponible por sucursal | ERP → Shop | On-change (webhook) |
| Pedidos nuevos | Shop → ERP | On-event (webhook) |
| Estado de pedido | ERP → Shop | On-change |
| Clientes / Contrapartes | Bidireccional | On-create |
| Pagos confirmados | Shop → ERP | On-event |

**Autenticación API:** OAuth2 con client_credentials (machine-to-machine), tenant-aware (cada tenant tiene sus propias credenciales de API).

- **Bancos:** Conexión con APIs bancarias abiertas para importar movimientos automáticamente
- **AFIP:** Importación automática de compras desde el servicio web de AFIP (sin cargar facturas manualmente)
- **Correo:** Integración con Andreani / OCA para seguimiento de envíos desde OC o factura
- **WhatsApp:** Envío de facturas, presupuestos y recordatorios de pago por WhatsApp Business API

---

## 6. Estructura de Documentación del Proyecto

La carpeta `/doc` contendrá un archivo Markdown por módulo, en orden estricto de dependencias (de base a cima). Nunca documentar un módulo antes de que sus dependencias estén completas.

```
doc/
├── 00-ERP-OVERVIEW.md              ✅ Este archivo
│
│ ── FASE 1: Fundación ──
├── 01-auth/
│   ├── 01-auth.md                 ✅ Completado
│   └── 01-auth-user-stories.md   ✅ Completado
├── 02-tenant/
│   ├── 02-tenant.md               ✅ Completado
│   └── 02-tenant-user-stories.md ✅ Completado
├── 03-rbac/
│   ├── 03-rbac.md                 ✅ Completado
│   └── 03-rbac-user-stories.md   ✅ Completado
├── 04-users/
│   ├── 04-users.md                ✅ Completado
│   └── 04-users-user-stories.md  ✅ Completado
├── 05-suscription/
│   ├── 05-suscription.md              ✅ Completado
│   └── 05-suscription-user-stories.md ✅ Completado
│
│ ── FASE 2: Operaciones Core ──
├── 06-dashboard/
│   └── 06-dashboard.md
├── 07-products/
│   └── 07-products.md
├── 08-inventory/
│   └── 08-inventory.md
├── 09-stock-transfer/
│   └── 09-stock-transfer.md
├── 10-clients-providers/
│   └── 10-clients-providers.md
│
│ ── FASE 3: Ciclo Comercial ──
├── 11-budget/
│   └── 11-budget.md
├── 12-invoice-sales/
│   └── 12-invoice-sales.md
├── 13-arca/
│   └── 13-arca.md
├── 14-purchase-orders/
│   └── 14-purchase-orders.md
├── 15-invoice-purchase/
│   └── 15-invoice-purchase.md
│
│ ── FASE 4: Finanzas y Reportes ──
├── 16-treasury/
│   └── 16-treasury.md
├── 17-cashier/
│   └── 17-cashier.md
├── 18-reports/
│   └── 18-reports.md
│
│ ── FASE 5: Extras y v2.0 ──
├── 19-superadmin/
│   └── 19-superadmin.md
└── 20-ai-agents/
    └── 20-ai-agents.md           ← Nuevo módulo v2.0 (diseño puro)
```

Cada documento de módulo incluye:
1. **Propósito y Alcance** del módulo
2. **Entidades de Datos** (tablas reales con columnas verificadas en BD)
3. **Reglas de Negocio** (lo no obvio: restricciones, invariantes, edge cases)
4. **Flujos Funcionales** paso a paso con estados y transiciones
5. **Integraciones** con otros módulos
6. **API / Endpoints** (método, path, auth, body, respuesta)
7. **Consideraciones de Migración** a Next.js + Cloudflare
8. **Mejoras Propuestas v2.0** (features nuevas, IA aplicada)

---

## 7. Principios de Arquitectura v2.0

### Server Components por defecto
Usar React Server Components para toda la carga de datos. Solo marcar `'use client'` cuando se necesite interactividad (formularios, estados locales, drag-and-drop).

### API Route Handlers tipados
Todas las mutaciones pasan por Route Handlers Next.js con Zod para validación de entrada. Los tipos se comparten entre cliente y servidor (no hay DTOs duplicados).

### Multi-Tenant por Row-Level Security
RLS en PostgreSQL (Cloudflare Hyperdrive) para aislar datos por tenant a nivel de base de datos, eliminando errores de lógica de negocio en la capa de aplicación.

### AI como capa de servicio
Los agentes de IA son servicios independientes (`/services/ai/`) que reciben contexto estructurado y retornan acciones sugeridas. El usuario siempre confirma antes de que el agente ejecute cambios. Los LLM solo interpretan y sugieren; la lógica de negocio sigue en código determinístico.

### Offline-first para operaciones críticas
Caja y facturación deben funcionar con conexión intermitente. Usar Service Workers + IndexedDB para cola de operaciones pendientes que se sincronizan al recuperar conectividad.

---

## 8. Criterios de Éxito v2.0

| Criterio | Baseline Actual | Meta v2.0 |
|----------|----------------|-----------|
| Latencia TTFB | ~300-500ms | <100ms (edge) |
| Tiempo de autorización CAE | ~3-8s | <2s (con cola y retry) |
| Cobertura de tests | ~60% | >85% |
| Tiempo de onboarding nuevo cliente | ~30 min manual | <10 min (wizard IA asistido) |
| Módulos con IA integrada | 0 | 6+ |
| Integraciones externas | 2 (AFIP + MP) | 7+ |
| Disponibilidad | ~99% | 99.9% (Cloudflare SLA) |

---

---

## 9. Mapa Completo de Base de Datos (PostgreSQL — verificado en producción)

> Fuente: schema real extraído de la BD. Usar como referencia autorizada en cada documento de módulo.

### Convenciones
- Todos los **precios/montos** se almacenan como `integer` (centavos). `$1.00 ARS = 100`.
- **Soft delete** se implementa con columna `deleted_at` (timestamp nullable).
- Los campos `created_at` / `updated_at` son `timestamp(0) without time zone` en todos los modelos con `timestamps`.

### ⚠️ Dato crítico para migración
La tabla `invoices` **NO tiene columnas `total`, `subtotal`, `total_tax` ni `total_discounts`**. Estos valores son **calculados dinámicamente** a partir de la tabla pivot `invoice_product`. En v2.0 hay que decidir si se calculan on-the-fly o se materializan en columnas (recomendado para performance).

---

### Tablas por dominio

#### Identidad y Acceso
| Tabla | Columnas clave | Módulo |
|-------|---------------|--------|
| `users` | id, name, email, avatar_url, password, address_id, dni, phone, is_super_admin, deleted_at | 01-auth, 04-users |
| `sessions` | id, user_id, ip_address, user_agent, payload, last_activity | 01-auth |
| `password_reset_tokens` | email (PK), token, created_at | 01-auth |
| `personal_access_tokens` | id, tokenable_type, tokenable_id, name, token, abilities, last_used_at, expires_at | API (Sanctum) |
| `tenants` | id, name, cuit, phone, email, logo_url, address_id, iva, parent_id, active, suspended_reason, deleted_at | 02-tenant |
| `tenant_user` | id, tenant_id, user_id | 02-tenant |
| `roles` | id, name, tenant_id, guard_name, deleted_at | 03-rbac |
| `permissions` | id, name, guard_name, deleted_at | 03-rbac |
| `permission_role` | id, role_id, permission_id | 03-rbac |
| `role_user` | id, role_id, user_id | 03-rbac |
| `custom_permissions` | id (vacía, legacy) | — |

#### Suscripciones
| Tabla | Columnas clave | Módulo |
|-------|---------------|--------|
| `plans` | id, name, price (int), description, order, active, is_free_tier, duration, isRecurrent, frequency, frequency_type, trial_days, show_in | 05-suscription |
| `suscriptions` | id, plan_id, tenant_id, coupon_id, start_date, next_payment_date, months, active, invoice_url, external_reference, payment_id, mercadopago_payer_id, mercadopago_subscription_id, payer_email, metadata (json), amount (float), status, trial, trial_days, trial_end_date | 05-suscription |
| `coupons` | id, code, type, value (int), max_uses, current_uses, start_date, end_date, active, reference | 05-suscription |
| `coupon_plan` | id, coupon_id, plan_id | 05-suscription |
| `free_tiers` | id, tenant_id, resource, quantity | 05-suscription |
| `tenant_features` | id, tenant_id, feature, enabled | 02-tenant |

#### Catálogo y Precios
| Tabla | Columnas clave | Módulo |
|-------|---------------|--------|
| `categories` | id, tenant_id, name, description, parent_id, deleted_at | 07-products |
| `products` | id, tenant_id, name, description, price_buy (int/¢), price_sell (int/¢), category_id, image, barcode, is_active, deleted_at | 07-products |
| `product_tenant` | id, product_id, tenant_id, margin_id | 07-products |
| `product_tax` | id, product_id, tax_id, value (decimal 10,2) | 07-products |
| `margins` | id, name, percentage (decimal 10,2), is_default, tenant_id | 07-products |
| `taxes` | id, name, deleted_at | 07-products, 02-tenant |
| `tax_tenant` | id, tenant_id, tax_id, value (decimal 10,2), is_preferred | 02-tenant |
| `price_histories` | id, tenant_id, user_id, product_id, price_buy (int), price_sell (int), tax_value (decimal 10,2), margin_id, change_type | 07-products |
| `price_history_tax` | id, price_history_id, tenant_id, tax_id, value (decimal 10,2) | 07-products |

#### Inventario
| Tabla | Columnas clave | Módulo |
|-------|---------------|--------|
| `batches` | id, product_id, tenant_id, batch_number, barcode, expiration_date, status, deleted_at | 08-inventory |
| `branch_stocks` | id, tenant_id, batch_id, product_id, quantity (int), deleted_at | 08-inventory |
| `stock_transfers` | id, source_tenant_id, destination_tenant_id, status, initiated_by (user_id), received_by (user_id), notes, completed_at, deleted_at | 09-stock-transfer |
| `stock_transfer_items` | id, stock_transfer_id, product_id, batch_id, quantity, source_quantity_before, source_quantity_after, dest_quantity_before, dest_quantity_after | 09-stock-transfer |

#### Contrapartes (Clientes y Proveedores)
| Tabla | Columnas clave | Módulo |
|-------|---------------|--------|
| `counterparties` | id, name, cuit, contact_name, email, phone, tax_condiction, deleted_at | 10-clients-providers |
| `counterparty_tenant` | id, counterparty_id, tenant_id, party_type, contact_name, email, phone | 10-clients-providers |
| `counterparty_product` | id, counterparty_id, product_id, party_type | 10-clients-providers |
| `addresses` | id, location_id, address | 01-auth, 02-tenant |
| `address_counterparty` | id, address_id, counterparty_id | 10-clients-providers |
| `locations` | id, province_id, name, lat, lon | geolocalización |
| `provinces` | id, name, lat, lon | geolocalización |

#### Documentos Comerciales (Facturas, Presupuestos, Notas)
| Tabla | Columnas clave | Módulo |
|-------|---------------|--------|
| `invoices` | id, tenant_id, counterparty_id, invoice_number, invoice_date, invoice_type, invoice_origin, currency, status, iva_type, tax_tenant_id, discount_type, discount_value, interest_type, interest_value, installments, expiration_date, reason, cae, cae_expiration_date, cae_result, cbte_nro, cbte_tipo, PtoVta, purchase_order_id, is_reconciled, conciliation_comment, deleted_at | 11-budget, 12-invoice-sales, 15-invoice-purchase |
| `invoice_product` | id, invoice_id, product_id, quantity (int), price (int/¢), discount (float), tax_value (float), margin_id, batch_id, update_product_price, update_product_tax | 11-budget, 12-invoice-sales |
| `purchase_orders` | id, tenant_id, counterparty_id, user_id, number, date, expected_date, status, total (bigint/¢), notes, rejection_reason, deleted_at | 14-purchase-orders |
| `purchase_order_items` | id, purchase_order_id, product_id, quantity (int), unit_price (bigint/¢), total (bigint/¢), notes, deleted_at | 14-purchase-orders |

#### AFIP / ARCA
| Tabla | Columnas clave | Módulo |
|-------|---------------|--------|
| `arca_certificates` | id, tenant_id, name, cert_pem (text), key_pem (text, encriptado), passphrase (varchar, encriptado), filename, mime_type, size, environment | 13-arca |
| `arca_login_ticket_requests` | id, tenant_id, certificate_id, unique_id, generation_time, expiration_time, service, xml (text), filename, mime_type, size, environment | 13-arca |
| `arca_login_tickets` | id, tenant_id, certificate_id, unique_id, generation_time, expiration_time, source, destination, xml (text), token (text), sign (text), filename, mime_type, size, environment | 13-arca |

#### Tesorería
| Tabla | Columnas clave | Módulo |
|-------|---------------|--------|
| `transactions` | id, counterparty_id, tenant_id, number (int, talonario), type, status, amount (int/¢), operation_date, description | 16-treasury |
| `invoice_transaction` | id, invoice_id, transaction_id, amount (int/¢), currency | 16-treasury |
| `payment_types` | id, tenant_id, name, is_cash, deleted_at | 16-treasury |
| `payment_type_transaction` | id, payment_type_id, transaction_id, amount (int/¢), currency, payment_reference, origin (bigint) | 16-treasury |
| `tenant_transaction` | id, tenant_id, transaction_id | 16-treasury |

> **Nota:** `payment_type_transaction.origin` es `bigint` en la BD pero el código lo usa como string ('payment', 'credit_balance', 'credit_notes'). Verificar si hay una tabla de referencia o si es un enum que se trata como int/string.

#### Caja
| Tabla | Columnas clave | Módulo |
|-------|---------------|--------|
| `cash_registers` | id, tenant_id, name (varchar 100), description (varchar 255), is_active | 17-cashier |
| `cash_shifts` | id, tenant_id, cash_register_id, opened_by_user_id, closed_by_user_id, status, shift_number (int), opening_balance (bigint/¢), closing_balance_counted (bigint/¢), closing_balance_calculated (bigint/¢), difference (bigint/¢), opened_at, closed_at, closing_notes | 17-cashier |
| `cash_movements` | id, tenant_id, cash_shift_id, user_id, type, origin, transaction_id, payment_type_id, amount (bigint/¢), concept, reference (varchar 100), movement_date | 17-cashier |

#### Sistema y Auditoría
| Tabla | Columnas clave | Módulo |
|-------|---------------|--------|
| `activities` | id, user_id, tenant_id, activity_type, data (json) | activity |
| `notifications` | id (uuid), type, notifiable_type, notifiable_id, data (text), read_at | notifications |
| `feedback` | id, tenant_id, user_id, subject, status | feedback |
| `feedback_messages` | id, feedback_id, user_id, message (text), is_super_admin | feedback |
| `inquiry_messages` | id, name, email, phone, subject, message (text), status, ip_address (inet), handled_at | landing |
| `jobs` | id, queue, payload (text), attempts, reserved_at, available_at, created_at | queues |
| `job_batches` | id, name, total_jobs, pending_jobs, failed_jobs, failed_job_ids, options, cancelled_at, created_at, finished_at | queues |
| `failed_jobs` | id, uuid, connection, queue, payload (text), exception (text), failed_at | queues |
| `cache` / `cache_locks` | key, value, expiration | cache |
| `migrations` | id, migration, batch | infra |

---

*Este documento es el punto de partida. Cada módulo tendrá su propio archivo de especificación detallada en la carpeta correspondiente de `/doc`.*
