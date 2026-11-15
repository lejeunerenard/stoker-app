// Electron Forge host configuration (see hello-pear-electron boilerplate).
// Kept slim: zip + dmg makers. Sign/msix/flatpak/snap layers can be added
// later when production releases are wanted (MIGRATION-PLAN phase 4d).
const fs = require('fs')
const path = require('path')
const plink = require('pear-link')
const child = require('child_process')

const pkg = require('./package.json')
const appName = pkg.productName ?? pkg.name

module.exports = {
  packagerConfig: {
    appVersion: pkg.version
  },

  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32', 'linux']
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {}
    }
  ],

  hooks: {
    readPackageJson: async (forgeConfig, packageJson) => {
      if (process.env.UPGRADE_KEY) {
        packageJson.upgrade = process.env.UPGRADE_KEY
      }
      try {
        plink.parse(packageJson.upgrade)
      } catch {
        throw new Error('package.json#upgrade is not a pear link. Run `pear touch` and set the key')
      }
      return packageJson
    },
    prePackage: async () => {
      // renderer/bundle.js is gitignored but shipped: rebuild it so a stale
      // copy cannot ship (the `package` pipeline runs prePackage)
      child.execFileSync('node', [path.join(__dirname, 'renderbuild.mjs')], { cwd: __dirname })
    },
    preMake: async () => {
      fs.rmSync(path.join(__dirname, 'out', 'make'), { recursive: true, force: true })
      // same rebuild for the `make` pipeline
      child.execFileSync('node', [path.join(__dirname, 'renderbuild.mjs')], { cwd: __dirname })
    }
  }
}
