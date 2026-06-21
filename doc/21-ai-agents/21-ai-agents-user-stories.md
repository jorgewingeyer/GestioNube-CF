# Historias de Usuario — Módulo 21: Agentes IA

> **Módulo:** 21-ai-agents  
> **Fase:** 5 — Extras y v2.0  
> **Estado:** Diseño puro — NO existe implementación actual  
> **Principio:** el usuario siempre confirma antes de que el agente ejecute cualquier cambio

---

## US-AI-01 — Acceder al chatbot del ERP desde cualquier módulo

**Como** usuario del sistema,  
**quiero** tener acceso a un chatbot en lenguaje natural desde cualquier pantalla del ERP,  
**para** poder consultar datos del sistema sin tener que navegar a la pantalla específica.

### Criterios de aceptación
- [ ] Un botón o ícono en la navegación abre el chatbot como panel lateral deslizable
- [ ] El chatbot está disponible en todas las páginas del ERP
- [ ] El chatbot carga el contexto del módulo actual automáticamente (ej: si estoy en inventario, ya sabe que quiero hablar de inventario)
- [ ] Las respuestas aparecen en tiempo real (streaming, no espero el completion completo)
- [ ] El historial de la conversación se mantiene durante mi sesión (máximo 1 hora de inactividad)

### Notas técnicas
- Panel lateral con Vercel AI SDK `useChat` + streaming
- Contexto del módulo pasado al agente via `AgentContext.module`
- Memoria de sesión en Cloudflare KV, TTL 1 hora

---

## US-AI-02 — Consultar datos del ERP en lenguaje natural

**Como** usuario del sistema,  
**quiero** poder hacerle preguntas al chatbot sobre los datos de mi empresa,  
**para** obtener respuestas rápidas sin tener que navegar a la pantalla específica.

### Criterios de aceptación
- [ ] Puedo preguntar: "¿Cuánto vendí en mayo?" y recibo el total con desglose por semana
- [ ] Puedo preguntar: "¿Quiénes me deben más de $500.000?" y recibo el listado con montos
- [ ] Puedo preguntar: "¿Cuántas unidades de [producto] quedan?" y recibo el stock actual
- [ ] Puedo preguntar: "¿Cuál fue mi producto más vendido este trimestre?" y recibo el ranking
- [ ] Si la pregunta incluye datos de otro tenant (que no sea mi empresa), el sistema rechaza la consulta
- [ ] Las respuestas incluyen los datos exactos extraídos de la base, no estimaciones del LLM

### Notas técnicas
- El LLM llama tools de lectura del ERP con `tenant_id` como parámetro obligatorio
- El LLM nunca estima datos — siempre llama a la tool correspondiente y formatea la respuesta
- Isolación multi-tenant garantizada por el parámetro `tenant_id` en cada tool

---

## US-AI-03 — Completar una factura de venta desde texto libre

**Como** usuario de facturación,  
**quiero** describir en lenguaje natural lo que quiero facturar,  
**para** que el agente complete el formulario de factura automáticamente y yo solo la revise y confirme.

### Criterios de aceptación
- [ ] Escribo algo como "facturo a Juan Pérez 5 cajas de [producto] a $1.200 cada una con 10% de descuento"
- [ ] El agente identifica el cliente (busca por nombre en la BD), los productos y los parámetros de precio
- [ ] Si hay ambigüedad (varios clientes con ese nombre), el agente pregunta cuál de los dos
- [ ] El formulario de factura se pre-completa con los datos interpretados
- [ ] Yo reviso el formulario antes de crear la factura — el agente no crea nada solo

### Notas técnicas
- Tool `searchCounterparty(name, tenantId)` + `searchProduct(name, tenantId)` para búsqueda semántica
- El agente retorna un JSON estructurado que mapea al formulario de factura; el frontend lo usa para pre-completar campos

---

## US-AI-04 — Recibir sugerencia del tipo de comprobante correcto

**Como** usuario de facturación,  
**quiero** que el agente me avise automáticamente si el tipo de comprobante que estoy usando (A, B, C) es el correcto para este cliente,  
**para** evitar rechazos del ARCA por error de tipo.

### Criterios de aceptación
- [ ] Al seleccionar un cliente en el formulario de factura, el agente verifica la condición IVA del cliente
- [ ] Si el tipo de comprobante seleccionado no coincide con la condición IVA, aparece una alerta clara con la corrección sugerida
- [ ] Puedo aceptar la sugerencia con un clic o ignorarla si soy consciente del motivo
- [ ] La validación ocurre en tiempo real, sin necesidad de intentar autorizar el CAE

---

## US-AI-05 — Ver la proyección de flujo de caja

**Como** administrador o contador,  
**quiero** ver una proyección del flujo de caja de los próximos 30/60/90 días,  
**para** anticipar períodos de liquidez ajustada y tomar decisiones de cobros y pagos.

### Criterios de aceptación
- [ ] La proyección toma en cuenta: facturas de venta pendientes de cobro (por fecha de vencimiento), facturas de compra pendientes de pago, patrones históricos de pago de cada cliente (ej: "Juan Pérez suele pagar con 15 días de retraso")
- [ ] El resultado muestra: saldo neto proyectado por semana, las 5 facturas más críticas a cobrar en el período, clientes con saldo en mora que afectan la proyección
- [ ] El agente presenta un resumen ejecutivo en lenguaje natural antes del detalle numérico
- [ ] Puedo cambiar el horizonte (30 / 60 / 90 días) sin recargar la página

---

## US-AI-06 — Detectar anomalías en cobros

**Como** administrador,  
**quiero** que el sistema detecte automáticamente clientes cuyo comportamiento de pago cambió negativamente,  
**para** actuar proactivamente antes de que la deuda se acumule.

### Criterios de aceptación
- [ ] El agente analiza el historial de cobros de cada cliente y detecta clientes que pagaban puntualmente pero ahora llevan más días en mora que su promedio histórico
- [ ] Cada alerta muestra: cliente, promedio histórico de días de pago, días actuales de mora, monto en riesgo
- [ ] Las alertas aparecen en el dashboard de tesorería y en el chatbot cuando pregunto sobre cobros
- [ ] Puedo hacer clic en una alerta para ir directamente al resumen de cuenta del cliente

---

## US-AI-07 — Recibir alertas proactivas de stock crítico con sugerencia de OC

**Como** encargado de compras,  
**quiero** que el sistema calcule automáticamente qué productos van a quedarse sin stock en los próximos N días y me sugiera una OC,  
**para** nunca quedarme sin stock sin haber tenido aviso previo.

### Criterios de aceptación
- [ ] El agente calcula la velocidad de consumo de cada producto (unidades/día en últimos 30 días)
- [ ] Detecta qué productos agotarán su stock en menos de N días (configurable, default: 7 días)
- [ ] Para cada producto crítico, sugiere la cantidad a comprar para cubrir N días de stock (default: 30 días)
- [ ] Propone la OC con el proveedor habitual y el precio histórico promedio
- [ ] Puedo aprobar la OC sugerida con un clic — el sistema crea el borrador de OC que reviso antes de finalizar

### Notas técnicas
- El agente NO crea la OC directamente — genera los datos y el usuario confirma antes de que `CreatePurchaseOrderAction` sea invocado
- Usa `branch_stocks.quantity` y velocidad calculada desde `invoice_product` (facturas completadas)

---

## US-AI-08 — Detectar lotes próximos a vencer y sugerir acción

**Como** encargado de inventario,  
**quiero** que el agente me alerte sobre los lotes que vencen en los próximos N días y me sugiera qué hacer con ellos,  
**para** minimizar las pérdidas por vencimiento.

### Criterios de aceptación
- [ ] El agente detecta lotes con `status = EXPIRING_SOON` o con `expiration_date` próxima
- [ ] Para cada lote crítico muestra: producto, cantidad disponible, fecha de vencimiento, sucursal, y velocidad de consumo (días para agotar al ritmo actual)
- [ ] Sugiere acciones según el caso: "A este ritmo de ventas el lote vence antes de agotarse — considerá hacer una promoción para acelerar la venta"
- [ ] Si hay stock en otra sucursal que consume más rápido ese producto, sugiere una transferencia

---

## US-AI-09 — Segmentación RFM de clientes

**Como** gerente comercial,  
**quiero** ver mis clientes segmentados automáticamente por comportamiento de compra,  
**para** priorizar esfuerzos comerciales en los clientes correctos.

### Criterios de aceptación
- [ ] El sistema calcula para cada cliente: Recency (días desde última compra), Frequency (cantidad de compras), Monetary (gasto total)
- [ ] Cada cliente es clasificado en una categoría: Campeón, Leal, Potencial, En Riesgo, Perdido
- [ ] Puedo ver el listado de clientes por categoría con sus métricas
- [ ] Puedo exportar la segmentación a Excel
- [ ] El agente puede redactar una estrategia de acción para cada segmento en lenguaje natural

---

## US-AI-10 — Detectar oportunidades de venta cruzada

**Como** vendedor o gerente comercial,  
**quiero** que el agente identifique qué productos podría venderle a un cliente que no ha comprado aún,  
**para** aumentar el ticket promedio y la relación comercial.

### Criterios de aceptación
- [ ] Para un cliente específico, el agente muestra: productos que compran clientes similares pero que este cliente nunca compró
- [ ] Las sugerencias se ordenan por frecuencia de compra en clientes del mismo segmento
- [ ] El vendedor puede agregar directamente el producto sugerido a un presupuesto nuevo con un clic

---

## US-AI-11 — Reporte ejecutivo generado por IA

**Como** administrador o dueño de la empresa,  
**quiero** recibir un resumen ejecutivo del estado del negocio generado automáticamente,  
**para** entender en 2 minutos la situación de mi empresa sin revisar múltiples pantallas.

### Criterios de aceptación
- [ ] El reporte incluye, en lenguaje natural: resumen de ventas del período vs. período anterior, los 3 clientes más importantes del mes, los 3 productos con mejor y peor margen, situación de caja (proyección), alertas críticas (stock bajo, mora de clientes, vencimientos)
- [ ] El formato es conciso, con datos concretos (no generalidades)
- [ ] Puedo configurar la frecuencia del reporte automático (diario, semanal, mensual) y recibirlo por email
- [ ] También puedo generarlo on-demand desde el chatbot: "Genérame el resumen del mes"

---

## US-AI-12 — Comparar precio de factura de proveedor con historial

**Como** encargado de compras,  
**quiero** que al registrar una factura de compra el agente compare el precio con el historial del proveedor,  
**para** detectar aumentos de precio no negociados antes de aprobar el gasto.

### Criterios de aceptación
- [ ] Al cargar o revisar una factura de compra, el agente compara cada línea con el precio histórico promedio del proveedor para ese producto
- [ ] Si el precio supera el histórico + un umbral configurable (ej: +5%), el agente muestra una alerta: "El precio de [producto] está un 8% por encima del promedio histórico con este proveedor"
- [ ] La alerta es informativa — no bloquea el proceso, el usuario decide si seguir igual o negociar

---

## US-AI-13 — Control de acceso y rate limiting de IA por tenant

**Como** sistema,  
**quiero** controlar cuántos tokens de IA consume cada tenant,  
**para** garantizar la viabilidad económica del servicio de IA y evitar abusos.

### Criterios de aceptación
- [ ] Cada tenant tiene un límite diario de tokens de IA (configurable por plan desde el superadmin)
- [ ] Si un tenant supera el límite, el chatbot muestra un mensaje claro indicando que el límite fue alcanzado y cuándo se reiniciará
- [ ] El superadmin puede ver el consumo de tokens por tenant
- [ ] Los superadmins tienen límite ilimitado

### Notas técnicas
- Rate limiting en Cloudflare KV: `ai_tokens:{tenant_id}:{date}` con TTL de 24h
- Auditoría de consumo en tabla `ai_usage_log` (tenant_id, date, tokens_input, tokens_output, model, feature)

---

## US-AI-14 — Acción de IA siempre requiere confirmación del usuario

**Como** sistema,  
**quiero** que ninguna acción de escritura se ejecute sin confirmación explícita del usuario,  
**para** garantizar que el agente IA nunca pueda modificar datos sin que el usuario lo apruebe conscientemente.

### Criterios de aceptación
- [ ] Cuando el agente propone una acción (crear OC, ajustar stock, registrar cobro, etc.), la acción se muestra en una tarjeta con descripción completa: "Se va a crear una OC por 50 unidades de [producto] al proveedor [nombre] por un total estimado de $X"
- [ ] El usuario debe hacer clic en "Confirmar" para ejecutar — nunca se ejecuta automáticamente
- [ ] El usuario puede modificar los parámetros antes de confirmar (ej: cambiar la cantidad sugerida)
- [ ] Tras confirmar, el sistema usa la lógica de negocio existente del ERP para ejecutar — no es el LLM quien ejecuta
- [ ] Toda acción ejecutada queda registrada en `activities` con `source: 'ai_agent'`

### Notas técnicas
- Patrón fundamental del módulo: LLM propone → usuario aprueba → Action del ERP ejecuta
- El LLM nunca tiene acceso de escritura a la BD, solo de lectura via tools
