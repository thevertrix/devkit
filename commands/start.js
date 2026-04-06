import { basename } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execa } from 'execa'
import chalk from 'chalk'
import ora from 'ora'
import { detectFramework, getFrameworkDefaultPort } from '../core/detect.js'
import { writeBaseCompose, startServices, getDefaultPorts } from '../core/docker.js'
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
  let port = 8000

  if (framework) {
    port = getFrameworkDefaultPort(framework) || 8000
    console.log(chalk.green(`✓ Framework detectado:`), chalk.bold(framework), chalk.dim(`(Puerto: ${port})`))
  } else {
    console.log(chalk.yellow(`⚠ No se detectó un framework conocido. Asumiendo puerto ${port}.`))
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

  if (needsDocker) {
    if (!hasDockerCompose) {
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
  console.log(chalk.magenta(`\n▶ Levantando servidor de desarrollo...`))

  try {
    if (framework === 'laravel') {
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
      await execa(pm, ['run', 'dev'], { stdio: 'inherit' })
    } else {
      console.log(chalk.yellow(`⚠ No se encontró package.json o comando de inicio automático.`))
      console.log(`Tu entorno está listo. Levanta tu aplicación manualmente en el puerto ${port}.`)
    }
  } catch {
    console.log(chalk.gray(`\nServidor de desarrollo detenido.`))
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectPm(cwd) {
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
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
