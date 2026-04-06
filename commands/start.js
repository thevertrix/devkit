import { basename } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execa } from 'execa'
import chalk from 'chalk'
import ora from 'ora'
import { detectFramework, getFrameworkDefaultPort } from '../core/detect.js'
import { writeBaseCompose, startServices } from '../core/docker.js'
import { registerProject, reloadProxy } from '../core/proxy.js'
import { addHostEntry } from '../core/dns.js'

export async function start(options = {}) {
  const cwd = process.cwd()
  const projectName = basename(cwd).toLowerCase().replace(/[^a-z0-9]/g, '-')
  
  console.log(chalk.cyan(`\n🚀 Iniciando entorno de desarrollo para: ${chalk.bold(projectName)}`))

  // 1. Detectar framework y puerto
  const framework = detectFramework(cwd)
  let port = 8000 // puerto fallback para servidores desconocidos
  
  if (framework) {
    port = getFrameworkDefaultPort(framework) || 8000
    console.log(chalk.green(`✓ Framework detectado:`), chalk.bold(framework), chalk.dim(`(Puerto esperado: ${port})`))
  } else {
    console.log(chalk.yellow(`⚠ No se detectó un framework conocido. Asumiendo puerto ${port}.`))
  }

  // 2. Levantar servicios Docker (Bases de datos, Redis, Mailpit)
  // Checamos si existe un docker-compose o si hay opciones pedidas
  const hasDockerCompose = existsSync(`${cwd}/docker-compose.yml`)
  
  // Nota: Idealmente estas opciones (mysql, postgres, etc.) vendrían de un devkit.json 
  // o de argumentos de la CLI (ej: devkit start --with-mysql)
  const needsDocker = hasDockerCompose || options.mysql || options.postgres || options.redis || options.mailpit

  if (needsDocker) {
    if (!hasDockerCompose) {
      console.log(chalk.blue(`Generando docker-compose.yml con servicios requeridos...`))
      writeBaseCompose(cwd, { 
        projectName, 
        mysql: options.mysql, 
        postgres: options.postgres, 
        redis: options.redis, 
        mailpit: options.mailpit 
      })
    }
    await startServices(cwd)
  }

  // 3. Si es Laravel, asegurar que APP_URL y TrustProxies estén configurados
  if (framework === 'laravel') {
    const envPath = join(cwd, '.env')
    if (existsSync(envPath)) {
      let env = readFileSync(envPath, 'utf8')
      const expectedUrl = `https://${projectName}.test`
      if (!env.includes(`APP_URL=${expectedUrl}`)) {
        env = env.replace(/^APP_URL=.*$/m, `APP_URL=${expectedUrl}`)
        writeFileSync(envPath, env, 'utf8')
        console.log(chalk.green(`✓ .env actualizado: APP_URL=${expectedUrl}`))
      }
    }

    // Asegurar que Laravel confíe en el proxy local (Caddy)
    const bootstrapPath = join(cwd, 'bootstrap', 'app.php')
    if (existsSync(bootstrapPath)) {
      let content = readFileSync(bootstrapPath, 'utf8')
      if (!content.includes('trustProxies')) {
        content = content.replace(
          /->withMiddleware\(function\s*\(Middleware\s+\$middleware\).*?\{/s,
          (match) => `${match}\n        $middleware->trustProxies(at: '*');`
        )
        writeFileSync(bootstrapPath, content, 'utf8')
        console.log(chalk.green(`✓ TrustProxies configurado en bootstrap/app.php`))
      }
    }
  }

  // 4. Registrar en Proxy (Caddy) y recargar
  const domain = `${projectName}.test`
  registerProject(projectName, port, cwd)
  addHostEntry(domain)
  addHostEntry('devkit.test')
  
  try {
    await reloadProxy()
    console.log(chalk.green(`✓ Proxy enlazado:`), chalk.cyan.underline(`https://${domain}`))
  } catch (err) {
    console.log(chalk.red(`⚠ Ocurrió un problema recargando el proxy. ¿Está Caddy instalado y tienes permisos?`))
  }

  // 4. Iniciar el servidor de desarrollo (npm run dev, php artisan serve, etc.)
  console.log(chalk.magenta(`\n▶ Levantando servidor de desarrollo...`))
  
  try {
    if (framework === 'laravel') {
      console.log(chalk.blue(`Iniciando backend PHP (artisan serve) y frontend (Vite)...`))
      
      const promises = [
        execa('php', ['artisan', 'serve', `--port=${port}`], { stdio: 'inherit' })
      ]

      if (existsSync(`${cwd}/package.json`)) {
        const pm = existsSync(`${cwd}/yarn.lock`) ? 'yarn' : existsSync(`${cwd}/pnpm-lock.yaml`) ? 'pnpm' : 'npm'
        promises.push(execa(pm, ['run', 'dev'], { stdio: 'inherit' }))
      }

      await Promise.all(promises)
    } else if (existsSync(`${cwd}/package.json`)) {
      // Entornos JS/TS
      const pm = existsSync(`${cwd}/yarn.lock`) ? 'yarn' 
               : existsSync(`${cwd}/pnpm-lock.yaml`) ? 'pnpm' 
               : 'npm'
      
      const runArgs = ['run', 'dev']
      
      // Mapeamos localhost para asegurarnos que levante donde caddy lo busca
      if (framework === 'vite') {
        runArgs.push('--', '--host', '127.0.0.1')
      }
      
      await execa(pm, runArgs, { stdio: 'inherit' })
    } else {
      console.log(chalk.yellow(`⚠ No se encontró package.json o comando de inicio automático.`))
      console.log(`Tu entorno está listo. Puedes levantar tu aplicación manualmente en el puerto ${port}.`)
    }
  } catch (error) {
    // Si el usuario presiona Ctrl+C, capturamos el cierre aquí limpiamente.
    console.log(chalk.gray(`\nServidor de desarrollo detenido.`))
  }
}
