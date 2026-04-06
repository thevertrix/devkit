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
  .option('--mysql', 'Agrega un contenedor MySQL')
  .option('--postgres', 'Agrega un contenedor PostgreSQL')
  .option('--redis', 'Agrega un contenedor Redis')
  .option('--mailpit', 'Agrega un contenedor Mailpit (correo falso)')
  .action(async (opts) => {
    const { start } = await import('../commands/start.js')
    await start(opts)
  })

program
  .command('stop')
  .description('Detiene todos los servicios')
  .action(async () => {
    const { stop } = await import('../commands/stop.js')
    await stop()
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

program.parse()
