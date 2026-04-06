import { execaSync } from 'execa'
import chalk from 'chalk'

/**
 * Instala la Autoridad Certificadora local (CA) usando mkcert
 */
export function installLocalCA() {
  try {
    console.log(chalk.blue('Instalando Autoridad Certificadora (CA) local con mkcert...'))
    execaSync('mkcert', ['-install'], { stdio: 'inherit' })
    console.log(chalk.green('✓ CA instalada correctamente en el sistema y navegadores.'))
  } catch (error) {
    console.log(chalk.red('⚠ Error al ejecutar mkcert -install. ¿Está instalado mkcert?'))
  }
}

/**
 * Aunque Caddy maneja local_certs automáticamente, 
 * esta función puede usarse para generar certificados específicos si no se usa Caddy en algún momento.
 */
export function generateCert(domain) {
  try {
    execaSync('mkcert', [domain], { stdio: 'inherit' })
    console.log(chalk.green(`✓ Certificado generado para ${domain}`))
  } catch (error) {
    console.log(chalk.red(`⚠ Error generando certificado para ${domain}.`))
  }
}