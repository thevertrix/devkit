import chalk from 'chalk'
import { execa } from 'execa'
import ora from 'ora'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { select, confirm } from '@inquirer/prompts'
import { hasBin, getBinVersion } from '../core/detect.js'

// Nombres que colisionan con el CLI u otros servicios internos
const RESERVED_NAMES = [
  'devkit', 'localhost', 'test', 'proxy', 'caddy', 'mailpit',
  'mysql', 'postgres', 'redis', 'docker', 'npm', 'node', 'php',
]

export async function newProject(name, opts) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-')

  if (RESERVED_NAMES.includes(slug)) {
    console.log(chalk.red(`\n⚠ "${name}" es un nombre reservado. Elige otro nombre para tu proyecto.`))
    console.log(chalk.dim(`  Nombres reservados: ${RESERVED_NAMES.join(', ')}\n`))
    return
  }

  const projectsBaseDir = join(os.homedir(), 'devkit-projects')

  if (!existsSync(projectsBaseDir)) {
    mkdirSync(projectsBaseDir, { recursive: true })
    console.log(chalk.blue(`ℹ Creado directorio central de proyectos en: ${projectsBaseDir}`))
  }

  const targetDir = join(projectsBaseDir, name)
  const projectSlug = slug

  console.log(chalk.cyan(`\n✨ Creando nuevo proyecto: ${chalk.bold(name)}\n`))

  if (existsSync(targetDir)) {
    console.log(chalk.red(`⚠ El directorio "${name}" ya existe en ${projectsBaseDir}. Abortando.`))
    return
  }

  try {
    if (opts.php) {
      const spinner = ora('Creando estructura base PHP...').start()
      mkdirSync(targetDir)
      await execa('git', ['init'], { cwd: targetDir })
      spinner.succeed(chalk.green('Estructura base PHP creada.'))
    } else if (opts.laravel) {
      await createLaravelProject(name, projectsBaseDir, targetDir)

      // Auto-configurar .env para que APP_URL apunte al dominio .test
      patchLaravelEnv(targetDir, projectSlug)

      console.log(chalk.green(`\n✓ Proyecto Laravel creado en ${targetDir}`))
    } else if (opts.next) {
      console.log(chalk.blue('Generando proyecto Next.js...'))
      console.log(chalk.dim('Esto puede tardar unos minutos descargando dependencias...'))
      await execa('npx', ['create-next-app@latest', name, '--ts', '--tailwind', '--eslint', '--app', '--src-dir', '--import-alias', '@/*'], { cwd: projectsBaseDir, stdio: 'inherit' })
      patchNextConfig(targetDir, projectSlug)
      console.log(chalk.green(`✓ Proyecto Next.js creado en ${targetDir}`))
    } else if (opts.nuxt) {
      console.log(chalk.blue('Generando proyecto Nuxt.js...'))
      console.log(chalk.dim('Esto puede tardar unos minutos descargando dependencias...'))
      await execa('npx', ['nuxi@latest', 'init', name], { cwd: projectsBaseDir, stdio: 'inherit' })
      patchNuxtConfig(targetDir, projectSlug)
      console.log(chalk.green(`✓ Proyecto Nuxt creado en ${targetDir}`))
    } else if (opts.angular) {
      console.log(chalk.blue('Generando proyecto Angular...'))
      console.log(chalk.dim('Esto puede tardar unos minutos descargando dependencias...'))
      await execa('npx', ['@angular/cli', 'new', name, '--defaults'], { cwd: projectsBaseDir, stdio: 'inherit' })
      console.log(chalk.green(`✓ Proyecto Angular creado en ${targetDir}`))
    } else if (opts.nestjs) {
      console.log(chalk.blue('Generando proyecto NestJS...'))
      console.log(chalk.dim('Esto puede tardar unos minutos descargando dependencias...'))
      await execa('npx', ['@nestjs/cli', 'new', name, '--package-manager', 'npm', '--strict'], { cwd: projectsBaseDir, stdio: 'inherit' })
      console.log(chalk.green(`✓ Proyecto NestJS creado en ${targetDir}`))
    } else if (opts.astro) {
      console.log(chalk.blue('Generando proyecto Astro...'))
      console.log(chalk.dim('Esto puede tardar unos minutos descargando dependencias...'))
      await execa('npm', ['create', 'astro@latest', name, '--', '--install', '--no-git', '--typescript', 'strict'], { cwd: projectsBaseDir, stdio: 'inherit' })
      patchAstroConfig(targetDir, projectSlug)
      console.log(chalk.green(`✓ Proyecto Astro creado en ${targetDir}`))
    } else if (opts.svelte) {
      console.log(chalk.blue('Generando proyecto SvelteKit...'))
      console.log(chalk.dim('Esto puede tardar unos minutos descargando dependencias...'))
      await execa('npm', ['create', 'svelte@latest', name], { cwd: projectsBaseDir, stdio: 'inherit' })
      patchSvelteKitConfig(targetDir, projectSlug)
      console.log(chalk.green(`✓ Proyecto SvelteKit creado en ${targetDir}`))
    } else {
      console.log(chalk.blue('Generando proyecto Vite (Vanilla TS) por defecto...'))
      console.log(chalk.dim('Esto puede tardar unos minutos descargando dependencias...'))
      await execa('npm', ['create', 'vite@latest', name, '--', '--template', 'vanilla-ts'], { cwd: projectsBaseDir, stdio: 'inherit' })
      patchViteConfig(targetDir, projectSlug)
      console.log(chalk.green(`✓ Proyecto Vite creado en ${targetDir}`))
    }

    console.log(`\nSiguientes pasos:`)
    console.log(`  ${chalk.cyan(`cd ${targetDir}`)}`)
    if (!opts.php && !opts.laravel && !opts.next && !opts.nuxt && !opts.angular && !opts.nestjs && !opts.astro && !opts.svelte) {
      console.log(`  ${chalk.cyan(`npm install`)}`)
    }
    console.log(`  ${chalk.cyan(`devkit start`)}\n`)

  } catch (error) {
    console.log(chalk.red('Ocurrió un error al crear el proyecto.'))
    console.error(error)
  }
}

// ─── Laravel helpers ──────────────────────────────────────────────────────────

/**
 * Busca el binario `laravel` en el PATH o en el directorio global de Composer.
 */
function findLaravelBin() {
  if (hasBin('laravel')) return 'laravel'

  const composerHome = os.platform() === 'win32'
    ? join(process.env.APPDATA || '', 'Composer')
    : join(os.homedir(), '.composer')

  const candidates = [
    join(composerHome, 'vendor', 'bin', 'laravel.bat'),
    join(composerHome, 'vendor', 'bin', 'laravel'),
  ]

  for (const bin of candidates) {
    if (existsSync(bin)) return bin
  }
  return null
}

/**
 * Obtiene la versión major.minor de PHP.
 */
function getPhpVersion() {
  const raw = getBinVersion('php')
  if (!raw) return null
  const match = raw.match(/(\d+\.\d+)/)
  return match ? parseFloat(match[1]) : null
}

/** PHP → Laravel constraint. null = última (laravel new interactivo). */
const laravelPhpCompat = [
  { minPhp: 8.3, constraint: null },
  { minPhp: 8.2, constraint: '^12.0' },
  { minPhp: 8.1, constraint: '^10.0' },
]

/**
 * Starter kits compatibles por versión de Laravel.
 * Laravel 12: breeze soporta react, vue, livewire, api
 * Laravel 10: breeze soporta blade, react, vue, api
 */
const starterKitsByVersion = {
  '^12.0': [
    { name: 'Ninguno',                    value: 'none' },
    { name: 'Laravel Breeze (React)',      value: 'breeze-react' },
    { name: 'Laravel Breeze (Vue)',        value: 'breeze-vue' },
    { name: 'Laravel Breeze (Livewire)',   value: 'breeze-livewire' },
    { name: 'Laravel Breeze (API only)',   value: 'breeze-api' },
  ],
  '^10.0': [
    { name: 'Ninguno',                    value: 'none' },
    { name: 'Laravel Breeze (Blade)',      value: 'breeze-blade' },
    { name: 'Laravel Breeze (React)',      value: 'breeze-react' },
    { name: 'Laravel Breeze (Vue)',        value: 'breeze-vue' },
    { name: 'Laravel Breeze (API only)',   value: 'breeze-api' },
  ],
}

/**
 * Crea un proyecto Laravel compatible con la versión de PHP instalada.
 * - PHP >= 8.3 → `laravel new` (interactivo nativo)
 * - PHP < 8.3  → `composer create-project` + configuración interactiva propia
 */
async function createLaravelProject(name, projectsBaseDir, targetDir) {
  if (!hasBin('composer')) {
    console.log(chalk.red('⚠ Se necesita Composer para crear proyectos Laravel.'))
    console.log(chalk.dim('  Instala Composer: https://getcomposer.org'))
    throw new Error('Composer no encontrado')
  }

  if (!hasBin('php')) {
    console.log(chalk.red('⚠ Se necesita PHP para crear proyectos Laravel.'))
    throw new Error('PHP no encontrado')
  }

  const phpVersion = getPhpVersion()
  const compat = laravelPhpCompat.find(c => phpVersion >= c.minPhp)

  if (!compat) {
    console.log(chalk.red(`⚠ PHP ${phpVersion} es demasiado antiguo para cualquier versión soportada de Laravel.`))
    console.log(chalk.yellow('  Se requiere al menos PHP 8.1.'))
    throw new Error(`PHP ${phpVersion} no soportado`)
  }

  // ─── PHP >= 8.3: laravel new interactivo nativo ────────────────────────
  if (!compat.constraint) {
    let laravelBin = findLaravelBin()

    if (!laravelBin) {
      console.log(chalk.blue('Instalando laravel/installer via Composer...'))
      console.log(chalk.dim('Esto puede requerir confirmación y tardar unos minutos...'))
      try {
        await execa('composer', ['global', 'require', 'laravel/installer'], { stdio: 'inherit' })
        console.log(chalk.green('✓ laravel/installer instalado'))
        laravelBin = findLaravelBin()
      } catch (e) {
        console.log(chalk.red('✗ No se pudo instalar laravel/installer'))
        console.log(chalk.dim(`  ${e.stderr?.split('\n')[0] || e.message}`))
      }
    }

    if (laravelBin) {
      console.log(chalk.blue('Usando el instalador de Laravel (interactivo)...\n'))
      try {
        await execa(laravelBin, ['new', name], { cwd: projectsBaseDir, stdio: 'inherit' })
        return
      } catch {
        console.log(chalk.yellow('\n⚠ El instalador de Laravel falló. Continuando con configuración manual...'))
        if (existsSync(targetDir)) {
          rmSync(targetDir, { recursive: true, force: true })
        }
      }
    }

    // Fallback: crear con composer + configurar interactivamente
    console.log(chalk.blue('Usando composer create-project...\n'))
    await execa('composer', ['create-project', 'laravel/laravel', name, '--no-scripts'], { cwd: projectsBaseDir, stdio: 'inherit' })
    await postCreateLaravel(targetDir)
    await configureLaravelProject(targetDir, null)
    return
  }

  // ─── PHP < 8.3: composer create-project + configuración interactiva ────
  console.log(chalk.yellow(`⚠ PHP ${phpVersion} detectado — instalando Laravel ${compat.constraint} (compatible).`))
  console.log(chalk.dim(`  Para la experiencia nativa completa, actualiza a PHP 8.3+\n`))

  // Preguntar configuración ANTES de instalar (así el usuario no espera dos veces)
  const choices = await askLaravelConfig(compat.constraint)

  // Crear proyecto base (sin scripts para evitar migraciones automáticas)
  const pkg = `laravel/laravel:${compat.constraint}`
  await execa('composer', ['create-project', pkg, name, '--no-scripts'], { cwd: projectsBaseDir, stdio: 'inherit' })
  await postCreateLaravel(targetDir)

  // Aplicar configuración elegida
  await configureLaravelProject(targetDir, choices)
}

/**
 * Ejecuta los pasos post-create esenciales de Laravel SIN migraciones.
 * Reemplaza los scripts que composer ejecutaría automáticamente.
 */
async function postCreateLaravel(targetDir) {
  // Crear .env desde .env.example
  const envExample = join(targetDir, '.env.example')
  const envPath = join(targetDir, '.env')
  if (existsSync(envExample) && !existsSync(envPath)) {
    writeFileSync(envPath, readFileSync(envExample, 'utf8'))
  }

  // Generar APP_KEY
  try {
    await execa('php', ['artisan', 'key:generate', '--ansi'], { cwd: targetDir, stdio: 'pipe' })
    console.log(chalk.green('  ✓ APP_KEY generada'))
  } catch {
    console.log(chalk.yellow('  ⚠ No se pudo generar APP_KEY'))
  }

  // Configurar TrustProxies para que Laravel confíe en Caddy
  patchTrustProxies(targetDir)
}

/**
 * Parcha bootstrap/app.php para que Laravel confíe en el proxy local de Caddy.
 * Sin esto, Laravel ignora los headers X-Forwarded-* y genera URLs con localhost.
 */
function patchTrustProxies(targetDir) {
  const bootstrapPath = join(targetDir, 'bootstrap', 'app.php')
  if (!existsSync(bootstrapPath)) return

  let content = readFileSync(bootstrapPath, 'utf8')

  // Ya está configurado
  if (content.includes('trustProxies')) return

  // Insertar trustProxies dentro del callback de withMiddleware
  content = content.replace(
    /->withMiddleware\(function\s*\(Middleware\s+\$middleware\).*?\{/s,
    (match) => `${match}\n        $middleware->trustProxies(at: '*');`
  )

  writeFileSync(bootstrapPath, content, 'utf8')
  console.log(chalk.green('  ✓ TrustProxies configurado en bootstrap/app.php'))
}

/**
 * Pregunta al usuario cómo quiere configurar su proyecto Laravel.
 */
async function askLaravelConfig(constraint) {
  console.log(chalk.bold('\n  Configuración del proyecto\n'))

  const starterKit = await select({
    message: 'Starter kit',
    choices: starterKitsByVersion[constraint] || starterKitsByVersion['^12.0'],
  })

  const database = await select({
    message: 'Base de datos',
    choices: [
      { name: 'SQLite',     value: 'sqlite' },
      { name: 'MySQL',      value: 'mysql' },
      { name: 'PostgreSQL', value: 'pgsql' },
      { name: 'SQL Server', value: 'sqlsrv' },
    ],
  })

  const testing = await select({
    message: 'Framework de testing',
    choices: [
      { name: 'Pest',    value: 'pest' },
      { name: 'PHPUnit', value: 'phpunit' },
    ],
  })

  const initGit = await confirm({
    message: 'Inicializar repositorio Git?',
    default: true,
  })

  console.log('')

  return { starterKit, database, testing, initGit }
}

/**
 * Aplica la configuración elegida al proyecto Laravel ya creado.
 */
async function configureLaravelProject(targetDir, choices) {
  // Si no hay choices (fallback de PHP >= 8.3), preguntar ahora
  if (!choices) {
    choices = await askLaravelConfig(null)
  }

  // 1. Configurar base de datos en .env
  const envPath = join(targetDir, '.env')
  if (existsSync(envPath)) {
    let env = readFileSync(envPath, 'utf8')
    env = env.replace(/^DB_CONNECTION=.*$/m, `DB_CONNECTION=${choices.database}`)

    if (choices.database !== 'sqlite') {
      // Descomentar las líneas DB_* (formato: "# DB_KEY=value")
      env = env.replace(/^# (DB_HOST=.*)$/m, '$1')
      env = env.replace(/^# (DB_PORT=.*)$/m, '$1')
      env = env.replace(/^# (DB_DATABASE=.*)$/m, '$1')
      env = env.replace(/^# (DB_USERNAME=.*)$/m, '$1')
      env = env.replace(/^# (DB_PASSWORD=.*)$/m, '$1')

      // Ajustar puerto para PostgreSQL
      if (choices.database === 'pgsql') {
        env = env.replace(/^DB_PORT=.*$/m, 'DB_PORT=5432')
      }
    }

    writeFileSync(envPath, env, 'utf8')
    console.log(chalk.green(`  ✓ Base de datos: ${choices.database}`))
  }

  // 2. Instalar starter kit
  if (choices.starterKit !== 'none') {
    const [kit, stack] = choices.starterKit.split('-')  // "breeze-react" → ["breeze", "react"]
    console.log(chalk.blue(`  Instalando Laravel ${kit}...`))
    console.log(chalk.dim('  Esto puede tardar varios minutos descargando dependencias...'))

    try {
      await execa('composer', ['require', `laravel/${kit}`, '--dev'], { cwd: targetDir, stdio: 'inherit' })

      const installArgs = ['artisan', `${kit}:install`]
      if (stack) installArgs.push(stack)

      await execa('php', installArgs, { cwd: targetDir, stdio: 'inherit' })

      // Instalar dependencias de NPM si el starter kit las necesita
      if (stack !== 'api' && existsSync(join(targetDir, 'package.json'))) {
        console.log(chalk.blue('    Instalando dependencias NPM...'))
        await execa('npm', ['install'], { cwd: targetDir, stdio: 'inherit' })
      }

      console.log(chalk.green(`  ✓ Laravel ${kit} (${stack || 'default'}) instalado`))
    } catch (e) {
      const msg = e.stderr?.split('\n').filter(Boolean).slice(0, 2).join('\n    ') || e.message
      console.log(chalk.red(`  ✗ Error instalando ${kit}`))
      console.log(chalk.dim(`    ${msg}`))
    }
  }

  // 3. Instalar Pest si fue elegido
  if (choices.testing === 'pest') {
    console.log(chalk.blue('  Instalando Pest...'))
    console.log(chalk.dim('  Descargando paquetes de testing...'))
    try {
      await execa('composer', [
        'require', 'pestphp/pest', 'pestphp/pest-plugin-laravel',
        '--dev', '--with-all-dependencies',
      ], { cwd: targetDir, stdio: 'inherit' })

      // pest:install viene del plugin de Laravel
      try {
        await execa('php', ['artisan', 'pest:install', '--no-interaction'], { cwd: targetDir, stdio: 'inherit' })
      } catch {
        // Fallback: inicializar Pest directamente
        const pestBin = os.platform() === 'win32' ? 'vendor\\bin\\pest' : 'vendor/bin/pest'
        await execa('php', [pestBin, '--init'], { cwd: targetDir, stdio: 'inherit' })
      }

      console.log(chalk.green('  ✓ Pest instalado'))
    } catch (e) {
      console.log(chalk.red('  ✗ Error instalando Pest'))
      console.log(chalk.dim(`    ${e.stderr?.split('\n')[0] || e.message}`))
    }
  }

  // 4. Inicializar Git
  if (choices.initGit) {
    try {
      await execa('git', ['init'], { cwd: targetDir, stdio: 'pipe' })
      await execa('git', ['add', '.'], { cwd: targetDir, stdio: 'pipe' })
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: targetDir, stdio: 'pipe' })
      console.log(chalk.green('  ✓ Repositorio Git inicializado'))
    } catch {
      console.log(chalk.dim('  ⚠ No se pudo inicializar Git'))
    }
  }
}

/**
 * Parcha el .env de Laravel para que APP_URL apunte al dominio .test de devkit.
 */
function patchLaravelEnv(targetDir, projectSlug) {
  const envPath = join(targetDir, '.env')
  if (!existsSync(envPath)) return

  let env = readFileSync(envPath, 'utf8')
  env = env.replace(/^APP_URL=.*$/m, `APP_URL=https://${projectSlug}.test`)
  writeFileSync(envPath, env, 'utf8')
  console.log(chalk.green(`  ✓ APP_URL=https://${projectSlug}.test`))

  // Configurar Vite para Laravel
  patchLaravelViteConfig(targetDir)

  // Parchar bootstrap/app.php para confiar en el proxy local
  patchTrustProxies(targetDir)
}

/**
 * Configura Laravel Vite para permitir dominios .test
 */
function patchLaravelViteConfig(targetDir) {
  const configPath = join(targetDir, 'vite.config.js')
  
  if (!existsSync(configPath)) {
    console.log(chalk.yellow('  ⚠ vite.config.js no encontrado, saltando configuración'))
    return
  }

  let config = readFileSync(configPath, 'utf8')
  
  // Si ya tiene la configuración, no hacer nada
  if (config.includes('allowedHosts')) {
    console.log(chalk.green('  ✓ vite.config.js ya configurado para dominios .test'))
    return
  }

  // Laravel usa una configuración específica con el plugin Laravel
  if (config.includes('export default defineConfig({')) {
    config = config.replace(
      'export default defineConfig({',
      `export default defineConfig({
    server: {
        allowedHosts: ['*.test', 'localhost'],
    },`
    )
  } else {
    // Configuración simple sin defineConfig
    config = config.replace(
      'export default {',
      `export default {
    server: {
        allowedHosts: ['*.test', 'localhost'],
    },`
    )
  }

  writeFileSync(configPath, config, 'utf8')
  console.log(chalk.green('  ✓ vite.config.js configurado para dominios .test'))
}

/**
 * Configura Astro para permitir dominios .test
 */
function patchAstroConfig(targetDir, projectSlug) {
  const configPath = join(targetDir, 'astro.config.mjs')
  
  if (!existsSync(configPath)) {
    console.log(chalk.yellow('  ⚠ astro.config.mjs no encontrado, saltando configuración'))
    return
  }

  let config = readFileSync(configPath, 'utf8')
  
  // Si ya tiene la configuración, no hacer nada
  if (config.includes('allowedHosts')) {
    console.log(chalk.green('  ✓ astro.config.mjs ya configurado para dominios .test'))
    return
  }

  const allowedHosts = `['${projectSlug}.test', '*.test', 'localhost']`

  // Manejar diferentes formatos de Astro config
  if (config.includes('export default defineConfig({') && config.includes('});')) {
    // Configuración con defineConfig vacía o con contenido
    const configContentMatch = config.match(/export default defineConfig\(\{([\s\S]*?)\}\);/)
    if (configContentMatch) {
      const existingContent = configContentMatch[1].trim()
      let newContent
      
      if (existingContent === '') {
        // Configuración vacía
        newContent = `
  vite: {
    server: {
      host: true,
      allowedHosts: ${allowedHosts},
    },
  },`
      } else {
        // Configuración existente
        newContent = `
  vite: {
    server: {
      host: true,
      allowedHosts: ${allowedHosts},
    },
  },
${existingContent}`
      }
      
      config = config.replace(
        /export default defineConfig\(\{[\s\S]*?\}\);/,
        `export default defineConfig({${newContent}
});`
      )
    }
  } else {
    // Fallback para otros formatos
    config = config.replace(
      'export default defineConfig({',
      `export default defineConfig({
  vite: {
    server: {
      host: true,
      allowedHosts: ${allowedHosts},
    },
  },`
    )
  }

  writeFileSync(configPath, config, 'utf8')
  console.log(chalk.green('  ✓ astro.config.mjs configurado para dominios .test'))
}

/**
 * Configura SvelteKit para permitir dominios .test
 */
function patchSvelteKitConfig(targetDir, projectSlug) {
  const viteConfigPath = join(targetDir, 'vite.config.js')
  
  if (!existsSync(viteConfigPath)) {
    console.log(chalk.yellow('  ⚠ vite.config.js no encontrado, saltando configuración'))
    return
  }

  let config = readFileSync(viteConfigPath, 'utf8')
  
  // Si ya tiene la configuración, no hacer nada
  if (config.includes('allowedHosts')) {
    console.log(chalk.green('  ✓ vite.config.js ya configurado para dominios .test'))
    return
  }

  const allowedHosts = `['${projectSlug}.test', '*.test', 'localhost']`

  // Añadir configuración de server allowedHosts
  if (config.includes('export default defineConfig({')) {
    config = config.replace(
      'export default defineConfig({',
      `export default defineConfig({
  server: {
    host: true,
    allowedHosts: ${allowedHosts},
  },`
    )
  } else {
    // Configuración simple sin defineConfig
    config = config.replace(
      'export default {',
      `export default {
  server: {
    host: true,
    allowedHosts: ${allowedHosts},
  },`
    )
  }

  writeFileSync(viteConfigPath, config, 'utf8')
  console.log(chalk.green('  ✓ vite.config.js configurado para dominios .test'))
}

/**
 * Configura Nuxt para permitir dominios .test
 */
function patchNuxtConfig(targetDir, projectSlug) {
  const configPath = join(targetDir, 'nuxt.config.ts')
  
  if (!existsSync(configPath)) {
    console.log(chalk.yellow('  ⚠ nuxt.config.ts no encontrado, saltando configuración'))
    return
  }

  let config = readFileSync(configPath, 'utf8')
  
  // Si ya tiene la configuración, no hacer nada
  if (config.includes('allowedHosts')) {
    console.log(chalk.green('  ✓ nuxt.config.ts ya configurado para dominios .test'))
    return
  }

  // Añadir configuración de vite server allowedHosts
  const allowedHosts = `['${projectSlug}.test', '*.test', 'localhost']`

  if (config.includes('export default defineNuxtConfig({')) {
    config = config.replace(
      'export default defineNuxtConfig({',
      `export default defineNuxtConfig({
  vite: {
    server: {
      host: true,
      allowedHosts: ${allowedHosts},
    },
  },`
    )
  } else {
    // Configuración simple sin defineNuxtConfig
    config = config.replace(
      'export default {',
      `export default {
  vite: {
    server: {
      host: true,
      allowedHosts: ${allowedHosts},
    },
  },`
    )
  }

  writeFileSync(configPath, config, 'utf8')
  console.log(chalk.green('  ✓ nuxt.config.ts configurado para dominios .test'))
}

/**
 * Configura Vite (vanilla) para permitir dominios .test
 */
function patchViteConfig(targetDir, projectSlug) {
  const configPath = join(targetDir, 'vite.config.ts')
  
  if (!existsSync(configPath)) {
    console.log(chalk.yellow('  ⚠ vite.config.ts no encontrado, saltando configuración'))
    return
  }

  let config = readFileSync(configPath, 'utf8')
  
  // Si ya tiene la configuración, no hacer nada
  if (config.includes('allowedHosts')) {
    console.log(chalk.green('  ✓ vite.config.ts ya configurado para dominios .test'))
    return
  }

  const allowedHosts = `['${projectSlug}.test', '*.test', 'localhost']`

  // Añadir configuración de server allowedHosts
  if (config.includes('export default defineConfig({')) {
    config = config.replace(
      'export default defineConfig({',
      `export default defineConfig({
  server: {
    host: true,
    allowedHosts: ${allowedHosts},
  },`
    )
  } else {
    // Configuración simple sin defineConfig
    config = config.replace(
      'export default {',
      `export default {
  server: {
    host: true,
    allowedHosts: ${allowedHosts},
  },`
    )
  }

  writeFileSync(configPath, config, 'utf8')
  console.log(chalk.green('  ✓ vite.config.ts configurado para dominios .test'))
}

/**
 * Configura Next.js para permitir dominios .test
 */
function patchNextConfig(targetDir, projectSlug) {
  const configPath = join(targetDir, 'next.config.ts')
  const configPathJs = join(targetDir, 'next.config.js')
  
  let actualPath = null
  if (existsSync(configPath)) {
    actualPath = configPath
  } else if (existsSync(configPathJs)) {
    actualPath = configPathJs
  } else {
    console.log(chalk.yellow('  ⚠ next.config.ts/js no encontrado, saltando configuración'))
    return
  }

  let config = readFileSync(actualPath, 'utf8')
  
  // Si ya tiene la configuración, no hacer nada
  if (config.includes('allowedDevOrigins')) {
    console.log(chalk.green('  ✓ next.config ya configurado para dominios .test'))
    return
  }

  const allowedOrigins = `['${projectSlug}.test', '*.test', 'localhost']`

  if (actualPath.endsWith('.ts')) {
    // Configuración TypeScript
    if (config.includes('const nextConfig: NextConfig = {')) {
      config = config.replace(
        'const nextConfig: NextConfig = {',
        `const nextConfig: NextConfig = {
  allowedDevOrigins: ${allowedOrigins},`
      )
    } else if (config.includes('/* config options here */')) {
      config = config.replace(
        '/* config options here */',
        `allowedDevOrigins: ${allowedOrigins},`
      )
    }
  } else {
    // Configuración JavaScript
    if (config.includes('const nextConfig = {')) {
      config = config.replace(
        'const nextConfig = {',
        `const nextConfig = {
  allowedDevOrigins: ${allowedOrigins},`
      )
    } else if (config.includes('module.exports = {')) {
      config = config.replace(
        'module.exports = {',
        `module.exports = {
  allowedDevOrigins: ${allowedOrigins},`
      )
    }
  }

  writeFileSync(actualPath, config, 'utf8')
  console.log(chalk.green('  ✓ next.config configurado para dominios .test'))
}
