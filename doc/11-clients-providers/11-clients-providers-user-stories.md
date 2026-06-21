# Historias de Usuario — Módulo 11: Clientes y Proveedores

> **Módulo:** 11-clients-providers  
> **Fase:** 2 — Operaciones Core  
> **Depende de:** 02-tenant, 03-rbac

---

## US-CP-01 — Ver la lista de clientes

**Como** administrador o vendedor,  
**quiero** ver todos los clientes del negocio con sus datos de contacto y condición fiscal,  
**para** gestionarlos, buscarlos rápidamente y acceder a su información antes de emitir una factura.

### Criterios de aceptación
- [ ] La lista muestra: nombre, CUIT, email, teléfono, condición IVA y si el cliente fue creado en este tenant o adjuntado desde otro ("compartido")
- [ ] Puedo buscar por nombre o CUIT (búsqueda parcial, no sensible a mayúsculas)
- [ ] Puedo filtrar por condición IVA (Responsable Inscripto, Consumidor Final, etc.)
- [ ] Los clientes están ordenados por nombre por defecto
- [ ] Paginación de 15 por página
- [ ] Solo puede acceder quien tenga el permiso "Ver Clientes"
- [ ] Un usuario de la empresa raíz ve clientes de todas las sucursales del grupo

### Notas técnicas
- `GetAllClientAction` usa `GetTenantContextAction` para filtrar por el grupo completo del tenant
- `is_shared = pivot.created_at > counterparty.created_at` — heurístico que identifica contrapartes adjuntadas
- Los datos de contacto muestran el valor del pivot si existe, o el de la tabla base

---

## US-CP-02 — Crear un cliente nuevo

**Como** vendedor o administrador,  
**quiero** registrar un nuevo cliente con sus datos fiscales y de contacto,  
**para** poder emitirle facturas y registrar sus pagos en tesorería.

### Criterios de aceptación
- [ ] El formulario solicita: nombre (razón social), CUIT, condición IVA, email, teléfono, nombre de contacto y dirección (opcional: calle + localidad)
- [ ] El CUIT es único en todo el sistema: si ya existe un cliente con ese CUIT, el sistema lo indica y ofrece adjuntarlo en lugar de crear un duplicado
- [ ] La condición IVA se selecciona de una lista fija (no campo de texto libre)
- [ ] Al crear exitosamente, se me redirige a la lista de clientes
- [ ] Si creo el cliente desde la pantalla de nueva factura, se me redirige de vuelta a la factura con el cliente ya seleccionado
- [ ] Solo puede crear clientes quien tenga el permiso "Crear Clientes"
- [ ] El free tier limita la cantidad total de contrapartes registradas

### Notas técnicas
- Ruta: `POST /clients/{from?}` — cuando `$from = 'invoice-sale'` → redirige a factura con header `x-client-id`
- `CreateClientAction` → `Counterparty::create()` + `FindAndAttachCounterpartyTenantAction(party_type=CLIENT)`
- `IncrementFreetierResourceAction('counterparties')` se llama después de crear

---

## US-CP-03 — Adjuntar un cliente existente al tenant

**Como** administrador,  
**quiero** poder asociar a mi empresa un cliente que ya existe en el sistema (fue creado por otra sucursal del grupo o empresa afiliada),  
**para** tener acceso a sus datos sin duplicar el registro en la base de datos.

### Criterios de aceptación
- [ ] Puedo buscar un cliente por nombre o CUIT en toda la base de datos (no solo los de mi tenant)
- [ ] Los resultados de búsqueda muestran hasta 5 clientes que NO están todavía en mi listado
- [ ] Al adjuntar, puedo opcionalmente personalizar el nombre de contacto, email y teléfono que se mostrarán en mi sucursal (sin modificar los datos del registro original)
- [ ] El cliente adjuntado aparece en mi lista con el badge "Compartido"
- [ ] Solo puede adjuntar clientes quien tenga el permiso "Crear Clientes"

### Notas técnicas
- `SearchGlobalClientAction`: busca en toda la BD, excluye los ya adjuntos al tenant actual (`whereDoesntHave`)
- `FindAndAttachCounterpartyTenantAction(party_type=CLIENT, pivotData)`: guarda en pivot solo los valores distintos al base (null si iguales)
- El attach registra una actividad con `RegisterCounterpartyAttachmentActivityAction`

---

## US-CP-04 — Editar un cliente

**Como** vendedor o administrador,  
**quiero** poder actualizar los datos de un cliente,  
**para** mantener su información de contacto y fiscal actualizada.

### Criterios de aceptación
- [ ] Si el cliente fue creado por mi empresa (no compartido): puedo editar todos los campos — nombre, CUIT, condición IVA, email, teléfono, nombre de contacto y dirección
- [ ] Si el cliente es compartido (fue creado por otra empresa): solo puedo editar mis datos de contacto locales (nombre de contacto, email, teléfono) sin afectar los datos del registro original
- [ ] Al guardar, los cambios se reflejan inmediatamente en la lista
- [ ] Solo puede editar quien tenga el permiso "Actualizar Clientes"

### Notas técnicas
- `UpdateClientAction`: detecta `$isShared = pivot.created_at > counterparty.created_at`
- Si shared: `counterparty->tenants()->updateExistingPivot($currentTenant, $pivotData)` — solo actualiza pivot
- Si owner: `counterparty->update(...)` + actualiza dirección

---

## US-CP-05 — Eliminar (desvincular) un cliente

**Como** administrador,  
**quiero** poder quitar un cliente de mi lista,  
**para** mantener el directorio de clientes limpio sin registros obsoletos.

### Criterios de aceptación
- [ ] Al eliminar, el cliente desaparece de mi lista pero el registro base (CUIT, nombre) permanece en el sistema por si otra sucursal lo usa
- [ ] No se puede eliminar un cliente que tiene facturas activas o saldo pendiente (pendiente de implementar — actualmente no hay validación)
- [ ] Solo puede eliminar quien tenga el permiso "Eliminar Clientes"

### Notas técnicas
- `FindAndDetachTenant::execute($counterparty)` — elimina la fila de `counterparty_tenant` para el tenant actual
- El registro en `counterparties` NO se borra (ni soft delete). `$counterparty->delete()` está comentado en el controller

---

## US-CP-06 — Ver la lista de proveedores

**Como** responsable de compras,  
**quiero** ver todos mis proveedores activos con sus datos de contacto,  
**para** gestionarlos y seleccionarlos rápidamente al crear una orden de compra o registrar una factura de compra.

### Criterios de aceptación
- [ ] La lista muestra: nombre, CUIT, email, teléfono, condición IVA
- [ ] Puedo buscar por nombre o CUIT (parcial)
- [ ] Puedo filtrar por condición IVA
- [ ] Solo puede acceder quien tenga el permiso "Ver Proveedores"

### Notas técnicas
- `GetAllProviderAction` — similar a GetAllClientAction pero filtra `party_type=PROVIDER`
- `scopeProvidersForTenant` en el modelo `Counterparty`

---

## US-CP-07 — Crear un proveedor nuevo

**Como** responsable de compras,  
**quiero** registrar un nuevo proveedor en el sistema,  
**para** poder asignarle órdenes de compra y cargar sus facturas.

### Criterios de aceptación
- [ ] El formulario solicita: nombre, CUIT, condición IVA, email, teléfono, nombre de contacto, dirección (opcional)
- [ ] Si el CUIT ya existe, se ofrece adjuntar al proveedor existente en lugar de duplicar
- [ ] Solo puede crear proveedores quien tenga el permiso "Crear Proveedores"
- [ ] El free tier limita la cantidad total de contrapartes

### Notas técnicas
- `CreateProviderAction` usa `DB::beginTransaction()` explícito (a diferencia del cliente que no lo tiene)
- `FindAndAttachCounterpartyTenantAction(party_type=PROVIDER)` + `CreateAndAttachAddressAction`

---

## US-CP-08 — Adjuntar un proveedor existente

**Como** responsable de compras,  
**quiero** buscar y asociar un proveedor que ya está registrado en el sistema,  
**para** evitar duplicar datos y aprovechar el registro que otra sucursal ya completó.

### Criterios de aceptación
- [ ] La búsqueda global devuelve hasta 5 proveedores que coincidan con el nombre o CUIT buscado, que NO estén ya adjuntos a mi sucursal
- [ ] Al adjuntar, puedo personalizar los datos de contacto para mi sucursal sin modificar el registro original
- [ ] Solo puede adjuntar proveedores quien tenga el permiso "Crear Proveedores"

### Notas técnicas
- `SearchGlobalProviderAction` + `AttachProviderAction::execute()`
- Ruta: `POST /providers/{counterparty}/attach` con guard `attachProvider`

---

## US-CP-09 — Editar un proveedor

**Como** responsable de compras,  
**quiero** actualizar los datos de un proveedor,  
**para** mantener su información de contacto y fiscal al día.

### Criterios de aceptación
- [ ] Si el proveedor fue creado por mi empresa: edición completa de todos los campos
- [ ] Si el proveedor es compartido: solo edición de datos de contacto locales
- [ ] Solo puede editar quien tenga el permiso "Actualizar Proveedores"

### Notas técnicas
- `UpdateProviderAction` — misma lógica de is_shared que `UpdateClientAction`

---

## US-CP-10 — Ver el análisis de riesgo de proveedores

**Como** gerente de compras,  
**quiero** ver qué tan dependiente soy de cada proveedor en términos de gasto,  
**para** identificar riesgos de concentración y diversificar mis proveedores si alguno representa más del 30% de mis compras.

### Criterios de aceptación
- [ ] El análisis muestra: gasto total por proveedor en el período, porcentaje del gasto total, y si supera el umbral de dependencia (30% por defecto)
- [ ] Los proveedores marcados como "críticos" (>30% del gasto) se destacan visualmente
- [ ] Se muestran los productos con un solo proveedor ("single source") como alerta de riesgo
- [ ] Puedo cambiar el umbral de criticidad (default 30%) y el período de análisis (default 6 meses)

### Notas técnicas
- `GetProviderRiskAnalysisAction::execute($dependencyThreshold=30, $periodMonths=6)`
- Calcula gasto desde facturas de compra (`InvoiceTypes::PURCHASE_INVOICE`) del período
- `total_calculated = SUM(invoice_product.quantity × invoice_product.price)` por proveedor
- No usa la columna `total` de la factura sino el cálculo de ítems (la columna puede no estar disponible)

---

## US-CP-11 — Validación de CUIT con ARCA (v2.0)

**Como** vendedor que registra clientes,  
**quiero** que al ingresar el CUIT del cliente, el sistema lo valide automáticamente contra ARCA (ex-AFIP) y autocomplete la razón social y condición IVA,  
**para** evitar errores de tipeo y asegurar que los datos fiscales son correctos antes de emitir una factura.

### Criterios de aceptación
- [ ] Al salir del campo CUIT, el sistema consulta ARCA automáticamente
- [ ] Si el CUIT es válido, se autocompletan: razón social y condición IVA
- [ ] Si el CUIT no existe en ARCA, aparece un aviso: "CUIT no encontrado en AFIP — verificá el número"
- [ ] El autocompletado se puede editar manualmente antes de guardar
- [ ] Si ARCA no responde (timeout), el campo se habilita para ingreso manual con un aviso

### Notas técnicas
- **Nuevo en v2.0** — no existe esta validación actualmente
- Usar el servicio WSFE de ARCA (o una API de terceros como API Afip) para validar CUIT
- Endpoint backend: `GET /api/arca/validate-cuit/{cuit}` → devuelve `{razonSocial, condicionIva}` o error

---

## US-CP-12 — Perfil de cliente con resumen financiero (v2.0)

**Como** vendedor o gerente comercial,  
**quiero** ver un perfil completo del cliente con su historial de compras, saldo actual y comportamiento de pago,  
**para** tomar decisiones informadas antes de ofrecerle crédito o hacer un seguimiento comercial.

### Criterios de aceptación
- [ ] Al hacer clic en un cliente de la lista, accedo a su perfil
- [ ] El perfil muestra: datos de contacto y fiscales, resumen financiero (deuda total, crédito a favor, saldo corriente), historial de facturas (monto, estado, fecha), historial de pagos, y ticket promedio de compra
- [ ] El perfil indica el tiempo promedio que tarda en pagar (ej: "Paga a los 12 días en promedio")
- [ ] Puedo acceder directamente desde el perfil a crear una nueva factura para este cliente

### Notas técnicas
- **Nuevo en v2.0** — actualmente los datos están dispersos entre Treasury y Reports
- Requiere agregar una vista `/clients/{counterparty}` que combine datos de: `invoices`, `transactions`, `Treasury::accountSummary`
- Los saldos vienen de `GetInvoicesByCounterparty` + `GetTransactionsByCounterpartyAction`

---

## US-CP-13 — Segmentación de clientes por IA (v2.0, requiere add-on IA)

**Como** gerente comercial con el add-on de IA activo,  
**quiero** que el sistema clasifique automáticamente a mis clientes en segmentos (VIP, En riesgo, Nuevo, Inactivo),  
**para** priorizar las acciones comerciales y no perder clientes que están dejando de comprar.

### Criterios de aceptación
- [ ] La lista de clientes muestra una columna "Segmento" con el badge del segmento actual
- [ ] Los segmentos son: "VIP" (alto ticket + alta frecuencia), "Activo" (compras regulares), "En riesgo" (sin compras en 60+ días), "Inactivo" (sin compras en 180+ días), "Nuevo" (primera compra en los últimos 30 días)
- [ ] Al hacer clic en un segmento, puedo filtrar la lista para ver solo esos clientes
- [ ] El sistema recalcula los segmentos cada 24 horas
- [ ] Si el add-on de IA no está activo, la columna no aparece pero hay un teaser al pie de la lista

### Notas técnicas
- **Nuevo en v2.0** — requiere add-on de IA activo
- Los datos de entrada al LLM: `{customer_id, last_purchase_date, purchase_count, avg_ticket, total_spent}`
- El LLM clasifica y genera el texto de cada segmento; NO calcula los datos
- Cachear los segmentos 24h por tenant en Cloudflare KV

---

## US-CP-14 — Límite de crédito por cliente (v2.0)

**Como** gerente de crédito,  
**quiero** poder definir un límite de crédito para cada cliente,  
**para** que el sistema me avise (o bloquee) cuando intente emitir una factura que supere la deuda máxima autorizada.

### Criterios de aceptación
- [ ] En la edición del cliente, puedo configurar un "Límite de crédito" (monto en pesos)
- [ ] Al crear una factura para ese cliente, el sistema verifica: deuda actual + monto de la nueva factura vs límite
- [ ] Si se superaría el límite, aparece un aviso visible: "Este cliente ya debe $X y esta factura sumaría $Y — supera el límite de $Z"
- [ ] El comportamiento al superar el límite es configurable por tenant: solo aviso (puede continuar) o bloqueo (no puede emitir la factura)
- [ ] Si el cliente no tiene límite configurado, no hay validación (comportamiento actual)

### Notas técnicas
- **Nuevo en v2.0** — no existe este campo ni validación actualmente
- Nueva columna: `counterparty_tenant.credit_limit` (integer nullable, en centavos)
- La deuda actual = SUM de facturas pendientes sin pagar del cliente para este tenant
- La validación se ejecuta en el controller de invoice-sales antes de crear la factura
