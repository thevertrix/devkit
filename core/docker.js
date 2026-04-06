import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execa } from 'execa'
import ora from 'ora'
import chalk from 'chalk'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = join(__dirname, '..', 'templates', 'docker-compose.yml.tpl')

/**
 * Retorna los puertos por defecto de cada servicio.
 */
export function getDefaultPorts() {
  return {
    mysql: 3306,
    postgres: 5432,
    redis: 6379,
    smtp: 1025,
    mailpit: 8025,
  }
}

/**
 * Genera y escribe el docker-compose.yml base en la ruta dada.
 * @param {string} destDir - Directorio destino
 * @param {object} options - Servicios a incluir y config del proyecto
 * @param {object|boolean} options.mysql - true o {version: '8.0'}
 * @param {object|boolean} options.postgres - true o {version: '16'}
 * @param {object|boolean} options.redis - true o {version: '7'}
 * @param {object|boolean} options.mailpit - true o {version: 'latest'}
 * @param {object|boolean} options.php - true o {version: '8.3'}
 * @param {object|boolean} options.node - true o {version: '20'}
 * @param {object|boolean} options.python - true o {version: '3.12'}
 * @param {string}  options.projectName
 */
export function writeBaseCompose(destDir, options) {
  const {
    mysql = false,
    postgres = false,
    redis = false,
    mailpit = false,
    php = false,
    node = false,
    python = false,
    projectName = 'devkit-project',
  } = options

  const ports = getDefaultPorts()
  let template = readFileSync(TEMPLATE_PATH, 'utf8')

  // Extraer versiones de los servicios
  const mysqlVersion = (typeof mysql === 'object' ? mysql.version : '8.0') || '8.0'
  const postgresVersion = (typeof postgres === 'object' ? postgres.version : '16') || '16'
  const redisVersion = (typeof redis === 'object' ? redis.version : '7') || '7'
  const mailpitVersion = (typeof mailpit === 'object' && mailpit.version) ? mailpit.version : 'latest'
  
  // Extraer versiones de los runtimes
  const phpVersion = (typeof php === 'object' ? php.version : '8.3') || '8.3'
  const nodeVersion = (typeof node === 'object' ? node.version : '20') || '20'
  const pythonVersion = (typeof python === 'object' ? python.version : '3.12') || '3.12'

  // Reemplazar placeholders simples
  const dbName = projectName.replace(/[^a-zA-Z0-9_]/g, '_')
  const replacements = {
    '{{PROJECT_NAME}}': projectName,
    '{{DB_NAME}}': dbName,
    '{{MYSQL_VERSION}}': mysqlVersion,
    '{{MYSQL_PORT}}': String(ports.mysql),
    '{{MYSQL_PASSWORD}}': process.env.MYSQL_ROOT_PASSWORD || 'devkit',
    '{{POSTGRES_VERSION}}': postgresVersion,
    '{{POSTGRES_PORT}}': String(ports.postgres),
    '{{POSTGRES_USER}}': 'devkit',
    '{{POSTGRES_PASSWORD}}': 'devkit',
    '{{REDIS_VERSION}}': redisVersion,
    '{{REDIS_PORT}}': String(ports.redis),
    '{{MAILPIT_VERSION}}': mailpitVersion,
    '{{SMTP_PORT}}': String(ports.smtp),
    '{{MAILPIT_PORT}}': String(ports.mailpit),
    '{{PHP_VERSION}}': phpVersion,
    '{{NODE_VERSION}}': nodeVersion,
    '{{PYTHON_VERSION}}': pythonVersion,
  }

  for (const [placeholder, value] of Object.entries(replacements)) {
    template = template.replaceAll(placeholder, value)
  }

  // Procesar bloques condicionales {{#SERVICE}}...{{/SERVICE}}
  const services = { 
    MYSQL: !!mysql, 
    POSTGRES: !!postgres, 
    REDIS: !!redis, 
    MAILPIT: !!mailpit,
    PHP: !!php,
    NODE: !!node,
    PYTHON: !!python,
  }

  for (const [tag, enabled] of Object.entries(services)) {
    const regex = new RegExp(`{{#${tag}}}\\n([\\s\\S]*?){{/${tag}}}\\n?`, 'g')
    if (enabled) {
      // Mantener el contenido, quitar los delimitadores
      template = template.replace(regex, '$1')
    } else {
      // Eliminar todo el bloque
      template = template.replace(regex, '')
    }
  }

  // Limpiar líneas vacías consecutivas (máximo 1 línea vacía)
  template = template.replace(/\n{3,}/g, '\n\n')

  // Limpiar 'volumes:' vacío si no hay volumenes
  if (!mysql && !postgres && !redis && !node) {
    // Si no hay volumenes, la clave volumes: quedará vacía justo antes de networks:
    template = template.replace(/volumes:\s*networks:/g, 'networks:')
  }

  // Asegurar que el directorio destino existe
  mkdirSync(destDir, { recursive: true })

  const destPath = join(destDir, 'docker-compose.yml')
  writeFileSync(destPath, template, 'utf8')

  return destPath
}

/**
 * Levanta los servicios Docker de un proyecto.
 * @param {string} projectDir - Directorio del proyecto (con docker-compose.yml)
 */
export async function startServices(projectDir) {
  const spinner = ora('Levantando servicios Docker...').start()

  try {
    await execa('docker', ['compose', 'up', '-d'], {
      cwd: projectDir,
    })
    spinner.succeed(chalk.green('Servicios levantados correctamente.'))
  } catch (error) {
    spinner.fail(chalk.red('Error al levantar los servicios Docker.'))
    throw error
  }
}

/**
 * Detiene los servicios Docker de un proyecto.
 * @param {string} projectDir - Directorio del proyecto (con docker-compose.yml)
 */
export async function stopServices(projectDir) {
  const spinner = ora('Deteniendo servicios Docker...').start()

  try {
    await execa('docker', ['compose', 'down'], {
      cwd: projectDir,
    })
    spinner.succeed(chalk.green('Servicios detenidos correctamente.'))
  } catch (error) {
    spinner.fail(chalk.red('Error al detener los servicios Docker.'))
    throw error
  }
}

/**
 * Detiene un servicio Docker específico de un proyecto.
 * @param {string} projectDir - Directorio del proyecto (con docker-compose.yml)
 * @param {string} serviceName - Nombre del servicio en docker-compose (ej: 'mysql')
 */
export async function stopService(projectDir, serviceName) {
  const spinner = ora(`Deteniendo ${serviceName}...`).start()

  try {
    await execa('docker', ['compose', 'stop', serviceName], {
      cwd: projectDir,
    })
    await execa('docker', ['compose', 'rm', '-f', serviceName], {
      cwd: projectDir,
    })
    spinner.succeed(chalk.green(`${serviceName} detenido.`))
  } catch (error) {
    spinner.fail(chalk.red(`Error al detener ${serviceName}.`))
    throw error
  }
}

/**
 * Verifica el estado de los servicios (running/stopped).
 * @param {string} projectDir - Directorio del proyecto
 * @returns {Promise<Array<{name: string, state: string, ports: string}>>}
 */
export async function getServicesStatus(projectDir) {
  try {
    const { stdout } = await execa(
      'docker',
      ['compose', 'ps', '--format', 'json'],
      { cwd: projectDir, stdio: 'pipe' }
    )

    if (!stdout.trim()) return []

    // docker compose ps --format json puede devolver un JSON por línea
    const lines = stdout.trim().split('\n')
    const services = lines.map((line) => {
      const svc = JSON.parse(line)
      return {
        name: svc.Name || svc.Service,
        state: svc.State || 'unknown',
        ports: svc.Ports || '',
      }
    })

    return services
  } catch {
    return []
  }
}
