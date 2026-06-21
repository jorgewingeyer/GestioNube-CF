# 14 — ARCA / AFIP — Facturación Electrónica

> **Fase:** 3 — Ciclo Comercial  
> **Depende de:** 13-invoice-sales, 02-tenant, 03-rbac  
> **Dependen de este:** 17-treasury (estado de facturas), 19-reports  
> **Feature flag:** `feature:facturacion_electronica` — todas las rutas requieren este feature habilitado  
> **Permiso de acceso:** `can('viewAny', ArcaCertificate::class)`

---

## 1. Propósito y Alcance

Integra GestioNube con el Web Service de Facturación Electrónica de ARCA (ex-AFIP), operando mediante dos servicios SOAP:

- **WSAA** (`LoginCms`): autenticación con certificado X.509 + clave privada → genera un Ticket de Acceso (TA)  
- **WSFE** (`FECAESolicitar`): emisión de comprobantes electrónicos, consulta de parámetros y comprobantes

El módulo soporta dos entornos configurables: **testing** (homologación) y **production**.

---

## 2. Entidades de Datos

### 2.1 Tabla `arca_certificates`

Almacena los certificados X.509 y claves privadas por tenant y entorno.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | bigint | PK |
| `tenant_id` | FK → tenants, nullable | Tenant propietario. `null` = certificado global |
| `environment` | string | `testing` \| `production` |
| `name` | string, nullable | Nombre descriptivo |
| `cert_pem` | text | Certificado X.509 en formato PEM (en texto plano) |
| `key_pem` | text | Clave privada — **encriptada con `Crypt::encryptString()`** en BD |
| `passphrase` | string, nullable | Passphrase de la clave — **encriptada** en BD |
| `filename`, `mime_type`, `size` | string/int | Metadatos del archivo |

**Accessors automáticos:** `key_pem` y `passphrase` se desencriptan al leer con `Crypt::decryptString()`.

### 2.2 Tabla `arca_login_ticket_requests`

Log de cada TRA (loginTicketRequest) generado antes de autenticar.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | bigint | PK |
| `tenant_id` | FK → tenants, nullable | Tenant solicitante |
| `certificate_id` | FK → arca_certificates, nullable | Certificado usado |
| `environment` | string | Entorno |
| `unique_id` | int | Timestamp Unix del TRA (`time()`) |
| `generation_time` | datetime | `uniqueId - 60s` (ISO 8601) |
| `expiration_time` | datetime | `uniqueId + 60s` — ventana de validez del TRA |
| `service` | string | Servicio destino (siempre `wsfe`) |
| `xml` | text | XML completo del TRA |

### 2.3 Tabla `arca_login_tickets`

Almacena cada Ticket de Acceso (TA) devuelto por WSAA.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | bigint | PK |
| `tenant_id` | FK → tenants, nullable | Tenant asociado |
| `certificate_id` | FK → arca_certificates, nullable | Certificado que originó el TA |
| `environment` | string | Entorno |
| `unique_id` | int, nullable | `uniqueId` del TA |
| `generation_time` | datetime, nullable | Hora de generación |
| `expiration_time` | datetime, nullable | Hora de vencimiento del TA (**~12 horas** desde generación) |
| `source` | string, nullable | CUIT del emisor ARCA |
| `destination` | string, nullable | Servicio destino |
| `xml` | text | XML completo del TA |
| `token` | text, nullable | Token para autenticación en WSFE |
| `sign` | text, nullable | Firma para autenticación en WSFE |

### 2.4 Campos ARCA en tabla `invoices`

(Documentados en módulo 13, referenciados aquí para contexto)

| Columna | Descripción |
|---------|-------------|
| `cae` | Código de Autorización Electrónica |
| `cae_expiration_date` | Vencimiento del CAE (`Y-m-d`) |
| `cae_result` | `A` (aprobado) o `R` (rechazado) |
| `cbte_nro` | Número de comprobante ARCA |
| `cbte_tipo` | Tipo: `1`=A, `6`=B, `11`=C, `2`=ND-A, `3`=NC-A, etc. |
| `PtoVta` | Punto de venta ARCA (entero) |

---

## 3. Reglas de Negocio

### 3.1 Inferencia automática del tipo de comprobante (`cbte_tipo`)

`InferCbteTipoFromInvoiceAction` determina el `CbteTipo` según la condición fiscal del **emisor** (tenant) y el **receptor** (cliente), sin que el usuario deba seleccionarlo:

| Emisor | Receptor | Tipo de doc | → `CbteTipo` |
|--------|----------|-------------|--------------|
| Responsable Inscripto (RI) | RI o Monotributista (Ley 27.618) | Factura | **1 (Factura A)** |
| RI | Consumidor Final / Exento / Otro | Factura | **6 (Factura B)** |
| Monotributista | Cualquiera | Factura | **11 (Factura C)** |
| RI | RI o Mono | NC | **3 (NC-A)** |
| RI | CF/Exento | NC | **8 (NC-B)** |
| Mono | Cualquiera | NC | **13 (NC-C)** |
| RI | RI o Mono | ND | **2 (ND-A)** |
| RI | CF/Exento | ND | **7 (ND-B)** |
| Mono | Cualquiera | ND | **12 (ND-C)** |

La condición del emisor se lee de `tenant.iva`. La del receptor se lee de `counterparty.tax_condiction` (enum `TaxCondictionTypes`).

### 3.2 Validaciones previas a la autorización (`ValidateInvoiceForAfipAction`)

Antes de construir el FECAEReq, el sistema valida:
- **Factura A (1/2/3):** emisor debe ser RI, receptor debe ser RI o Monotributista
- **Factura B (6/7/8):** emisor debe ser RI, receptor NO debe ser RI
- **Factura C (11/12/13):** emisor NO debe ser RI (error si es RI)
- Si `tenant.iva` está vacío → excepción: "condición fiscal del emisor no configurada"

### 3.3 Factura C: IVA no discriminado

Para comprobantes tipo 11, 12, 13 (Factura/ND/NC tipo C):
- `ImpIVA = 0` (no se informa)
- El arreglo `Iva[]` NO se incluye en el payload
- `ImpNeto = ImpTotal - ImpTrib` (el neto absorbe el IVA)
- El total sigue siendo el mismo

### 3.4 IVA agrupado por alícuota para WSFE

`BuildIvaGroupsFromInvoiceAction` agrupa las líneas de la factura por tasa IVA:
```
rateGroups['21'] = { base_cent: int, iva_cent: int }
rateGroups['10.5'] = { base_cent: int, iva_cent: int }
```

Luego `ComposeIvaItemsFromGroupsAction` mapea a los `Id` que ARCA acepta:
- `21%` → Id `5`
- `10.5%` → Id `4`
- `27%` → Id `6`
- `0%` → no se informa en `Iva[]`

Los valores se convierten de centavos a pesos decimales: `cents / 100.0`.

### 3.5 Descuento global → proporcional por grupo de alícuota

`ApplyGlobalDiscountToIvaGroupsAction` reduce proporcionalmente el `base_cent` de cada grupo IVA y recalcula el `iva_cent`. El residuo de redondeo se asigna al grupo de mayor base. Esto garantiza que lo reportado a ARCA sea consistente con los totales de la factura.

### 3.6 Interés → `ImpTrib`

El interés (`invoice.total_interest`) va al campo `ImpTrib` del payload WSFE. No se incluye en `ImpNeto` ni `ImpIVA`.

### 3.7 Numeración del comprobante (`GetNextCbteNumberAction`)

Antes de autorizar, `feIssueInvoice` llama `GetNextCbteNumberAction` que consulta vía `FECompUltimoAutorizado` el último número autorizado en ARCA para `(PtoVta, CbteTipo)` y devuelve `ultimo_nro + 1`. Esto evita baches por fallo de sincronía local.

### 3.8 Normalización de fecha (`NormalizeCbteFchAction`)

`CbteFch` (fecha del comprobante en formato `YYYYMMDD`) no puede ser anterior al último número autorizado ni anterior a hoy. `NormalizeCbteFchAction` ajusta la fecha si es necesario para evitar rechazo por ARCA.

### 3.9 Resolución del certificado (multi-nivel)

`CertificateManager::getCurrentCertificate()` busca en este orden:
1. `arca_certificates WHERE tenant_id = $tenantId AND environment = $env` → más específico
2. `arca_certificates WHERE tenant_id = $tenantId` → cualquier entorno del tenant
3. `arca_certificates WHERE tenant_id IS NULL AND environment = $env` → global para el entorno
4. `arca_certificates WHERE tenant_id IS NULL` → global sin importar entorno

### 3.10 Bug documentado: TA no aislado por tenant

`TokenManager::latestTicket()` tiene comentado `->where('tenant_id', $tenantId)`. En consecuencia, en un entorno multi-tenant, el TA más reciente en BD se comparte entre **todos los tenants** del mismo entorno. Si tenant A autentica, tenant B usará el TA de A para emitir comprobantes. En testing con un solo CUIT esto no importa; en producción multi-tenant es un bug crítico.

### 3.11 Entorno configurable por request

Las rutas ARCA admiten `?env=testing` o `?env=production` en el request. El servicio selecciona la URL de WSAA/WSFE, el CUIT y el certificado correspondiente. Por defecto usa `ARCA_MODE` del `.env`.

### 3.12 CUIT del emisor en producción

`WsfeService` lee `tenant.cuit` cuando `env = production` y lo sanitiza a 11 dígitos (`preg_replace('/\D+/', '', ...)`). En testing usa `ARCA_TEST_CUIT` del `.env` independientemente del tenant.

### 3.13 QR AFIP (RG 4892/2020)

`BuildAfipQrUrlAction` construye la URL de verificación:
```
https://www.afip.gob.ar/fe/qr/?p=BASE64(JSON)
```
El JSON incluye: `ver`, `fecha`, `cuit`, `ptoVta`, `tipoCmp`, `nroCmp`, `importe`, `moneda`, `ctz`, `tipoDocRec`, `nroDocRec`, `tipoCodAut`, `codAut` (CAE).

`GenerateQrRepresentationsAction` produce: `svg`, `png` y `svg_base64` del QR.

### 3.14 RG 5616: `CondicionIVAReceptorId` obligatorio

Desde la Resolución General 5616, el campo `CondicionIVAReceptorId` es **obligatorio** en FECAEReq. `MapCondicionIvaReceptorIdAction` mapea `counterparty.tax_condiction` al ID que ARCA espera.

### 3.15 Documento del receptor (`DocTipo`/`DocNro`)

`MapDocTipoAndNroAction` traduce el `counterparty.cuit` al par `(DocTipo, DocNro)` que ARCA entiende:
- Si tiene CUIT → `DocTipo = 80` (CUIT)
- Si es Consumidor Final sin CUIT → `DocTipo = 99`, `DocNro = 0`

---

## 4. Flujos Funcionales

### 4.1 Autenticación WSAA (obtener TA)

```
POST /arca/auth/login
         │
         ▼
AuthLoginAction → WsaaService::loginCmsAndStoreTa()
         │
         ├─ 1. CertificateManager::getCurrentCertificate()
         │      Busca en arca_certificates (tenant → global)
         │
         ├─ 2. createTraXml(service='wsfe')
         │      Genera XML: uniqueId=time(), genTime=now-60s, expTime=now+60s
         │      Guarda en arca_login_ticket_requests
         │
         ├─ 3. signTraXml()
         │      Escribe cert+key en /tmp (mode 0600)
         │      openssl_pkcs7_sign → CMS (sin cabeceras MIME)
         │      Limpia archivos temporales (finally)
         │
         ├─ 4. SOAP: loginCms({ in0: cms })
         │      → WSAA devuelve taXml
         │
         └─ 5. TokenManager::saveTaXml()
                Guarda en arca_login_tickets
                Cachea en Redis/Laravel Cache con TTL = expiración del TA
```

**El TA dura ~12 horas.** El sistema verifica antes de cada llamada WSFE: `TokenManager::isExpired()` (con 30s de margen).

### 4.2 Emisión de factura electrónica — flujo completo (`feIssueInvoice`)

```
POST /arca/fe/issue/{invoice_id}
    Params: pto_vta, cbte_tipo (opcional), mon_id, mon_cotiz, concepto
         │
         ▼
BuildFeCaeRequestFromInvoiceAction::execute()
         │
         ├─ Carga invoice con tenant, counterparty, products
         ├─ calculateInvoiceTotals() (totales en centavos)
         ├─ InferCbteTipoFromInvoiceAction → CbteTipo automático
         ├─ ValidateInvoiceForAfipAction → valida combinación emisor/receptor
         ├─ MapDocTipoAndNroAction → DocTipo/DocNro del receptor
         ├─ MapCondicionIvaReceptorIdAction → CondicionIVAReceptorId (RG 5616)
         ├─ BuildIvaGroupsFromInvoiceAction → grupos base+iva por tasa
         ├─ ApplyGlobalDiscountToIvaGroupsAction → aplica descuento proporcional
         ├─ ComposeIvaItemsFromGroupsAction → iva[] + impNeto + impIVA en pesos
         │   (interés → impTrib)
         │   (Factura C: impIVA=0, iva=[], impNeto absorbe todo)
         └─ Retorna { FeCabReq, FeDetReq[0], _meta }
         │
         ▼
GetNextCbteNumberAction::execute()
    → FECompUltimoAutorizado → ultimo_nro+1 → CbteDesde/CbteHasta
         │
         ▼
NormalizeCbteFchAction::execute()
    → Ajusta CbteFch si es anterior al último autorizado o a hoy
         │
         ▼
AuthorizeCaeRequestAction::execute()
    → WsfeService::caeRequest()
    → SOAP: FECAESolicitar({ Auth: {Token,Sign,Cuit}, FeCAEReq: ... })
    → Extrae: resultado, cae, cae_vto, cbte_nro, detResp
         │
         ▼ (si resultado = 'A')
PersistCaeResponseToInvoiceAction::execute()
    → invoices.cae, cae_expiration_date, cae_result, cbte_nro, cbte_tipo, PtoVta
         │
         ▼
Retorna JSON: { invoice_id, resultado, cae, cae_vto, cbte_nro, env, cuit }
```

### 4.3 Emisión + PDF fiscal (`feIssueInvoicePdf`)

Igual al flujo 4.2, pero al final:
1. `BuildPrintableItemsFromInvoiceAction` → items de la factura para el PDF
2. `ComposePrintDataFromInvoiceAction` → datos del emisor, receptor, totales
3. `BuildAfipQrUrlAction` → URL QR con datos del comprobante
4. `GenerateQrRepresentationsAction` → `{svg, png, svg_base64}`
5. `RenderInvoicePdfAction` → Blade view → PDF binario
6. `response()->streamDownload(...)` → `Factura_{PtoVta}-{CbteTipo}-{CbteNro}.pdf`

### 4.4 Reimpresión sin re-autorizar (`feReprintInvoicePdf`)

```
GET /arca/fe/reprint-pdf/{invoice_id}
    │
    ▼
ReprintInvoicePdfAction::execute()
    Carga invoice desde BD (ya tiene CAE, cbte_nro, etc.)
    Regenera PDF con los mismos datos → no llama a ARCA
    → PDF con "Reimpresión" marcado
```

### 4.5 Consultar comprobante en ARCA (`feCompConsultar`)

```
POST /arca/fe/comp/consultar
    Body: { pto_vta, cbte_tipo, cbte_nro }
    → WsfeService::compConsultar()
    → SOAP: FECompConsultar({ FeCompConsReq: ... })
    Útil para auditoría o verificar si ARCA tiene el comprobante
```

### 4.6 Verificar estado de autenticación

```
GET /arca/auth/status
    → TokenManager::exists(), isExpired(), getExpiration()
    → { has_ta: bool, expired: bool, expires_at: ISO8601 | null }
```

### 4.7 Flujo alternativo — payload manual (`feCaeRequest`)

Endpoint de bajo nivel para testeo. Recibe el payload WSFE completo (`FeCabReq` + `FeDetReq`) construido por el cliente. No infiere nada, no persiste en invoice. Retorna respuesta raw de ARCA.

---

## 5. Servicios y Clases Clave

### 5.1 `WsaaService`

| Método | Descripción |
|--------|-------------|
| `createTraXml()` | Genera XML de loginTicketRequest y lo persiste |
| `signTraXml()` | Firma con `openssl_pkcs7_sign`, escribe cert/key en /tmp, limpia después |
| `loginCmsAndStoreTa()` | Orquesta: obtiene cert → genera TRA → firma → SOAP loginCms → guarda TA |

### 5.2 `WsfeService`

| Método | Descripción |
|--------|-------------|
| `getAuth()` | Lee TA de caché/BD, verifica expiración, retorna `{Token, Sign, Cuit}` |
| `makeClient()` | `SoapClient` WSFE con TLS 1.2, `WSDL_CACHE_NONE`, `exceptions=true` |
| `caeRequest()` | `FECAESolicitar` — retorna respuesta raw |
| `compUltimoAutorizado()` | `FECompUltimoAutorizado` — último nro. autorizado |
| `compConsultar()` | `FECompConsultar` — consulta comprobante en ARCA |
| `dummy()` | `FEDummy` — test de conectividad sin auth |
| `getTipos*()` | Varios `FEParamGet*` — parámetros del WS |

### 5.3 `CertificateManager`

| Método | Descripción |
|--------|-------------|
| `validate()` | Lee cert de BD, verifica que no esté vencido con OpenSSL |
| `withOpenSslFiles()` | Escribe cert+key en /tmp, ejecuta callback, limpia (finally) |
| `getCurrentCertificate()` | Resuelve certificado con 4 niveles de fallback |

### 5.4 `TokenManager`

| Método | Descripción |
|--------|-------------|
| `saveTaXml()` | Parsea TA XML, guarda en BD + caché Redis con TTL |
| `getTaXml()` | Caché → BD, retorna XML del TA activo |
| `isExpired()` | Compara `expiration_time - 30s` con `now()` |
| `exists()` | Caché o BD tiene TA para el entorno |

### 5.5 Actions de construcción de payload

| Action | Responsabilidad |
|--------|----------------|
| `InferCbteTipoFromInvoiceAction` | Determina CbteTipo según condición fiscal emisor/receptor |
| `ValidateInvoiceForAfipAction` | Valida combinación emisor/receptor/tipo antes de enviar |
| `BuildIvaGroupsFromInvoiceAction` | Agrupa líneas por tasa IVA → `{base_cent, iva_cent}` |
| `ApplyGlobalDiscountToIvaGroupsAction` | Aplica descuento proporcional a los grupos IVA |
| `ComposeIvaItemsFromGroupsAction` | Convierte grupos a `Iva[]` WSFE + impNeto + impIVA |
| `MapDocTipoAndNroAction` | Mapea CUIT del receptor a `(DocTipo, DocNro)` AFIP |
| `MapCondicionIvaReceptorIdAction` | Mapea condición IVA del receptor al ID de RG 5616 |
| `BuildFeCaeRequestFromInvoiceAction` | Orquesta todos los anteriores → payload completo WSFE |
| `GetNextCbteNumberAction` | Consulta último nro. autorizado → siguiente CbteDesde |
| `NormalizeCbteFchAction` | Ajusta fecha del comprobante si es inválida |
| `PersistCaeResponseToInvoiceAction` | Persiste CAE y datos fiscales en `invoices` |

### 5.6 Actions de PDF

| Action | Responsabilidad |
|--------|----------------|
| `BuildPrintableItemsFromInvoiceAction` | Items de la factura formateados para impresión |
| `ComposePrintDataFromInvoiceAction` | Datos de emisor, receptor y resumen para PDF |
| `BuildAfipQrUrlAction` | URL QR base64-encoded según RG 4892/2020 |
| `GenerateQrRepresentationsAction` | Genera SVG, PNG, SVG-base64 del QR |
| `RenderInvoicePdfAction` | Blade + DomPDF → PDF fiscal binario |
| `ReprintInvoicePdfAction` | Regenera PDF sin re-autorizar en ARCA |

---

## 6. Configuración (`.env`)

```ini
# Modo activo
ARCA_MODE=testing   # 'testing' | 'production'

# Homologación (testing)
ARCA_WSAA_WSDL=https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL
ARCA_WSAA_URL=https://wsaahomo.afip.gov.ar/ws/services/LoginCms
ARCA_WSFE_WSDL=https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL
ARCA_WSFE_URL=https://wswhomo.afip.gov.ar/wsfev1/service.asmx
ARCA_TEST_CUIT=20123456789

# Producción
ARCA_PROD_WSAA_WSDL=https://wsaa.afip.gov.ar/ws/services/LoginCms?WSDL
ARCA_PROD_WSAA_URL=https://wsaa.afip.gov.ar/ws/services/LoginCms
ARCA_PROD_WSFE_WSDL=https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL
ARCA_PROD_WSFE_URL=https://servicios1.afip.gov.ar/wsfev1/service.asmx
ARCA_PROD_CUIT=  # CUIT del tenant en producción (también desde tenant.cuit)

# Proxy (opcional)
ARCA_PROXY_HOST=
ARCA_PROXY_PORT=

# Punto de venta por defecto
ARCA_PTO_VTA=1
```

---

## 7. API / Endpoints

Todos bajo `/arca` (prefijo) + middleware `feature:facturacion_electronica`.

| Método | Path | Nombre | Descripción |
|--------|------|---------|-------------|
| GET | `/arca` | `arca.index` | Pantalla principal ARCA |
| GET | `/arca/auth/status` | `arca.auth.status` | Estado del TA (vigente/expirado) |
| POST | `/arca/auth/login` | `arca.auth.login` | Autenticar contra WSAA → guardar TA |
| POST | `/arca/auth/migrate-files` | `arca.auth.migrate-files` | Migrar cert/key desde archivos legado a BD |
| GET | `/arca/admin/status` | `arca.admin.status` | Estado completo: cert, TRA, TA más recientes |
| POST | `/arca/cert/store` | `arca.cert.store` | Guardar certificado en BD (cert+key+passphrase) |
| GET | `/arca/fe/dummy` | `arca.fe.dummy` | `FEDummy` — test infraestructura sin auth |
| GET | `/arca/fe/connectivity` | `arca.fe.connectivity` | DNS + TCP + HTTPS probe al endpoint WSFE |
| GET | `/arca/fe/auth-cuit` | `arca.fe.auth-cuit` | CUIT activo para el entorno actual |
| GET | `/arca/fe/ptos-venta` | `arca.fe.ptos-venta` | Puntos de venta autorizados |
| POST | `/arca/fe/comp/ultimo-autorizado` | `arca.fe.comp.ultimo-autorizado` | Último nro. autorizado para `(pto_vta, cbte_tipo)` |
| POST | `/arca/fe/comp/consultar` | `arca.fe.comp.consultar` | Consultar comprobante en ARCA |
| POST | `/arca/fe/cae-request` | `arca.fe.cae-request` | **Bajo nivel**: envía payload WSFE manual |
| POST | `/arca/fe/cae-request-pdf` | `arca.fe.cae-request-pdf` | Payload manual → autoriza + devuelve PDF |
| POST | `/arca/fe/issue/{invoice}` | `arca.fe.issue` | **Alto nivel**: construye payload desde invoice, autoriza, persiste CAE |
| POST | `/arca/fe/issue-pdf/{invoice}` | `arca.fe.issue-pdf` | Alto nivel + devuelve PDF fiscal |
| GET | `/arca/fe/reprint-pdf/{invoice}` | `arca.fe.reprint-pdf` | Reimprime PDF de factura ya autorizada |
| GET | `/arca/fe/params/tipos-cbtes` | `arca.fe.params.tipos-cbtes` | Tipos de comprobante del WS |
| GET | `/arca/fe/params/tipos-iva` | `arca.fe.params.tipos-iva` | Alícuotas IVA del WS |
| GET | `/arca/fe/params/ptos-venta` | `arca.fe.params.ptos-venta` | Puntos de venta (con auth) |
| GET | `/arca/fe/params/condicion-iva-receptor` | `arca.fe.params.condicion-iva-receptor` | Condiciones IVA receptor (RG 5616) |
| GET | `/arca/fe/params/tipos-doc` | `arca.fe.params.tipos-doc` | Tipos de documento |
| GET | `/arca/fe/params/tipos-concepto` | `arca.fe.params.tipos-concepto` | Conceptos de facturación |
| GET | `/arca/fe/params/tipos-tributos` | `arca.fe.params.tipos-tributos` | Tipos de tributos |
| GET | `/arca/fe/params/tipos-monedas` | `arca.fe.params.tipos-monedas` | Monedas aceptadas |

---

## 8. Logging

Canal dedicado `arca` para todos los eventos:
- `info`: TRA generado, TA guardado, conectividad exitosa
- `error`: faults SOAP, comprobantes no autorizados (con payload sanitizado: sin `DocNro` completo), errores de autenticación
- El canal se configura en `config/logging.php`

---

## 9. Consideraciones de Migración Next.js

### SOAP requiere PHP
La integración AFIP usa `SoapClient` nativo de PHP + `openssl_pkcs7_sign`. No existe equivalente directo en Node.js/Bun (Cloudflare Workers no tiene soporte SOAP nativo). **Opción recomendada:** mantener un microservicio Laravel solo para ARCA, exponiendo una API REST interna. Next.js llama a ese microservicio en lugar de conectarse directamente a ARCA.

### Certificados en BD → encriptados con APP_KEY
`key_pem` y `passphrase` están encriptados con `Crypt::encryptString()` de Laravel (AES-256-CBC + APP_KEY). Al migrar la BD, el APP_KEY debe mantenerse o los certificados deben re-encriptarse.

### Archivos temporales en `/tmp`
El proceso de firma crea archivos temporales con el cert/key. En Cloudflare Workers (sin filesystem) esto no es viable. Con el microservicio PHP esto no cambia.

### TA en caché compartido
El TA se cachea en Laravel Cache (Redis). En la nueva arquitectura, el microservicio puede mantener su propio caché. Con el bug de TA no aislado por tenant, en producción multi-tenant hay que corregir el `latestTicket()` antes de migrar.

### QR / PDF
El QR se genera con una librería PHP de QR code. El PDF con DomPDF + Blade. Ambos viven en el microservicio. Next.js recibe el PDF como `streamDownload` del microservicio.

---

## 10. Mejoras Propuestas v2.0

### 10.1 Corregir aislamiento de TA por tenant (BUG CRÍTICO)
Descomentar `->where('tenant_id', $tenantId)` en `TokenManager::latestTicket()`. Sin esto, en producción multi-tenant los CUITs se mezclan.

### 10.2 Renovación automática del TA
Verificar expiración antes de cada llamada WSFE y autenticar automáticamente si el TA expiró, sin requerir intervención manual del usuario.

### 10.3 Gestión de certificados con UI
Actualmente solo hay un endpoint `POST /cert/store`. v2.0: pantalla para subir `.crt` + `.key` con validación visual (fecha de vencimiento, CUIT asociado), y alertas cuando el certificado vence en menos de 30 días.

### 10.4 Retry automático con backoff
Los errores transitorios de WSAA/WSFE (timeout, servidor no disponible) deberían reintentarse con backoff exponencial en un Job de queue, en lugar de fallar inmediatamente.

### 10.5 Webhook de estado ARCA
Implementar un job periódico que consulte `FECompUltimoAutorizado` y marque facturas como "consistentes" o "discrepantes" si el número local no coincide con ARCA.

### 10.6 Soporte multi-punto-de-venta
Actualmente se usa un único `PtoVta` por tenant (configurable en `.env`). v2.0: selector de punto de venta en la pantalla de emisión, con lista obtenida de `FEParamGetPtosVenta`.

### 10.7 Anulación fiscal desde UI
Implementar el flujo completo de baja de comprobante ante ARCA. Actualmente solo existe el campo `status = ANNULLED` pero no hay endpoint para comunicarlo a ARCA.
