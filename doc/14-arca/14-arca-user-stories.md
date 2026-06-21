# Historias de Usuario — Módulo 14: ARCA / AFIP — Facturación Electrónica

> **Módulo:** 14-arca  
> **Fase:** 3 — Ciclo Comercial  
> **Depende de:** 13-invoice-sales, 02-tenant, 03-rbac  
> **Feature flag:** `feature:facturacion_electronica`

---

## US-ARCA-01 — Cargar el certificado digital ARCA

**Como** administrador del sistema,  
**quiero** subir el certificado X.509 y la clave privada emitidos por ARCA para mi empresa,  
**para** que el sistema pueda autenticarse ante AFIP y emitir facturas electrónicas.

### Criterios de aceptación
- [ ] Puedo ingresar el certificado en formato PEM (texto), la clave privada PEM y la passphrase opcional
- [ ] Puedo seleccionar el entorno: Homologación (testing) o Producción
- [ ] El sistema valida que el certificado sea un X.509 válido y no esté vencido antes de guardarlo
- [ ] La clave privada y la passphrase se almacenan encriptadas en la base de datos (nunca en texto plano)
- [ ] Al guardar exitosamente, aparece un mensaje de confirmación con el ID del certificado guardado
- [ ] Si el certificado ya está vencido, aparece un error claro indicando la fecha de vencimiento

### Notas técnicas
- `POST /arca/cert/store` → `SaveArcaCertificateAction`
- `key_pem` y `passphrase` se encriptan con `Crypt::encryptString()` (AES-256-CBC, dependiente de `APP_KEY`)
- `CertificateManager::validate()` usa `openssl_x509_parse()` para verificar `validTo_time_t`
- `tenant_id` se asocia automáticamente al tenant activo de la sesión

---

## US-ARCA-02 — Verificar el estado de autenticación ARCA

**Como** administrador o contador,  
**quiero** saber si mi empresa tiene un Ticket de Acceso (TA) vigente ante ARCA,  
**para** confirmar que puedo emitir facturas sin necesidad de autenticarme de nuevo.

### Criterios de aceptación
- [ ] La pantalla de ARCA muestra claramente: "Autenticado — vence el DD/MM/YYYY HH:MM" o "No autenticado / Expirado"
- [ ] El estado se actualiza en tiempo real al recargar
- [ ] Si no hay certificado configurado, se muestra un mensaje orientando a cargarlo primero
- [ ] Si el TA expira en menos de 30 minutos, se muestra una advertencia proactiva

### Notas técnicas
- `GET /arca/auth/status` → `AuthStatusAction` → `TokenManager`
- Retorna: `{ has_ta: bool, expired: bool, expires_at: ISO8601 | null }`
- El TA dura ~12 horas desde el momento de autenticación

---

## US-ARCA-03 — Autenticarse ante ARCA (obtener Ticket de Acceso)

**Como** administrador,  
**quiero** iniciar sesión ante ARCA con el certificado de mi empresa,  
**para** obtener el Ticket de Acceso que habilita la emisión de facturas electrónicas.

### Criterios de aceptación
- [ ] Un botón "Autenticar con ARCA" dispara el proceso de autenticación
- [ ] El sistema firma el pedido con la clave privada y lo envía al WSAA de ARCA
- [ ] Si la autenticación es exitosa, se muestra: "Autenticado correctamente — válido hasta DD/MM/YYYY HH:MM"
- [ ] Si falla (certificado vencido, error SOAP, timeout), se muestra el error específico de ARCA
- [ ] El TA se cachea automáticamente; no se necesita volver a autenticar hasta que expire

### Notas técnicas
- `POST /arca/auth/login` → `AuthLoginAction` → `WsaaService::loginCmsAndStoreTa()`
- Proceso: certifica TRA → `openssl_pkcs7_sign` → SOAP `loginCms` → guarda en `arca_login_tickets` + caché Redis
- La ventana TRA (tiempo entre `generationTime` y `expirationTime`) es de 120 segundos
- Los archivos temporales del cert/key se eliminan en el bloque `finally` del proceso de firma

---

## US-ARCA-04 — Verificar conectividad con los servidores ARCA

**Como** administrador,  
**quiero** verificar que los servidores de ARCA/AFIP son accesibles desde la infraestructura de GestioNube,  
**para** diagnosticar problemas de red antes de intentar emitir una factura.

### Criterios de aceptación
- [ ] El diagnóstico muestra: resolución DNS del host WSFE, conectividad TCP al puerto 443, estado HTTPS, accesibilidad del WSDL
- [ ] Cada componente muestra OK o ERROR con el detalle del fallo
- [ ] Se puede ejecutar sin necesidad de tener TA activo (test de infraestructura pura)
- [ ] También puedo probar `FEDummy` (estado de servidores de ARCA sin autenticación)

### Notas técnicas
- `GET /arca/fe/connectivity` → `FeConnectivityProbeAction` → retorna DNS/TCP/HTTP stats
- `GET /arca/fe/dummy` → `FeDummyAction` → SOAP `FEDummy` (sin auth) → estado AppServer/DbServer/AuthServer
- El probe intenta con dos variantes de SoapClient (WSDL y no-WSDL) para cubrir edge cases TLS

---

## US-ARCA-05 — Emitir una factura electrónica (obtener CAE)

**Como** administrador o contador,  
**quiero** autorizar una factura completada ante ARCA para obtener el CAE,  
**para** que el comprobante tenga validez fiscal y pueda ser entregado al cliente.

### Criterios de aceptación
- [ ] Solo facturas con estado "Aceptado" (completadas) pueden autorizarse ante ARCA
- [ ] El sistema determina automáticamente el tipo de comprobante (A, B o C) según la condición fiscal del emisor y del cliente
- [ ] El sistema obtiene automáticamente el siguiente número de comprobante desde ARCA
- [ ] Al autorizar exitosamente, la factura muestra: CAE, fecha de vencimiento del CAE y número de comprobante ARCA (`cbte_nro`)
- [ ] Si ARCA rechaza la factura, se muestra el error exacto retornado por ARCA (ej: "CUIT receptor inválido")
- [ ] El tipo de comprobante no es configurable por el usuario: el sistema lo infiere para garantizar cumplimiento normativo

### Criterios de rechazo esperados
- Emisor RI intentando emitir Factura A a Consumidor Final → error claro
- Emisor Monotributista intentando emitir Factura A o B → error claro
- Emisor sin condición fiscal configurada en el tenant → error antes de enviar a ARCA

### Notas técnicas
- `POST /arca/fe/issue/{invoice_id}` → `BuildFeCaeRequestFromInvoiceAction` → `GetNextCbteNumberAction` → `NormalizeCbteFchAction` → `AuthorizeCaeRequestAction` → `PersistCaeResponseToInvoiceAction`
- `InferCbteTipoFromInvoiceAction`: RI+RI/Mono → 1(A); RI+CF → 6(B); Mono+any → 11(C)
- `ValidateInvoiceForAfipAction`: valida la combinación antes de enviar para dar error claro al usuario
- CAE persiste en `invoices.cae`, `cae_expiration_date`, `cbte_nro`, `cbte_tipo`, `PtoVta`

---

## US-ARCA-06 — Emitir factura electrónica y descargar PDF fiscal en un solo paso

**Como** administrador,  
**quiero** autorizar la factura ante ARCA y descargar el PDF con QR oficial en un solo clic,  
**para** reducir pasos en el flujo de facturación diaria.

### Criterios de aceptación
- [ ] Un solo botón "Autorizar y descargar PDF" ejecuta ambas acciones en secuencia
- [ ] El PDF descargado incluye el QR de verificación AFIP (RG 4892/2020)
- [ ] El PDF incluye el CAE y la fecha de vencimiento del CAE
- [ ] El nombre del archivo es `Factura_{PtoVta}-{CbteTipo}-{CbteNro}.pdf`
- [ ] Si ARCA rechaza, no se genera el PDF y se muestra el error

### Notas técnicas
- `POST /arca/fe/issue-pdf/{invoice_id}` → mismo flujo que US-ARCA-05 + generación de PDF
- `BuildAfipQrUrlAction` → URL JSON-base64 según RG 4892: incluye cuit, ptoVta, tipoCmp, nroCmp, importe, moneda, ctz, tipoDocRec, nroDocRec, codAut
- `GenerateQrRepresentationsAction` → SVG + PNG + SVG-base64
- `RenderInvoicePdfAction` → Blade view + DomPDF → binario

---

## US-ARCA-07 — Reimprimir el PDF fiscal de una factura ya autorizada

**Como** vendedor o administrador,  
**quiero** volver a descargar el PDF de una factura que ya tiene CAE,  
**para** enviársela nuevamente al cliente o archivarla sin volver a contactar ARCA.

### Criterios de aceptación
- [ ] Solo funciona para facturas que ya tienen CAE asignado
- [ ] El PDF generado es idéntico al original (mismo CAE, QR, cbte_nro)
- [ ] No genera ningún nuevo comprobante ni comunicación con ARCA
- [ ] El nombre del archivo indica "Reimpresión": `Factura_Reimpresion_{invoice_number}.pdf`

### Notas técnicas
- `GET /arca/fe/reprint-pdf/{invoice_id}` → `ReprintInvoicePdfAction`
- Lee los datos persistidos en `invoices` (cae, cbte_nro, etc.) — no llama a WSFE

---

## US-ARCA-08 — Ver los parámetros vigentes del servicio WSFE

**Como** contador o administrador técnico,  
**quiero** consultar los parámetros actuales del servicio WSFE de ARCA,  
**para** verificar tipos de comprobante, alícuotas IVA y puntos de venta disponibles antes de configurar la facturación.

### Criterios de aceptación
- [ ] Puedo ver: tipos de comprobante (`FEParamGetTiposCbtes`), alícuotas IVA, tipos de documento, monedas, puntos de venta
- [ ] Los datos se obtienen en tiempo real desde ARCA (requiere TA activo)
- [ ] Si el TA está expirado, aparece el error correspondiente con instrucciones para re-autenticar

### Notas técnicas
- Endpoints `GET /arca/fe/params/*`: `tipos-cbtes`, `tipos-iva`, `tipos-doc`, `ptos-venta`, `tipos-concepto`, `tipos-tributos`, `tipos-monedas`, `condicion-iva-receptor`, `unidades-medida`
- Todos llaman al método correspondiente en `WsfeService` que requiere `getAuth()` → TA activo

---

## US-ARCA-09 — Consultar un comprobante en ARCA

**Como** contador,  
**quiero** consultar un comprobante específico directamente en ARCA ingresando punto de venta, tipo y número,  
**para** verificar que ARCA tiene registrado el comprobante y comparar con el registro local.

### Criterios de aceptación
- [ ] Ingreso: punto de venta, tipo de comprobante y número de comprobante
- [ ] Retorna los datos que ARCA tiene del comprobante: CAE, estado, importe, fecha
- [ ] Si el comprobante no existe en ARCA, se muestra el error de ARCA
- [ ] Útil para auditoría y para detectar discrepancias entre el sistema y ARCA

### Notas técnicas
- `POST /arca/fe/comp/consultar` → `FeCompConsultarFrontendAction` → `WsfeService::compConsultar()`
- SOAP `FECompConsultar` con `{PtoVta, CbteTipo, CbteNro}`
- El servicio intenta con `FeCompConsReq` y fallback a `FeCompConsultaReq` por compatibilidad

---

## US-ARCA-10 — Consultar el último número autorizado para un punto de venta

**Como** contador o administrador,  
**quiero** consultar cuál es el último número de comprobante autorizado por ARCA para un punto de venta y tipo,  
**para** verificar que la numeración local está sincronizada con ARCA y detectar baches.

### Criterios de aceptación
- [ ] Ingreso: punto de venta y tipo de comprobante
- [ ] Retorna el último número autorizado según ARCA
- [ ] Si hay diferencia entre el número local y el de ARCA, se muestra un aviso
- [ ] También se puede usar para saber cuál será el próximo número antes de emitir

### Notas técnicas
- `POST /arca/fe/comp/ultimo-autorizado` → `FeCompUltimoAutorizadoFrontendAction`
- SOAP `FECompUltimoAutorizado({ Auth, PtoVta, CbteTipo })`
- El mismo número se usa en `GetNextCbteNumberAction` para la numeración automática al emitir

---

## US-ARCA-11 — Ver el estado del entorno ARCA (admin)

**Como** administrador técnico,  
**quiero** ver un panel consolidado con el estado del certificado, las solicitudes de TA y el TA activo,  
**para** diagnosticar rápidamente cualquier problema de autenticación con ARCA.

### Criterios de aceptación
- [ ] Muestra el último certificado guardado: nombre, entorno, fecha de creación
- [ ] Muestra el último TRA (loginTicketRequest): servicio, generación, expiración
- [ ] Muestra el último TA: generación, expiración, estado (vigente/expirado)
- [ ] Puedo cambiar el entorno consultado (testing/production) desde el panel

### Notas técnicas
- `GET /arca/admin/status` → retorna `{ status, environment, latest_certificate, latest_tra, latest_ta }`
- Parámetro `?env=testing|production`
- Consulta directamente `ArcaCertificate`, `ArcaLoginTicketRequest`, `ArcaLoginTicket`

---

## US-ARCA-12 — Renovación automática del TA expirado (v2.0)

**Como** sistema,  
**quiero** detectar cuando el Ticket de Acceso está por expirar y renovarlo automáticamente,  
**para** que los usuarios nunca reciban un error de "TA expirado" al intentar emitir una factura.

### Criterios de aceptación
- [ ] Un job en queue verifica el estado del TA cada 60 minutos
- [ ] Si el TA vence en menos de 2 horas, el job lo renueva automáticamente
- [ ] Si la renovación falla (WSAA no disponible), se envía una alerta por email al administrador del tenant
- [ ] El usuario nunca ve un error de TA expirado durante el horario laboral normal

### Notas técnicas
- **Mejora v2.0** — actualmente la renovación es 100% manual
- Job `RenewArcaTokenJob` en queue `arca`
- Schedule: `$schedule->job(RenewArcaTokenJob::class)->hourly()`
- La renovación sigue el mismo flujo que `AuthLoginAction`

---

## US-ARCA-13 — Alertas de vencimiento de certificado (v2.0)

**Como** administrador,  
**quiero** recibir una alerta cuando el certificado ARCA de mi empresa esté próximo a vencer,  
**para** tramitar la renovación con tiempo antes de que se interrumpa la facturación electrónica.

### Criterios de aceptación
- [ ] Alerta en la plataforma 60 días antes del vencimiento del certificado
- [ ] Email automático al administrador del tenant 30 días antes del vencimiento
- [ ] En la pantalla de ARCA se muestra el tiempo restante de validez del certificado
- [ ] Si el certificado ya está vencido, aparece un banner rojo en todas las pantallas de facturación

### Notas técnicas
- **Mejora v2.0** — actualmente no hay alerta de vencimiento
- Job `CheckArcaCertificateExpirationJob` en schedule diario
- La fecha de vencimiento se extrae con `openssl_x509_parse()['validTo_time_t']`

---

## US-ARCA-14 — Soporte multi-punto-de-venta (v2.0)

**Como** empresa con múltiples puntos de venta habilitados en ARCA,  
**quiero** seleccionar qué punto de venta usar al emitir cada factura,  
**para** emitir correctamente desde cada sucursal con el número de PtoVta correspondiente.

### Criterios de aceptación
- [ ] Al autorizar una factura, puedo seleccionar el punto de venta de una lista obtenida de ARCA
- [ ] La lista de puntos de venta se obtiene de `FEParamGetPtosVenta` (datos reales de ARCA)
- [ ] El PtoVta seleccionado se guarda en la factura
- [ ] Si el tenant solo tiene un punto de venta, no aparece el selector (se usa automáticamente)

### Notas técnicas
- **Mejora v2.0** — actualmente `PtoVta` es global por `.env` (`ARCA_PTO_VTA=1`)
- Nueva columna en `tenants`: `arca_pto_vta` (integer, default `1`)
- O bien: selector en el UI de emisión con lista de ARCA

---

## US-ARCA-15 — Corregir aislamiento de TA por tenant en multi-tenant (v2.0 - BUG CRÍTICO)

**Como** sistema multi-tenant en producción,  
**quiero** que cada tenant tenga su propio Ticket de Acceso independiente,  
**para** que el CUIT de un tenant nunca sea usado para autorizar facturas de otro tenant.

### Criterios de aceptación
- [ ] El TA de tenant A no es usado por tenant B bajo ninguna circunstancia
- [ ] Si tenant B no tiene TA, recibe un error claro: "Debe autenticarse ante ARCA" — no usa el TA de otro tenant
- [ ] La búsqueda del TA activo siempre filtra por `tenant_id`

### Notas técnicas
- **Bug crítico en v1** — `TokenManager::latestTicket()` tiene comentado `->where('tenant_id', $tenantId)`, lo que hace que todos los tenants compartan el último TA
- Fix: descomentar esa línea. Impacto: en testing con un solo CUIT no hay problema; en producción multi-tenant es un riesgo de mezcla de CUITs
- Verificar también que `saveTaXml()` siempre asocie correctamente el `tenant_id`
