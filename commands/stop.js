import { basename } from 'path'
import { existsSync } from 'fs'
import chalk from 'chalk'
import { stopServices, stopService } from '../core/docker.js'
import { unregisterProject, reloadProxy } from '../core/proxy.js'
import { removeHostEntry } from '../core/dns.js'

// Mapa de flags a nombres de servicio en docker-compose
const SERVICE_MAP = {
  mysql: 'mysql',
  postgres: 'postgres',
  redis: 'redis',
  mailpit: 'mailpit',
}

export async function stop(options = {}) {
  const cwd = process.cwd()
  const projectName = basename(cwd).toLowerCase().replace(/[^a-z0-9]/g, '-')

  // Detectar si se pidió detener servicios específicos
  const requestedServices = Object.keys(SERVICE_MAP).filter(k => options[k])

  if (requestedServices.length > 0) {
    // Detener solo los servicios indicados
    await stopSpecificServices(cwd, requestedServices)
    return
  }

  // Sin flags: detener todo el entorno
  await stopAll(cwd, projectName)
}

/**
 * Detiene servicios Docker específicos sin tocar el resto del entorno.
 */
async function stopSpecificServices(cwd, services) {
  if (!existsSync(`${cwd}/docker-compose.yml`)) {
    console.log(chalk.red(`\n⚠ No se encontró docker-compose.yml en este directorio.\n`))
    return
  }

  console.log(chalk.yellow(`\n🛑 Deteniendo servicios: ${chalk.bold(services.join(', '))}\n`))

  for (const key of services) {
    const serviceName = SERVICE_MAP[key]
    try {
      await stopService(cwd, serviceName)
    } catch {
      console.log(chalk.red(`  ⚠ No se pudo detener ${serviceName}. ¿Está corriendo?`))
    }
  }

  console.log('')
}

/**
 * Detiene todo el entorno: Docker, proxy y DNS.
 */
async function stopAll(cwd, projectName) {
  console.log(chalk.yellow(`\n🛑 Deteniendo entorno para: ${chalk.bold(projectName)}`))

  if (existsSync(`${cwd}/docker-compose.yml`)) {
    try {
      await stopServices(cwd)
    } catch {
      console.log(chalk.red(`⚠ Error al detener contenedores. ¿Docker está corriendo?`))
    }
  }

  const domain = `${projectName}.test`
  unregisterProject(projectName)
  removeHostEntry(domain)

  try {
    await reloadProxy()
    console.log(chalk.green(`✓ Dominio `) + chalk.cyan.strikethrough(domain) + chalk.green(` desenlazado del proxy.`))
  } catch {
    console.log(chalk.red(`⚠ Error al actualizar el proxy. Omitiendo.`))
  }

  console.log(chalk.green(`\n✨ Entorno detenido correctamente.\n`))
}
