import { writeFileSync, readFileSync, mkdirSync, existsSync, chmodSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { getRuntimeVersions } from './config.js'

export const DEVKIT_BIN = join(homedir(), '.devkit', 'bin')

// Cada entrada define qué comando crear, qué imagen Docker usar y qué versión de runtime
const WRAPPER_DEFS = [
  { cmd: 'node',     image: (v) => `node:${v}-alpine`,   runtime: 'node' },
  { cmd: 'npm',      image: (v) => `node:${v}-alpine`,   runtime: 'node' },
  { cmd: 'npx',      image: (v) => `node:${v}-alpine`,   runtime: 'node' },
  { cmd: 'php',      image: (v) => `php:${v}-cli`,       runtime: 'php' },
  { cmd: 'composer', image: () => 'composer:latest',     runtime: 'php' },
  { cmd: 'python',   image: (v) => `python:${v}-slim`,   runtime: 'python' },
  { cmd: 'python3',  image: (v) => `python:${v}-slim`,   runtime: 'python' },
  { cmd: 'pip',      image: (v) => `python:${v}-slim`,   runtime: 'python' },
  { cmd: 'pip3',     image: (v) => `python:${v}-slim`,   runtime: 'python' },
]

const DEFAULT_VERSIONS = { node: '20', php: '8.3', python: '3.12' }

function wrapperContent(cmd, image) {
  return `#!/bin/bash
# devkit wrapper — ${cmd} via Docker (${image})
TTY_FLAG=$([ -t 0 ] && [ -t 1 ] && echo "-it" || echo "-i")
exec docker run --rm $TTY_FLAG \\
  -v "$(pwd):/app" \\
  -w /app \\
  ${image} \\
  ${cmd} "$@"
`
}

/**
 * Crea (o actualiza) todos los wrapper scripts en ~/.devkit/bin/.
 * Usa las versiones configuradas en devkit o los defaults.
 * @returns {string[]} lista de comandos creados
 */
export function writeWrappers() {
  mkdirSync(DEVKIT_BIN, { recursive: true })

  const versions = { ...DEFAULT_VERSIONS, ...getRuntimeVersions() }
  const created = []

  for (const def of WRAPPER_DEFS) {
    const version = versions[def.runtime] || 'latest'
    const image = def.image(version)
    const dest = join(DEVKIT_BIN, def.cmd)
    writeFileSync(dest, wrapperContent(def.cmd, image), 'utf8')
    chmodSync(dest, 0o755)
    created.push(def.cmd)
  }

  return created
}

/**
 * Devuelve true si el binario en PATH es un wrapper de devkit.
 */
export function isWrapper(cmd) {
  const wrapperPath = join(DEVKIT_BIN, cmd)
  if (!existsSync(wrapperPath)) return false
  try {
    return readFileSync(wrapperPath, 'utf8').includes('devkit wrapper')
  } catch {
    return false
  }
}

/**
 * Extrae la imagen Docker del wrapper (ej: "node:20-alpine").
 */
export function getWrapperImage(cmd) {
  const wrapperPath = join(DEVKIT_BIN, cmd)
  if (!existsSync(wrapperPath)) return null
  try {
    const match = readFileSync(wrapperPath, 'utf8').match(/devkit wrapper — \S+ via Docker \((.+)\)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Agrega ~/.devkit/bin al PATH en el rc file del shell del usuario.
 * @returns {string|null} ruta del archivo rc actualizado, o null si ya estaba
 */
export function ensurePathInShell() {
  const shell = process.env.SHELL ?? ''
  const home = homedir()

  const rcFiles = shell.includes('zsh')
    ? [join(home, '.zshrc')]
    : [join(home, '.bashrc'), join(home, '.bash_profile')]

  const line = `\nexport PATH="$HOME/.devkit/bin:$PATH" # devkit runtimes\n`

  for (const rcPath of rcFiles) {
    if (!existsSync(rcPath)) continue
    const content = readFileSync(rcPath, 'utf8')
    if (content.includes('.devkit/bin')) continue
    writeFileSync(rcPath, content + line, 'utf8')
    return rcPath
  }

  // Si ningún rc existía, crear .zshrc o .bashrc
  const target = shell.includes('zsh') ? join(home, '.zshrc') : join(home, '.bashrc')
  writeFileSync(target, line, 'utf8')
  return target
}
