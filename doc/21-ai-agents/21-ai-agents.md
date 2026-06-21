# Módulo 21 — Agentes IA

> **Fase:** 5 — Extras y v2.0  
> **Estado:** Especificación funcional — NO existe implementación en Laravel  
> **Dependencias de diseño:** todos los módulos del ERP (los agentes consumen sus datos)  
> **Principio rector:** los LLM solo interpretan y sugieren; la lógica de negocio determinística permanece en código

---

## 1. Propósito y Alcance

El módulo de Agentes IA es la característica diferenciadora de GestioNube v2.0. No es un chatbot pegado encima del ERP — es un copiloto operativo integrado dentro de cada módulo: facturación, tesorería, inventario, compras, ventas y reportes.

**Principio fundamental:** los agentes IA no ejecutan cambios solos. Proponen acciones, el usuario las confirma, y solo entonces el sistema de negocio (determinístico) las ejecuta. Los LLMs interpretan contexto, detectan patrones y generan lenguaje natural; nunca manejan dinero ni modifican inventario directamente.

---

## 2. Stack Técnico Propuesto

| Componente | Tecnología | Justificación |
|------------|-----------|---------------|
| Modelos LLM | Claude Sonnet 4.6 (producción) / Gemini 2.0 Flash (desarrollo) | Claude para calidad en prod; Gemini para iteración rápida con costo reducido |
| Runtime | Cloudflare Workers AI + Vercel AI SDK | Edge-native, sin servidores de AI propios |
| Contexto estructurado | JSON + Zod schemas | Los LLMs reciben datos estructurados, no texto libre |
| Streaming | Vercel AI SDK `streamText` | Respuestas en tiempo real, sin esperar el completion |
| Herramientas del agente | Tool calling (function calling) | El LLM puede invocar queries del ERP como herramientas |
| Memoria de sesión | Cloudflare KV | Contexto de conversación por usuario/tenant, TTL de 1 hora |
| Embeddings | Cloudflare Workers AI (text-embedding-ada-002 equivalente) | Para búsqueda semántica de facturas, clientes, productos |

---

## 3. Arquitectura de Agentes

```
Usuario (Next.js UI)
    ↓ input / confirmación
Capa de Orquestación (/services/ai/)
    ↓ contexto estructurado (JSON)
LLM (Claude / Gemini)
    ↓ tool calls / texto sugerido
Sistema ERP (lógica determinística)
    ↓ ejecuta solo si usuario confirma
Base de datos (PostgreSQL / D1)
```

**Los agentes IA son servicios independientes** en `/services/ai/`, desacoplados del núcleo del ERP. Cada agente recibe un contexto estructurado, llama tools que leen datos del ERP (nunca escriben), y retorna sugerencias de acción al frontend. El usuario aprueba o rechaza antes de que cualquier mutación ocurra.

---

## 4. Agentes Planificados

### 4.1 Agente de Tesorería

**Propósito:** análisis financiero predictivo y detección de anomalías en cobros/pagos.

**Capacidades:**
- Proyección de flujo de caja a 30/60/90 días basada en facturas pendientes y patrones históricos de pago por cliente
- Ranking de facturas a priorizar para cobro (por antigüedad, monto, comportamiento histórico del cliente)
- Detección de anomalías: cliente que habitualmente paga en 15 días y lleva 45 días de mora
- Generación de resumen del estado financiero en lenguaje natural: "Tu caja neta proyectada para julio es X, con 3 clientes en mora que representan el 40% de la deuda pendiente"

**Tools disponibles:**
- `getAccountSummaries(tenantId, dateRange)` — saldos por cliente
- `getTransactionHistory(counterpartyId, months)` — historial de pagos
- `getPendingInvoices(tenantId, type)` — facturas pendientes de cobro/pago
- `getCashProjection(tenantId, days)` — proyección basada en vencimientos

**Restricciones:** nunca puede crear ni anular transacciones. Solo retorna texto + lista de acciones sugeridas con botón de confirmación por parte del usuario.

---

### 4.2 Agente de Inventario Predictivo

**Propósito:** prevenir roturas de stock y optimizar el ciclo de reposición.

**Capacidades:**
- Cálculo de velocidad de consumo por producto (unidades/día promedio en últimos N días)
- Predicción de cuándo cada producto alcanzará el stock mínimo
- Generación automática de borradores de OC cuando un producto se acerca al punto de reposición
- Detección de productos de baja rotación con riesgo de vencimiento (lotes `EXPIRING_SOON`)
- Sugerencia del proveedor óptimo por producto (por precio histórico, lead time y calidad)

**Tools disponibles:**
- `getStockByProduct(tenantId)` — stock actual en `branch_stocks`
- `getSalesVelocity(productId, days)` — velocidad de consumo calculada desde `invoice_product`
- `getBatchesExpiringSoon(tenantId, days)` — lotes próximos a vencer
- `getProviderPriceHistory(productId)` — historial de precios de compra por proveedor

**Output de creación de OC:** genera un JSON estructurado que el usuario revisa y aprueba antes de que `CreatePurchaseOrderAction` sea invocado.

---

### 4.3 Agente de Facturación Asistida

**Propósito:** reducir errores y tiempo en la carga de facturas.

**Capacidades:**
- Completado automático de líneas de factura a partir de texto libre ("necesito cargar 5 heladeras marca X modelo Y a $150.000")
- Sugerencia del tipo de comprobante correcto (A/B/C/M) basada en la condición IVA del cliente cargada en el sistema
- Validación de coherencia de precios: si el precio de venta está por debajo del costo histórico, alerta con contexto
- Detección de posibles errores antes de solicitar el CAE (nombre del cliente, CUIT, tipo de IVA, punto de venta)

**Restricciones:** nunca puede crear facturas directamente. Propone los datos al formulario existente de factura de venta; el usuario confirma y cierra.

---

### 4.4 Copiloto de Ventas

**Propósito:** análisis del comportamiento de clientes y oportunidades comerciales.

**Capacidades:**
- Identificación de clientes inactivos (no compraron en N días, configurable)
- Detección de patrones de compra cruzada: "Este cliente siempre compra A y B juntos; nunca le ofreciste C"
- Segmentación automática RFM: Recency / Frequency / Monetary — etiquetas: Campeones, Leales, En Riesgo, Perdidos
- Generación de reporte ejecutivo en lenguaje natural con los insights más relevantes del período
- Sugerencia de descuento personalizado para clientes en riesgo de churn

**Tools disponibles:**
- `getClientSegmentation(tenantId)` — calcula RFM de todos los clientes
- `getClientPurchasePattern(clientId)` — productos y frecuencia de compra
- `getInactiveClients(tenantId, days)` — clientes sin compras en N días
- `getCrossSellOpportunities(clientId)` — productos comprados por clientes similares pero no por este

---

### 4.5 Asistente de Compras

**Propósito:** optimización del proceso de compras a proveedores.

**Capacidades:**
- Comparación de precios históricos del proveedor vs. precios actuales de la factura en revisión
- Detección de aumentos de precios no justificados (precio factura > precio histórico × (1 + inflación estimada))
- Consolidación de múltiples necesidades de reposición en una sola OC por proveedor optimizada
- Resumen ejecutivo del desempeño de un proveedor: cumplimiento de entregas, calidad histórica, evolución de precios

---

### 4.6 Chatbot ERP (Interfaz Conversacional)

**Propósito:** interfaz en lenguaje natural para consultas y operaciones del ERP.

**Capacidades de consulta:**
- "¿Cuánto vendí en mayo?" → ejecuta la query de ventas del período y responde con número + gráfico inline
- "¿Quiénes me deben más de $500.000?" → retorna listado de clientes con saldo pendiente mayor al umbral
- "¿Cuántas unidades de [producto] quedan en stock?" → consulta `branch_stocks`
- "¿Cuándo vence la suscripción de mi cliente [nombre]?" → busca en facturas y retorna fecha

**Capacidades de acción confirmada (el usuario siempre aprueba primero):**
- "Quiero registrar un cobro de $50.000 de Juan Pérez" → pre-completa el formulario de tesorería, usuario confirma
- "Ajustá el stock de [producto] a 10 unidades" → propone ajuste con motivo requerido, usuario confirma
- "Creá un presupuesto para [cliente]" → abre el formulario con cliente pre-cargado

**Restricciones:** las consultas solo leen datos (SELECT). Las acciones de escritura requieren confirmación explícita mediante un botón en la interfaz, nunca ejecutadas en el flujo de texto del chat.

---

## 5. Diseño de la Capa de Contexto

Los agentes reciben siempre contexto estructurado, nunca texto libre del usuario como única fuente. El contexto incluye:

```typescript
interface AgentContext {
  tenant: {
    id: number
    name: string
    iva_condition: string
    current_plan: string
  }
  user: {
    id: number
    name: string
    role: string
  }
  module: string  // 'treasury' | 'inventory' | 'invoicing' | ...
  data: Record<string, unknown>  // datos específicos del módulo
  user_input?: string  // input libre del usuario (si aplica)
}
```

**El LLM nunca accede directamente a la BD.** Solo puede llamar tools predefinidas que ejecutan queries parametrizadas con la autorización del tenant actual. Esto garantiza aislamiento multi-tenant y previene prompt injection.

---

## 6. Flujo de Interacción (Patrón Confirmar-Antes-de-Ejecutar)

```
1. Usuario abre el panel del agente en un módulo
2. Sistema pre-carga el contexto estructurado del módulo actual
3. Usuario hace una pregunta o solicita una sugerencia
4. Agente llama tools de lectura del ERP para enriquecer el contexto
5. LLM genera respuesta + (opcional) lista de acciones sugeridas
6. Frontend muestra la respuesta en lenguaje natural
7. Si hay acciones sugeridas:
   a. Se muestran como tarjetas con descripción clara de qué va a pasar
   b. Usuario hace clic en "Confirmar" en cada acción que desea ejecutar
   c. Sistema ejecuta la acción usando la lógica de negocio existente del ERP
   d. Se muestra confirmación del resultado
8. El historial de la conversación se guarda en Cloudflare KV (TTL 1 hora)
```

---

## 7. Consideraciones de Seguridad

- **Prompt injection:** el input del usuario nunca se interpola directamente en el system prompt. Se inyecta en un slot `{user_input}` tipado y escapado.
- **Aislamiento multi-tenant:** todas las tools del agente reciben `tenantId` como parámetro obligatorio y aplican el filtro de tenant en cada query. El LLM no puede acceder a datos de otro tenant.
- **Lista blanca de acciones:** solo las acciones definidas como disponibles para un agente pueden ser invocadas. El LLM no puede inventar tools fuera de la lista.
- **Auditoría:** cada acción ejecutada a través de un agente queda registrada en el `activities` log con `source: 'ai_agent'` para trazabilidad completa.
- **Rate limiting:** cada tenant tiene un límite de tokens por día para evitar abuso. Se trackea en Cloudflare KV.

---

## 8. Plan de Implementación por Fases

### Fase A — Infraestructura Base
- Crear el servicio `/services/ai/` con el cliente del LLM (Vercel AI SDK)
- Implementar el sistema de tools del ERP (wrappers de las queries existentes)
- Crear la capa de contexto estructurado
- Implementar el patrón confirmar-antes-de-ejecutar en el frontend

### Fase B — Chatbot de Consultas
- Solo queries de lectura (ventas, inventario, clientes, facturas)
- Implementar memoria de conversación (Cloudflare KV)
- UI: panel lateral deslizable en todas las páginas del ERP

### Fase C — Agente de Inventario Predictivo
- Integrar con `branch_stocks` y `invoice_product`
- Implementar generación de borradores de OC
- Alertas proactivas en el dashboard de inventario

### Fase D — Agente de Tesorería
- Proyección de flujo de caja
- Detección de anomalías en cobros
- Integrar con el dashboard de tesorería

### Fase E — Copiloto de Ventas + Segmentación RFM
- Análisis de comportamiento de clientes
- Integrar con el módulo de reportes

### Fase F — Agente de Facturación Asistida
- Completado desde texto libre
- Validación pre-CAE
- Integrar en el formulario de factura de venta

---

## 9. Métricas de Éxito del Módulo

| KPI | Meta |
|-----|------|
| Tiempo promedio de carga de factura (con asistente) | <2 minutos (vs. 5+ actual) |
| Reducción de errores de facturación electrónica | >30% en facturas con problemas de ARCA |
| Adopción del chatbot (% de usuarios activos que lo usan) | >40% en 3 meses post-lanzamiento |
| Acciones de inventario ejecutadas via agente | >50% de las OC de reposición |
| NPS atribuible al módulo de IA | >8/10 entre usuarios activos |
