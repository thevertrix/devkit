import chalk from 'chalk'
import {
  detectOS,
  hasBin,
  getBinVersion,
  isDockerRunning,
  isDnsmasqConfigured,
  isResolverConfigured,
  installHint,
} from '../core/detect.js'

export async function doctor() {
  const os = detectOS()

  console.log('')
  console.log(chalk.bold('  devkit doctor'))
  console.log(chalk.dim(`  OS detectado: ${osLabel(os)}\n`))

  let allGood = true

  // ─── Binarios requeridos ────────────────────────────────────────────────
  console.log(chalk.dim('  Binarios\n'))

  const bins = [
    { name: 'mkcert',  required: true,  label: 'mkcert  (SSL)' },
    { name: 'caddy',   required: true,  label: 'caddy   (proxy)' },
    { name: 'docker',  required: true,  label: 'docker  (mail + DB)' },
    { name: 'php',     required: false, label: 'php     (opcional)' },
    { name: 'node',    required: true,  label: 'node    (runtime)' },
  ]

  for (const dep of bins) {
    const found = hasBin(dep.name)
    const version = found ? getBinVersion(dep.name) : null

    if (found) {
      const ver = version ? chalk.dim(` ${version}`) : ''
      console.log(`  ${chalk.green('✔')} ${dep.label}${ver}`)
    } else if (dep.required) {
      allGood = false
      const hint = installHint(dep.name, os)
      console.log(`  ${chalk.red('✗')} ${dep.label}`)
      console.log(`    ${chalk.dim('→')} ${chalk.yellow(hint)}`)
    } else {
      console.log(`  ${chalk.dim('–')} ${dep.label}  ${chalk.dim('(no instalado)')}`)
    }
  }

  // ─── Docker corriendo ───────────────────────────────────────────────────
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

    if (!dnsmasqInstalled) {
      allGood = false
      console.log(`  ${chalk.red('✗')} dnsmasq  no instalado`)
      console.log(`    ${chalk.dim('→')} ${chalk.yellow(installHint('dnsmasq', os))}`)
    } else if (!dnsmasqConfigured) {
      allGood = false
      console.log(`  ${chalk.yellow('!')} dnsmasq  instalado pero sin config .test`)
      console.log(`    ${chalk.dim('→')} ${chalk.yellow('Ejecuta: devkit setup')}`)
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
