// Bundles the renderer sources (renderer/app.js + npm deps like choo) into
// renderer/bundle.js, which is the single module script renderer/index.html
// loads. Bare imports are resolved via node_modules + the package.json#imports
// aliases, so the sandboxed renderer page stays browser-only.
// Uses the WASM build of esbuild: platform-neutral, so a shared node_modules
// dir (e.g. macOS host + Linux container) can't get a wrong-arch native binary.
import esbuild from 'esbuild-wasm'
import { readFile } from 'node:fs/promises'

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url)))

// Mirror package.json#imports onto the bundler so aliased core modules resolve
// to the same implementation in the bundle as at runtime
const alias = {}
for (const name in pkg.imports) {
  alias[name] = pkg.imports[name].default
}

// Browser-safe stand-in for node's `assert` (choo's own dependency)
alias.assert = 'nanoassert'

await esbuild.build({
  entryPoints: ['./renderer/app.js'],
  format: 'esm',
  bundle: true,
  outfile: './renderer/bundle.js',
  alias
})
