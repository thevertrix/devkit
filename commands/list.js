import chalk from 'chalk'
import { readdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { getDevkitContainers } from '../core/detect.js'
import { unregisterProject } from '../core/proxy.js'

export async function list() {
  const DEVKIT_DIR = join(os.homedir(), '.devkit')
  const PROXY_CONFIG_DIR = join(DEVKIT_DIR, 'proxy')

  console.log(chalk.cyan(`\n🌐 Proyectos registrados en Caddy (.test):`))

  if (!existsSync(PROXY_CONFIG_DIR)) {
    console.log(chalk.dim('  Ningún proyecto registrado aún.\n'))
  } else {
    // Filtrar archivos .caddy que sean proyectos reales (no internos como _dashboard)
    const files = readdirSync(PROXY_CONFIG_DIR)
      .filter(f => f.endsWith('.caddy') && !f.startsWith('_'))

    let cleaned = false

    if (files.length === 0) {
      console.log(chalk.dim('  Ningún proyecto registrado aún.\n'))
    } else {
      for (const file of files) {
        const projectName = file.replace('.caddy', '')
        const content = readFileSync(join(PROXY_CONFIG_DIR, file), 'utf8')

        const pathMatch = content.match(/# PATH:\s*(.+)/)
        const projectDir = pathMatch ? pathMatch[1].trim() : null

        // Si el directorio ya no existe, limpiar silenciosamente
        if (projectDir && !existsSync(projectDir)) {
          unregisterProject(projectName)
          cleaned = true
          continue
        }

        console.log(`  ${chalk.green('✓')} ${chalk.bold(projectName)} ${chalk.dim(`(https://${projectName}.test)`)}`)
      }

      if (cleaned) {
        console.log(chalk.dim('  (se limpiaron proyectos eliminados del disco)'))
      }
      console.log('')
    }
  }

  console.log(chalk.cyan(`🐳 Contenedores Docker de Devkit:`))
  const containers = getDevkitContainers()

  if (containers.length === 0) {
    console.log(chalk.dim('  No hay contenedores de devkit corriendo.\n'))
  } else {
    containers.forEach(c => {
      const isUp = c.status.toLowerCase().includes('up')
      const statusColor = isUp ? chalk.green : chalk.yellow
      console.log(`  ${statusColor(isUp ? '▶' : '⏸')} ${chalk.bold(c.name)} ${chalk.dim(`(${c.status})`)}`)
    })
    console.log('')
  }
}
