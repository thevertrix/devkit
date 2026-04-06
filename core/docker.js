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
 * @param {boolean} options.mysql
 * @param {boolean} options.postgres
 * @param {boolean} options.redis
 * @param {boolean} options.mailpit
 * @param {string}  options.projectName
 */
export function writeBaseCompose(destDir, options) {
  const {
    mysql = false,
    postgres = false,
    redis = false,
    mailpit = false,
    projectName = 'devkit-project',
  } = options

  const ports = getDefaultPorts()
  let template = readFileSync(TEMPLATE_PATH, 'utf8')

  // Reemplazar placeholders simples
  const dbName = projectName.replace(/[^a-zA-Z0-9_]/g, '_')
  const replacements = {
    '{{PROJECT_NAME}}': projectName,
    '{{DB_NAME}}': dbName,
    '{{MYSQL_PORT}}': String(ports.mysql),
    '{{MYSQL_PASSWORD}}': process.env.MYSQL_ROOT_PASSWORD || 'devkit',
    '{{POSTGRES_PORT}}': String(ports.postgres),
    '{{POSTGRES_USER}}': 'devkit',
    '{{POSTGRES_PASSWORD}}': 'devkit',
    '{{REDIS_PORT}}': String(ports.redis),
    '{{SMTP_PORT}}': String(ports.smtp),
    '{{MAILPIT_PORT}}': String(ports.mailpit),
  }

  for (const [placeholder, value] of Object.entries(replacements)) {
    template = template.replaceAll(placeholder, value)
  }

  // Procesar bloques condicionales {{#SERVICE}}...{{/SERVICE}}
  const services = { MYSQL: mysql, POSTGRES: postgres, REDIS: redis, MAILPIT: mailpit }

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

  // Limpiar 'volumes:' vacío si no hay db o redis
  if (!mysql && !postgres && !redis) {
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
