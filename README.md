# devkit

Local dev environment manager — SSL automático, dominios `.test`, servicios Docker y runtimes sin instalar nada localmente.

## Cómo funciona

devkit es un **binario standalone** — no requiere Node.js, PHP, Python ni Composer en el host. Todo lo que tu proyecto necesita corre en contenedores Docker. devkit se encarga del proxy (Caddy), los certificados SSL (mkcert) y los dominios `.test`.

```
devkit new mi-app --laravel
→  dominio:    https://mi-app.test  (SSL automático)
→  PHP:        contenedor php:8.3-cli
→  MySQL:      contenedor mysql:8.0
→  Mail:       contenedor mailpit
→  host:       sin instalar nada
```

## Instalación

### macOS (Apple Silicon)
```bash
curl -fsSL https://github.com/thevertrix/devkit/releases/latest/download/devkit-macos-arm64 -o devkit
chmod +x devkit && sudo mv devkit /usr/local/bin/devkit
devkit setup
source ~/.zshrc
```

### macOS (Intel)
```bash
curl -fsSL https://github.com/thevertrix/devkit/releases/latest/download/devkit-macos-x64 -o devkit
chmod +x devkit && sudo mv devkit /usr/local/bin/devkit
devkit setup
source ~/.zshrc
```

### Linux
```bash
curl -fsSL https://github.com/thevertrix/devkit/releases/latest/download/devkit-linux-x64 -o devkit
chmod +x devkit && sudo mv devkit /usr/local/bin/devkit
devkit setup
source ~/.bashrc
```

### Windows
Descarga `devkit-win-x64.exe` desde [Releases](https://github.com/thevertrix/devkit/releases), renómbralo a `devkit.exe` y agrégalo a tu `PATH`.

> **Requisito único:** [Docker Desktop](https://www.docker.com/products/docker-desktop) instalado y corriendo.

---

## `devkit setup`

Configura todo el entorno en un solo comando:

- Instala **mkcert** (SSL) y **Caddy** (proxy)
- Configura DNS para dominios `*.test`
- Crea **wrappers de runtime** en `~/.devkit/bin/` — después del setup, `node`, `npm`, `npx`, `php`, `composer`, `python` y `pip` ejecutan en contenedores Docker sin que los tengas instalados localmente

```bash
devkit setup
source ~/.zshrc   # recargar PATH

# Verificar
node -v       # → corre en Docker (node:20-alpine)
php -v        # → corre en Docker (php:8.3-cli)
python --version  # → corre en Docker (python:3.12-slim)
```

Para cambiar las versiones de los wrappers:
```bash
devkit services --set --node=22 --php=8.4
devkit setup   # regenera los wrappers con las versiones nuevas
source ~/.zshrc
```

---

## Inicio rápido

```bash
# Crear un proyecto Laravel
devkit new mi-app --laravel
cd ~/devkit-projects/mi-app

# Levantar con MySQL y Mailpit
devkit start --mysql --mailpit

# Abrir en el navegador
open https://mi-app.test
```

---

## Comandos

### `devkit new <nombre>`

Crea un nuevo proyecto con dominio `.test` y certificado SSL.

```bash
devkit new mi-app --laravel    # Laravel
devkit new mi-app --php        # PHP básico
devkit new mi-app --next       # Next.js
devkit new mi-app --nuxt       # Nuxt
devkit new mi-app --angular    # Angular
devkit new mi-app --nestjs     # NestJS
devkit new mi-app --astro      # Astro
devkit new mi-app --svelte     # SvelteKit
```

Los proyectos se crean en `~/devkit-projects/<nombre>` con dominio `https://<nombre>.test`.

---

### `devkit start`

Levanta el proyecto. Detecta el framework automáticamente y asigna un puerto libre.

```bash
devkit start                          # solo proxy + dev server
devkit start --mysql                  # + MySQL con versión por defecto
devkit start --mysql=8.0              # + MySQL 8.0 específico
devkit start --postgres=16 --redis=7  # + PostgreSQL 16 + Redis 7
devkit start --mailpit                # + Mailpit (correo de prueba)
```

**Runtimes containerizados** — el servidor dev corre en el contenedor, no en el host:

```bash
devkit start --node=20       # dev server en contenedor Node 20
devkit start --php=8.3       # dev server en contenedor PHP 8.3
devkit start --php=7.4       # proyecto legacy con PHP 7.4
devkit start --python=3.12   # contenedor Python listo en el puerto del proyecto
```

Combinaciones:
```bash
devkit start --mysql=5.7 --php=7.4            # Laravel legacy
devkit start --postgres=16 --node=20          # API Node.js moderna
devkit start --mysql=8.0 --php=8.3 --mailpit  # Full stack PHP
devkit start --python=3.12 --postgres=15      # Aplicación Python
```

> Si el puerto por defecto está ocupado por otro proyecto, devkit asigna uno libre automáticamente.

---

### `devkit stop`

```bash
devkit stop                     # detener todo el entorno
devkit stop --mysql             # detener solo MySQL
devkit stop --mysql --redis     # detener servicios específicos
devkit stop --php               # detener contenedor PHP
devkit stop --node --python     # detener runtimes específicos
```

---

### `devkit services`

Gestiona las versiones por defecto de servicios y runtimes.

```bash
devkit services --list                          # ver versiones actuales
devkit services --set --mysql=8.0              # fijar versión de MySQL
devkit services --set --postgres=15 --redis=7  # fijar DB y cache
devkit services --set --php=8.2 --node=22      # fijar runtimes
devkit services --set --python=3.12 --go=1.22  # fijar Python y Go
```

---

### `devkit doctor`

Verifica el estado del entorno. Muestra si los runtimes son locales o via Docker.

```bash
devkit doctor
```

Ejemplo de salida:
```
  Binarios
  ✔ mkcert    v1.4.4
  ✔ caddy     v2.x.x
  ✔ docker    Docker Desktop

  Runtimes
  ✔ node      via Docker  (node:20-alpine)
  ✔ npm       via Docker  (node:20-alpine)
  ✔ php       via Docker  (php:8.3-cli)
  ✔ composer  via Docker  (composer:latest)
  ✔ python    via Docker  (python:3.12-slim)
```

---

### `devkit list`

Lista todos los proyectos registrados con su URL y estado.

### `devkit mail`

Abre la interfaz de Mailpit en el navegador para revisar correos de prueba.

---

## Runtimes via Docker (sin instalar nada)

Después de `devkit setup`, los comandos de runtime en tu terminal funcionan transparentemente via Docker:

| Comando | Imagen Docker |
|---------|--------------|
| `node` | `node:20-alpine` |
| `npm` | `node:20-alpine` |
| `npx` | `node:20-alpine` |
| `php` | `php:8.3-cli` |
| `composer` | `composer:latest` |
| `python` | `python:3.12-slim` |
| `pip` | `python:3.12-slim` |

Los wrappers montan el directorio actual (`$(pwd)`) dentro del contenedor, por lo que los archivos creados aparecen en el host normalmente.

Para actualizar versiones:
```bash
devkit services --set --node=22
devkit setup        # regenera los wrappers
source ~/.zshrc
node -v             # → v22.x.x
```

---

## Compilar desde código fuente

Requiere Node.js y Docker para el build:

```bash
git clone https://github.com/thevertrix/devkit
cd devkit
npm install
npm run build
# Binarios en dist/
```

---

## Solución de problemas

**El dominio `.test` no resuelve**
```bash
devkit doctor        # identificar el problema
devkit setup         # reconfigurar DNS y proxy
```

**502 en un proyecto con --node o --php**
Borra el `docker-compose.yml` del proyecto y vuelve a correr `devkit start --node=20`. El archivo anterior no tenía los puertos configurados correctamente.

**Puerto ocupado**
devkit asigna automáticamente el siguiente puerto disponible. Si ves `(5173 ocupado → usando 5174)`, es el comportamiento esperado.

**Cambiar versión de servicio en proyecto existente**
```bash
devkit stop
rm docker-compose.yml
devkit start --mysql=8.0   # regenera con la nueva versión
```

---

## Requisitos

- **Docker Desktop** — único requisito obligatorio
- macOS 12+, Linux, o Windows (WSL2 recomendado)

## Licencia

MIT
