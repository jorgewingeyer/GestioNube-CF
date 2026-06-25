# Módulo 2 — Multi-Tenant y Sucursales

## Descripción
Implementación del sistema multi-tenant con soporte para sucursales, gestión de permisos y configuración de empresa.

**Epic:** GNCF-2  
**Fecha inicio:** 2026-06-25

---

## Actividades y Ramas

| # | Issue | Rama | Descripción |
|---|-------|------|-------------|
| 1 | [GNCF-128](https://3lineas.atlassian.net/browse/GNCF-128) | `modulo-2/GNCF-128-ver-info-empresa` | Ver información de mi empresa |
| 2 | [GNCF-133](https://3lineas.atlassian.net/browse/GNCF-133) | `modulo-2/GNCF-133-editar-info-empresa` | Editar información de mi empresa |
| 3 | [GNCF-142](https://3lineas.atlassian.net/browse/GNCF-142) | `modulo-2/GNCF-142-actualizar-logo` | Actualizar el logo de mi empresa |
| 4 | [GNCF-152](https://3lineas.atlassian.net/browse/GNCF-152) | `modulo-2/GNCF-152-config-iva-preferida` | Configurar alícuota de IVA preferida |
| 5 | [GNCF-159](https://3lineas.atlassian.net/browse/GNCF-159) | `modulo-2/GNCF-159-crear-sucursal` | Crear una sucursal |
| 6 | [GNCF-168](https://3lineas.atlassian.net/browse/GNCF-168) | `modulo-2/GNCF-168-editar-sucursal` | Editar una sucursal existente |
| 7 | [GNCF-172](https://3lineas.atlassian.net/browse/GNCF-172) | `modulo-2/GNCF-172-eliminar-sucursal` | Eliminar una sucursal |
| 8 | [GNCF-178](https://3lineas.atlassian.net/browse/GNCF-178) | `modulo-2/GNCF-178-cambiar-sucursal` | Cambiar de sucursal activa |
| 9 | [GNCF-185](https://3lineas.atlassian.net/browse/GNCF-185) | `modulo-2/GNCF-185-visibilidad-cruzada` | Ver datos de múltiples sucursales (visibilidad cruzada) |
| 10 | [GNCF-191](https://3lineas.atlassian.net/browse/GNCF-191) | `modulo-2/GNCF-191-config-permisos` | Configurar permisos de un rol |
| 11 | [GNCF-198](https://3lineas.atlassian.net/browse/GNCF-198) | `modulo-2/GNCF-198-features-plan` | Ver features disponibles según mi plan (v2.0) |
| 12 | [GNCF-204](https://3lineas.atlassian.net/browse/GNCF-204) | `modulo-2/GNCF-204-conectar-shop` | Conectar con GestioNube Shop (v2.0) |
| 13 | [GNCF-211](https://3lineas.atlassian.net/browse/GNCF-211) | `modulo-2/GNCF-211-config-idioma-pais` | Configurar el idioma y país de la empresa (v2.0) |
| 14 | [GNCF-219](https://3lineas.atlassian.net/browse/GNCF-219) | `modulo-2/GNCF-219-limites-uso` | Ver y respetar los límites de uso según el plan (v2.0) |

---

## Convención de Ramas

```
modulo-2/GNCF-XXX-slug-descriptivo
```

**Ejemplo:** `modulo-2/GNCF-128-ver-info-empresa`

### Estructura
- **modulo-2/**: Prefijo para identificar que pertenece al Módulo 2
- **GNCF-XXX**: Número de issue en Jira
- **slug-descriptivo**: Descripción corta en kebab-case del trabajo

---

## Flujo de Trabajo

1. **Crear rama**: `git checkout -b modulo-2/GNCF-XXX-slug-descriptivo`
2. **Desarrollar**: Realizar los cambios necesarios
3. **Commit**: Usar convención `GNCF-XXX: descripción corta`
4. **Push**: `git push origin modulo-2/GNCF-XXX-slug-descriptivo`
5. **PR**: Crear PR hacia `dev` o `main` según sea necesario

---

## Estado de Actividades

- [ ] GNCF-128: Ver información de mi empresa
- [ ] GNCF-133: Editar información de mi empresa
- [ ] GNCF-142: Actualizar el logo de mi empresa
- [ ] GNCF-152: Configurar alícuota de IVA preferida
- [ ] GNCF-159: Crear una sucursal
- [ ] GNCF-168: Editar una sucursal existente
- [ ] GNCF-172: Eliminar una sucursal
- [ ] GNCF-178: Cambiar de sucursal activa
- [ ] GNCF-185: Ver datos de múltiples sucursales
- [ ] GNCF-191: Configurar permisos de un rol
- [ ] GNCF-198: Ver features disponibles según mi plan
- [ ] GNCF-204: Conectar con GestioNube Shop
- [ ] GNCF-211: Configurar idioma y país
- [ ] GNCF-219: Ver y respetar límites de uso

---

## Notas

- Las actividades 11, 12, 13, 14 son v2.0 (pueden requerirse en fases posteriores)
- Algunas actividades tienen dependencias entre sí (verificar en Jira)
- Mantener el README actualizado con el progreso del módulo
