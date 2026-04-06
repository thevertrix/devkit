import { execaSync } from 'execa'
import os from 'os'
import { readFileSync, existsSync } from 'fs'

/**
 * Detecta el OS actual.
 * @returns {'macos' | 'linux' | 'wsl' | 'windows' | 'unknown'}
 */
export function detectOS() {
  const platform = process.platform
  const release = os.release().toLowerCase()

  if (platform === 'linux' && release.includes('microsoft')) return 'wsl'
  if (platform === 'darwin') return 'macos'
  if (platform === 'linux') return 'linux'
  if (platform === 'win32') return 'windows'
  return 'unknown'
}

/**
 * Verifica si un binario está disponible en el PATH.
 */
export function hasBin(name) {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    execaSync(cmd, [name])
    return true
  } catch {
    return false
  }
}

/**
 * Obtiene la versión de un binario.
 */
export function getBinVersion(name, flag = '--version') {
  try {
    const { stdout } = execaSync(name, [flag], {
      stderr: 'ignore',
      env: { ...process.env, NO_COLOR: '1' },
    })
    // Limpiar códigos ANSI residuales
    return stdout.split('\n')[0].replace(/\x1B\[[0-9;]*m/g, '').trim()
  } catch {
    return null
  }
}

/**
 * Verifica si Docker está corriendo (no solo instalado).
 */
export function isDockerRunning() {
  try {
    execaSync('docker', ['info'], { stderr: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Verifica si docker compose (v2) está disponible.
 */
export function hasDockerCompose() {
  try {
    execaSync('docker', ['compose', 'version'], { stderr: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Verifica si un contenedor Docker específico está corriendo.
 */
export function isContainerRunning(name) {
  try {
    const { stdout } = execaSync('docker', ['ps', '--filter', `name=${name}`, '--format', '{{.Names}}'], { stderr: 'ignore' })
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Obtiene la lista de contenedores devkit corriendo.
 * @returns {{ name: string, status: string }[]}
 */
export function getDevkitContainers() {
  try {
    // Listamos todos los contenedores y luego la función que los llame se encarga
    // de verificar si su nombre tiene sufijos como -mailpit, -mysql, etc.
    const { stdout } = execaSync('docker', ['ps', '--format', '{{.Names}} {{.Status}}'], { stderr: 'ignore' })
    if (!stdout.trim()) return []
    return stdout.trim().split('\n').map(line => {
      const [name, ...rest] = line.split(' ')
      return { name, status: rest.join(' ') }
    })
  } catch {
    return []
  }
}

/**
 * Checa si dnsmasq está configurado para .test
 */
export function isDnsmasqConfigured() {
  const configPaths = [
    '/opt/homebrew/etc/dnsmasq.d/test.conf',  // macOS ARM
    '/usr/local/etc/dnsmasq.d/test.conf',      // macOS Intel
    '/etc/dnsmasq.d/test.conf',                // Linux
  ]

  for (const p of configPaths) {
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf8')
      if (content.includes('/.test/')) return true
    }
  }

  // También revisar el archivo principal
  const mainConfigs = [
    '/opt/homebrew/etc/dnsmasq.conf',
    '/usr/local/etc/dnsmasq.conf',
    '/etc/dnsmasq.conf',
  ]

  for (const p of mainConfigs) {
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf8')
      if (content.includes('address=/.test/127.0.0.1')) return true
    }
  }

  return false
}

/**
 * Checa si el resolver .test está configurado (macOS).
 */
export function isResolverConfigured() {
  return existsSync('/etc/resolver/test')
}

/**
 * Detecta el framework de un proyecto.
 * @param {string} dir Directorio del proyecto.
 * @returns {string | null} El nombre del framework detectado.
 */
export function detectFramework(dir = process.cwd()) {
  const packageJsonPath = `${dir}/package.json`
  const composerJsonPath = `${dir}/composer.json`

  if (existsSync(composerJsonPath)) {
    const composer = JSON.parse(readFileSync(composerJsonPath, 'utf8'))
    const deps = { ...composer.require, ...composer['require-dev'] }
    if (deps['laravel/framework']) return 'laravel'
  }

  if (existsSync(packageJsonPath)) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }

    if (deps['next']) return 'nextjs'
    if (deps['nuxt']) return 'nuxtjs'
    if (deps['@nestjs/core']) return 'nestjs'
    if (deps['@angular/core']) return 'angular'
    if (deps['astro']) return 'astro'
    if (deps['svelte']) return 'svelte' // También puede ser @sveltejs/kit
    if (deps['@sveltejs/kit']) return 'sveltekit'
    if (deps['vite']) return 'vite'
  }

  return null
}

/**
 * Obtiene el puerto por defecto de un framework.
 * @param {string} framework Nombre del framework.
 * @returns {number | null} El puerto por defecto.
 */
export function getFrameworkDefaultPort(framework) {
  const ports = {
    laravel: 8000,
    nextjs: 3000,
    nuxtjs: 3000,
    nestjs: 3000,
    angular: 4200,
    astro: 4321,
    svelte: 5173,
    sveltekit: 5173,
    vite: 5173,
  }
  return ports[framework] || null
}

/**
 * Detecta el package manager disponible según el OS.
 * @returns {{ name: string, install: string } | null}
 */
export function detectPackageManager(osType) {
  const managers = {
    macos:   [{ name: 'brew',   install: 'brew install' }],
    linux:   [
      { name: 'apt',    install: 'sudo apt install -y' },
      { name: 'dnf',    install: 'sudo dnf install -y' },
      { name: 'pacman', install: 'sudo pacman -S --noconfirm' },
    ],
    wsl:     [
      { name: 'apt',    install: 'sudo apt install -y' },
    ],
    windows: [
      { name: 'scoop',  install: 'scoop install' },
      { name: 'choco',  install: 'choco install -y' },
      { name: 'winget', install: 'winget install --accept-source-agreements --accept-package-agreements' },
    ],
  }

  for (const pm of managers[osType] ?? []) {
    if (hasBin(pm.name)) return pm
  }
  return null
}

/**
 * Retorna instrucciones de instalación por dependencia y OS.
 */
export function installHint(dep, osType) {
  const hints = {
    mkcert: {
      macos:   'brew install mkcert',
      linux:   'sudo apt install mkcert  # o: https://github.com/FiloSottile/mkcert',
      wsl:     'sudo apt install mkcert',
      windows: 'choco install mkcert  # o: scoop install mkcert',
    },
    caddy: {
      macos:   'brew install caddy',
      linux:   'https://caddyserver.com/docs/install',
      wsl:     'https://caddyserver.com/docs/install',
      windows: 'choco install caddy  # o: scoop install caddy',
    },
    docker: {
      macos:   'https://www.docker.com/products/docker-desktop',
      linux:   'sudo apt install docker.io docker-compose-plugin',
      wsl:     'Instala Docker Desktop en Windows con integración WSL2',
      windows: 'https://www.docker.com/products/docker-desktop',
    },
    dnsmasq: {
      macos:   'brew install dnsmasq',
      linux:   'sudo apt install dnsmasq',
      wsl:     'sudo apt install dnsmasq',
      windows: 'Edita C:\\Windows\\System32\\drivers\\etc\\hosts o instala Acrylic DNS Proxy',
    },
    php: {
      macos:   'brew install php',
      linux:   'sudo apt install php-fpm',
      wsl:     'sudo apt install php-fpm',
      windows: 'choco install php  # o: scoop install php',
    },
    node: {
      macos:   'brew install node',
      linux:   'sudo apt install nodejs  # o: https://nodejs.org',
      wsl:     'sudo apt install nodejs',
      windows: 'https://nodejs.org  # o: choco install nodejs',
    },
    composer: {
      macos:   'devkit setup --php',
      linux:   'devkit setup --php',
      wsl:     'devkit setup --php',
      windows: 'devkit setup --php',
    },
    'docker-compose': {
      macos:   'Se incluye con Docker Desktop',
      linux:   'Se incluye con Docker Desktop',
      wsl:     'Se incluye con Docker Desktop',
      windows: 'Se incluye con Docker Desktop',
    },
  }

  return hints[dep]?.[osType] ?? 'ver documentación oficial'
}
