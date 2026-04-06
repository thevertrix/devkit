import { execaSync } from 'execa'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import os from 'os'
import chalk from 'chalk'

const HOSTS_FILE = os.platform() === 'win32' 
  ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' 
  : '/etc/hosts'

/**
 * Añade un dominio al archivo hosts apuntando a localhost.
 * @param {string} domain El dominio a registrar (ej: mi-proyecto.test)
 */
export function addHostEntry(domain) {
  try {
    const hostsContent = readFileSync(HOSTS_FILE, 'utf8')
    const entry = `127.0.0.1 ${domain}`

    if (!hostsContent.includes(entry)) {
      console.log(chalk.blue(`Registrando dominio ${domain} en el archivo hosts...`))
      
      if (os.platform() === 'win32') {
        // En Windows necesitamos escalar privilegios si no somos admin
        // Usamos PowerShell para intentar escribir
        execaSync('powershell', ['-Command', `Start-Process powershell -Verb runAs -ArgumentList "-Command \`"Add-Content -Path '${HOSTS_FILE}' -Value '${entry}'\`""`], { stdio: 'ignore' })
      } else {
        // En Linux/Mac requiere sudo
        try {
          execaSync('sudo', ['sh', '-c', `echo "${entry}" >> ${HOSTS_FILE}`])
        } catch {
          console.log(chalk.red(`⚠ Se requiere 'sudo' para editar /etc/hosts.`))
        }
      }
    }
  } catch (error) {
    console.log(chalk.red(`⚠ No se pudo leer o escribir en el archivo hosts.`))
    console.log(chalk.dim(`Asegúrate de ejecutar tu terminal como Administrador o añade manualmente la línea: 127.0.0.1 ${domain}`))
  }
}

/**
 * Remueve un dominio del archivo hosts.
 * @param {string} domain 
 */
export function removeHostEntry(domain) {
  try {
    const hostsContent = readFileSync(HOSTS_FILE, 'utf8')
    const entryRegex = new RegExp(`^127\\.0\\.0\\.1\\s+${domain}\\s*$`, 'gm')

    if (hostsContent.match(entryRegex)) {
      console.log(chalk.blue(`Removiendo dominio ${domain} del archivo hosts...`))
      
      // Filtramos la línea
      const newContent = hostsContent.replace(entryRegex, '').replace(/\n{2,}/g, '\n')
      
      // Para escribir todo el archivo modificado necesitamos guardarlo en un temporal
      const tempPath = join(os.tmpdir(), 'devkit-hosts.tmp')
      writeFileSync(tempPath, newContent, 'utf8')

      if (os.platform() === 'win32') {
        execaSync('powershell', ['-Command', `Start-Process powershell -Verb runAs -ArgumentList "-Command \`"Copy-Item '${tempPath}' -Destination '${HOSTS_FILE}' -Force\`""`], { stdio: 'ignore' })
      } else {
        execaSync('sudo', ['cp', tempPath, HOSTS_FILE])
      }
    }
  } catch (error) {
    console.log(chalk.yellow(`⚠ Omitiendo limpieza del archivo hosts por falta de permisos.`))
  }
}

/**
 * Configura dnsmasq o Acrylic DNS para resolver dominios *.test a 127.0.0.1
 */
export function setupDns() {
  const platform = os.platform()
  
  if (platform === 'darwin') {
    // macOS
    console.log(chalk.blue('Configurando resolver .test para macOS...'))
    const resolverDir = '/etc/resolver'
    if (!existsSync(resolverDir)) {
      try {
        execaSync('sudo', ['mkdir', '-p', resolverDir])
      } catch (e) {
        console.log(chalk.red('Error creando /etc/resolver. Requiere sudo.'))
      }
    }
    
    // Escribir archivo test
    try {
      execaSync('sudo', ['sh', '-c', 'echo "nameserver 127.0.0.1" > /etc/resolver/test'])
      console.log(chalk.green('✓ Resolver configurado. (dnsmasq debería estar corriendo)'))
    } catch (e) {
      console.log(chalk.red('Error escribiendo /etc/resolver/test.'))
    }
  } else if (platform === 'win32') {
    // Windows
    console.log(chalk.yellow('En Windows se recomienda usar Acrylic DNS Proxy para wildcard *.test.'))
    console.log('Puedes editar C:\\Windows\\System32\\drivers\\etc\\hosts manualmente por ahora.')
  } else {
    // Linux
    console.log(chalk.blue('Asegúrate de que NetworkManager o systemd-resolved usen dnsmasq para *.test.'))
  }
}