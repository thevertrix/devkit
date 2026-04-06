import chalk from 'chalk'
import { select, input, confirm } from '@inquirer/prompts'
import { getServiceVersions, setServiceVersion, getRuntimeVersions, setRuntimeVersion } from '../core/config.js'

export async function services(options = {}) {
  const action = options.set ? 'set' : options.list ? 'list' : await promptAction()

  if (action === 'list') {
    await listVersions()
  } else if (action === 'set') {
    await setVersions(options)
  }
}

async function promptAction() {
  return await select({
    message: '¿Qué deseas hacer?',
    choices: [
      { name: 'Ver versiones por defecto', value: 'list' },
      { name: 'Configurar versiones por defecto', value: 'set' },
    ],
  })
}

async function listVersions() {
  const serviceVersions = getServiceVersions()
  const runtimeVersions = getRuntimeVersions()
  
  console.log(chalk.cyan('\n📦 Versiones por defecto de servicios:\n'))
  console.log(chalk.bold('  MySQL:     '), chalk.green(serviceVersions.mysql))
  console.log(chalk.bold('  PostgreSQL:'), chalk.green(serviceVersions.postgres))
  console.log(chalk.bold('  Redis:     '), chalk.green(serviceVersions.redis))
  console.log(chalk.bold('  Mailpit:   '), chalk.green(serviceVersions.mailpit))
  
  console.log(chalk.cyan('\n🔧 Versiones por defecto de runtimes:\n'))
  console.log(chalk.bold('  PHP:       '), chalk.green(runtimeVersions.php))
  console.log(chalk.bold('  Node.js:   '), chalk.green(runtimeVersions.node))
  console.log(chalk.bold('  Python:    '), chalk.green(runtimeVersions.python))
  console.log(chalk.bold('  Go:        '), chalk.green(runtimeVersions.go))
  
  console.log()
  console.log(chalk.dim('  Estas versiones se usan cuando no especificas una versión al ejecutar'))
  console.log(chalk.dim('  devkit start --mysql (sin especificar =X.X)'))
  console.log()
}

async function setVersions(options) {
  const serviceVersions = getServiceVersions()
  const runtimeVersions = getRuntimeVersions()
  
  const hasServiceFlags = options.mysql || options.postgres || options.redis || options.mailpit
  const hasRuntimeFlags = options.php || options.node || options.python || options.go
  
  if (hasServiceFlags || hasRuntimeFlags) {
    // Modo comando directo - Servicios
    if (options.mysql) {
      setServiceVersion('mysql', options.mysql)
      console.log(chalk.green(`✓ MySQL versión por defecto actualizada a: ${options.mysql}`))
    }
    if (options.postgres) {
      setServiceVersion('postgres', options.postgres)
      console.log(chalk.green(`✓ PostgreSQL versión por defecto actualizada a: ${options.postgres}`))
    }
    if (options.redis) {
      setServiceVersion('redis', options.redis)
      console.log(chalk.green(`✓ Redis versión por defecto actualizada a: ${options.redis}`))
    }
    if (options.mailpit) {
      setServiceVersion('mailpit', options.mailpit)
      console.log(chalk.green(`✓ Mailpit versión por defecto actualizada a: ${options.mailpit}`))
    }
    
    // Modo comando directo - Runtimes
    if (options.php) {
      setRuntimeVersion('php', options.php)
      console.log(chalk.green(`✓ PHP versión por defecto actualizada a: ${options.php}`))
    }
    if (options.node) {
      setRuntimeVersion('node', options.node)
      console.log(chalk.green(`✓ Node.js versión por defecto actualizada a: ${options.node}`))
    }
    if (options.python) {
      setRuntimeVersion('python', options.python)
      console.log(chalk.green(`✓ Python versión por defecto actualizada a: ${options.python}`))
    }
    if (options.go) {
      setRuntimeVersion('go', options.go)
      console.log(chalk.green(`✓ Go versión por defecto actualizada a: ${options.go}`))
    }
  } else {
    // Modo interactivo
    console.log(chalk.cyan('\n⚙️  Configurar versiones por defecto\n'))
    console.log(chalk.dim('  Presiona Enter para mantener la versión actual\n'))
    
    console.log(chalk.bold('Servicios:'))
    
    const mysqlVersion = await input({
      message: '  MySQL:',
      default: serviceVersions.mysql,
    })
    
    const postgresVersion = await input({
      message: '  PostgreSQL:',
      default: serviceVersions.postgres,
    })
    
    const redisVersion = await input({
      message: '  Redis:',
      default: serviceVersions.redis,
    })
    
    const mailpitVersion = await input({
      message: '  Mailpit:',
      default: serviceVersions.mailpit,
    })
    
    console.log(chalk.bold('\nRuntimes:'))
    
    const phpVersion = await input({
      message: '  PHP:',
      default: runtimeVersions.php,
    })
    
    const nodeVersion = await input({
      message: '  Node.js:',
      default: runtimeVersions.node,
    })
    
    const pythonVersion = await input({
      message: '  Python:',
      default: runtimeVersions.python,
    })
    
    const goVersion = await input({
      message: '  Go:',
      default: runtimeVersions.go,
    })
    
    const shouldSave = await confirm({
      message: '¿Guardar cambios?',
      default: true,
    })
    
    if (shouldSave) {
      setServiceVersion('mysql', mysqlVersion)
      setServiceVersion('postgres', postgresVersion)
      setServiceVersion('redis', redisVersion)
      setServiceVersion('mailpit', mailpitVersion)
      
      setRuntimeVersion('php', phpVersion)
      setRuntimeVersion('node', nodeVersion)
      setRuntimeVersion('python', pythonVersion)
      setRuntimeVersion('go', goVersion)
      
      console.log(chalk.green('\n✓ Versiones por defecto actualizadas correctamente\n'))
    } else {
      console.log(chalk.yellow('\n⚠ Cambios descartados\n'))
    }
  }
}
