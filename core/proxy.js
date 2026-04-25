import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import os from 'os'
import { execa } from 'execa'
import ora from 'ora'
import chalk from 'chalk'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEVKIT_DIR = join(os.homedir(), '.devkit')
const PROXY_CONFIG_DIR = join(DEVKIT_DIR, 'proxy')
const DASHBOARD_DIR = join(DEVKIT_DIR, 'dashboard')
const CADDYFILE_PATH = join(PROXY_CONFIG_DIR, 'Caddyfile')
const TEMPLATE_PATH = join(__dirname, '..', 'templates', 'dashboard.html')

/**
 * Inicializa la configuración global del proxy (Caddy).
 */
export function initProxy() {
  if (!existsSync(PROXY_CONFIG_DIR)) {
    mkdirSync(PROXY_CONFIG_DIR, { recursive: true })
  }

  if (!existsSync(DASHBOARD_DIR)) {
    mkdirSync(DASHBOARD_DIR, { recursive: true })
  }

  if (!existsSync(CADDYFILE_PATH)) {
    const baseCaddyfile = `{
\tlocal_certs
}

import *.caddy
`
    writeFileSync(CADDYFILE_PATH, baseCaddyfile, 'utf8')
  }

  // Asegurar que devkit.test sirva el dashboard
  const dashboardCaddy = join(PROXY_CONFIG_DIR, '_dashboard.caddy')
  if (!existsSync(dashboardCaddy)) {
    writeDashboardCaddy()
  }

  updateDashboard()
}

/**
 * Escribe la config de Caddy para devkit.test (dashboard estático).
 */
function writeDashboardCaddy() {
  const dashboardPath = DASHBOARD_DIR.replace(/\\/g, '/')
  const config = `devkit.test {
\troot * "${dashboardPath}"
\tfile_server
\ttry_files {path} /index.html
}
`
  writeFileSync(join(PROXY_CONFIG_DIR, '_dashboard.caddy'), config, 'utf8')
}

/**
 * Regenera el dashboard HTML con la lista actual de proyectos.
 */
export function updateDashboard() {
  if (!existsSync(TEMPLATE_PATH)) return

  const projects = getRegisteredProjects()
  let projectsHtml

  if (projects.length === 0) {
    projectsHtml = '<div class="empty">No hay proyectos registrados. Ejecuta <code>devkit new mi-app --laravel</code> para empezar.</div>'
  } else {
    const items = projects.map(p => {
      const frameworkBadge = p.framework
        ? `<span class="project-framework">${p.framework}</span>`
        : ''
      return `<li class="project">
        <div class="project-info">
          <span class="project-name">${p.name}</span>
          ${frameworkBadge}
        </div>
        <a class="project-link" href="https://${p.name}.test">${p.name}.test</a>
      </li>`
    }).join('\n      ')

    projectsHtml = `<ul class="projects-list">\n      ${items}\n    </ul>`
  }

  /* global __PKG_VERSION__ */
  const version = typeof __PKG_VERSION__ !== 'undefined'
    ? __PKG_VERSION__
    : (() => { try { return JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version } catch { return '0.0.0' } })()

  let html = readFileSync(TEMPLATE_PATH, 'utf8')
  html = html.replace('{{PROJECTS_LIST}}', projectsHtml)
  html = html.replace('{{VERSION}}', version)
  html = html.replace('{{DATE}}', new Date().toLocaleDateString('es', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }))

  writeFileSync(join(DASHBOARD_DIR, 'index.html'), html, 'utf8')
}

/**
 * Lee los archivos .caddy y extrae la lista de proyectos registrados.
 */
function getRegisteredProjects() {
  if (!existsSync(PROXY_CONFIG_DIR)) return []

  return readdirSync(PROXY_CONFIG_DIR)
    .filter(f => f.endsWith('.caddy') && !f.startsWith('_'))
    .map(f => {
      const name = f.replace('.caddy', '')
      const content = readFileSync(join(PROXY_CONFIG_DIR, f), 'utf8')

      // Extraer framework del comentario PATH si hay un composer.json o package.json
      let framework = null
      const pathMatch = content.match(/^# PATH:\s*(.+)$/m)
      if (pathMatch) {
        const dir = pathMatch[1].trim()
        framework = detectProjectFramework(dir)
      }

      return { name, framework }
    })
}

/**
 * Detecta el framework de un proyecto a partir de su directorio (lectura rápida).
 */
function detectProjectFramework(dir) {
  try {
    if (existsSync(join(dir, 'artisan'))) return 'Laravel'
    if (existsSync(join(dir, 'next.config.js')) || existsSync(join(dir, 'next.config.mjs')) || existsSync(join(dir, 'next.config.ts'))) return 'Next.js'
    if (existsSync(join(dir, 'nuxt.config.ts')) || existsSync(join(dir, 'nuxt.config.js'))) return 'Nuxt'
    if (existsSync(join(dir, 'angular.json'))) return 'Angular'
    if (existsSync(join(dir, 'astro.config.mjs')) || existsSync(join(dir, 'astro.config.ts'))) return 'Astro'
    if (existsSync(join(dir, 'svelte.config.js'))) return 'SvelteKit'
    if (existsSync(join(dir, 'vite.config.js')) || existsSync(join(dir, 'vite.config.ts'))) return 'Vite'
  } catch { /* dir might not exist */ }
  return null
}

/**
 * Registra un nuevo proyecto en el proxy inverso.
 */
export function registerProject(projectName, port, projectDir = process.cwd()) {
  initProxy()
  
  // Prevenir que se registre un proyecto llamado "devkit" (reservado para el dashboard)
  if (projectName === 'devkit') {
    console.log(chalk.yellow(`⚠ El nombre "devkit" está reservado para el dashboard. No se registrará en el proxy.`))
    console.log(chalk.dim(`  El proyecto está disponible localmente en http://localhost:${port}`))
    return
  }

  const host = `${projectName}.test`
  const projectConfigPath = join(PROXY_CONFIG_DIR, `${projectName}.caddy`)

  const config = `# PATH: ${projectDir}
${host} {
\treverse_proxy localhost:${port}
}
`

  writeFileSync(projectConfigPath, config, 'utf8')
  updateDashboard()
}

/**
 * Elimina un proyecto del proxy inverso.
 */
export function unregisterProject(projectName) {
  const projectConfigPath = join(PROXY_CONFIG_DIR, `${projectName}.caddy`)
  if (existsSync(projectConfigPath)) {
    rmSync(projectConfigPath)
  }
  updateDashboard()
}

/**
 * Inicia Caddy elevado en Windows (necesita admin para puertos 80/443).
 */
async function startCaddyElevated() {
  const caddyPath = await getCaddyPath()
  const configPath = CADDYFILE_PATH.replace(/\//g, '\\')

  // Iniciar Caddy como proceso elevado en segundo plano
  await execa('powershell', [
    '-Command',
    `Start-Process -Verb RunAs -WindowStyle Hidden -FilePath '${caddyPath}' -ArgumentList 'start','--config','${configPath}'`,
  ], { stdio: 'inherit' })

  // Esperar un momento a que arranque
  await new Promise(resolve => setTimeout(resolve, 1500))
}

/**
 * Obtiene la ruta absoluta de caddy.exe
 */
async function getCaddyPath() {
  try {
    const { stdout } = await execa('where', ['caddy'], { stdio: 'pipe' })
    return stdout.trim().split('\n')[0].trim()
  } catch {
    return 'caddy'
  }
}

/**
 * Reinicia Caddy para aplicar los cambios.
 * En Windows, auto-eleva con UAC si Caddy no está corriendo.
 */
export async function reloadProxy() {
  const spinner = ora('Recargando proxy...').start()

  try {
    // Intentar reload directo (funciona si Caddy ya está corriendo)
    const reload = await execa('caddy', ['reload', '--config', CADDYFILE_PATH, '--force'], {
      reject: false,
      stdio: 'pipe',
    })

    if (reload.exitCode === 0) {
      spinner.succeed(chalk.green('Proxy recargado correctamente.'))
      return
    }

    // Caddy no está corriendo — intentar iniciar
    spinner.text = 'Iniciando proxy...'

    if (os.platform() === 'win32') {
      // Windows: necesita admin para puertos 80/443
      try {
        await startCaddyElevated()

        // Verificar que arrancó
        const recheck = await execa('caddy', ['reload', '--config', CADDYFILE_PATH, '--force'], {
          reject: false,
          stdio: 'pipe',
        })
        if (recheck.exitCode === 0) {
          spinner.succeed(chalk.green('Proxy iniciado (se solicitó permisos de administrador).'))
          return
        }
      } catch {
        // UAC rechazada o error
      }

      spinner.warn(chalk.yellow('No se pudo iniciar Caddy.'))
      console.log(chalk.cyan('\n  Ejecuta en una terminal de Administrador:'))
      console.log(chalk.white(`  caddy start --config "${CADDYFILE_PATH}"\n`))
    } else {
      // Unix: intentar directamente
      try {
        await execa('caddy', ['start', '--config', CADDYFILE_PATH], { stdio: 'ignore' })
        spinner.succeed(chalk.green('Proxy iniciado.'))
      } catch {
        spinner.warn(chalk.yellow('No se pudo iniciar Caddy.'))
        console.log(chalk.cyan(`\n  Ejecuta: sudo caddy start --config "${CADDYFILE_PATH}"\n`))
      }
    }
  } catch {
    spinner.fail(chalk.red('Caddy no está instalado o no se encontró en el PATH.'))
  }
}

/**
 * Detiene el servidor Caddy global.
 */
export async function stopProxy() {
  const spinner = ora('Deteniendo proxy...').start()
  try {
    await execa('caddy', ['stop'], { stdio: 'ignore' })
    spinner.succeed(chalk.green('Proxy detenido.'))
  } catch (error) {
    spinner.fail(chalk.yellow('El proxy no estaba corriendo o no se pudo detener.'))
  }
}
