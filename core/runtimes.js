import chalk from 'chalk'
import ora from 'ora'
import { execa } from 'execa'
import {
  detectOS,
  hasBin,
  getBinVersion,
  detectPackageManager,
} from './detect.js'

// ─── Mapa de paquetes por runtime y package manager ───────────────────────

const pkgNames = {
  node: {
    brew: 'node', apt: 'nodejs', dnf: 'nodejs', pacman: 'nodejs',
    choco: 'nodejs', scoop: 'nodejs', winget: 'OpenJS.NodeJS.LTS',
  },
  php: {
    brew: 'php', apt: 'php', dnf: 'php-cli', pacman: 'php',
    choco: 'php', scoop: 'php',
  },
  composer: {
    choco: 'composer', scoop: 'composer',
  },
}

// ─── Metadata de runtimes ─────────────────────────────────────────────────

const runtimeMeta = [
  { name: 'node',     label: 'Node.js',  bin: 'node' },
  { name: 'php',      label: 'PHP',      bin: 'php' },
  { name: 'composer', label: 'Composer',  bin: 'composer' },
]

// ─── checkRuntimes ────────────────────────────────────────────────────────

/**
 * Verifica el estado de todos los runtimes soportados.
 * @returns {Array<{ name: string, label: string, installed: boolean, version: string|null }>}
 */
export function checkRuntimes() {
  return runtimeMeta.map(rt => {
    const installed = hasBin(rt.bin)
    const version = installed ? getBinVersion(rt.bin) : null
    return { name: rt.name, label: rt.label, installed, version }
  })
}

// ─── installRuntime ───────────────────────────────────────────────────────

/**
 * Instala un runtime específico usando el package manager detectado.
 * @param {string} name    — 'node' | 'php' | 'composer'
 * @param {{ name: string, install: string }} pm — package manager detectado
 * @param {string} osType  — resultado de detectOS()
 * @returns {Promise<boolean>} true si la instalación fue exitosa
 */
export async function installRuntime(name, pm, osType) {
  // Composer tiene un flujo especial en Unix
  if (name === 'composer') {
    return installComposer(pm, osType)
  }

  const pkgName = pkgNames[name]?.[pm.name]
  if (!pkgName) {
    console.log(`  ${chalk.yellow('!')} ${name} — paquete no disponible para ${pm.name}`)
    return false
  }

  const label = runtimeMeta.find(r => r.name === name)?.label ?? name
  const spinner = ora(`  Instalando ${label}...`).start()

  try {
    const installCmd = pm.install.split(' ')
    await execa(installCmd[0], [...installCmd.slice(1), pkgName], { stdio: 'pipe' })
    spinner.succeed(`  ${label} instalado`)
    return true
  } catch (e) {
    const detail = e.stderr?.split('\n').filter(Boolean).slice(0, 3).join('\n    ')
      || e.shortMessage || e.message
    spinner.fail(`  ${label} — error`)
    console.log(chalk.dim(`    ${detail}`))
    return false
  }
}

// ─── Instalación especial de Composer ─────────────────────────────────────

/**
 * Instala Composer. En Unix descarga el instalador oficial;
 * en Windows usa choco/scoop.
 */
async function installComposer(pm, osType) {
  const spinner = ora('  Instalando Composer...').start()

  // ─── Windows: usar package manager directamente ─────────────────────
  if (osType === 'windows') {
    const pkgName = pkgNames.composer[pm.name]
    if (!pkgName) {
      spinner.fail('  Composer — paquete no disponible para ' + pm.name)
      console.log(chalk.dim(`    Instala manualmente: ${chalk.cyan('https://getcomposer.org/download/')}`))
      return false
    }

    try {
      const installCmd = pm.install.split(' ')
      await execa(installCmd[0], [...installCmd.slice(1), pkgName], { stdio: 'pipe' })
      spinner.succeed('  Composer instalado')
      return true
    } catch (e) {
      const detail = e.stderr?.split('\n').filter(Boolean).slice(0, 3).join('\n    ')
        || e.shortMessage || e.message
      spinner.fail('  Composer — error')
      console.log(chalk.dim(`    ${detail}`))
      return false
    }
  }

  // ─── Unix (macOS / Linux / WSL): instalador oficial ─────────────────
  if (!hasBin('php')) {
    spinner.fail('  Composer requiere PHP instalado primero')
    return false
  }

  try {
    // Descargar el instalador
    await execa('php', ['-r', `copy('https://getcomposer.org/installer', '/tmp/composer-setup.php');`], { stdio: 'pipe' })

    // Ejecutar el instalador
    await execa('php', ['/tmp/composer-setup.php', '--install-dir=/tmp', '--filename=composer'], { stdio: 'pipe' })

    // Mover al PATH global con sudo
    await execa('sudo', ['mv', '/tmp/composer', '/usr/local/bin/composer'], { stdio: 'pipe' })

    // Limpiar
    await execa('rm', ['-f', '/tmp/composer-setup.php'], { stdio: 'pipe' })

    spinner.succeed('  Composer instalado en /usr/local/bin/composer')
    return true
  } catch (e) {
    const detail = e.stderr?.split('\n').filter(Boolean).slice(0, 3).join('\n    ')
      || e.shortMessage || e.message
    spinner.fail('  Composer — error en instalación')
    console.log(chalk.dim(`    ${detail}`))
    return false
  }
}

// ─── runtimeInstallHint ───────────────────────────────────────────────────

/**
 * Retorna una pista de instalación para un runtime según el OS.
 * @param {string} name   — 'node' | 'php' | 'composer'
 * @param {string} osType — resultado de detectOS()
 * @returns {string}
 */
export function runtimeInstallHint(name, osType) {
  const hints = {
    node: {
      macos:   'brew install node',
      linux:   'sudo apt install nodejs  # o: https://nodejs.org',
      wsl:     'sudo apt install nodejs  # o: https://nodejs.org',
      windows: 'choco install nodejs  # o: scoop install nodejs  # o: https://nodejs.org',
    },
    php: {
      macos:   'brew install php',
      linux:   'sudo apt install php  # o: sudo dnf install php-cli',
      wsl:     'sudo apt install php',
      windows: 'choco install php  # o: scoop install php',
    },
    composer: {
      macos:   'brew install composer  # o: https://getcomposer.org/download/',
      linux:   'https://getcomposer.org/download/',
      wsl:     'https://getcomposer.org/download/',
      windows: 'choco install composer  # o: scoop install composer',
    },
  }

  return hints[name]?.[osType] ?? 'ver documentación oficial'
}
