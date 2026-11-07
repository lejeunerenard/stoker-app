# Stoker App: Old Pear → New Pear Migration Plan

Reference boilerplate: [holepunchto/hello-pear-electron](https://github.com/holepunchto/hello-pear-electron)

Decisions made:

- OTA updates / deployment pipeline adopted at **Phase 4** (shell-first approach).
- Fully adopt the template layout (`electron/`, `renderer/`, `workers/`).

## Current state

The app has already migrated to the new hyper\* library ecosystem (`hypercore-storage`, `hyperdb`, `hyperschema`, `hrpc`, `framed-stream`, bare-\* imports map in `package.json`) — but the **app framework layer is still old Pear**:

- `package.json`: `"pear"` field with `pre: pear-electron/pre`, deps `pear-electron@1.7.x` + `pear-bridge`, run via `pear run -d .`
- `index.mjs` (root): old `pear-electron` Runtime + `pear-bridge` launcher
- `index.html` (root): renderer entry using the Pear-specific `<pear-ctrl>` custom element
- Renderer spawns the backend via the old `Pear` global (`Pear.config.applink/dir`, `Pear.worker.run()`) in `src/public/stores/pear.js`
- Backend `src/backend/index.mjs` ("pearend" worker) uses globals `Pear.worker.pipe()` and `Pear.config.storage`
- The pre-Pear Electron Forge config is parked in `package.json.bnk`

The target (hello-pear-electron) replaces all of that: **Electron Forge owns the app** (`electron/main.js`, `electron/preload.js`, `forge.config.js`), and `pear-runtime` is embedded in a **Bare worker** (`workers/main.js`) launched with `PearRuntime.run()`; the renderer talks to it over `window.bridge` IPC (framed-stream on `Bare.IPC`), with `pear.json` + `package.json#upgrade` replacing the old `pear` field.

## File mapping

| Current (old Pear) | Target (new Pear boilerplate) | Notes |
|---|---|---|
| `index.mjs` | `electron/main.js` | Flag parsing (`paparam`), per-OS storage dir, `PearRuntime.run('/workers/main.js', [...])`, `pear:worker:*` IPC handlers |
| — | `electron/preload.js` | New file: exposes `window.bridge` (`startWorker`, `writeWorkerIPC`, `onWorkerIPC`, `applyUpdate`, …) |
| `index.html` (root) | `renderer/index.html` | Drop `<pear-ctrl>` + its CSS (Pear-browser-only); keep `-webkit-app-region: drag` bar |
| `src/public/**` (choo app) | `renderer/**` | Browser-side code, mostly unchanged except the Pear-global store |
| `src/public/stores/pear.js` | rewritten over `window.bridge` | Wrap bridge IPC events in a stream-like adapter so `FramedStream` + HRPC client still work |
| `src/backend/index.mjs` | `workers/main.js` | Runs in **Bare**: `Bare.IPC` instead of `Pear.worker.pipe()`, argv via helper (`Bare.argv[i+2]`), storage dir passed from main process |
| `src/**` backend libs (`stoker.js`, `stoker-server.js`, `store/`, `sessions.js`) | `workers/**` (or shared dir) | Must be Bare-compatible: route `fs`/`http`/`path`/`querystring`/`events`/`assert` through the `imports` map (`bare-fs`, `bare-http1`, …) |
| `build.mjs`, `spec/`, `builder/` | keep as-is | Framework-neutral codegen |
| `package.json.bnk` (forged forge config) | `forge.config.js` | Proper config file now that Forge is the host |
| `package.json` `"pear"` field | `productName`, `"upgrade": "pear://…"`, `pear.json` (multisig) | Plus forge deps + `pear-runtime` |

## Phased plan

### Phase 0 — housekeeping & prerequisites

- Gitignore (or move out) the clutter: `node_modules-bck/`, `package.json.bnk`, `package-lock.json.bnk`, `2025-thanksgiving*.jsonl` datasets.
- Install the current `pear` CLI (works via `npx pear`); verify Node meets template requirements.
- Do the work on a branch/worktree so old entry points stay functional until the new shell works.

### Phase 1 — swap the app shell (Electron Forge + pear-runtime)

- `package.json`:
  - Remove: `pear` block, `pear-electron`, `pear-bridge`, plus now-dead `express`, `ws`, `axios`, `electron-store`, `mkdirp`.
  - Add: `productName`, `"upgrade": "pear://<key>"` (key via `pear touch`), `"main": "electron/main.js"`, `"private": true`, `@electron-forge/cli` + `maker-zip`/`maker-dmg`, `pear-runtime`, `paparam`, `which-runtime`, `graceful-goodbye`, `bare-path`, `bare-storage`.
- Add `forge.config.js` (start slim: packagerConfig + icon + zip/dmg makers; sign/msix/flatpak layers later).
- Add `electron/main.js` + `electron/preload.js` (port from template, trimmed).
- Scripts: `start: electron-forge start -- --no-updates`, `package`, `make`; delete the `pear run -d .` line and update the README.
- ✅ Check: empty Forge window launches.

### Phase 2 — move the renderer

- `index.html` → `renderer/index.html`; `src/public/**` → `renderer/**` (template layout).
- Remove `<pear-ctrl>`; handle the title bar via `titleBarStyle` / `app-region` CSS instead.
- Rewrite `stores/pear.js` → `stores/bridge.js`: `bridge.startWorker('/workers/main.js')`, then adapt `bridge.onWorkerIPC`/`writeWorkerIPC` into a stream-like object and keep `new FramedStream(adapter)` + the generated `spec/hrpc` client. Watch the `Uint8Array` → `Buffer` conversion the preload does.
- ✅ Check: choo app renders, `bridge.pkg().version` shows in the UI.

### Phase 3 — backend worker → Bare worker

- `src/backend/index.mjs` → `workers/main.js`; `Pear.worker.pipe()` → `new FramedStream(Bare.IPC)`; `Pear.config.storage` → dir passed as argv (per-OS resolution already in `electron/main.js`, fallback `bare-storage` `dir.persistent()`).
- Audit every backend import for Bare compat: `sessions.js` (fs), `stoker.js` (http/querystring — `bare-http1`/`bare-querystring` are already in the imports map), `store/index.mjs` (`hypercore-storage` + generated `hyperdb` are new-gen, so Bare-safe).
- Decide storage layout: pass the runtime's `pear.storage` dir to the `Store`, keeping one Corestore/rocks root under the app storage dir.
- ✅ Check: existing `tests/` (`store.mjs`, `stoker-server.js` w/ mock stoker) still pass; HRPC round-trips (`store:get`, `get-sessions`, `session-data`) work end-to-end in the running app.

### Phase 4 — updates & deployment (adopt incrementally)

- 4a (dev, already covered): keep `updates: false` in dev (the `--no-updates` default) — app works fully before any of this.
- 4b: add the updater section from the template's worker (Corestore + Hyperswarm join + `pear.updater` `updating`/`updated` events → renderer update banner, `bridge.applyUpdate()` flow).
- 4c: P2P release pipeline — `pear touch` → set `upgrade` link → version → `electron-forge make` → `pear build` (⚠️ output the deployment dir **outside** the app folder, per the template's troubleshooting notes) → `pear stage`; `pear.json` multisig/provision only when production releases are wanted.
- 4d (optional, defer): CI build-release workflow, dmg signing, flatpak/snap.

### Phase 5 — cleanup & docs

- Delete leftover deps/scripts now unused (`cross-env` if `update-env` is dropped — the new model uses `bridge.pkg().version` instead of `src/env.json`'s git SHA).
- Update README: install (`install:all`/`install:mac`), `npm start` for dev, no more `pear run`.

## Key gotchas

1. **Bare worker ≠ Node**: any Node-only API in backend code (`node:http`-style `.setTimeout()` chains in `stoker.js`, sync `fs` in `sessions.js`) needs the bare equivalents — cheap now thanks to the existing `imports` map.
2. **Renderer is sandboxed** (`sandbox: true`, contextIsolation): only `window.bridge` + browser libs cross over; choo/chart.js are fine.
3. **`pear-ctrl` has no equivalent** in plain Electron — the one visible UI change from the migration.
4. **Never nest the `pear build` deployment folder inside the app dir** (stage-size trap documented in the boilerplate).

## Implementation status (2026-11-07)

All phases implemented on this branch. Verified in-repo: `npm run build` (spec
regen), `npm run renderbuild`, `npm test` 18/19 (the 1 fail —
`tests/timeseries-db.mjs` — is pre-existing WIP: the `@stoker-app/series-ids`
collection was never in `spec/hyperdb/db.json`, on any branch), eslint green.
Forge pipeline runs up to Electron launch; Electron itself cannot render in the
dev container (no libglib), so the GUI checks below are for the user to confirm
on a real desktop.

### Notes / deviations from the plan

- **Worker**: `workers/main.mjs` (kept `.mjs` so top-level await lints under
  eslint 7). Backend libs moved to `workers/` (`stoker-server.js`, `stoker.js`,
  `sessions.js`, `store/`, `timeseries.js`); test imports updated accordingly.
  Storage dir + argv layout mirror the boilerplate (`Bare.argv[i+2]` helper,
  storage dir = argv 4 from `electron/main.js`, `bare-storage` `dir.persistent()`
  fallback).
- **Control channel**: the old plan kept `bridge.onWorkerIPC`/`writeWorkerIPC`
  raw messages — but with HRPC on the same Bare pipe, raw control messages
  would corrupt the RPC framing. So two new HRPC ops were added to the spec
  (`build.mjs` regen): `worker-event` (send-only, server→renderer, used for
  `updating`/`updated`/`update-scheduled`) and `apply-update` (renderer→worker,
  replaces the template's raw `pear:applyUpdate` handshake).
- **Framing**: one framing layer only — the worker's `FramedStream(Bare.IPC)` +
  the main-process `FramedStream` relay. The renderer adapter (`electron/preload.js`)
  is a **message** pipe, so the renderer-side `new FramedStream(adapter)` from the
  plan is not needed (double-framing would break symmetry); the generated
  `spec/hrpc` client runs directly on it.
- **Bridge/RPC**: the HRPC client is built inside `electron/preload.js` (full
  Node context) and exposed as `window.bridge.rpc`; preload `require` of
  app deps needs `sandbox: false`, so the window runs `sandbox: false,
  contextIsolation: true, nodeIntegration: false` — the main world stays
  browser-only (gotcha 2 holds; Chromium `sandbox: true` would forbid preload
  `require`).
- **Renderer bundling**: the sandboxed page cannot bare-import npm libs under
  plain Electron (that was a Pear-platform feature), so `renderbuild.mjs`
  (esbuild) bundles `renderer/app.js` → `renderer/bundle.js`, which
  `renderer/index.html` loads. `renderer/bundle.js` is gitignored; `npm start`
  runs the build.
- **Deps**: `corestore` + `hyperswarm` added (worker updater store, per
  boilerplate); `express` kept as devDep only (test helper `mock-stoker.js`);
  `axios`/`ws`/`electron-store`/`mkdirp`/`pear-*` removed. `cross-env`/`update-env`
  dropped; `src/env.json` no longer updated.
- **`package.json#upgrade`** is a structurally valid placeholder key: `pear touch`
  needs network here, so swap it in when deploying (README).
- **`pear.json`** intentionally not created (plan phase 4c: only for production
  multisig releases).
