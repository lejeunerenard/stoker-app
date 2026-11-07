# Stoker App

An app for tracking and controlling a stoker for grills & smokers.

Built on the new Pear stack: [Electron Forge](https://electronjs.org/forge) owns the
app, [pear-runtime](https://github.com/holepunchto/pear-runtime) is embedded in a
[Bare](https://github.com/holepunchto/bare) worker (`workers/`), and the renderer
(`renderer/`) talks to it over bridge IPC.

## Development Setup

Needs Node.js, `npm` & [`pear`](https://docs.pears.com/guides/getting-started)
(works via `npx pear`) installed.

### Install

All platforms:

```console
npm run install:all
```

macOS:

```console
npm run install:mac
```

### Building spec

```console
npm run build
```

### Running

```console
npm start
```

`npm start` bundles the renderer (`renderbuild`) and launches with
`electron-forge start -- --no-updates` (updates are off in development).

To test the update flow in dev: `npm start -- --updates`.

### Testing

```console
npm test
```

## Deployment (P2P updates)

Follow the [hello-pear-electron](https://github.com/holepunchto/hello-pear-electron)
release flow:

1. `pear touch` → set the returned link as `package.json#upgrade`
   (the committed key is a placeholder until this is done)
2. bump `version`
3. `electron-forge make`
4. `pear build --package .` — run from **outside** the app folder, so the
   deployment folder never nests inside the app dir (stage-size trap)
5. `pear stage <link>`; add `pear.json` multisig/provision only when production
   releases are wanted

OTA events (`updating`/`updated`) flow worker → renderer over the HRPC
`worker-event` op and show an "Update ready" banner; pressing Apply calls
`bridge.rpc.applyUpdate()` (HRPC `apply-update` op) then relaunches the app.
