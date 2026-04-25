import chalk from 'chalk'
import ora from 'ora'
import { execa } from 'execa'
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import os from 'os'
import {
  detectOS,
  hasBin,
  detectPackageManager,
} from '../core/detect.js'

// ─── Elevación de permisos ─────────────────────────────────────────────────

function isElevated() {
  if (process.platform === 'win32') {
    const result = spawnSync('net', ['session'], { stdio: 'ignore' })
    return result.status === 0
  }
  return process.getuid?.() === 0
}

async function relaunchElevated() {
  const nodePath = process.execPath
  const cwd = process.cwd()
  // Resolver args a rutas absolutas y construir ArgumentList como una sola cadena
  const resolvedArgs = process.argv.slice(1).map(a => {
    // Si parece una ruta relativa a un archivo, resolver a absoluta
    if (a.includes('/') || a.includes('\\')) return join(cwd, a)
    return a
  })
  const innerArgs = resolvedArgs.map(a => `\`"${a}\``).join(' ')

  console.log(chalk.yellow('  ⚠  Se necesitan permisos de Administrador.'))
  console.log(chalk.dim('     Acepta el diálogo de UAC para continuar...\n'))

  try {
    await execa('powershell', [
      '-Command',
      `Start-Process -Verb RunAs -Wait -FilePath '${nodePath}' -ArgumentList '${innerArgs}' -WorkingDirectory '${cwd}'`,
    ], { stdio: 'inherit' })
    return true
  } catch {
    console.log(chalk.red('\n  ✗ No se obtuvieron permisos de administrador.'))
    console.log(chalk.dim('    Ejecuta manualmente en una terminal elevada: devkit setup\n'))
    return false
  }
}

// ─── Ejecutar comando con sudo (Unix) o directamente (Windows elevado) ────

async function runPrivileged(cmd, args, options = {}) {
  const osType = detectOS()
  if (osType === 'macos' || osType === 'linux' || osType === 'wsl') {
    // sudo pedirá password al usuario automáticamente
    return execa('sudo', [cmd, ...args], { stdio: 'inherit', ...options })
  }
  // En Windows ya estamos elevados a este punto
  return execa(cmd, args, { stdio: 'inherit', ...options })
}

// ─── Mapa de paquetes por package manager ──────────────────────────────────
const pkgNames = {
  mkcert: {
    brew: 'mkcert', apt: 'mkcert', dnf: 'mkcert', pacman: 'mkcert',
    choco: 'mkcert', scoop: 'mkcert', winget: 'FiloSottile.mkcert',
  },
  caddy: {
    brew: 'caddy', apt: 'caddy', dnf: 'caddy', pacman: 'caddy',
    choco: 'caddy', scoop: 'caddy', winget: 'CaddyServer.Caddy',
  },
  php: {
    brew: 'php', apt: 'php', dnf: 'php-cli', pacman: 'php',
    choco: 'php', scoop: 'php', winget: 'PHP.PHP',
  },
}

// Caddy en apt necesita repo externo
const needsRepo = {
  caddy: {
    apt: [
      ['sudo', 'apt', 'install', '-y', 'debian-keyring', 'debian-archive-keyring', 'apt-transport-https', 'curl'],
      ['bash', '-c', 'curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null || true'],
      ['bash', '-c', 'curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | sudo tee /etc/apt/sources.list.d/caddy-stable.list'],
      ['sudo', 'apt', 'update'],
    ],
  },
}

export async function setup(opts) {
  const osType = detectOS()
  const pm = detectPackageManager(osType)

  console.log('')
  console.log(chalk.bold('  devkit setup'))
  console.log(chalk.dim(`  OS: ${osLabel(osType)}  •  Package manager: ${pm?.name ?? 'no detectado'}\n`))

  // ─── Sin package manager ─────────────────────────────────────────────────
  if (!pm) {
    console.log(chalk.red('  ✗ No se detectó un package manager.'))
    printPmHelp(osType)
    process.exit(1)
  }

  // ─── Auto-elevación en Windows ───────────────────────────────────────────
  const needsAdmin = osType === 'windows' && (pm.name === 'choco' || pm.name === 'winget')
  if (needsAdmin && !isElevated()) {
    const ok = await relaunchElevated()
    // El proceso elevado ya hizo todo el trabajo
    process.exit(ok ? 0 : 1)
  }

  // ─── 1. Instalar binarios ────────────────────────────────────────────────
  const bins = [
    { name: 'mkcert', label: 'mkcert (SSL)',   required: true },
    { name: 'caddy',  label: 'Caddy (proxy)',   required: true },
    { name: 'docker', label: 'Docker',          required: true,  manual: true },
    { name: 'php',    label: 'PHP (opcional)',   required: false },
  ]

  for (const dep of bins) {
    if (hasBin(dep.name)) {
      console.log(`  ${chalk.green('✔')} ${dep.label} ya instalado`)
      continue
    }

    if (dep.manual) {
      await handleManualDep(dep, osType)
      continue
    }

    if (!dep.required && !opts.php && dep.name === 'php') {
      console.log(`  ${chalk.dim('–')} ${dep.label} omitido (usa --php para incluirlo)`)
      continue
    }

    await installPkg(dep, pm)
  }

  // ─── 2. Configurar mkcert CA ────────────────────────────────────────────
  console.log('')
  if (hasBin('mkcert')) {
    console.log(chalk.blue('  Configurando CA local (mkcert)...'))
    if (osType === 'macos') {
      console.log(chalk.dim('  Acepta el diálogo de macOS para agregar el certificado al keychain.'))
    }
    try {
      // Usar stdio: 'inherit' para que el usuario pueda interactuar con prompts de seguridad
      await execa('mkcert', ['-install'], { stdio: 'inherit' })
      console.log(`  ${chalk.green('✔')} CA local instalada (mkcert -install)`)
    } catch (e) {
      console.log(`  ${chalk.red('✗')} mkcert -install falló: ${e.shortMessage ?? e.message}`)
    }
  }

  // ─── 3. Configurar DNS .test ─────────────────────────────────────────────
  console.log('')
  await setupDns(osType, pm)

  // ─── 4. Wrappers de runtime vía Docker ───────────────────────────────────
  console.log('')
  console.log(chalk.blue('  Configurando runtimes vía Docker...'))
  console.log(chalk.dim('  node, npm, npx, php, composer, python, pip → se ejecutan en contenedores'))

  try {
    const { writeWrappers, ensurePathInShell } = await import('../core/wrappers.js')
    const created = writeWrappers()
    console.log(`  ${chalk.green('✔')} Wrappers creados: ${chalk.dim(created.join(', '))}`)

    const updatedRc = ensurePathInShell()
    if (updatedRc) {
      const rcShort = updatedRc.replace(os.homedir(), '~')
      console.log(`  ${chalk.green('✔')} PATH actualizado en ${chalk.dim(rcShort)}`)
      console.log(chalk.yellow(`\n  ⚠  Recarga tu terminal:  source ${rcShort}`))
    } else {
      console.log(`  ${chalk.green('✔')} PATH ya configurado`)
    }
  } catch (e) {
    console.log(`  ${chalk.red('✗')} Error creando wrappers: ${e.message}`)
  }

  // ─── 5. Resultado ────────────────────────────────────────────────────────
  console.log('')
  console.log(chalk.dim('  ─────────────────────────────────────────'))
  console.log(`  ${chalk.green('✔')} Setup completo.`)
  console.log(`  Ejecuta ${chalk.cyan('devkit doctor')} para verificar el estado.\n`)
}

// ─── Instalación de un paquete ─────────────────────────────────────────────

async function installPkg(dep, pm) {
  const pkgName = pkgNames[dep.name]?.[pm.name]
  if (!pkgName) {
    console.log(`  ${chalk.yellow('!')} ${dep.label} — paquete no disponible para ${pm.name}`)
    return
  }

  // Repos adicionales si aplica (ej: Caddy en apt)
  const repoSteps = needsRepo[dep.name]?.[pm.name]
  if (repoSteps) {
    const repoSpinner = ora(`  Agregando repositorio de ${dep.name}...`).start()
    try {
      for (const cmd of repoSteps) {
        await execa(cmd[0], cmd.slice(1), { stdio: 'pipe' })
      }
      repoSpinner.succeed(`  Repositorio de ${dep.name} configurado`)
    } catch (e) {
      repoSpinner.fail(`  Error agregando repo de ${dep.name}: ${e.shortMessage ?? e.message}`)
      return
    }
  }

  const spinner = ora(`  Instalando ${dep.label}...`).start()
  try {
    const installCmd = pm.install.split(' ')
    await execa(installCmd[0], [...installCmd.slice(1), pkgName], { stdio: 'pipe' })
    spinner.succeed(`  ${dep.label} instalado`)
  } catch (e) {
    const detail = e.stderr?.split('\n').filter(Boolean).slice(0, 3).join('\n    ') || e.shortMessage || e.message
    spinner.fail(`  ${dep.label} — error`)
    console.log(chalk.dim(`    ${detail}`))
  }
}

// ─── Docker: descarga automática si no existe ──────────────────────────────

async function handleManualDep(dep, osType) {
  if (dep.name !== 'docker') {
    console.log(`  ${chalk.yellow('!')} ${dep.label} requiere instalación manual`)
    return
  }

  if (osType === 'windows') {
    console.log(`  ${chalk.yellow('!')} Docker Desktop no instalado`)
    console.log(chalk.dim('    Descargando Docker Desktop...'))

    const spinner = ora('  Descargando Docker Desktop...').start()
    try {
      // winget puede instalar Docker Desktop automáticamente
      if (hasBin('winget')) {
        await execa('winget', [
          'install', '--accept-source-agreements', '--accept-package-agreements',
          'Docker.DockerDesktop',
        ], { stdio: 'pipe' })
        spinner.succeed('  Docker Desktop instalado (requiere reinicio)')
        return
      }
    } catch { /* fallthrough */ }

    try {
      if (hasBin('choco')) {
        await execa('choco', ['install', '-y', 'docker-desktop'], { stdio: 'pipe' })
        spinner.succeed('  Docker Desktop instalado (requiere reinicio)')
        return
      }
    } catch { /* fallthrough */ }

    spinner.fail('  No se pudo instalar Docker Desktop automáticamente')
    console.log(`    ${chalk.dim('→')} ${chalk.cyan('https://www.docker.com/products/docker-desktop')}`)
  } else if (osType === 'linux' || osType === 'wsl') {
    const spinner = ora('  Instalando Docker...').start()
    try {
      await runPrivileged('apt', ['install', '-y', 'docker.io', 'docker-compose-plugin'], { stdio: 'pipe' })
      spinner.succeed('  Docker instalado')
    } catch (e) {
      spinner.fail(`  Docker — error: ${e.shortMessage ?? e.message}`)
      console.log(`    ${chalk.dim('→')} ${chalk.yellow('sudo apt install docker.io docker-compose-plugin')}`)
    }
  } else if (osType === 'macos') {
    console.log(`  ${chalk.yellow('!')} Docker Desktop no instalado`)
    // brew cask puede instalarlo
    const spinner = ora('  Instalando Docker Desktop via brew...').start()
    try {
      await execa('brew', ['install', '--cask', 'docker'], { stdio: 'pipe' })
      spinner.succeed('  Docker Desktop instalado')
    } catch {
      spinner.fail('  No se pudo instalar Docker Desktop')
      console.log(`    ${chalk.dim('→')} ${chalk.cyan('https://www.docker.com/products/docker-desktop')}`)
    }
  }
}

// ─── DNS por OS ────────────────────────────────────────────────────────────

async function setupDns(osType, pm) {
  if (osType === 'macos') {
    await setupDnsMac()
  } else if (osType === 'linux' || osType === 'wsl') {
    await setupDnsLinux(pm)
  } else if (osType === 'windows') {
    setupDnsWindows()
  }
}

async function setupDnsMac() {
  if (!hasBin('dnsmasq')) {
    console.log(chalk.blue('  Instalando dnsmasq...'))
    try {
      // Mostrar progreso de brew
      await execa('brew', ['install', 'dnsmasq'], { stdio: 'inherit' })
      console.log(`  ${chalk.green('✔')} dnsmasq instalado`)
    } catch (e) {
      console.log(`  ${chalk.red('✗')} dnsmasq — error: ${e.shortMessage ?? e.message}`)
      return
    }
  }

  // Detectar el prefix de Homebrew (Intel o ARM)
  let brewPrefix = '/usr/local'
  try {
    const { stdout } = await execa('brew', ['--prefix'], { stdio: 'pipe' })
    brewPrefix = stdout.trim()
  } catch {
    // Fallback: intentar detectar si estamos en ARM
    if (existsSync('/opt/homebrew')) {
      brewPrefix = '/opt/homebrew'
    }
  }

  const confDir = join(brewPrefix, 'etc', 'dnsmasq.d')
  if (!existsSync(confDir)) {
    mkdirSync(confDir, { recursive: true })
  }

  const confFile = join(confDir, 'test.conf')
  if (!existsSync(confFile) || !readFileSync(confFile, 'utf8').includes('/.test/')) {
    writeFileSync(confFile, 'address=/.test/127.0.0.1\n')
    console.log(`  ${chalk.green('✔')} dnsmasq configurado para *.test`)
  } else {
    console.log(`  ${chalk.green('✔')} dnsmasq ya configurado para *.test`)
  }

  if (!existsSync('/etc/resolver/test')) {
    console.log('')
    console.log(chalk.yellow('  🔐 Se necesita contraseña de administrador para configurar DNS'))
    console.log(chalk.dim('      Esto creará /etc/resolver/test para resolución automática de dominios *.test'))
    console.log('')
    
    try {
      await runPrivileged('mkdir', ['-p', '/etc/resolver'], { stdio: 'inherit' })
      const tempFile = join(os.tmpdir(), 'devkit-resolver-test')
      writeFileSync(tempFile, 'nameserver 127.0.0.1\n', 'utf8')
      await runPrivileged('cp', [tempFile, '/etc/resolver/test'], { stdio: 'inherit' })
      console.log(`  ${chalk.green('✔')} /etc/resolver/test creado`)
    } catch {
      console.log(`  ${chalk.red('✗')} No se pudo crear /etc/resolver/test — ejecuta manualmente con sudo`)
    }
  } else {
    console.log(`  ${chalk.green('✔')} /etc/resolver/test ya existe`)
  }

  try {
    // Reiniciar dnsmasq con brew services (sin sudo, ya que brew services lo maneja)
    await execa('brew', ['services', 'restart', 'dnsmasq'], { stdio: 'pipe' })
    
    // Verificar que el servicio esté corriendo
    const { stdout } = await execa('brew', ['services', 'list'], { stdio: 'pipe' })
    if (stdout.includes('dnsmasq') && stdout.includes('started')) {
      console.log(`  ${chalk.green('✔')} dnsmasq reiniciado y corriendo`)
    } else if (stdout.includes('dnsmasq') && stdout.includes('error')) {
      console.log(`  ${chalk.yellow('⚠')} dnsmasq instalado pero con error al iniciar`)
      console.log(chalk.dim('    Intenta: sudo brew services restart dnsmasq'))
    } else {
      console.log(`  ${chalk.green('✔')} dnsmasq reiniciado`)
    }
  } catch {
    console.log(`  ${chalk.yellow('!')} No se pudo reiniciar dnsmasq — ejecuta: brew services restart dnsmasq`)
  }
}

async function setupDnsLinux(pm) {
  if (!hasBin('dnsmasq')) {
    const spinner = ora('  Instalando dnsmasq...').start()
    try {
      const installCmd = pm.install.split(' ')
      await execa(installCmd[0], [...installCmd.slice(1), 'dnsmasq'], { stdio: 'pipe' })
      spinner.succeed('  dnsmasq instalado')
    } catch (e) {
      spinner.fail(`  dnsmasq — error: ${e.shortMessage ?? e.message}`)
      return
    }
  }

  const confDir = '/etc/dnsmasq.d'
  const confFile = join(confDir, 'test.conf')

  if (!existsSync(confFile) || !readFileSync(confFile, 'utf8').includes('/.test/')) {
    const spinner = ora('  Configurando dnsmasq para *.test...').start()
    try {
      await runPrivileged('mkdir', ['-p', confDir], { stdio: 'pipe' })
      await execa('bash', ['-c', `echo "address=/.test/127.0.0.1" | sudo tee ${confFile}`], { stdio: 'pipe' })
      await runPrivileged('systemctl', ['restart', 'dnsmasq'], { stdio: 'pipe' })
      spinner.succeed('  dnsmasq configurado y reiniciado para *.test')
    } catch (e) {
      spinner.fail(`  Error configurando dnsmasq: ${e.shortMessage ?? e.message}`)
    }
  } else {
    console.log(`  ${chalk.green('✔')} dnsmasq ya configurado para *.test`)
  }
}

function setupDnsWindows() {
  console.log(`  ${chalk.green('✔')} DNS: devkit gestionará ${chalk.dim('C:\\Windows\\System32\\drivers\\etc\\hosts')} al crear proyectos`)
  console.log(chalk.dim('    Cada "devkit new <nombre>" agregará <nombre>.test → 127.0.0.1 al hosts file'))
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function printPmHelp(osType) {
  const help = {
    macos:   `  Instala Homebrew: ${chalk.cyan('https://brew.sh')}`,
    linux:   '  Se esperaba apt, dnf o pacman en el PATH.',
    wsl:     '  Se esperaba apt en el PATH.',
    windows: `  Instala uno de:\n    • Chocolatey: ${chalk.cyan('https://chocolatey.org/install')}\n    • Scoop:      ${chalk.cyan('https://scoop.sh')}`,
  }
  console.log(help[osType] ?? '')
  console.log('')
}

function osLabel(os) {
  return { macos: 'macOS', linux: 'Linux', wsl: 'Windows (WSL2)', windows: 'Windows', unknown: 'desconocido' }[os] ?? os
}
