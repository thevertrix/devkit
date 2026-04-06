export async function stop(...args) {
  const chalk = (await import('chalk')).default
  console.log(chalk.dim('  Comando en construcción...'))
}
