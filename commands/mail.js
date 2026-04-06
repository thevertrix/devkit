import chalk from 'chalk'
import { execa } from 'execa'
import os from 'os'
import { getDevkitContainers } from '../core/detect.js'

export async function mail() {
  console.log(chalk.cyan(`\n📧 Revisando estado de Mailpit...`))

  const containers = getDevkitContainers()
  const isMailpitRunning = containers.some(c => c.name.includes('-mailpit') && c.status.toLowerCase().includes('up'))

  if (!isMailpitRunning) {
    console.log(chalk.yellow(`⚠ No se encontró ningún contenedor de Mailpit en ejecución.`))
    console.log(chalk.dim(`Asegúrate de levantar tu proyecto con la opción de correo: `) + chalk.cyan(`devkit start --mailpit\n`))
    return
  }

  // Asumimos que Mailpit está mapeado al puerto 8025 (definido en docker.js)
  const url = 'http://localhost:8025'
  
  console.log(chalk.cyan(`Abriendo Mailpit en el navegador...`))
  
  try {
    const platform = os.platform()
    
    if (platform === 'win32') {
      // En Windows, usar shell: true es importante para el comando start
      await execa('start', ['""', url], { shell: true })
    } else if (platform === 'darwin') {
      await execa('open', [url])
    } else {
      await execa('xdg-open', [url])
    }
    
    console.log(chalk.green(`✓ Listo. Si no se abrió automáticamente, visita:`), chalk.underline(url), `\n`)
  } catch (error) {
    console.log(chalk.red(`⚠ No se pudo abrir el navegador. Puedes visitar manualmente: ${url}`))
  }
}
