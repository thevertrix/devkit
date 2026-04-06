export async function newProject(...args) {
  const chalk = (await import('chalk')).default
  console.log(chalk.dim('  Comando en construcción...'))
}
