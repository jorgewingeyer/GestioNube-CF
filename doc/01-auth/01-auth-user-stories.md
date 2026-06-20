# Historias de Usuario — Módulo 01: Autenticación (Auth)

> **Módulo:** 01-auth  
> **Fase:** 1 — Fundación  
> **Formato:** Como [rol], quiero [acción] para [beneficio]

---

## US-AUTH-01 — Registro de nueva cuenta

**Como** dueño o administrador de una PYME,  
**quiero** registrarme con mi nombre, email y contraseña,  
**para** crear mi empresa en GestioNube y comenzar a gestionar mi negocio sin intervención manual de soporte.

### Criterios de aceptación
- [ ] El formulario solicita: nombre completo, email y contraseña (con confirmación)
- [ ] El email debe ser único en el sistema; si ya existe, mostrar error claro
- [ ] La contraseña debe tener mínimo 6 caracteres
- [ ] Al completar el registro exitosamente, se crea automáticamente:
  - Un usuario con rol administrador
  - Una empresa (Tenant) con el nombre "Empresa de {nombre}"
  - Las alícuotas de IVA configuradas (10.5%, 21%, 27%)
  - Un rol "admin" con todos los permisos asignados
- [ ] El usuario queda autenticado inmediatamente después del registro
- [ ] Se redirige al dashboard de la aplicación
- [ ] Si ocurre un error en cualquier paso, toda la operación se revierte (no quedan datos parciales)

### Notas técnicas
- Pipeline de 7 pasos en transacción DB atómica
- Tablas afectadas: `users`, `tenants`, `tenant_user`, `tax_tenant`, `roles`, `role_user`, `permission_role`

---

## US-AUTH-02 — Inicio de sesión

**Como** usuario registrado,  
**quiero** ingresar con mi email y contraseña,  
**para** acceder al sistema y continuar trabajando en mi empresa.

### Criterios de aceptación
- [ ] El formulario solicita email y contraseña
- [ ] Si las credenciales son incorrectas, mostrar mensaje de error sin revelar cuál campo falló
- [ ] Después de 5 intentos fallidos desde la misma IP y email, bloquear temporalmente el acceso e informar cuántos minutos restan
- [ ] Al ingresar exitosamente, establecer la empresa activa (último tenant utilizado o el primero asignado)
- [ ] Opción "Recordarme" para mantener la sesión activa en el dispositivo
- [ ] Redirigir a la página que el usuario intentaba acceder antes del login, o al dashboard si es acceso directo
- [ ] El evento de login queda registrado en el log de actividad

### Notas técnicas
- Rate limiting: 5 intentos por `email + IP`
- Tablas afectadas: `users` (lectura), `sessions` (escritura)

---

## US-AUTH-03 — Cierre de sesión

**Como** usuario autenticado,  
**quiero** cerrar mi sesión de forma segura,  
**para** proteger mi cuenta en dispositivos compartidos o al terminar mi jornada.

### Criterios de aceptación
- [ ] El botón de logout está accesible desde cualquier pantalla (menú de usuario en el header)
- [ ] Al cerrar sesión, la sesión del servidor se invalida completamente
- [ ] El historial de navegación de la sesión se limpia para que no queden datos sensibles accesibles con el botón "atrás" del browser
- [ ] Se redirige a la pantalla de login
- [ ] El evento de logout queda registrado en el log de actividad

### Notas técnicas
- `Inertia::clearHistory()` limpia el historial encriptado del browser
- Tablas afectadas: `sessions` (invalidar/eliminar)

---

## US-AUTH-04 — Recuperación de contraseña olvidada

**Como** usuario que olvidó su contraseña,  
**quiero** recibir un enlace por email para resetearla,  
**para** recuperar el acceso a mi cuenta sin necesitar soporte técnico.

### Criterios de aceptación
- [ ] La pantalla de login tiene un enlace visible "¿Olvidaste tu contraseña?"
- [ ] El formulario solicita únicamente el email
- [ ] Si el email existe, se envía un enlace de reseteo con token temporal
- [ ] Si el email no existe, mostrar el mismo mensaje de éxito (no revelar si el email está registrado)
- [ ] El enlace es válido por un tiempo limitado (configurable, default 60 minutos)
- [ ] Al hacer clic en el enlace, se muestra un formulario para ingresar la nueva contraseña (con confirmación)
- [ ] La nueva contraseña debe cumplir las reglas de seguridad de Laravel Password defaults
- [ ] Tras resetear exitosamente, redirigir al login con mensaje de éxito

### Notas técnicas
- Tablas afectadas: `password_reset_tokens` (escritura/lectura/eliminación)
- El token se elimina automáticamente al usarse

---

## US-AUTH-05 — Editar información personal del perfil

**Como** usuario autenticado,  
**quiero** actualizar mi nombre, email, teléfono y DNI desde mi perfil,  
**para** mantener mis datos personales actualizados en el sistema.

### Criterios de aceptación
- [ ] La página de perfil muestra los datos actuales del usuario
- [ ] Se pueden editar: nombre, email, teléfono y DNI
- [ ] El email nuevo debe seguir siendo único en el sistema
- [ ] Los cambios se guardan con confirmación visual (toast/mensaje de éxito)
- [ ] Si el email cambia, se actualiza en todas las referencias del sistema

### Notas técnicas
- Ruta: `PUT /account/{user}`
- Tablas afectadas: `users`

---

## US-AUTH-06 — Cambiar contraseña desde el perfil

**Como** usuario autenticado,  
**quiero** cambiar mi contraseña desde el perfil,  
**para** mantener la seguridad de mi cuenta sin necesitar hacer logout.

### Criterios de aceptación
- [ ] El formulario solicita: contraseña actual, nueva contraseña y confirmación
- [ ] Si la contraseña actual no coincide, mostrar error específico
- [ ] La nueva contraseña debe cumplir las reglas mínimas (min. 6 caracteres)
- [ ] Tras el cambio exitoso, mostrar confirmación sin cerrar la sesión activa

### Notas técnicas
- Ruta: `PUT /account/{user}/password`
- Tablas afectadas: `users` (campo `password`)

---

## US-AUTH-07 — Actualizar avatar de perfil

**Como** usuario autenticado,  
**quiero** subir una foto de perfil,  
**para** personalizar mi cuenta y ser reconocible dentro del equipo.

### Criterios de aceptación
- [ ] El perfil muestra el avatar actual (o uno predeterminado si no tiene)
- [ ] Se puede subir una imagen desde el dispositivo (formatos: JPG, PNG, WEBP)
- [ ] La imagen se convierte automáticamente a formato WebP al guardarse
- [ ] El avatar se almacena en Cloudflare R2 y se muestra via URL pública
- [ ] Si no hay avatar configurado, se muestra un avatar predeterminado del sistema

### Notas técnicas
- Ruta: `POST /account/{user}/avatar`
- Almacenamiento: Cloudflare R2, campo `users.avatar_url`

---

## US-AUTH-08 — Eliminar cuenta propia

**Como** usuario autenticado,  
**quiero** poder eliminar mi cuenta,  
**para** ejercer mi derecho a la cancelación y que mis datos sean removidos del sistema.

### Criterios de aceptación
- [ ] La opción de eliminar cuenta está en el perfil pero con fricción (confirmación explícita)
- [ ] Se solicita confirmación antes de proceder (mensaje de advertencia sobre pérdida de datos)
- [ ] Tras la eliminación, se cierra la sesión automáticamente
- [ ] Se redirige al login con mensaje de confirmación
- [ ] La eliminación es lógica (soft delete), no física, para mantener integridad referencial

### Notas técnicas
- Ruta: `DELETE /account/{user}`
- Tablas afectadas: `users` (columna `deleted_at`)

---

## US-AUTH-09 — Acceso denegado a rutas protegidas (no autenticado)

**Como** visitante no autenticado,  
**quiero** ser redirigido al login si intento acceder a una sección protegida,  
**para** entender que necesito autenticarme antes de continuar.

### Criterios de aceptación
- [ ] Cualquier ruta protegida redirige al login si el usuario no está autenticado
- [ ] Después del login exitoso, se redirige a la página que se intentó acceder originalmente
- [ ] Las rutas de auth (login, register, etc.) no son accesibles para usuarios ya autenticados

### Notas técnicas
- Middleware `auth` en rutas protegidas
- `redirect()->intended(route('dashboard'))` preserva la URL original

---

## US-AUTH-10 — Ver notificaciones del sistema (v2.0)

**Como** usuario autenticado,  
**quiero** ver mis notificaciones del sistema en tiempo real,  
**para** estar al tanto de eventos importantes (facturas vencidas, stock crítico, pagos recibidos) sin tener que navegar por el sistema.

### Criterios de aceptación
- [ ] El header muestra un ícono de campana con el contador de notificaciones no leídas
- [ ] Al hacer clic se despliega un panel con las últimas 5 notificaciones
- [ ] Las notificaciones no leídas se distinguen visualmente
- [ ] Se puede marcar una notificación como leída al hacer clic en ella
- [ ] Las notificaciones incluyen: tipo de evento, descripción breve y timestamp

### Notas técnicas
- Tabla: `notifications` (uuid como PK, notifiable_type/id para polimorfismo)
- Datos disponibles en Inertia shared props: `auth_notifications.latest` y `auth_notifications.unreadCount`

---

## US-AUTH-11 — Autenticación de dos factores (v2.0)

**Como** usuario con datos financieros sensibles,  
**quiero** activar la verificación en dos pasos (2FA),  
**para** proteger mi cuenta incluso si alguien obtiene mi contraseña.

### Criterios de aceptación
- [ ] En el perfil, opción para activar/desactivar 2FA
- [ ] Al activar: se muestra código QR para escanear con Google Authenticator / Authy
- [ ] Se generan 8 códigos de respaldo (backup codes) para usar si se pierde el dispositivo
- [ ] En el próximo login, después de email/password, se solicita el código TOTP de 6 dígitos
- [ ] Si el usuario usa un backup code, este se invalida para uso futuro
- [ ] El administrador puede desactivar el 2FA de un usuario desde el panel de usuarios (en caso de pérdida)

### Notas técnicas
- **Nuevo en v2.0** — no existe en Laravel actual
- Nueva tabla requerida: `user_two_factor` (user_id, secret, recovery_codes, confirmed_at)
- Biblioteca Node.js: `otpauth`

---

## US-AUTH-13 — Verificación de email obligatoria al registrarse (v2.0)

**Como** sistema GestioNube,  
**quiero** que los usuarios verifiquen su email antes de acceder a la aplicación,  
**para** garantizar que el email de contacto es válido y reducir cuentas basura.

### Criterios de aceptación
- [ ] Al registrarse, se envía automáticamente un email con enlace de verificación (token firmado, válido 24h)
- [ ] Hasta verificar el email, el usuario accede únicamente a una pantalla de "Verificá tu email" — el resto de rutas están bloqueadas
- [ ] El enlace de verificación puede reenviarse desde esa pantalla (máximo 3 reenvíos por hora)
- [ ] Al hacer clic en el enlace válido, `email_verified_at` se registra y el usuario ingresa al sistema normalmente
- [ ] Al cambiar el email desde el perfil, se requiere reverificar el nuevo email antes de que tome efecto

### Notas técnicas
- **Nuevo en v2.0** — el campo `users.email_verified_at` ya existe pero la verificación está deshabilitada (interfaz `MustVerifyEmail` comentada en el modelo)
- Solo hace falta activar la interfaz + agregar el middleware `verified` en las rutas protegidas

---

## US-AUTH-14 — Ver y cerrar sesiones activas desde el perfil (v2.0)

**Como** usuario preocupado por la seguridad de mi cuenta,  
**quiero** ver todos los dispositivos donde mi sesión está activa y poder cerrarlas remotamente,  
**para** proteger mi cuenta si detecto accesos no autorizados.

### Criterios de aceptación
- [ ] En "Mi Perfil > Seguridad", listado de sesiones activas con: tipo de dispositivo (parseado del user_agent), IP y fecha de último acceso
- [ ] La sesión actual está marcada con un badge "Esta sesión"
- [ ] Botón "Cerrar sesión" disponible en cada sesión excepto la activa
- [ ] Botón "Cerrar todas las demás sesiones" para revocar todas en un click
- [ ] Al cerrar una sesión, ese dispositivo es redirigido al login en su próximo request

### Notas técnicas
- **Nuevo en v2.0** — la tabla `sessions` ya contiene `ip_address`, `user_agent`, `last_activity` y `user_id`; solo hace falta la UI y el endpoint de revocación
- Parsear el `user_agent` para mostrar "Chrome en Windows" en vez del string completo

---

## US-AUTH-15 — Alerta de login desde dispositivo nuevo (v2.0)

**Como** usuario de GestioNube,  
**quiero** recibir un email automático cuando se inicia sesión en mi cuenta desde un dispositivo o ubicación no reconocida,  
**para** detectar accesos no autorizados aunque no tenga 2FA activado.

### Criterios de aceptación
- [ ] Al hacer login desde una IP o user_agent nunca visto para ese usuario, se envía email de alerta inmediato
- [ ] El email muestra: fecha/hora, tipo de dispositivo, ubicación aproximada (ciudad, país) e IP
- [ ] El email incluye un botón "No fui yo — Asegurar mi cuenta" que revoca todas las sesiones excepto la del dispositivo que está pidiendo ayuda
- [ ] El usuario puede desactivar esta notificación desde su perfil (opt-out)
- [ ] Si el usuario tiene 2FA activo, no se envía esta alerta (el 2FA ya es protección suficiente)

### Notas técnicas
- **Nuevo en v2.0** — comparar `ip_address` + `user_agent` contra historial de `sessions` o nueva tabla `login_history`
- Cloudflare Workers provee geolocalización nativa en `request.cf.city` y `request.cf.country` sin librerías adicionales

---

## US-AUTH-16 — Onboarding wizard post-registro asistido por IA (v2.0)

**Como** dueño de PYME que acaba de crear su cuenta,  
**quiero** un asistente paso a paso que me guíe para configurar mi empresa,  
**para** llegar al primer "momento de valor" (emitir una factura o agregar un producto) en menos de 10 minutos sin necesitar capacitación.

### Criterios de aceptación
- [ ] Después del registro, en vez del dashboard vacío, se muestra un wizard de 4 pasos con barra de progreso
- [ ] **Paso 1 — Mi empresa:** completar nombre, CUIT, condición IVA y logo (con búsqueda automática por CUIT en AFIP para autocompletar)
- [ ] **Paso 2 — Mi primer producto:** agregar al menos 1 producto; la IA puede sugerir descripción, categoría y precio basándose en el nombre
- [ ] **Paso 3 — Punto de venta (opcional):** ¿facturás electrónicamente? → flujo de configuración ARCA/AFIP
- [ ] **Paso 4 — Mi equipo (opcional):** invitar miembros por email con rol predefinido
- [ ] Cada paso puede omitirse con "Configurar después"; el wizard vuelve a aparecer en el dashboard hasta completarse
- [ ] Una vez completado el 100%, el wizard desaparece permanentemente para ese tenant

### Notas técnicas
- **Nuevo en v2.0** — detectar tenant "nuevo": sin productos, sin facturas, sin `onboarding_completed_at`
- Nueva columna sugerida: `tenants.onboarding_completed_at`
- El wizard se coordina con el módulo de tenant (Paso 1) y de productos (Paso 2)

---

## US-AUTH-12 — Login con Google (v2.0)

**Como** nuevo usuario que usa Google Workspace,  
**quiero** registrarme e ingresar con mi cuenta de Google,  
**para** no tener que crear y recordar una contraseña adicional.

### Criterios de aceptación
- [ ] En la pantalla de login y registro, botón "Continuar con Google"
- [ ] Al autenticarse con Google por primera vez, se ejecuta el mismo pipeline de registro (crear empresa, rol admin, etc.)
- [ ] En logins subsiguientes, Google autentica directamente sin pipeline de creación
- [ ] Si el email de Google ya existe en el sistema (registrado con contraseña), se vinculan las cuentas con confirmación del usuario

### Notas técnicas
- **Nuevo en v2.0** — no existe en Laravel actual
- NextAuth v5 con Google OAuth provider
- Nueva tabla requerida: `accounts` (NextAuth standard: provider, providerAccountId, user_id)
