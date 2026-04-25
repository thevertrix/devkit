import chalk from 'chalk'
import { execaSync } from 'execa'
import {
  detectOS,
  hasBin,
  getBinVersion,
  isDockerRunning,
  hasDockerCompose,
  getDevkitContainers,
  isDnsmasqConfigured,
  isResolverConfigured,
  installHint,
} from '../core/detect.js'
import { isWrapper, getWrapperImage } from '../core/wrappers.js'

export async function doctor() {
  const os = detectOS()

  console.log('')
  console.log(chalk.bold('  devkit doctor'))
  console.log(chalk.dim(`  OS detectado: ${osLabel(os)}\n`))

  let allGood = true

  // ─── Binarios requeridos ────────────────────────────────────────────────
  console.log(chalk.dim('  Binarios\n'))

  const bins = [
    { name: 'mkcert',  required: true,  label: 'mkcert          (SSL)' },
    { name: 'caddy',   required: true,  label: 'caddy           (proxy)' },
    { name: 'docker',  required: true,  label: 'docker          (contenedores)' },
  ]

  for (const dep of bins) {
    const found = hasBin(dep.name)
    const version = found ? getBinVersion(dep.name) : null

    if (found) {
      const ver = version ? chalk.dim(` ${version}`) : ''
      console.log(`  ${chalk.green('✔')} ${dep.label}${ver}`)
    } else {
      allGood = false
      const hint = installHint(dep.name, os)
      console.log(`  ${chalk.red('✗')} ${dep.label}`)
      console.log(`    ${chalk.dim('→')} ${chalk.yellow(hint)}`)
    }
  }

  // docker compose (v2) — check via subcommand, not binary
  const composeOk = hasDockerCompose()
  if (composeOk) {
    const composeVer = getDockerComposeVersion()
    console.log(`  ${chalk.green('✔')} docker compose  (orquestación)${composeVer ? chalk.dim(` ${composeVer}`) : ''}`)
  } else {
    allGood = false
    console.log(`  ${chalk.red('✗')} docker compose  (orquestación)`)
    console.log(`    ${chalk.dim('→')} ${chalk.yellow(installHint('docker-compose', os))}`)
  }

  // ─── Runtimes opcionales ────────────────────────────────────────────────
  console.log('')
  console.log(chalk.dim('  Runtimes\n'))

  const runtimeBins = [
    { cmd: 'node',     label: 'node    ' },
    { cmd: 'npm',      label: 'npm     ' },
    { cmd: 'php',      label: 'php     ' },
    { cmd: 'composer', label: 'composer' },
    { cmd: 'python',   label: 'python  ' },
  ]

  for (const { cmd, label } of runtimeBins) {
    const found = hasBin(cmd)
    const wrapped = !found && isWrapper(cmd)

    if (found) {
      const ver = getBinVersion(cmd) ?? ''
      console.log(`  ${chalk.green('✔')} ${label}  ${chalk.dim(ver)}`)
    } else if (wrapped) {
      const image = getWrapperImage(cmd) ?? 'Docker'
      console.log(`  ${chalk.green('✔')} ${label}  ${chalk.cyan('via Docker')} ${chalk.dim(`(${image})`)}`)
    } else {
      console.log(`  ${chalk.dim('–')} ${label}  ${chalk.dim('(no instalado — ejecuta devkit setup)')}`)
    }
  }

  // ─── Servicios (Docker) ─────────────────────────────────────────────────
  console.log('')
  console.log(chalk.dim('  Servicios\n'))

  const dockerRunning = hasBin('docker') && isDockerRunning()
  if (dockerRunning) {
    console.log(`  ${chalk.green('✔')} Docker corriendo`)
  } else if (hasBin('docker')) {
    allGood = false
    console.log(`  ${chalk.red('✗')} Docker instalado pero no está corriendo`)
    console.log(`    ${chalk.dim('→')} ${chalk.yellow('Inicia Docker Desktop o el daemon')}`)
  }

  // Contenedores devkit
  if (dockerRunning) {
    const containers = getDevkitContainers()
    if (containers.length > 0) {
      for (const c of containers) {
        console.log(`  ${chalk.green('✔')} ${c.name}  ${chalk.dim(c.status)}`)
      }
    } else {
      console.log(chalk.dim('    Sin proyectos configurados — usa devkit new'))
    }
  }

  // ─── DNS ────────────────────────────────────────────────────────────────
  console.log('')
  console.log(chalk.dim('  DNS (.test)\n'))

  if (os === 'windows') {
    // En Windows se usa el hosts file, gestionado por devkit new
    console.log(`  ${chalk.green('✔')} DNS gestionado vía hosts file`)
    console.log(chalk.dim('    devkit new agregará entradas *.test → 127.0.0.1'))
  } else {
    const dnsmasqInstalled = hasBin('dnsmasq')
    const dnsmasqConfigured = isDnsmasqConfigured()
    
    // Verificar si el servicio está corriendo (macOS)
    let dnsmasqRunning = false
    if (os === 'macos' && dnsmasqInstalled) {
      try {
        // Primero verificar con brew services
        const { stdout } = execaSync('brew', ['services', 'list'], { stdio: 'pipe' })
        dnsmasqRunning = stdout.includes('dnsmasq') && stdout.includes('started')
        
        // Si brew services dice que hay error, verificar el proceso directamente
        if (!dnsmasqRunning && stdout.includes('dnsmasq')) {
          try {
            const { stdout: psOutput } = execaSync('pgrep', ['dnsmasq'], { stdio: 'pipe' })
            dnsmasqRunning = psOutput.trim().length > 0
          } catch {
            // pgrep no encontró proceso dnsmasq
          }
        }
      } catch {}
    }

    if (!dnsmasqInstalled) {
      allGood = false
      console.log(`  ${chalk.red('✗')} dnsmasq  no instalado`)
      console.log(`    ${chalk.dim('→')} ${chalk.yellow(installHint('dnsmasq', os))}`)
    } else if (!dnsmasqConfigured) {
      allGood = false
      console.log(`  ${chalk.yellow('!')} dnsmasq  instalado pero sin config .test`)
      console.log(`    ${chalk.dim('→')} ${chalk.yellow('Ejecuta: devkit setup')}`)
    } else if (!dnsmasqRunning && os === 'macos') {
      console.log(`  ${chalk.yellow('!')} dnsmasq  configurado pero no está corriendo`)
      console.log(`    ${chalk.dim('→')} ${chalk.yellow('sudo brew services restart dnsmasq')}`)
    } else {
      console.log(`  ${chalk.green('✔')} dnsmasq  configurado para *.test`)
    }

    if (os === 'macos') {
      const resolverOk = isResolverConfigured()
      if (resolverOk) {
        console.log(`  ${chalk.green('✔')} /etc/resolver/test  configurado`)
      } else {
        allGood = false
        console.log(`  ${chalk.red('✗')} /etc/resolver/test  faltante`)
        console.log(`    ${chalk.dim('→')} ${chalk.yellow('sudo mkdir -p /etc/resolver && echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/test')}`)
      }
    }
  }

  // ─── Resultado final ────────────────────────────────────────────────────
  console.log('')
  if (allGood) {
    console.log(`  ${chalk.bgGreen.black(' LISTO ')} Todo en orden. Usa ${chalk.cyan('devkit new <nombre>')} para crear un proyecto.\n`)
  } else {
    console.log(`  ${chalk.bgYellow.black(' ACCIÓN REQUERIDA ')} Resuelve los items marcados con ${chalk.red('✗')} y vuelve a correr ${chalk.cyan('devkit doctor')}.\n`)
  }
}

function getDockerComposeVersion() {
  try {
    const { stdout } = execaSync('docker', ['compose', 'version'], { stderr: 'ignore' })
    return stdout.split('\n')[0].trim()
  } catch {
    return null
  }
}

function osLabel(os) {
  const labels = {
    macos:   'macOS',
    linux:   'Linux',
    wsl:     'Windows (WSL2)',
    windows: 'Windows',
    unknown: 'desconocido',
  }
  return labels[os] ?? os
}
