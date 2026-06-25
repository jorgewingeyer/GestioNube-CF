# CF Turborepo Next Hono

Este proyecto es un monorepo Turborepo que integra Next.js (Frontend) y Hono (Backend) sobre Cloudflare Workers/Pages, utilizando **PostgreSQL** mediante **Cloudflare Hyperdrive** y Drizzle ORM.

## Instalación rápida 🚀

Puedes iniciar un nuevo proyecto utilizando nuestro CLI interactivo:

```bash
npx @3lineas/create-cf-stack@latest
```

## Comandos Principales (Raíz)

Estos comandos se ejecutan desde la raíz del proyecto y orquestan tareas en todo el monorepo.

| Comando            | Descripción                                                                    |
| :----------------- | :----------------------------------------------------------------------------- |
| `pnpm dev`         | Inicia el entorno de desarrollo local para todas las aplicaciones (Web + API). |
| `pnpm build`       | Construye todas las aplicaciones y paquetes para producción.                   |
| `pnpm lint`        | Ejecuta el linter en todos los paquetes.                                       |
| `pnpm format`      | Formatea el código de todo el proyecto usando Prettier.                        |
| `pnpm check-types` | Verifica los tipos de TypeScript en todo el proyecto.                          |

## Configuración de Base de Datos (PostgreSQL) 🐘

El proyecto ha sido migrado de D1 a PostgreSQL para mayor escalabilidad.

### Entorno Local

Para conectar la API a tu base de datos local:

1. Crea un archivo `.dev.vars` en `apps/api/` (puedes usar `.dev.vars.example` como base).
2. Define las variables de conexión:
   ```env
   DATABASE_URL=postgres://usuario:contraseña@127.0.0.1:5432/nombre_db
   CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgres://usuario:contraseña@127.0.0.1:5432/nombre_db
   ```
   _Nota: La segunda variable es requerida por Wrangler para emular Hyperdrive localmente._
3. Wrangler cargará automáticamente estas variables al ejecutar `pnpm dev`.

### Producción (Hyperdrive)

En producción, la conexión se gestiona a través de **Cloudflare Hyperdrive** para optimizar el pool de conexiones:

1. Asegúrate de tener configurado el binding `[[hyperdrive]]` en `apps/api/wrangler.toml`.
2. El sistema utilizará automáticamente `env.HYPERDRIVE.connectionString`.

## Gestión de Base de Datos (Drizzle)

Comandos para gestionar la base de datos PostgreSQL.

| Comando               | Descripción                                                                                          |
| :-------------------- | :--------------------------------------------------------------------------------------------------- |
| `pnpm db:generate`    | Genera los archivos de migración SQL basados en los cambios del esquema Drizzle (`apps/api/src/db`). |
| `pnpm migrate:local`  | Aplica las migraciones pendientes a la base de datos PostgreSQL **local**.                           |
| `pnpm migrate:remote` | Aplica las migraciones pendientes a la base de datos PostgreSQL **remota (producción)**.             |
| `pnpm db:studio`      | Abre Drizzle Studio para visualizar y editar la base de datos localmente.                            |

## Comandos Específicos por Aplicación

Aunque se recomienda usar los comandos raíz, aquí están los comandos específicos disponibles en cada paquete.

### Frontend (`apps/web`)

Desarrollado con Next.js 16 y desplegado en Cloudflare Workers via OpenNext.

- `pnpm --filter web dev`: Inicia solo el frontend en modo desarrollo.
- `pnpm --filter web build`: Construye la aplicación Next.js.
- `pnpm --filter web deploy`: Despliega la aplicación a Cloudflare Workers.
- `pnpm --filter web preview`: Genera una vista previa del despliegue.
- `pnpm --filter web cf-typegen`: Genera los tipos para las variables de entorno de Cloudflare.

### Backend (`apps/api`)

API REST desarrollada con Hono y desplegada en Cloudflare Workers. Incluye la configuración y esquemas de la base de datos (Drizzle).

- `pnpm --filter @repo/api dev`: Inicia solo la API en modo desarrollo con Wrangler.
- `pnpm --filter @repo/api deploy`: Despliega la API a Cloudflare Workers.

## Estructura del Proyecto

- **apps/web**: Aplicación Next.js 16 (App Router, Tailwind CSS, Shadcn UI). Consume Hono RPC mediante Cloudflare Service Bindings.
- **apps/api**: API Server (Hono) y Capa de Datos (Drizzle ORM).
- **packages/typescript-config**: Configuraciones de TypeScript compartidas.
- **packages/ui**: Componentes base de UI (Shadcn).

## Gestión de Componentes UI (shadcn/ui)

Los componentes de UI se encuentran centralizados en el paquete `packages/ui`. Para agregar un nuevo componente desde la raíz del proyecto:

```bash
pnpm ui:add [nombre-del-componente]
```

Ejemplo:

```bash
pnpm ui:add button
```

El componente se agregará en `packages/ui/src/components` y estará disponible para usar en `apps/web` importándolo desde `@repo/ui/components/[nombre]`.

## Flujo de Trabajo Recomendado

1.  **Desarrollo**: Ejecuta `pnpm dev` para levantar todo el entorno.
2.  **Cambios en DB**:
    - Modifica el esquema en `apps/api/src/db/schema.ts`.
    - Ejecuta `pnpm db:generate` para crear la migración.
    - Ejecuta `pnpm migrate:local` para aplicar cambios localmente.
3.  **Despliegue**:
    - Ejecuta `pnpm migrate:remote` para actualizar la BD de producción.
    - Ejecuta `pnpm build` y luego los comandos de deploy específicos si no tienes CI/CD configurado.

## Créditos 👨‍💻

Desarrollado por **Diego Nelson** para [3 Lineas](https://3lineas.com).
