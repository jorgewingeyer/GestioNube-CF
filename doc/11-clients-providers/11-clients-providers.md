# Módulo 11 — Clientes y Proveedores

> **Fase:** 2 — Operaciones Core  
> **Depende de:** 02-tenant, 03-rbac  
> **Es requerido por:** 12-budget, 13-invoice-sales, 15-purchase-orders, 16-invoice-purchase, 17-treasury, 19-reports

---

## 1. Propósito y Alcance

Este módulo gestiona las contrapartes del negocio: clientes (quienes compran) y proveedores (quienes venden). Ambos comparten el mismo modelo `Counterparty` y se diferencian únicamente por el campo `party_type` en la tabla pivot `counterparty_tenant`.

**Filosofía de diseño:**
- Una contraparte existe una sola vez en la BD (identificada por CUIT único)
- La relación con un tenant es a través de la pivot `counterparty_tenant`, que incluye el rol (`client` o `provider`)
- El mismo CUIT puede ser cliente de la sucursal A y proveedor de la sucursal B
- Los datos de contacto sobreescritos por tenant (teléfono, email, nombre de contacto) viven en la pivot, no en la tabla base

**Quién lo usa:** administradores, equipo comercial, responsables de compras.

**Alcance:**
- CRUD de clientes: crear, listar, editar, eliminar (soft delete = detach del tenant)
- CRUD de proveedores: crear, listar, editar, adjuntar, eliminar
- Búsqueda global de contrapartes ya existentes para adjuntarlas sin duplicar
- Análisis de riesgo de proveedores por concentración de compras

---

## 2. Entidades de Datos

### 2.1 Tabla `counterparties`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `name` | varchar | Razón social o nombre del cliente/proveedor |
| `cuit` | varchar UNIQUE | Clave única: CUIT (11 dígitos para personas físicas/jurídicas) |
| `contact_name` | varchar nullable | Nombre de la persona de contacto en la empresa |
| `email` | varchar UNIQUE nullable | Email de contacto (unique global — puede sobreescribirse en pivot) |
| `phone` | varchar nullable | Teléfono de contacto |
| `tax_condiction` | varchar | Enum `TaxCondictionTypes` — condición frente al IVA |
| `deleted_at` | timestamp nullable | Soft delete |

Nota: `email` tiene constraint UNIQUE global pero la pivot permite sobrescribirlo por tenant. La constraint global puede generar conflictos si dos empresas tienen el mismo proveedor con emails distintos.

### 2.2 Tabla pivot `counterparty_tenant`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | bigint PK | |
| `counterparty_id` | bigint FK → counterparties | cascade |
| `tenant_id` | bigint FK → tenants | cascade |
| `party_type` | varchar | `'client'` o `'provider'` — identifica el rol en este tenant |
| `contact_name` | varchar nullable | Override por tenant del nombre de contacto |
| `email` | varchar nullable | Override por tenant del email |
| `phone` | varchar nullable | Override por tenant del teléfono |
| `created_at` / `updated_at` | timestamps | |

Los campos de override se guardan en null cuando son iguales a los datos base (lógica en `FindAndAttachCounterpartyTenantAction`). Al leer, se prioriza el valor del pivot sobre el de la tabla base.

### 2.3 Tabla pivot `address_counterparty`

Relación many-to-many entre `counterparties` y `addresses`. Una contraparte puede tener múltiples direcciones físicas. La tabla `addresses` incluye `location_id` (FK a localidades de Argentina).

### 2.4 Tabla pivot `counterparty_product`

Relación many-to-many entre `counterparties` y `products`. Se usa para asociar qué productos vende un proveedor (visible en reportes de "productos por proveedor").

### 2.5 Enum `CounterpartyTypes`

```
CLIENT   = 'client'    → Cliente del tenant
PROVIDER = 'provider'  → Proveedor del tenant
```

### 2.6 Enum `TaxCondictionTypes`

```
REGISTERED_TAXPAYER = 'responsable_inscrito'    → Responsable Inscripto (IVA)
FINAL_CONSUMER      = 'consumidor_final'        → Consumidor Final
EXEMPT              = 'exento'                  → Exento
MONOTAX_TAXPAYER    = 'responsable_monotributo' → Monotributista
SOCIAL_MONOTAX      = 'monotributo_social'      → Monotributo Social
VAT_NOT_APPLICABLE  = 'iva_no_alcanzado'        → IVA No Alcanzado
OTHER               = 'OTRO'                    → Otro
```

La condición IVA del cliente determina la letra del comprobante (A, B, C) en facturación electrónica AFIP/ARCA.

---

## 3. Reglas de Negocio

### 3.1 CUIT único global — contraparte compartida entre tenants

`counterparties.cuit` tiene constraint UNIQUE. Si dos empresas del mismo grupo (o dos tenants distintos) tienen el mismo proveedor/cliente, comparten el mismo registro de `Counterparty`. Cada uno tiene su propia fila en `counterparty_tenant`.

Al crear una contraparte, el sistema primero busca por CUIT. Si existe, hace attach (no crea un duplicado).

### 3.2 Eliminar = Detach (no soft delete del registro base)

`ClientController::destroy()` llama a `FindAndDetachTenant::execute($counterparty)`, que elimina la fila de `counterparty_tenant`. El registro base en `counterparties` no se borra (otros tenants pueden seguir usándolo).

El código tiene comentado `$counterparty->delete()` — el soft delete del registro base está deshabilitado.

### 3.3 `is_shared` — contraparte importada vs propia

`GetAllClientAction` determina si la contraparte es "compartida" comparando `pivot.created_at > counterparty.created_at`. Si el pivot se creó después que el registro base, fue adjuntada desde otra empresa.

Cuando `is_shared = true`:
- `UpdateClientAction` solo actualiza datos en el pivot (contact_name, email, phone)
- No puede cambiar el nombre, CUIT ni condición IVA del registro base (que pertenece al creator)

### 3.4 Datos de contacto con override por tenant

Al editar una contraparte compartida, los datos de contacto se guardan en el pivot en null si son iguales al registro base, y con valor si difieren. Al leer, `GetAllClientAction` transforma la colección para sobrescribir los campos con los valores del pivot (si no son null).

### 3.5 Visibilidad multi-tenant

`GetAllClientAction` y `GetAllProviderAction` usan `GetTenantContextAction` para devolver contrapartes de todos los tenants del grupo del usuario (empresa raíz + sucursales). Un usuario de la empresa principal ve clientes creados en cualquier sucursal.

### 3.6 Búsqueda global para adjuntar sin duplicar

`SearchGlobalClientAction` / `SearchGlobalProviderAction` buscan por nombre o CUIT en TODOS los tenants (sin filtro de tenant), excluyendo las que ya están adjuntadas al tenant actual. Esto permite encontrar un proveedor que otra sucursal ya registró y adjuntarlo sin crear un nuevo registro.

### 3.7 Free tier: límite de contrapartes

`IncrementFreetierResourceAction::execute('counterparties')` se llama al crear o adjuntar una contraparte. El límite del plan gratuito es controlado por `.env`.

---

## 4. Flujos Funcionales

### 4.1 Crear un cliente nuevo

```
POST /clients/{from?}
  │
  ├─ StoreCounterpartyRequest — valida: name, cuit, email, phone, contact_name, tax_condition, address?, location_id?
  ├─ CreateClientAction::execute($data)
  │   ├─ Counterparty::create({name, email, cuit, contact_name, phone, tax_condiction})
  │   ├─ FindAndAttachCounterpartyTenantAction (party_type=CLIENT)
  │   ├─ CreateAndAttachAddressAction (si viene address + location_id)
  │   └─ RegisterCounterpartyCreationActivityAction
  ├─ IncrementFreetierResourceAction('counterparties')
  └─ Si `$from === 'invoice-sale'` → redirect a /invoices-sale/create con header x-client-id
     Sino → redirect a /clients
```

### 4.2 Adjuntar un cliente existente

```
POST /clients/{counterparty}/attach
  │
  ├─ AttachCounterpartyRequest
  ├─ FindAndAttachCounterpartyTenantAction (party_type=CLIENT, pivotData={contact_name,email,phone})
  ├─ RegisterCounterpartyAttachmentActivityAction
  ├─ IncrementFreetierResourceAction('counterparties')
  └─ Redirect a /clients
```

### 4.3 Editar un cliente

```
PUT /clients/{counterparty}
  │
  ├─ CounterpartyPolicy::updateClient → checkTenant + 'Actualizar Clientes'
  ├─ UpdateCounterpartyRequest
  ├─ UpdateClientAction::execute($data, $counterparty)
  │   ├─ Obtener pivot.created_at vs counterparty.created_at → $isShared
  │   ├─ Si $isShared:
  │   │   └─ Solo actualiza pivot: contact_name, email, phone (null si igual al base)
  │   └─ Si no es shared (owner del registro):
  │       ├─ $counterparty->update({name, email, phone, cuit, contact_name, tax_condiction})
  │       └─ UpdateAddress o CreateAndAttachAddress según si ya tiene dirección
  └─ Redirect a /clients
```

### 4.4 Eliminar un cliente (detach)

```
DELETE /clients/{counterparty}
  │
  ├─ CounterpartyPolicy::deleteClient → checkTenant + 'Eliminar Clientes'
  ├─ FindAndDetachTenant::execute($counterparty)
  │   └─ Elimina la fila de counterparty_tenant para el tenant actual
  │   (El registro base en counterparties NO se elimina)
  └─ Redirect a /clients
```

### 4.5 Buscar y adjuntar proveedor existente

```
GET /providers/search?search_global={query}
  │
  ├─ SearchGlobalProviderAction::execute($query)
  │   ├─ Counterparty.where(name ILIKE % o cuit ILIKE %)
  │   └─ whereDoesntHave('tenants', party_type=PROVIDER, tenant_id=current) ← excluye ya adjuntos
  └─ Devuelve máx. 5 resultados con is_attached=false
```

El frontend muestra los resultados y ofrece un botón "Asociar" que llama a `POST /providers/{counterparty}/attach`.

### 4.6 Análisis de riesgo de proveedores

```
GET /providers (con parámetro de análisis de riesgo)
  │
  ├─ GetProviderRiskAnalysisAction::execute($dependencyThreshold=30, $periodMonths=6)
  │   ├─ Obtiene todas las facturas de compra del período (InvoiceTypes::PURCHASE_INVOICE)
  │   ├─ Calcula total_spend = SUM(quantity × price por ítem)
  │   ├─ Agrupa por proveedor → spend y % del total
  │   ├─ Marca como "crítico" si % > $dependencyThreshold
  │   └─ single_source_items: productos que solo tiene un proveedor en el período
  └─ Resultado: {total_spend, critical_providers_count, single_source_items_count, providers[]}
```

---

## 5. Integraciones con Otros Módulos

| Módulo | Relación |
|--------|----------|
| **12-budget** | `Invoice.counterparty_id` FK; presupuestos se crean para un cliente |
| **13-invoice-sales** | `Invoice.counterparty_id`; la condición IVA del cliente determina la letra del comprobante |
| **14-arca** | La `tax_condiction` del cliente + la del tenant determinan si corresponde factura A, B o C |
| **15-purchase-orders** | `PurchaseOrder.counterparty_id` FK a proveedor |
| **16-invoice-purchase** | `Invoice.counterparty_id` FK a proveedor |
| **17-treasury** | `Transaction.counterparty_id`; los resúmenes de cuenta agrupan transacciones por contraparte |
| **19-reports** | Reportes de comportamiento de clientes, lealtad, proveedores y productos por proveedor |

---

## 6. API / Endpoints

### Clientes

| Método | Path | Nombre | Guard | Descripción |
|--------|------|---------|-------|-------------|
| `GET` | `/clients` | `clients` | `viewAnyClient` | Lista paginada (15/página), filtros y búsqueda global |
| `POST` | `/clients/{from?}` | `clients.store` | `storeClient` | Crear cliente nuevo (from=invoice-sale redirige a factura) |
| `PUT` | `/clients/{counterparty}` | `clients.update` | `updateClient` | Editar cliente (datos base o pivot según is_shared) |
| `DELETE` | `/clients/{counterparty}` | `clients.destroy` | `deleteClient` | Detach del tenant (no elimina el registro base) |
| `POST` | `/clients/{counterparty}/attach` | `clients.attach` | `attachClient` | Adjuntar cliente existente al tenant |

### Proveedores

| Método | Path | Nombre | Guard | Descripción |
|--------|------|---------|-------|-------------|
| `GET` | `/providers` | `providers` | `viewAnyProvider` | Lista paginada de proveedores |
| `GET` | `/providers/search` | `providers.search` | — | Búsqueda global de proveedores no adjuntos |
| `POST` | `/providers/{from?}` | `providers.store` | `storeProvider` | Crear proveedor nuevo |
| `PUT` | `/providers/{counterparty}` | `providers.update` | `updateProvider` | Editar proveedor |
| `DELETE` | `/providers/{counterparty}` | `providers.destroy` | `deleteProvider` | Detach del tenant |
| `POST` | `/providers/{counterparty}/attach` | `providers.attach` | `attachProvider` | Adjuntar proveedor existente |

### Filtros disponibles (vía Spatie QueryBuilder)

Para clientes y proveedores:
- `filter[name]`: búsqueda parcial por nombre (case-insensitive)
- `filter[cuit]`: búsqueda parcial por CUIT
- `filter[email]`: match exacto de email
- `filter[phone]`: match exacto de teléfono
- `filter[tax_condiction]`: match exacto por condición IVA

---

## 7. Consideraciones de Migración Next.js

### Modelo compartido vs separado

En v2.0 mantener un único modelo `Counterparty` con relación many-to-many a `Tenant` vía pivot. No crear tablas separadas para clientes y proveedores — el `party_type` en el pivot es suficiente y permite que el mismo CUIT sea cliente en una empresa y proveedor en otra.

### CUIT único global — problema con grupos empresariales

La constraint `cuit UNIQUE` en `counterparties` puede ser un problema si dos empresas sin relación entre sí necesitan registrar el mismo CUIT con datos distintos. En v2.0 evaluar si esto es un caso real o si el modelo compartido es siempre deseable.

### Override de datos de contacto por tenant

El patrón de override en el pivot (guardar null cuando es igual al base, valor cuando difiere) es elegante pero frágil. En v2.0 simplificar: siempre guardar en la pivot los datos que el tenant quiere mostrar, independientemente de si son iguales al base.

### `is_shared` heurístico

La detección de "contraparte compartida" usando `pivot.created_at > counterparty.created_at` es frágil si hay desfases de reloj o migraciones de datos. En v2.0 agregar una columna explícita `counterparty_tenant.is_creator` (boolean) que indique si ese tenant creó el registro original.

### Dirección con estructura geográfica argentina

Las direcciones referencian localidades de Argentina (tabla `locations` con `province_id`). En v2.0 mantener este modelo si el sistema sigue siendo Argentina-only, o generalizar a country/state/city para multi-país.

---

## 8. Mejoras Propuestas v2.0

### Perfil de cliente con resumen financiero

Agregar una vista de perfil de cliente que muestre: historial de facturas, saldo corriente (deuda/crédito), transacciones recientes y comportamiento de pago (promedio de días para pagar). Hoy esta información está dispersa entre treasury y reports.

### Portal del proveedor

Un acceso limitado para proveedores donde pueden ver sus órdenes de compra pendientes, cargar el remito de entrega y consultar el estado de sus facturas. Reduce la carga operativa del equipo de compras.

### Integración ARCA para validar CUIT

Al ingresar un CUIT, consultar el servicio de ARCA (ex-AFIP) para validar que es un CUIT real y obtener automáticamente la razón social y la condición IVA. Elimina errores de tipeo y normaliza los datos.

### Segmentación de clientes por IA (add-on IA)

Con el add-on activo, clasificar automáticamente los clientes en segmentos: "Clientes VIP" (alto ticket, alta frecuencia), "En riesgo de abandono" (no compran hace X días), "Nuevos" (primera compra reciente), "Recurrentes". Mostrar el segmento en el listado y usarlo para alertas de reactivación.

### Productos favoritos del cliente

Mostrar en el perfil del cliente qué productos compra más frecuentemente. Al crear una factura para ese cliente, sugerir los productos de su historial para acelerar la carga.

### Límite de crédito por cliente

Agregar `client_credit_limit` (entero en centavos) a la pivot `counterparty_tenant`. Al emitir una factura, validar que la deuda actual + el monto de la nueva factura no supere el límite. Bloqueo configurable (alerta vs bloqueo duro).
