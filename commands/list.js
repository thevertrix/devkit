import chalk from 'chalk'
import { readdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { getDevkitContainers } from '../core/detect.js'
import { unregisterProject, reloadProxy } from '../core/proxy.js'

export async function list() {
  const DEVKIT_DIR = join(os.homedir(), '.devkit')
  const PROXY_CONFIG_DIR = join(DEVKIT_DIR, 'proxy')

  console.log(chalk.cyan(`\n🌐 Proyectos registrados en Caddy (.test):`))
  
  let needsReload = false

  if (!existsSync(PROXY_CONFIG_DIR)) {
    console.log(chalk.dim('  Ningún proyecto registrado aún.\n'))
  } else {
    const files = readdirSync(PROXY_CONFIG_DIR).filter(f => f.endsWith('.caddy'))
    if (files.length === 0) {
      console.log(chalk.dim('  Ningún proyecto registrado aún.\n'))
    } else {
      for (const file of files) {
        const projectName = file.replace('.caddy', '')
        const filePath = join(PROXY_CONFIG_DIR, file)
        const content = readFileSync(filePath, 'utf8')
        
        // Buscar ruta original en el comentario o asumir la de devkit-projects
        const pathMatch = content.match(/# PATH:\s*(.+)/)
        const projectDir = pathMatch ? pathMatch[1].trim() : join(os.homedir(), 'devkit-projects', projectName)

        // Si el directorio ya no existe, lo limpiamos de Caddy
        if (!existsSync(projectDir)) {
          unregisterProject(projectName)
          needsReload = true
          continue
        }

        console.log(`  ${chalk.green('✓')} ${chalk.bold(projectName)} ${chalk.dim(`(https://${projectName}.test)`)}`)
      }
      
      if (needsReload) {
        try {
          await reloadProxy()
          console.log(chalk.yellow(`  ⚠ Se detectaron y limpiaron proyectos eliminados del disco.\n`))
        } catch(e) {}
      } else {
        console.log('')
      }
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
