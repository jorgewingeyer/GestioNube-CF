# Módulo 05 — Suscripciones y Planes

> **Fase:** 1 — Fundación  
> **Depende de:** 02-tenant  
> **Es requerido por:** todos los módulos (el free tier controla límites de uso), 20-ai-agents (add-on IA)

---

## 1. Propósito y Alcance

El módulo de suscripciones gestiona el ciclo de vida comercial de GestioNube como producto SaaS: qué plan tiene cada empresa, cuánto paga, por cuánto tiempo, y qué funcionalidades tiene habilitadas. Integra con **MercadoPago** para el cobro recurrente.

**Estructura de planes actual:**
- Un **free tier** sin cobro, con límites de uso configurados
- Tres **planes pagos** (Mensual, Trimestral, Semestral) con facturación recurrente via MercadoPago
- **[v2.0]** Un **add-on de IA** que se puede activar independientemente del plan base para desbloquear el módulo de inteligencia artificial

**Quién lo usa:** dueños y administradores de empresa (contratar/cancelar planes), el sistema internamente (verificar acceso a features), y superadmin (gestionar planes y cupones).

---

## 2. Entidades de Datos

### Tabla `plans`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | — |
| `name` | varchar NOT NULL | "Mensual", "Trimestral", "Semestral" |
| `price` | integer NOT NULL | Precio en ARS (entero). Ej: 55000 = $55.000 ARS |
| `description` | text nullable | Texto de marketing del plan |
| `order` | integer NOT NULL | Orden de presentación en la UI |
| `active` | boolean NOT NULL | Si el plan está disponible para contratar |
| `is_free_tier` | boolean NOT NULL | `true` para el plan gratuito |
| `duration` | integer NOT NULL | Duración en meses del período contratado |
| `isRecurrent` | boolean nullable | Si tiene cobro recurrente automático |
| `frequency` | integer nullable | Cada cuántas unidades se cobra (ej: 1, 3, 6) |
| `frequency_type` | varchar nullable | Unidad de frecuencia: `'months'`, `'weeks'`, `'days'` |
| `trial_days` | integer nullable | Días de prueba gratuita antes del primer cobro |
| `show_in` | varchar nullable | Contexto donde se muestra: `'upgrade'`, `'all'`, etc. |
| `mercadopago_plan_id` | varchar nullable | ID del plan en MP (si está preconfigurado allá) |
| `created_at` / `updated_at` | timestamp nullable | — |

**Planes actuales en BD:**

| ID | Nombre | Precio ARS | Duración | Frecuencia | Trial |
|----|--------|-----------|----------|------------|-------|
| 1 | Mensual | $55.000 | 1 mes | 1 mes | 7 días |
| 2 | Trimestral | $148.500 | 3 meses | 3 meses | 14 días |
| 3 | Semestral | $264.000 | 6 meses | 6 meses | 30 días |
| — | Free Tier | $0 | sin fin | — | — |

**Ahorro por plan:** Trimestral = $148.500 vs 3×$55.000 = $165.000 (10% off). Semestral = $264.000 vs 6×$55.000 = $330.000 (20% off).

### Tabla `suscriptions`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | — |
| `plan_id` | bigint NOT NULL | FK → `plans.id` |
| `tenant_id` | bigint NOT NULL | FK → `tenants.id` |
| `coupon_id` | bigint nullable | FK → `coupons.id` |
| `start_date` | timestamp NOT NULL | Fecha de inicio de la suscripción |
| `next_payment_date` | timestamp nullable | Próxima fecha de cobro recurrente (desde MP) |
| `months` | integer NOT NULL | Duración contratada en meses |
| `active` | boolean NOT NULL | Indicador rápido de si está activa |
| `invoice_url` | varchar nullable | URL del comprobante de pago |
| `external_reference` | varchar nullable | Referencia en MP: `"plan_{id}_{timestamp}_{sub_id}"` |
| `payment_id` | varchar nullable | ID del pago en MercadoPago |
| `mercadopago_payer_id` | varchar nullable | ID del pagador en MP |
| `mercadopago_subscription_id` | varchar nullable | ID del preapproval en MP |
| `payer_email` | varchar nullable | Email del pagador registrado en MP |
| `metadata` | json nullable | Datos adicionales: activated_at, payment_data, payer_id |
| `amount` | float NOT NULL | Monto cobrado (puede diferir de `plans.price` si hay descuento) |
| `status` | varchar NOT NULL | Enum: `pending`, `authorized`, `paused`, `cancelled` |
| `trial` | boolean NOT NULL | Si está en período de prueba |
| `trial_days` | integer NOT NULL | Días de trial configurados |
| `trial_end_date` | timestamp nullable | Fecha de fin del trial |
| `created_at` / `updated_at` | timestamp nullable | — |

**Nota:** el modelo referencia un campo `end_date` en su código pero **no existe en la tabla** — la expiración se calcula a partir de `start_date + months`.

### `SuscriptionStatus` Enum

| Valor | Nombre | Descripción |
|-------|--------|-------------|
| `pending` | Pendiente | Creada, esperando confirmación de pago de MP |
| `authorized` | Activa | Pago confirmado, acceso completo |
| `paused` | Pausada/Expirada | Período vencido o pago fallido recurrente |
| `cancelled` | Cancelada | Cancelada por el usuario o el sistema |

**Discrepancia código vs enum:** el modelo `Suscription.php` referencia `ACTIVE`, `FAILED`, `SUSPENDED`, `EXPIRED` como casos válidos, pero el enum `SuscriptionStatus` solo tiene `PENDING`, `AUTHORIZED`, `PAUSED`, `CANCELLED`. En la BD se guardan los strings del enum. Los métodos `fail()`, `suspend()`, `expire()` en el modelo usan strings directamente — deuda técnica.

### Tabla `coupons`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | — |
| `code` | varchar NOT NULL | Código alfanumérico del cupón |
| `type` | varchar NOT NULL | Tipo: `'percentage'` o `'fixed'` |
| `value` | integer NOT NULL | % de descuento o monto fijo en ARS |
| `max_uses` | integer nullable | Máximo de usos permitidos (NULL = ilimitado) |
| `current_uses` | integer NOT NULL | Usos acumulados hasta ahora |
| `start_date` | timestamp NOT NULL | Fecha de inicio de validez |
| `end_date` | timestamp nullable | Fecha de fin de validez (NULL = sin expiración) |
| `active` | boolean NOT NULL | — |
| `reference` | varchar nullable | Nota interna de referencia |
| `created_at` / `updated_at` | timestamp nullable | — |

### Tabla `coupon_plan` (pivot)

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | — |
| `coupon_id` | bigint NOT NULL | FK → `coupons.id` |
| `plan_id` | bigint NOT NULL | FK → `plans.id` |

Un cupón puede aplicarse a múltiples planes o solo a planes específicos.

### Tabla `free_tiers`

Almacena los límites de uso por recurso para tenants en free tier.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | — |
| `tenant_id` | bigint NOT NULL | FK → `tenants.id` |
| `resource` | varchar NOT NULL | Nombre del recurso: `'invoices'`, `'products'`, etc. |
| `quantity` | integer nullable | Límite máximo de ese recurso |
| `created_at` / `updated_at` | timestamp nullable | — |

---

## 3. Reglas de Negocio

### 3.1 Free tier: ausencia de suscripción activa

`IsFreeTierAction` determina si un tenant está en free tier con una lógica inversa:

```php
public static function execute(): bool
{
    $subscription = Suscription::where('tenant_id', $tenantId)
        ->where('active', 1)
        ->first();
    return $subscription ? false : true; // si no tiene suscripción activa → es free tier
}
```

**Implicación:** el free tier no es un plan explícito en muchos contextos — simplemente es la ausencia de suscripción paga activa.

### 3.2 Creación de suscripción: flujo en dos pasos

La suscripción se crea primero en BD con estado `PENDING`, y luego MP la activa via webhook o redirect:
1. `POST /suscription/create-preference-url` → `CreateSuscriptionAction` crea registro con `status=PENDING` → `CreateSubscriptionWithoutPlan` crea el preapproval en MP → redirect al `init_point` de MP
2. El usuario paga en MP → MP redirige a `/suscription/success` → `ActivateSubscriptionFromMercadoPago` actualiza a `AUTHORIZED`
3. MP también envía webhook → `ProcessMercadoPagoWebhookAction` procesa el evento

### 3.3 External reference como clave de correlación

El campo `external_reference` conecta la suscripción en BD con el evento de MP:
```
"plan_{plan_id}_{timestamp}_{subscription_id}"
```
`ProcessMercadoPagoWebhookAction` busca la suscripción por este campo al recibir el webhook.

### 3.4 Período de prueba (trial)

El plan define `trial_days`. Al crear el preapproval en MP, se configura:
```php
'free_trial' => [
    'frequency' => $plan->trial_days,
    'frequency_type' => 'days',
]
```
MP no cobra durante el trial. Cuando termina, inicia el cobro recurrente automático.

### 3.5 Cupones: porcentaje o monto fijo

El modelo `Coupon` valida:
- `active = true`
- `current_uses < max_uses` (si max_uses no es null)
- `start_date <= now <= end_date`

El descuento se aplica en `CalculateDiscountOnPlans` antes de crear la preferencia en MP.

### 3.6 Shared prop `isFreeTier` en cada request

El middleware `HandleInertiaRequests` calcula `isFreeTier` en cada request y lo comparte con el frontend via Inertia props. El frontend lo usa para mostrar banners de upgrade y restringir acciones.

### 3.7 Cancelación: actualiza BD y MP

`cancelSubscription()`:
1. Llama a MP API para marcar el preapproval como `'cancelled'` (si falla por API, loguea warning pero continúa)
2. Actualiza el registro en BD: `status='cancelled', active=false`

---

## 4. Flujos Funcionales

### 4.1 Ver página de suscripción

```
GET /suscription
  │
  ├─ GetActiveSuscriptionAction::execute() → suscripción activa del tenant (con plan y cupón)
  ├─ Si hay coupon_id en sesión → GetCouponById
  └─ GetAvailablePlansAction::execute() → planes activos ordenados por order

  → Inertia render 'suscription/suscription'
  → Props: { activeSuscription, availablePlans, coupon }
```

### 4.2 Contratar un plan (flujo completo)

```
[1] Usuario elige plan y (opcionalmente) aplica cupón
    POST /suscription/validate-coupon
        └─ GetCouponByCode → valida → guarda coupon_id en sesión flash

[2] Usuario confirma contratación
    POST /suscription/create-preference-url
        body: { plan_id, coupon_id?, final_price }
        │
        ├─ Plan::find($plan_id)
        ├─ Coupon::find($coupon_id)  [opcional]
        ├─ CreateSuscriptionAction::execute(plan, coupon, finalPrice)
        │   └─ Suscription::create([tenant_id, plan_id, amount, status=PENDING, months, ...])
        ├─ CreateSubscriptionWithoutPlan::execute(plan, finalPrice, subscription->id)
        │   └─ MP PreapprovalClient::create({
        │         reason: plan.name,
        │         external_reference: "plan_{id}_{ts}_{sub_id}",
        │         payer_email: user.email,
        │         auto_recurring: { frequency, frequency_type, amount, ARS, free_trial }
        │      })
        │      → retorna preapproval con init_point (URL de pago MP)
        ├─ subscription->update([mercadopago_subscription_id = preapproval->id])
        └─ Inertia::location($preapproval->init_point)   ← redirect externo a MP

[3a] Pago exitoso → MP redirige a GET /suscription/success?preapproval_id=...
        ├─ MercadoPagoClient::get($preapproval_id)
        ├─ Si status == 'authorized' → ActivateSubscriptionFromMercadoPago::execute()
        │   └─ subscription->update([status=AUTHORIZED, active=true, next_payment_date, trial, ...])
        └─ redirect /suscription con flash 'success'

[3b] Pago fallido → MP redirige a GET /suscription/failure
        └─ render PaymentResult con status='error'

[3c] Pago pendiente → MP redirige a GET /suscription/pending
        └─ render PaymentResult con status='warning'

[4] Webhook de MP (asíncrono)
    POST /mp-webhook  (ruta separada)
        └─ ProcessMercadoPagoWebhookAction::execute($webhookData)
            ├─ Valida type: 'payment' | 'preapproval'
            ├─ Busca resource details en MP API
            ├─ Busca suscripción por external_reference
            └─ Actualiza status según resource_status:
               - 'approved'/'authorized' → AUTHORIZED + dates
               - 'pending' → PENDING
               - 'rejected'/'cancelled'/'paused' → FAILED/CANCELLED
```

### 4.3 Cancelar suscripción

```
POST /suscription/cancel
    body: { subscription_id }
    │
    ├─ Suscription::find($subscription_id)
    ├─ MercadoPagoClient::update(mp_id, { status: 'cancelled' })  ← puede fallar (warning)
    └─ subscription->update([status='cancelled', active=false])

  → redirect back con flash 'success'
```

### 4.4 Validar cupón

```
POST /suscription/validate-coupon
    body: { cupon_code }
    │
    ├─ GetCouponByCode::execute($code) → Coupon con plans eager loaded
    ├─ Valida: active, max_uses, fechas
    └─ session()->flash('coupon_id', $coupon->id)

  → redirect back con flash 'success'
```

---

## 5. Integración con el resto del sistema

| Módulo | Relación |
|--------|----------|
| **Tenant (02)** | Cada suscripción pertenece a un `tenant_id`. El free tier se activa al crear el tenant en el registro. |
| **Auth (01)** | `HandleInertiaRequests` comparte `isFreeTier` y `FreeTierResources` en cada request. |
| **Dashboard (06)** | El dashboard verifica `isFreeTier` para mostrar banner de upgrade. |
| **Todos los módulos** | Los límites del free tier (`free_tiers` table) restringen operaciones de creación cuando se alcanza el máximo. |
| **Superadmin (19)** | Gestiona los planes, precios, cupones y suscripciones de todos los tenants. |

---

## 6. API / Endpoints

| Método | Path | Nombre | Auth | Body / Params |
|--------|------|--------|------|---------------|
| `GET` | `/suscription` | `suscription.index` | auth | — |
| `GET` | `/suscription/status` | `suscription.status` | auth | — |
| `POST` | `/suscription/validate-coupon` | `suscription.validateCoupon` | auth | `cupon_code` |
| `POST` | `/suscription/create-preference-url` | `suscription.createPreferenceUrl` | auth | `plan_id`, `coupon_id?`, `final_price` |
| `POST` | `/suscription/cancel` | `suscription.cancelSubscription` | auth | `subscription_id` |
| `GET` | `/suscription/success` | `suscription.success` | auth | `preapproval_id` (query) |
| `GET` | `/suscription/failure` | `suscription.failure` | auth | params de MP |
| `GET` | `/suscription/pending` | `suscription.pending` | auth | params de MP |

---

## 7. Consideraciones de Migración Next.js

### MercadoPago SDK

El SDK de MercadoPago para PHP funciona con `PreapprovalClient`. En Node.js/Next.js usar el SDK oficial `@mercadopago/sdk-react` para el frontend y llamar a la API REST de MP directamente desde el backend (Cloudflare Worker).

```typescript
// lib/mercadopago.ts
const MP_BASE = 'https://api.mercadopago.com'

export async function createPreapproval(data: PreapprovalData) {
  const res = await fetch(`${MP_BASE}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
  return res.json()
}
```

### Webhooks en Cloudflare Workers

Los webhooks de MP son requests POST externos. En Cloudflare Workers, usar una ruta dedicada con verificación de firma:

```typescript
// app/api/webhooks/mercadopago/route.ts
export async function POST(req: Request) {
  const body = await req.json()
  // Verificar x-signature header de MP
  await processWebhook(body)
  return Response.json({ ok: true })
}
```

### Estado de suscripción en JWT

En Next.js, incluir el `subscriptionStatus` y `isFreeTier` en el JWT token para no consultar BD en cada request:

```json
{
  "tenantId": 7,
  "subscriptionStatus": "authorized",
  "isFreeTier": false,
  "planId": 2,
  "aiAddonActive": false
}
```

Invalidar el JWT cuando cambia el estado de la suscripción (vía webhook).

### Múltiples suscripciones por tenant (add-on IA)

En la arquitectura v2.0 un tenant puede tener hasta 2 suscripciones activas simultáneas:
1. La suscripción del plan base (Mensual/Trimestral/Semestral)
2. El add-on de IA (independiente, con su propio ciclo de cobro)

`GetActiveSuscriptionAction` debe evolucionar para retornar ambas:

```typescript
async function getActiveSubscriptions(tenantId: number) {
  return db.select().from(subscriptions)
    .where(and(
      eq(subscriptions.tenantId, tenantId),
      eq(subscriptions.active, true),
      eq(subscriptions.status, 'authorized')
    ))
  // Retorna array de 0, 1 o 2 suscripciones
}
```

---

## 8. Add-on de IA — Diseño v2.0

### Concepto

El módulo de IA de GestioNube (análisis de rentabilidad, predicciones, agentes) es una funcionalidad premium que se comercializa como un **add-on independiente**, aplicable sobre cualquiera de los 3 planes base. Un tenant puede estar en el plan Mensual + tener el add-on de IA activo; o en el plan Semestral + sin IA.

### Cambios en la BD requeridos

**Nueva columna en `plans`:**
```sql
ALTER TABLE plans ADD COLUMN plan_type VARCHAR DEFAULT 'base';
-- Valores: 'base' | 'addon'
```

**Nuevo plan en `plans`:**
```
id=4  name='IA Pro'  plan_type='addon'  price=XX000  is_free_tier=false
      duration=1  frequency=1  frequency_type='months'  show_in='all'
      description='Desbloquea todos los agentes de IA: análisis de rentabilidad, predicciones de compra, asistente contable y más.'
```

**Nueva columna en `suscriptions`:**
```sql
ALTER TABLE suscriptions ADD COLUMN plan_type VARCHAR DEFAULT 'base';
```

**Nuevo feature en `tenant_features`:**
```
feature = 'ai_module'  (ya existe el mecanismo; solo agregar el feature)
```

### Lógica de activación

Al autorizar el pago del add-on de IA:
1. Se crea un registro en `suscriptions` con `plan_type='addon'`
2. `tenant_features` recibe `{ tenant_id, feature: 'ai_module', enabled: true }`
3. El JWT del usuario se invalida para que el próximo request incluya el nuevo feature

Al cancelar el add-on o vencer:
1. `suscriptions` pasa a `status='cancelled'`
2. `tenant_features` se actualiza: `enabled=false` para `ai_module`

### Pricing sugerido

| Plan base | Con IA | Ahorro combo |
|-----------|--------|-------------|
| Mensual $55.000 | +$XX.000/mes | — |
| Trimestral $148.500 | +$XX.000/mes | Considerar descuento combo |
| Semestral $264.000 | +$XX.000/mes | Considerar descuento combo |

El precio del add-on se define como producto. La lógica de cobro es igual al plan base (preapproval de MP independiente).

### Features incluidos en el add-on de IA

- Análisis de rentabilidad en lenguaje natural (chat)
- Predicciones de compra con configuración de parámetros
- Detección de anomalías en ventas y stock
- Sugerencias de precios basadas en márgenes
- Asistente contable (preguntas sobre estados financieros)
- Resumen automático semanal de KPIs por email

Ver módulo 20-ai-agents para el detalle técnico completo.
