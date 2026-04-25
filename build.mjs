#!/usr/bin/env node
import { build } from 'esbuild'
import { execSync } from 'child_process'
import { mkdirSync, readFileSync } from 'fs'
import { join } from 'path'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

const BUNDLE = 'dist/bundle.cjs'

const TARGETS = [
  { pkg: 'node20-macos-arm64', out: 'devkit-macos-arm64'  },
  { pkg: 'node20-macos-x64',   out: 'devkit-macos-x64'    },
  { pkg: 'node20-linux-x64',   out: 'devkit-linux-x64'    },
  { pkg: 'node20-win-x64',     out: 'devkit-win-x64.exe'  },
]

// ─── Step 1: bundle ESM → CJS ────────────────────────────────────────────────
console.log('▶ Step 1: bundling with esbuild...')
mkdirSync('dist', { recursive: true })

await build({
  entryPoints: ['bin/devkit.js'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: BUNDLE,
  external: ['electron'],
  logLevel: 'warning',
  // En CJS, import.meta.url es undefined. Este shim lo reemplaza con el
  // equivalente correcto para que fileURLToPath/__dirname funcionen en pkg.
  banner: {
    js: `const __importMetaUrl = require('url').pathToFileURL(__filename).href;`,
  },
  define: {
    'import.meta.url': '__importMetaUrl',
    '__PKG_VERSION__': JSON.stringify(version),
  },
})

console.log(`  ✔ ${BUNDLE}`)

// ─── Step 2: compilar binarios con pkg ────────────────────────────────────────
console.log('\n▶ Step 2: compilando binarios con pkg...')

for (const { pkg, out } of TARGETS) {
  const outPath = join('dist', out)
  process.stdout.write(`  → ${out.padEnd(26)}`)
  try {
    execSync(
      `npx pkg ${BUNDLE} --target ${pkg} --output ${outPath} --compress GZip`,
      { stdio: 'pipe' }
    )
    console.log('✔')
  } catch (e) {
    console.log('✗')
    console.error('    ' + (e.stderr?.toString().split('\n')[0] ?? e.message))
  }
}

console.log('\n✨ Binarios en dist/')
