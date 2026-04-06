#!/usr/bin/env node
import { program } from 'commander'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))

program
  .name('devkit')
  .description('Local dev environment — SSL, .test domains, mail')
  .version(pkg.version)

// Commands (lazy import so errors are isolated)
program
  .command('doctor')
  .description('Verifica que todas las dependencias estén instaladas')
  .action(async () => {
    const { doctor } = await import('../commands/doctor.js')
    await doctor()
  })

program
  .command('setup')
  .description('Instala y configura todas las dependencias automáticamente')
  .option('--php', 'incluir PHP en la instalación')
  .action(async (opts) => {
    const { setup } = await import('../commands/setup.js')
    await setup(opts)
  })

program
  .command('new <name>')
  .description('Crea un nuevo proyecto con dominio .test y SSL')
  .option('-p, --port <port>', 'puerto local del servidor', '3000')
  .option('--php', 'crear un esqueleto basico de PHP')
  .option('--laravel', 'crear un proyecto de Laravel (requiere composer)')
  .option('--next', 'crear un proyecto de Next.js')
  .option('--nuxt', 'crear un proyecto de Nuxt.js')
  .option('--angular', 'crear un proyecto de Angular')
  .option('--nestjs', 'crear un proyecto de NestJS')
  .option('--astro', 'crear un proyecto de Astro')
  .option('--svelte', 'crear un proyecto de SvelteKit')
  .action(async (name, opts) => {
    const { newProject } = await import('../commands/new.js')
    await newProject(name, opts)
  })

program
  .command('start')
  .description('Levanta el proyecto y los servicios en Docker si los requiere')
  .option('--mysql [version]', 'Agrega un contenedor MySQL (especifica versión opcional, ej: --mysql=8.0)')
  .option('--postgres [version]', 'Agrega un contenedor PostgreSQL (especifica versión opcional, ej: --postgres=15)')
  .option('--redis [version]', 'Agrega un contenedor Redis (especifica versión opcional, ej: --redis=7)')
  .option('--mailpit [version]', 'Agrega un contenedor Mailpit (especifica versión opcional, ej: --mailpit=latest)')
  .option('--php [version]', 'Agrega un contenedor PHP (especifica versión opcional, ej: --php=8.3)')
  .option('--node [version]', 'Agrega un contenedor Node.js (especifica versión opcional, ej: --node=20)')
  .option('--python [version]', 'Agrega un contenedor Python (especifica versión opcional, ej: --python=3.12)')
  .action(async (opts) => {
    const { start } = await import('../commands/start.js')
    await start(opts)
  })

program
  .command('stop')
  .description('Detiene servicios. Sin flags detiene todo el entorno')
  .option('--mysql', 'Detener solo el contenedor MySQL')
  .option('--postgres', 'Detener solo el contenedor PostgreSQL')
  .option('--redis', 'Detener solo el contenedor Redis')
  .option('--mailpit', 'Detener solo el contenedor Mailpit')
  .action(async (opts) => {
    const { stop } = await import('../commands/stop.js')
    await stop(opts)
  })

program
  .command('list')
  .description('Lista todos los proyectos configurados')
  .action(async () => {
    const { list } = await import('../commands/list.js')
    await list()
  })

program
  .command('mail')
  .description('Abre Mailpit en el navegador')
  .action(async () => {
    const { mail } = await import('../commands/mail.js')
    await mail()
  })

program
  .command('services')
  .description('Gestiona las versiones por defecto de los servicios y runtimes')
  .option('--list', 'Lista las versiones por defecto')
  .option('--set', 'Configura las versiones por defecto')
  .option('--mysql <version>', 'Establece la versión por defecto de MySQL')
  .option('--postgres <version>', 'Establece la versión por defecto de PostgreSQL')
  .option('--redis <version>', 'Establece la versión por defecto de Redis')
  .option('--mailpit <version>', 'Establece la versión por defecto de Mailpit')
  .option('--php <version>', 'Establece la versión por defecto de PHP')
  .option('--node <version>', 'Establece la versión por defecto de Node.js')
  .option('--python <version>', 'Establece la versión por defecto de Python')
  .option('--go <version>', 'Establece la versión por defecto de Go')
  .action(async (opts) => {
    const { services } = await import('../commands/services.js')
    await services(opts)
  })

program.parse()
