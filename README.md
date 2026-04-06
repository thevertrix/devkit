# DevKit

Local dev environment manager — SSL, custom domains, versioned services & runtimes

## Características

- 🔒 SSL automático para dominios `.test`
- 🌐 Dominios personalizados locales
- 📧 Servidor de correo de prueba (Mailpit)
- 🐳 Gestión de servicios Docker (MySQL, PostgreSQL, Redis)
- 🔧 Runtimes con versiones (PHP, Node.js, Python)
- 📦 Soporte para múltiples frameworks
- 🎯 Versiones personalizables de servicios y runtimes

## Instalación

```bash
npm install -g devkit
```

## Comandos

### `devkit doctor`

Verifica que todas las dependencias estén instaladas correctamente.

```bash
devkit doctor
```

### `devkit setup`

Instala y configura todas las dependencias automáticamente.

```bash
devkit setup
devkit setup --php  # Incluir PHP en la instalación
```

### `devkit new <nombre>`

Crea un nuevo proyecto con dominio `.test` y SSL.

```bash
devkit new mi-proyecto
devkit new mi-app --next        # Proyecto Next.js
devkit new mi-api --nestjs      # Proyecto NestJS
devkit new mi-sitio --laravel   # Proyecto Laravel
```

**Opciones:**
- `-p, --port <puerto>` - Puerto local del servidor (default: 3000)
- `--php` - Crear un esqueleto básico de PHP
- `--laravel` - Crear un proyecto de Laravel (requiere composer)
- `--next` - Crear un proyecto de Next.js
- `--nuxt` - Crear un proyecto de Nuxt.js
- `--angular` - Crear un proyecto de Angular
- `--nestjs` - Crear un proyecto de NestJS
- `--astro` - Crear un proyecto de Astro
- `--svelte` - Crear un proyecto de SvelteKit

### `devkit start`

Levanta el proyecto y los servicios en Docker si los requiere.

```bash
# Sin servicios adicionales
devkit start

# Con servicios específicos usando versiones por defecto
devkit start --mysql --redis

# Especificando versiones personalizadas de servicios
devkit start --mysql=8.0 --postgres=15 --redis=7

# Con runtimes en contenedores
devkit start --php=8.3 --node=20

# Combinando servicios y runtimes
devkit start --mysql=8.0 --php=8.3 --node=20 --mailpit
```

**Opciones de Servicios:**
- `--mysql [version]` - Agrega MySQL (ej: `--mysql=8.0`, `--mysql=5.7`)
- `--postgres [version]` - Agrega PostgreSQL (ej: `--postgres=16`, `--postgres=15`)
- `--redis [version]` - Agrega Redis (ej: `--redis=7`, `--redis=6`)
- `--mailpit [version]` - Agrega Mailpit (ej: `--mailpit=latest`, `--mailpit`)

**Opciones de Runtimes:**
- `--php [version]` - Agrega PHP en contenedor (ej: `--php=8.3`, `--php=7.4`)
- `--node [version]` - Agrega Node.js en contenedor (ej: `--node=20`, `--node=18`)
- `--python [version]` - Agrega Python en contenedor (ej: `--python=3.12`, `--python=3.11`)
- `--postgres [version]` - Agrega PostgreSQL (ej: `--postgres=16`, `--postgres=15`)
- `--redis [version]` - Agrega Redis (ej: `--redis=7`, `--redis=6`)
- `--mailpit [version]` - Agrega Mailpit (ej: `--mailpit=latest`, `--mailpit`)

**Opciones de Runtimes:**
- `--php [version]` - Agrega PHP en contenedor (ej: `--php=8.3`, `--php=7.4`)
- `--node [version]` - Agrega Node.js en contenedor (ej: `--node=20`, `--node=18`)
- `--python [version]` - Agrega Python en contenedor (ej: `--python=3.12`, `--python=3.11`)

**Versiones disponibles:**

*Servicios:*
- **MySQL**: `8.0`, `8.4`, `5.7`, etc.
- **PostgreSQL**: `16`, `15`, `14`, `13`, etc.
- **Redis**: `7`, `6`, `5`, etc.
- **Mailpit**: `latest` o versión específica

*Runtimes:*
- **PHP**: `8.3`, `8.2`, `8.1`, `7.4`, etc.
- **Node.js**: `20`, `18`, `16`, `14`, etc.
- **Python**: `3.12`, `3.11`, `3.10`, `3.9`, etc.

### `devkit stop`

Detiene servicios. Sin flags detiene todo el entorno.

```bash
# Detener todos los servicios
devkit stop

# Detener servicios específicos
devkit stop --mysql
devkit stop --postgres --redis
```

**Opciones:**
- `--mysql` - Detener solo MySQL
- `--postgres` - Detener solo PostgreSQL
- `--redis` - Detener solo Redis
- `--mailpit` - Detener solo Mailpit

### `devkit list`

Lista todos los proyectos configurados.

```bash
devkit list
```

### `devkit mail`

Abre Mailpit en el navegador para ver los correos de prueba.

```bash
devkit mail
```

### `devkit services`

Gestiona las versiones por defecto de los servicios y runtimes.

```bash
# Ver versiones por defecto actuales
devkit services --list

# Configurar versiones de forma interactiva
devkit services --set

# Configurar versiones específicas de servicios
devkit services --set --mysql=8.0 --postgres=16

# Configurar versiones específicas de runtimes
devkit services --set --php=8.3 --node=20 --python=3.12
```

**Opciones de Servicios:**
- `--mysql <version>` - Establece la versión por defecto de MySQL
- `--postgres <version>` - Establece la versión por defecto de PostgreSQL
- `--redis <version>` - Establece la versión por defecto de Redis
- `--mailpit <version>` - Establece la versión por defecto de Mailpit

**Opciones de Runtimes:**
- `--php <version>` - Establece la versión por defecto de PHP
- `--node <version>` - Establece la versión por defecto de Node.js
- `--python <version>` - Establece la versión por defecto de Python
- `--go <version>` - Establece la versión por defecto de Go

## Gestión de Versiones

DevKit permite gestionar versiones de servicios y runtimes de tres formas:

### 1. Versiones por Defecto Globales

Configura las versiones que se usarán cuando no especifiques una versión:

```bash
# Ver versiones actuales (servicios y runtimes)
devkit services --list

# Configurar interactivamente
devkit services --set

# Configurar directamente servicios
devkit services --set --mysql=8.0 --postgres=16 --redis=7

# Configurar directamente runtimes
devkit services --set --php=8.3 --node=20 --python=3.12
```

### 2. Versiones Específicas por Proyecto

Al ejecutar `devkit start`, especifica la versión que necesita tu proyecto:

```bash
# Proyecto con MySQL 5.7, PHP 7.4 y Redis 6 (legacy)
devkit start --mysql=5.7 --php=7.4 --redis=6

# Proyecto moderno con PostgreSQL 16 y Node.js 20
devkit start --postgres=16 --node=20

# Proyecto Python con PostgreSQL
devkit start --python=3.12 --postgres=15
```

Las versiones se guardan en la configuración del proyecto y se usan automáticamente en futuros `start`.

### 3. Versiones en docker-compose.yml

Si ya tienes un `docker-compose.yml` en tu proyecto, devkit lo respetará y no generará uno nuevo. Puedes especificar las versiones directamente en ese archivo.

## Ejemplos de Uso

### Proyecto Laravel Legacy con PHP 7.4

```bash
devkit new mi-laravel --laravel
cd mi-laravel
devkit start --mysql=5.7 --php=7.4 --mailpit
```

### Proyecto Laravel Moderno con PHP 8.3

```bash
devkit new mi-laravel --laravel
cd mi-laravel
devkit start --mysql=8.0 --php=8.3 --redis=7 --mailpit
```

### Proyecto Next.js con PostgreSQL

```bash
devkit new mi-nextjs --next
cd mi-nextjs
devkit start --postgres=15 --node=20 --redis=7
```

### API Python con FastAPI

```bash
devkit new mi-api-python
cd mi-api-python
devkit start --python=3.12 --postgres=16 --redis=7
```

### Proyecto Laravel con MySQL 8.0

```bash
devkit new mi-laravel --laravel
cd mi-laravel
devkit start --mysql=8.0 --php=8.3 --mailpit
```

### Proyecto Next.js con PostgreSQL y Node.js 20

```bash
devkit new mi-nextjs --next
cd mi-nextjs
devkit start --postgres=15 --node=20 --redis=7
```

### API NestJS con servicios completos

```bash
devkit new mi-api --nestjs
cd mi-api
devkit start --mysql=8.0 --postgres=16 --node=20 --redis=7 --mailpit
```

## Configuración

DevKit almacena la configuración en `~/.config/devkit/`. Incluye:

- Proyectos registrados
- Versiones por defecto de servicios (MySQL, PostgreSQL, Redis, Mailpit)
- Versiones por defecto de runtimes (PHP, Node.js, Python, Go)
- Configuración de Caddy (proxy)
- Puertos de servicios

## Requisitos

- Node.js 18+
- Docker Desktop
- Caddy (se instala con `devkit setup`)
- Composer (opcional, para proyectos Laravel)

## Soporte de Frameworks

DevKit detecta automáticamente y configura:

- Laravel
- Next.js
- Nuxt.js
- Angular
- NestJS
- Astro
- SvelteKit
- Proyectos PHP básicos

## Solución de Problemas

### Los servicios no se levantan

```bash
# Verifica que Docker esté corriendo
docker ps

# Revisa los logs de Docker Compose
cd tu-proyecto
docker compose logs
```

### El dominio .test no funciona

```bash
# Verifica la configuración
devkit doctor

# Reconfigura el sistema
devkit setup
```

### Cambiar versión de un servicio existente

1. Detén los servicios: `devkit stop`
2. Edita `docker-compose.yml` y cambia la versión en la imagen
3. Levanta de nuevo: `docker compose up -d`

O elimina `docker-compose.yml` y vuelve a ejecutar `devkit start` con la versión deseada.

## Licencia

MIT
