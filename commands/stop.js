import { basename } from 'path'
import { existsSync } from 'fs'
import chalk from 'chalk'
import { stopServices } from '../core/docker.js'
import { unregisterProject, reloadProxy } from '../core/proxy.js'
import { removeHostEntry } from '../core/dns.js'

export async function stop() {
  const cwd = process.cwd()
  const projectName = basename(cwd).toLowerCase().replace(/[^a-z0-9]/g, '-')

  console.log(chalk.yellow(`\n🛑 Deteniendo entorno para: ${chalk.bold(projectName)}`))

  // 1. Bajar contenedores de Docker (si existe el archivo)
  if (existsSync(`${cwd}/docker-compose.yml`)) {
    try {
      await stopServices(cwd)
    } catch (err) {
      console.log(chalk.red(`⚠ Error al detener contenedores. ¿Docker está corriendo?`))
    }
  } else {
    console.log(chalk.dim(`No se encontró docker-compose.yml, omitiendo apagado de contenedores.`))
  }

  // 2. Remover del Proxy inverso y archivo hosts
  const domain = `${projectName}.test`
  unregisterProject(projectName)
  removeHostEntry(domain)
  
  try {
    await reloadProxy()
    console.log(chalk.green(`✓ Dominio `) + chalk.cyan.strikethrough(domain) + chalk.green(` desenlazado del proxy.`))
  } catch (err) {
    console.log(chalk.red(`⚠ Error al actualizar el proxy. Omitiendo.`))
  }

  console.log(chalk.green(`\n✨ Entorno detenido correctamente.\n`))
}
