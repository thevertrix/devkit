import { createServer } from 'net'
import { basename } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execa } from 'execa'
import chalk from 'chalk'
import { detectFramework, getFrameworkDefaultPort, hasBin } from '../core/detect.js'
import { writeBaseCompose, startServices } from '../core/docker.js'
import { registerProject, reloadProxy } from '../core/proxy.js'
import { addHostEntry } from '../core/dns.js'
import { getServiceVersions, getRuntimeVersions, saveProjectServices, saveProjectRuntimes } from '../core/config.js'

/**
 * Parsea el valor de un flag de servicio para extraer la versión.
 * @param {string|boolean} flagValue - Valor del flag (ej: true, "8.0", "16")
 * @param {string} serviceName - Nombre del servicio (para obtener versión por defecto)
 * @param {boolean} isRuntime - true si es un runtime (php, node, python), false si es servicio
 * @returns {false|{version: string}} - false si no se pidió el servicio, o {version: 'X'}
 */
function parseServiceFlag(flagValue, serviceName, isRuntime = false) {
  if (!flagValue) return false
  
  const defaultVersions = isRuntime ? getRuntimeVersions() : getServiceVersions()
  const defaultVersion = defaultVersions[serviceName]
  
  // Si es true, usar versión por defecto
  if (flagValue === true) {
    return { version: defaultVersion }
  }
  
  // Si es un string, usarlo como versión
  if (typeof flagValue === 'string') {
    return { version: flagValue }
  }
  
  return { version: defaultVersion }
}

export async function start(options = {}) {
  const cwd = process.cwd()
  const projectName = basename(cwd).toLowerCase().replace(/[^a-z0-9]/g, '-')

  // Evitar ejecutar en el propio directorio de devkit
  if (projectName === 'devkit' && existsSync(join(cwd, 'bin', 'devkit.js'))) {
    console.log(chalk.red('\n⚠ No puedes ejecutar "devkit start" en el propio directorio de devkit'))
    console.log(chalk.yellow('  Para crear un proyecto nuevo, usa: devkit new mi-proyecto'))
    console.log(chalk.dim('  Para ver proyectos existentes, usa: devkit list\n'))
    process.exit(1)
  }

  console.log(chalk.cyan(`\n🚀 Iniciando entorno de desarrollo para: ${chalk.bold(projectName)}`))

  // 1. Detectar framework y puerto
  const framework = detectFramework(cwd)
  const defaultPort = framework ? (getFrameworkDefaultPort(framework) || 8000) : 8000
  const port = await findAvailablePort(defaultPort)

  if (framework) {
    const portNote = port !== defaultPort
      ? chalk.yellow(` (${defaultPort} ocupado → usando ${port})`)
      : chalk.dim(` (Puerto: ${port})`)
    console.log(chalk.green(`✓ Framework detectado:`), chalk.bold(framework), portNote)
  } else {
    console.log(chalk.yellow(`⚠ No se detectó un framework conocido. Asumiendo puerto ${port}.`))
  }

  // Parchear configs de frameworks lo antes posible para que el evento de escritura
  // se consuma antes de que el file watcher de Vite/Angular arranque.
  if (framework === 'angular') {
    ensureAngularAllowedHosts(cwd, projectName)
  } else if (['svelte', 'sveltekit', 'vite', 'astro'].includes(framework)) {
    ensureViteAllowedHosts(cwd, projectName)
  } else if (framework === 'nuxtjs') {
    ensureNuxtAllowedHosts(cwd, projectName)
  }

  // 2. Parsear servicios y versiones
  const mysqlConfig = parseServiceFlag(options.mysql, 'mysql')
  const postgresConfig = parseServiceFlag(options.postgres, 'postgres')
  const redisConfig = parseServiceFlag(options.redis, 'redis')
  const mailpitConfig = parseServiceFlag(options.mailpit, 'mailpit')
  
  // Parsear runtimes y versiones
  const phpConfig = parseServiceFlag(options.php, 'php', true)
  const nodeConfig = parseServiceFlag(options.node, 'node', true)
  const pythonConfig = parseServiceFlag(options.python, 'python', true)

  // 3. Levantar servicios Docker
  const hasDockerCompose = existsSync(join(cwd, 'docker-compose.yml'))
  const needsDocker = hasDockerCompose || mysqlConfig || postgresConfig || redisConfig || mailpitConfig || phpConfig || nodeConfig || pythonConfig
  // Los runtime containers (--node, --php, --python) embeben el puerto en el comando del contenedor,
  // así que siempre hay que regenerar docker-compose.yml cuando cambia el puerto asignado.
  const runtimeContainer = !!(nodeConfig || phpConfig || pythonConfig)

  if (needsDocker) {
    if (!hasDockerCompose || runtimeContainer) {
      console.log(chalk.blue(`Generando docker-compose.yml...`))

      // Mostrar versiones que se van a usar
      const serviceVersions = []
      if (mysqlConfig) serviceVersions.push(`MySQL ${mysqlConfig.version}`)
      if (postgresConfig) serviceVersions.push(`PostgreSQL ${postgresConfig.version}`)
      if (redisConfig) serviceVersions.push(`Redis ${redisConfig.version}`)
      if (mailpitConfig) serviceVersions.push(`Mailpit ${mailpitConfig.version}`)
      if (phpConfig) serviceVersions.push(`PHP ${phpConfig.version}`)
      if (nodeConfig) serviceVersions.push(`Node.js ${nodeConfig.version}`)
      if (pythonConfig) serviceVersions.push(`Python ${pythonConfig.version}`)

      if (serviceVersions.length) {
        console.log(chalk.dim(`  Versiones: ${serviceVersions.join(', ')}`))
      }

      writeBaseCompose(cwd, {
        projectName,
        mysql: mysqlConfig,
        postgres: postgresConfig,
        redis: redisConfig,
        mailpit: mailpitConfig,
        php: phpConfig,
        node: nodeConfig,
        python: pythonConfig,
        appPort: port,
        nodeCommand: buildNodeContainerCmd(framework, port),
        phpCommand: buildPhpContainerCmd(framework, port),
      })
      
      // Guardar configuración de servicios en el proyecto
      const projectServices = {}
      if (mysqlConfig) projectServices.mysql = mysqlConfig
      if (postgresConfig) projectServices.postgres = postgresConfig
      if (redisConfig) projectServices.redis = redisConfig
      if (mailpitConfig) projectServices.mailpit = mailpitConfig
      
      saveProjectServices(projectName, projectServices)
      
      // Guardar configuración de runtimes en el proyecto
      const projectRuntimes = {}
      if (phpConfig) projectRuntimes.php = phpConfig
      if (nodeConfig) projectRuntimes.node = nodeConfig
      if (pythonConfig) projectRuntimes.python = pythonConfig
      
      saveProjectRuntimes(projectName, projectRuntimes)
    }
    await startServices(cwd)
  }

  // 4. Si es Laravel, configurar .env, servicios Docker y TrustProxies
  if (framework === 'laravel') {
    configureLaravelEnv(cwd, projectName, {
      mysql: mysqlConfig,
      postgres: postgresConfig,
      redis: redisConfig,
      mailpit: mailpitConfig,
    })
    configureTrustProxies(cwd)
  }

  // 5. Registrar en Proxy (Caddy) y recargar
  const domain = `${projectName}.test`
  registerProject(projectName, port, cwd)
  addHostEntry(domain)
  addHostEntry('devkit.test')

  try {
    await reloadProxy()
    console.log(chalk.green(`✓ Proxy enlazado:`), chalk.cyan.underline(`https://${domain}`))
  } catch {
    console.log(chalk.red(`⚠ Ocurrió un problema recargando el proxy. ¿Está Caddy instalado y tienes permisos?`))
  }

  // 6. Iniciar el servidor de desarrollo
  // Si hay un runtime de contenedor activo (--node o --php), el contenedor ES el servidor.
  // Solo hacemos stream de sus logs y no arrancamos nada en el host.
  const runtimeService = nodeConfig ? 'node' : (phpConfig ? 'php' : null)

  if (runtimeService) {
    console.log(chalk.green(`\n✓ Servidor corriendo en contenedor Docker (${runtimeService})\n`))
    console.log(chalk.dim(`  Ctrl+C para detener`))
    try {
      await execa('docker', ['compose', 'logs', '-f', runtimeService], { cwd, stdio: 'inherit' })
    } catch (e) {
      const stopped = e.isTerminated || e.signal === 'SIGINT' || e.signal === 'SIGTERM'
      if (stopped) {
        console.log(chalk.gray(`\nServidor de desarrollo detenido.`))
      } else {
        console.log(chalk.red(`\nError al obtener logs del contenedor:`))
        console.log(chalk.dim(e.shortMessage || e.message))
      }
    }
    return
  }

  if (pythonConfig) {
    console.log(chalk.yellow(`\n⚠ Contenedor Python listo en puerto ${port}.`))
    console.log(chalk.dim(`  Configura el comando de inicio en: docker-compose.yml`))
    console.log(chalk.dim(`  Ejemplo: command: python manage.py runserver 0.0.0.0:${port}`))
    return
  }

  console.log(chalk.magenta(`\n▶ Levantando servidor de desarrollo...`))

  try {
    if (framework === 'php') {
      const docroot = existsSync(join(cwd, 'public')) ? 'public' : '.'
      console.log(chalk.dim(`  Sirviendo desde ./${docroot} en localhost:${port}`))
      await execa('php', ['-S', `localhost:${port}`, '-t', docroot], { stdio: 'inherit' })
    } else if (framework === 'laravel') {
      const promises = [
        execa('php', ['artisan', 'serve', `--port=${port}`], { stdio: 'inherit' }),
      ]

      if (existsSync(join(cwd, 'package.json'))) {
        const pm = detectPm(cwd)
        promises.push(execa(pm, ['run', 'dev'], { stdio: 'inherit' }))
      }

      await Promise.all(promises)
    } else if (existsSync(join(cwd, 'package.json'))) {
      const pm = detectPm(cwd)
      const script = resolveDevScript(framework, cwd)
      if (script) {
        const portArgs = buildPortArgs(framework, port, defaultPort)
        const portEnv = (framework === 'nestjs' && port !== defaultPort)
          ? { ...process.env, PORT: String(port) }
          : process.env
        await execa(pm, ['run', script, ...portArgs], { stdio: 'inherit', env: portEnv })
      } else {
        console.log(chalk.yellow(`⚠ No se encontró un script de desarrollo en package.json (dev/start).`))
        console.log(`Tu entorno está listo. Levanta tu aplicación manualmente en el puerto ${port}.`)
      }
    } else {
      console.log(chalk.yellow(`⚠ No se encontró package.json o comando de inicio automático.`))
      console.log(`Tu entorno está listo. Levanta tu aplicación manualmente en el puerto ${port}.`)
    }
  } catch (e) {
    const stopped = e.isTerminated || e.signal === 'SIGINT' || e.signal === 'SIGTERM'
    if (stopped) {
      console.log(chalk.gray(`\nServidor de desarrollo detenido.`))
    } else {
      console.log(chalk.red(`\nError iniciando el servidor de desarrollo:`))
      console.log(chalk.dim(e.shortMessage || e.stderr?.split('\n').filter(Boolean)[0] || e.message))
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tryBind(port, host) {
  return new Promise(resolve => {
    const srv = createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => { srv.close(); resolve(true) })
    srv.listen(port, host)
  })
}

async function isPortFree(port) {
  const [v4, v6] = await Promise.all([
    tryBind(port, '127.0.0.1'),
    tryBind(port, '::1').catch(() => true),  // IPv6 puede no estar disponible
  ])
  return v4 && v6
}

async function findAvailablePort(start) {
  for (let p = start; p < start + 20; p++) {
    if (await isPortFree(p)) return p
  }
  return start
}

/**
 * Devuelve los args de `--port` para pasar vía `npm run <script> -- ...`
 * Solo aplica si el puerto real difiere del puerto por defecto.
 */
function buildPortArgs(framework, port, defaultPort) {
  if (port === defaultPort) return []

  // npm/yarn/pnpm requieren `--` para separar args del script
  switch (framework) {
    case 'nextjs':  return ['--', '-p', String(port)]
    case 'nestjs':  return []   // NestJS usa PORT como env var, no CLI arg
    default:        return ['--', '--port', String(port)]  // Vite, Angular, Astro, etc.
  }
}

function ensureAngularAllowedHosts(cwd, projectName) {
  const configPath = join(cwd, 'angular.json')
  if (!existsSync(configPath)) return

  let config
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch {
    return
  }

  const ngProject = Object.keys(config.projects ?? {})[0]
  const serveTarget = config.projects?.[ngProject]?.architect?.serve
  if (!serveTarget) return

  if (!serveTarget.options) serveTarget.options = {}

  const host = `${projectName}.test`
  const current = serveTarget.options.allowedHosts ?? []
  if (current.includes(host)) return

  serveTarget.options.allowedHosts = [...current, host]
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
  console.log(chalk.green(`✓ angular.json: ${host} agregado a allowedHosts`))
}

function ensureNuxtAllowedHosts(cwd, projectName) {
  const configPath = join(cwd, 'nuxt.config.ts')
  if (!existsSync(configPath)) return

  let config
  try { config = readFileSync(configPath, 'utf8') } catch { return }

  if (config.includes('allowedHosts: true')) return

  const host = `${projectName}.test`

  if (config.includes('allowedHosts:')) {
    config = config.replace(/allowedHosts:\s*\[[^\]]*\]/, 'allowedHosts: true')
    writeFileSync(configPath, config, 'utf8')
    console.log(chalk.green(`✓ nuxt.config.ts: allowedHosts actualizado`))
    return
  }

  if (!config.includes('defineNuxtConfig({')) return

  config = config.replace(
    'defineNuxtConfig({',
    `defineNuxtConfig({\n\tvite: { server: { allowedHosts: true } },`
  )
  writeFileSync(configPath, config, 'utf8')
  console.log(chalk.green(`✓ nuxt.config.ts: allowedHosts habilitado para ${host}`))
}

function ensureViteAllowedHosts(cwd, projectName) {
  const configPath = existsSync(join(cwd, 'vite.config.ts'))
    ? join(cwd, 'vite.config.ts')
    : join(cwd, 'vite.config.js')

  if (!existsSync(configPath)) return

  let config
  try {
    config = readFileSync(configPath, 'utf8')
  } catch {
    return
  }

  if (config.includes('allowedHosts: true')) return

  // Si ya hay un array de allowedHosts, reemplazarlo con true
  if (config.includes('allowedHosts:')) {
    config = config.replace(/allowedHosts:\s*\[[^\]]*\]/, 'allowedHosts: true')
    writeFileSync(configPath, config, 'utf8')
    console.log(chalk.green(`✓ vite.config: allowedHosts actualizado`))
    return
  }

  if (!config.includes('export default defineConfig({')) return

  config = config.replace(
    'export default defineConfig({',
    `export default defineConfig({\n\tserver: { host: true, allowedHosts: true },`
  )
  writeFileSync(configPath, config, 'utf8')
  console.log(chalk.green(`✓ vite.config: allowedHosts habilitado para ${projectName}.test`))
}

function resolveDevScript(framework, cwd) {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) return null

  const scripts = JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {}

  if (framework === 'nestjs') {
    if (scripts['start:dev']) return 'start:dev'
    if (scripts['start']) return 'start'
    return null
  }

  if (scripts['dev']) return 'dev'
  if (scripts['start']) return 'start'
  return null
}

function detectPm(cwd) {
  if (existsSync(join(cwd, 'yarn.lock')) && hasBin('yarn')) return 'yarn'
  if (existsSync(join(cwd, 'pnpm-lock.yaml')) && hasBin('pnpm')) return 'pnpm'
  return 'npm'
}

/**
 * Configura el .env de Laravel: APP_URL + servicios Docker si se pidieron.
 */
function configureLaravelEnv(cwd, projectName, options) {
  const envPath = join(cwd, '.env')
  if (!existsSync(envPath)) return

  let env = readFileSync(envPath, 'utf8')
  let changed = false
  const dbName = projectName.replace(/[^a-zA-Z0-9_]/g, '_')

  // APP_URL
  const expectedUrl = `https://${projectName}.test`
  if (!env.includes(`APP_URL=${expectedUrl}`)) {
    env = env.replace(/^APP_URL=.*$/m, `APP_URL=${expectedUrl}`)
    changed = true
  }

  // MySQL
  if (options.mysql) {
    env = setEnvVar(env, 'DB_CONNECTION', 'mysql')
    env = setEnvVar(env, 'DB_HOST', '127.0.0.1')
    env = setEnvVar(env, 'DB_PORT', '3306')
    env = setEnvVar(env, 'DB_DATABASE', dbName)
    env = setEnvVar(env, 'DB_USERNAME', 'root')
    env = setEnvVar(env, 'DB_PASSWORD', process.env.MYSQL_ROOT_PASSWORD || 'devkit')
    changed = true
  }

  // PostgreSQL
  if (options.postgres) {
    env = setEnvVar(env, 'DB_CONNECTION', 'pgsql')
    env = setEnvVar(env, 'DB_HOST', '127.0.0.1')
    env = setEnvVar(env, 'DB_PORT', '5432')
    env = setEnvVar(env, 'DB_DATABASE', dbName)
    env = setEnvVar(env, 'DB_USERNAME', 'devkit')
    env = setEnvVar(env, 'DB_PASSWORD', 'devkit')
    changed = true
  }

  // Redis
  if (options.redis) {
    env = setEnvVar(env, 'REDIS_HOST', '127.0.0.1')
    env = setEnvVar(env, 'REDIS_PORT', '6379')
    env = setEnvVar(env, 'CACHE_STORE', 'redis')
    env = setEnvVar(env, 'SESSION_DRIVER', 'redis')
    changed = true
  } else {
    // Sin --redis, asegurar que session/cache no intenten usar Redis (causaría crash sin extensión)
    const sessionMatch = env.match(/^SESSION_DRIVER=(.+)$/m)
    const cacheMatch = env.match(/^CACHE_STORE=(.+)$/m)
    if (sessionMatch?.[1]?.trim() === 'redis') {
      env = setEnvVar(env, 'SESSION_DRIVER', 'file')
      changed = true
    }
    if (cacheMatch?.[1]?.trim() === 'redis') {
      env = setEnvVar(env, 'CACHE_STORE', 'file')
      changed = true
    }
  }

  // Mailpit
  if (options.mailpit) {
    env = setEnvVar(env, 'MAIL_MAILER', 'smtp')
    env = setEnvVar(env, 'MAIL_HOST', '127.0.0.1')
    env = setEnvVar(env, 'MAIL_PORT', '1025')
    env = setEnvVar(env, 'MAIL_USERNAME', '')
    env = setEnvVar(env, 'MAIL_PASSWORD', '')
    env = setEnvVar(env, 'MAIL_ENCRYPTION', '')
    changed = true
  }

  if (changed) {
    writeFileSync(envPath, env, 'utf8')
    const services = []
    if (options.mysql) services.push('MySQL')
    if (options.postgres) services.push('PostgreSQL')
    if (options.redis) services.push('Redis')
    if (options.mailpit) services.push('Mailpit')

    console.log(chalk.green(`✓ .env actualizado: APP_URL=${expectedUrl}`))
    if (services.length) {
      console.log(chalk.green(`✓ .env configurado para: ${services.join(', ')}`))
    }
    if (!options.redis) {
      const sessionNow = env.match(/^SESSION_DRIVER=(.+)$/m)?.[1]?.trim()
      const cacheNow = env.match(/^CACHE_STORE=(.+)$/m)?.[1]?.trim()
      if (sessionNow === 'file' || cacheNow === 'file') {
        console.log(chalk.yellow(`⚠ SESSION_DRIVER/CACHE_STORE cambiados a "file" (usa --redis para Redis)`))
      }
    }
  }
}

/**
 * Establece una variable en el .env. Descomenta si está comentada,
 * reemplaza si ya existe, o agrega al final si no existe.
 */
function setEnvVar(env, key, value) {
  // Descomentar si está como "# KEY=..."
  const commentRegex = new RegExp(`^#\\s*${key}=.*$`, 'm')
  if (commentRegex.test(env)) {
    env = env.replace(commentRegex, `${key}=${value}`)
    return env
  }

  // Reemplazar si ya existe
  const existsRegex = new RegExp(`^${key}=.*$`, 'm')
  if (existsRegex.test(env)) {
    env = env.replace(existsRegex, `${key}=${value}`)
    return env
  }

  // Agregar al final
  env += `\n${key}=${value}`
  return env
}

function buildNodeContainerCmd(framework, port) {
  switch (framework) {
    case 'nextjs':  return `sh -c "npm install && npm run dev -- -p ${port}"`
    case 'nestjs':  return `sh -c "npm install && PORT=${port} npm run start:dev"`
    default:        return `sh -c "npm install && npm run dev -- --port ${port} --host"`
  }
}

function buildPhpContainerCmd(framework, port) {
  if (framework === 'laravel') {
    return `sh -c "composer install && php artisan serve --host=0.0.0.0 --port=${port}"`
  }
  return `php -S 0.0.0.0:${port} -t public`
}

/**
 * Asegura que Laravel confíe en el proxy local (Caddy) via TrustProxies.
 */
function configureTrustProxies(cwd) {
  const bootstrapPath = join(cwd, 'bootstrap', 'app.php')
  if (!existsSync(bootstrapPath)) return

  let content = readFileSync(bootstrapPath, 'utf8')
  if (content.includes('trustProxies')) return

  content = content.replace(
    /->withMiddleware\(function\s*\(Middleware\s+\$middleware\).*?\{/s,
    (match) => `${match}\n        $middleware->trustProxies(at: '*');`
  )
  writeFileSync(bootstrapPath, content, 'utf8')
  console.log(chalk.green(`✓ TrustProxies configurado en bootstrap/app.php`))
}
