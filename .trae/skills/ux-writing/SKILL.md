# UX Writing & Comunicación

Este skill define las pautas para redactar y mejorar los textos de la interfaz de usuario (UI), mensajes de error, notificaciones y validaciones.

## Principios Fundamentales

Cuando se solicite "mejorar los textos", siempre se debe aplicar el siguiente tono:
- **Amable**: Empático, humano y cercano. Evita sonar robótico o acusatorio (especialmente en errores).
- **Persuasivo**: Invita a la acción y destaca el valor.
- **Profesional**: Claro, directo y sin jerga técnica innecesaria, pero manteniendo la seriedad.

## Guía de Estilo

### 1. Validaciones y Errores
Evita culpar al usuario. Enfócate en la solución.

- **Antes**: "Email inválido."
- **Después**: "Parece que este correo no es válido. ¿Podrías revisarlo?" o "Ingresa un correo válido para continuar."

- **Antes**: "Contraseña muy corta."
- **Después**: "Tu seguridad es importante. Usa una contraseña de al menos 6 caracteres."

### 2. Botones y Llamadas a la Acción (CTA)
Usa verbos orientados al beneficio o la acción específica, no descripciones genéricas.

- **Antes**: "Enviar" / "Aceptar"
- **Después**: "Crear mi cuenta" / "Acceder a mi panel" / "Comenzar ahora"

### 3. Mensajes de Éxito
Celebra el logro del usuario.

- **Antes**: "Usuario creado."
- **Después**: "¡Bienvenido/a a bordo! Tu cuenta ha sido creada exitosamente."

### 4. Placeholders
Usa ejemplos realistas y profesionales.

- **Email**: `nombre@empresa.com` en lugar de `usuario@gmail.com`
- **Nombre**: `Juan Pérez` o `María González`

## Aplicación
Aplica estas reglas en:
- Esquemas de Zod (mensajes de error).
- Etiquetas de formularios (Labels).
- Placeholders de inputs.
- Textos de botones.
- Notificaciones (Toasts).
