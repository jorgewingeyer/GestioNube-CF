# Módulo 06 — Dashboard

> **Fase:** 2 — Operaciones Core  
> **Depende de:** 02-tenant, 03-rbac, 05-suscription  
> **Es requerido por:** ninguno (es el punto de entrada visual post-login)

---

## 1. Propósito y Alcance

El dashboard es la pantalla de inicio que ve el usuario al autenticarse. Concentra los indicadores clave de negocio (KPIs) del tenant activo en una sola vista: tesorería, facturación, productos y actividad reciente.

**Filosofía de diseño:**
- Los datos se calculan en el backend y se cachean por 5–10 minutos para evitar queries repetidas en cada recarga
- El frontend recibe los datos ya formateados (montos como strings, fechas en formato local) a través de `DashboardResource`
- No existe paginación — son métricas agregadas y listas acotadas (top 5 productos, últimas 10 facturas)
- No tiene un `Policy` propio — el acceso se controla con el permiso "Ver Dashboard" (ID 18) verificado en la ruta

**Quién lo usa:** todos los usuarios autenticados con acceso al tenant activo (el nivel de detalle varía según permisos individuales de otros módulos).

---

## 2. Fuentes de Datos

El dashboard no tiene tablas propias. Agrega datos de múltiples módulos:

| Sección | Tablas consultadas | Módulo fuente |
|---------|-------------------|---------------|
| Facturas de venta (conteo, monto, estado) | `invoices`, `invoice_product` | 12-invoice-sales |
| Facturas de compra (conteo, monto, estado) | `invoices`, `invoice_product` | 13-invoice-purchase |
| Cuentas por cobrar / pagar | `invoices`, `invoice_transaction` | 15-treasury |
| Flujo de caja mensual (6 meses) | `transactions` | 15-treasury |
| Contrapartes con saldo pendiente | `invoices`, `counterparties` | 10-clients-providers |
| Contrapartes con saldo a favor | `transactions`, `counterparties` | 10-clients-providers |
| Productos más vendidos (top 5) | `products`, `invoice_product` | 07-products |
| Actividad reciente (últimas 10 facturas + 10 transacciones) | `invoices`, `transactions` | 12, 13, 15 |
| Comparación mes actual vs mes anterior | `invoices`, `invoice_product` | 12-invoice-sales |

**Nota crítica:** las facturas NO tienen columnas `total`, `subtotal`, `tax` en la BD. Todos los totales se **calculan dinámicamente** leyendo `invoice_product.quantity × invoice_product.price`, aplicando descuentos, intereses e IVA. Este cálculo se hace en PHP dentro de los chunks de 500 registros para evitar cargar toda la colección en memoria.

---

## 3. Reglas de Negocio

### 3.1 Caché por tenant con TTL de 5–10 minutos

`GetDashboardDataAction` usa dos niveles de caché:

```php
// Dashboard general: 5 minutos
$cacheKey = "dashboard_data_tenant_{$currentTenant}";
Cache::remember($cacheKey, 300, function () { ... });

// Tesorería: 10 minutos  
$cacheKey = "treasury_dashboard_tenants_{implode('_', $tenantIds)}";
Cache::remember($cacheKey, now()->addMinutes(10), function () { ... });
```

Las claves se invalidan cuando el usuario cambia de sucursal (`SetCurrentTenantAction` llama a `Cache::forget`).

### 3.2 Visibilidad cross-tenant en tesorería

`DashboardTreasuryAction` aplica el permiso especial de multi-sucursal:

```php
$tenantIds = auth()->user()->hasPermissionTo('Ver Facturas Sucursales')
    ? GetTenantContextAction::execute($currentTenant)  // self + toda la jerarquía
    : [$currentTenant];                                 // solo el tenant activo
```

Esto significa que un dueño de la empresa principal con el permiso especial ve los KPIs consolidados de todas sus sucursales en el dashboard.

### 3.3 Cálculo de totales de factura en chunks

Para evitar memory exhaustion con grandes volúmenes, los totales de facturas se calculan en lotes:

```php
Invoice::...->chunk(500, function ($invoices) use (&$totalSalesAmount) {
    foreach ($invoices as $invoice) {
        $calculated = GetInvoiceByIdAction::calculateInvoiceTotals($invoice);
        $totalSalesAmount += $calculated->total;
    }
});
```

La función `calculateInvoicesTotalsBulk` aplica en orden:
1. Subtotal = `sum(quantity × price)` desde `invoice_product`
2. Descuento (porcentaje o fijo)
3. Interés (porcentaje o fijo)
4. IVA: si `iva_type = 'excluded'` se multiplica × 1.21; si `iva_type = 'included'` ya está incorporado

### 3.4 Conversión de montos en DashboardResource

El backend calcula los montos como floats. `DashboardResource` los convierte con `NumberHelper::money()` antes de enviarlos al frontend. Formato resultante: `"$1.500,00"` (ARS con separador de miles y decimales).

**Importante para la migración:** el `DashboardResource` documenta explícitamente que "el backend almacena en centavos" pero en la práctica los cálculos del dashboard producen floats, no enteros en centavos. Los módulos de facturación trabajan con `price` en centavos en la tabla `invoice_product`, pero al calcular totales con IVA y descuentos el resultado es float.

### 3.5 Endpoint separado para actualizaciones AJAX

Existe un endpoint `GET /dashboard/data` que devuelve JSON puro (sin Inertia), diseñado para actualizaciones periódicas desde el frontend sin recargar la página completa.

### 3.6 Fallback a datos vacíos

Si `GetDashboardDataAction` lanza una excepción, retorna `getDefaultDashboardData()` con todos los valores en cero. El controller también captura excepciones y pasa `dashboardData = []`. El frontend debe manejar ambos casos sin romperse.

---

## 4. Bloques de Datos del Dashboard

### 4.1 Summary Cards (4 tarjetas principales)

```
┌─────────────────────┐  ┌─────────────────────┐
│  Cuentas por Cobrar │  │  Cuentas por Pagar  │
│  $XXX.XXX,XX        │  │  $XXX.XXX,XX        │
│  ↑ Total pendiente  │  │  ↓ Total a pagar    │
└─────────────────────┘  └─────────────────────┘
┌─────────────────────┐  ┌─────────────────────┐
│  Facturas de Venta  │  │  Flujo de Caja Neto │
│  XXX emitidas       │  │  $XXX.XXX,XX        │
│  ↑ Total emitidas   │  │  ↑/↓ Cobros - Pagos │
└─────────────────────┘  └─────────────────────┘
```

- **Cuentas por Cobrar:** suma de `balance` de facturas de venta + notas de débito en status ACCEPTED, PARTIALLY_PAID, PENDING
- **Cuentas por Pagar:** suma de `balance` de facturas de compra en mismos estados
- **Facturas de Venta:** conteo total de facturas emitidas
- **Flujo de Caja Neto:** `accountsReceivable - accountsPayable`

### 4.2 Métricas de Facturación (invoiceMetrics)

- Conteo total de facturas de venta y compra (sin filtro de fecha)
- Distribución por estado: `salesByStatus` y `purchasesByStatus` (array con status, label, count)
- Tendencia de los últimos 6 meses: monto de ventas y compras por mes

### 4.3 Métricas Financieras (financialMetrics)

- Total ventas y compras de los últimos 6 meses
- Ganancia neta = totalSales - totalPurchases (últimos 6 meses)
- Ventas y compras del mes actual vs mes anterior (para comparación)

### 4.4 Flujo de Caja (cashFlow)

- Datos mensuales de los últimos 6 meses: ingresos (cobros), egresos (pagos), flujo neto
- Calculado desde `transactions` con `type = 'collection'` (ingresos) y `type = 'payment'` (egresos)
- Totales resumidos del período: total ingresos, total egresos, neto, promedios mensuales

### 4.5 Comparación Mensual

- Ventas del mes actual vs mes anterior
- `percentageChange` = `((actual - anterior) / anterior) * 100`

### 4.6 Métricas de Productos

- Total de productos del tenant
- Productos activos (`is_active = true`)
- Top 5 productos más vendidos en los últimos 3 meses (por cantidad sumada en `invoice_product`)

### 4.7 Actividad Reciente

- Últimas 10 facturas (cualquier tipo): número, tipo, cliente/proveedor, estado, total calculado, fecha
- Últimas 10 transacciones: número, tipo, contraparte, monto, estado, fecha

### 4.8 Tesorería (treasury — viene de DashboardTreasuryAction)

- Contrapartes con saldo a favor (crédito) — hasta 10, agrupado por tipo
- Contrapartes con facturas pendientes — hasta 50
- Totales de saldos pendientes y de crédito, separados por clientes y proveedores
- Transacciones pendientes del mes

---

## 5. Flujo Request / Response

```
GET /dashboard
  │
  ├─ Middleware: auth, verified (si aplica)
  ├─ Permiso: "Ver Dashboard" (ID 18) verificado en ruta
  │
  ├─ GetCurrentTenantAction → $currentTenant
  └─ GetDashboardDataAction::execute()
      │
      ├─ Cache::remember("dashboard_data_tenant_{id}", 300s)
      │   ├─ DashboardTreasuryAction::execute()
      │   │   ├─ Cache::remember("treasury_dashboard_tenants_...", 10min)
      │   │   ├─ Facturas de venta pendientes (chunk 500)
      │   │   ├─ Facturas de compra pendientes (chunk 500)
      │   │   ├─ GetTreasuryMetricsAction (AR, AP, netFlow, overdue)
      │   │   ├─ GetCashFlowSummaryAction (6 meses de transactions)
      │   │   ├─ GetCounterpartiesWithCreditBalanceAction
      │   │   └─ GetCounterpartiesWithPendingInvoicesAction
      │   │
      │   ├─ getInvoiceMetrics() → chunk 500 de facturas últimos 6 meses
      │   ├─ getProductMetrics() → top 5 productos
      │   ├─ getRecentActivity() → últimas 10 facturas + 10 transacciones
      │   ├─ getMonthlyComparison() → chunk 500 de facturas actuales vs anteriores
      │   ├─ getFinancialMetrics() → agrega desde monthlyTrends
      │   └─ getSummaryCards() → 4 tarjetas
      │
      └─ new DashboardResource($data) → formatea montos y fechas

  → Inertia::render('dashboard/dashboard', {
      dashboardData: DashboardResource,
      currentTenant: int
    })
```

---

## 6. API / Endpoints

| Método | Path | Nombre | Auth | Guard | Respuesta |
|--------|------|--------|------|-------|-----------|
| `GET` | `/dashboard` | `dashboard` | auth | `can('Ver Dashboard')` | Inertia render |
| `GET` | `/dashboard/data` | `dashboard.data` | auth | ninguno en ruta | JSON `{ success, data }` |

**Nota:** `GET /dashboard/data` no tiene middleware `can()` explícito — heredado de la autenticación general pero sin check de permiso granular.

---

## 7. Consideraciones de Migración Next.js

### Server Component con streaming

El dashboard es un candidato ideal para React Server Components con streaming en Next.js:

```tsx
// app/(authenticated)/dashboard/page.tsx
export default async function Dashboard() {
  const session = await auth()
  await requirePermission(session, 'Ver Dashboard')
  
  return (
    <div>
      {/* Tarjetas de resumen: carga inmediata */}
      <Suspense fallback={<SummaryCardsSkeleton />}>
        <SummaryCards tenantId={session.tenantId} />
      </Suspense>
      
      {/* Gráficos: carga diferida */}
      <Suspense fallback={<ChartsSkeleton />}>
        <CashFlowChart tenantId={session.tenantId} />
        <MonthlyTrendsChart tenantId={session.tenantId} />
      </Suspense>
      
      {/* Actividad reciente: carga diferida */}
      <Suspense fallback={<ActivitySkeleton />}>
        <RecentActivity tenantId={session.tenantId} />
      </Suspense>
    </div>
  )
}
```

### Caché con React `cache()` y Cloudflare KV

```typescript
// lib/dashboard.ts
import { cache } from 'react'
import { kv } from '@/lib/cloudflare-kv'

export const getDashboardData = cache(async (tenantId: number) => {
  const cacheKey = `dashboard:${tenantId}`
  const cached = await kv.get(cacheKey)
  if (cached) return JSON.parse(cached)
  
  const data = await computeDashboardData(tenantId)
  await kv.put(cacheKey, JSON.stringify(data), { expirationTtl: 300 })
  return data
})
```

### Cálculo de totales en Drizzle

Reemplazar los `chunk(500)` de Laravel por queries SQL agregadas para eficiencia:

```typescript
// En vez de chunk con PHP, hacer el cálculo en SQL:
const salesMetrics = await db
  .select({
    month: sql`to_char(created_at, 'YYYY-MM')`,
    totalAmount: sql`SUM(ip.quantity * ip.price)`,
    count: sql`COUNT(DISTINCT i.id)`,
  })
  .from(invoices)
  .innerJoin(invoiceProduct, eq(invoiceProduct.invoiceId, invoices.id))
  .where(and(
    eq(invoices.tenantId, tenantId),
    gte(invoices.createdAt, sixMonthsAgo),
    inArray(invoices.invoiceType, ['sale_invoice', 'remit_sale'])
  ))
  .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
```

Esto es significativamente más eficiente que cargar los modelos en PHP y sumar en memoria.

### Endpoint de refresco en tiempo real

Reemplazar el `GET /dashboard/data` por Server-Sent Events o polling con React Query:

```typescript
// Polling cada 5 minutos en el cliente
const { data } = useQuery({
  queryKey: ['dashboard', tenantId],
  queryFn: () => fetch('/api/dashboard').then(r => r.json()),
  staleTime: 5 * 60 * 1000,   // 5 minutos
  refetchInterval: 5 * 60 * 1000,
})
```

---

## 8. Mejoras Propuestas v2.0

### Dashboard personalizable por usuario

Actualmente todos los usuarios ven los mismos bloques. En v2.0 permitir que cada usuario elija qué widgets mostrar y en qué orden.

### KPIs en tiempo real con WebSockets / SSE

Los datos críticos (cuentas por cobrar, facturas vencidas) podrían actualizarse en tiempo real cuando se emite o cobra una factura, usando Cloudflare Durable Objects o Server-Sent Events en lugar de polling.

### Alertas inteligentes generadas por IA (add-on IA)

Con el add-on de IA activo, el dashboard mostraría una sección "Alertas del negocio" con insights automáticos:
- "Tus ventas cayeron 30% esta semana vs la semana pasada — los jueves y viernes fueron los días más bajos"
- "El proveedor X tiene 3 facturas vencidas por $XX.XXX — contactarlos antes del viernes"
- "El producto Y se agota en ~12 días a tu ritmo actual de ventas"

### Widget de estado AFIP/ARCA

Para empresas con facturación electrónica activa: un indicador en el dashboard sobre el estado de la conexión AFIP, validez del certificado y última emisión exitosa.

### Comparador de sucursales

Para tenants con permiso "Ver Facturas Sucursales": un widget que compare las ventas de cada sucursal en el mes actual, con ranking visual.

### Onboarding progress widget

Si el tenant tiene el onboarding incompleto (módulo US-AUTH-16), mostrar una barra de progreso en el dashboard con los pasos pendientes.
