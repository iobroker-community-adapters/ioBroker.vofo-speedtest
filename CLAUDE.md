# CLAUDE.md — ioBroker.vofo-speedtest

ioBroker adapter that runs the speed test of https://speedtest.vodafone.de (download, upload, ping) and writes
the results into states. Community adapter (iobroker-community-adapters), MIT.

## Commands

```bash
npm run build          # tsc -p tsconfig.build.json -> build/ (gitignored, common.nogit: true)
npm run check          # type check only
npm run lint           # @iobroker/eslint-config (prettier included), fix with: npx eslint -c eslint.config.mjs --fix
npm run test:package   # package file checks
npm run test:integration   # starts the adapter in a test js-controller - fails if a js-controller runs locally
npm run release-patch|minor|major
```

There is no `prepare` script: the build runs in `npm run build` and in the CI (`build: true`) only.

## Architecture

- `src/main.ts` — class `VofoSpeedtest extends utils.Adapter`, compact mode export at the end.
- `src/lib/types.ts` — answers of the Vodafone API.
- `src/lib/stateAttr.ts` — name/type/role/unit of all states, used by `createAndSetState()`.
- `src/lib/apiKey.ts` — extracts the API key from the Next.js chunks of speedtest.vodafone.de.
- `src/lib/adapter-config.d.ts` — `this.config`, must match `native` in io-package.json and admin/jsonConfig.json.

The adapter runs in **schedule mode** (`11,41 * * * *`): it is started, runs one test and stops itself with
`stop()`. Every dead end must call `stopNow()`, otherwise the process stays alive and the next start fails with
"already running with pid". A watchdog (5 min) stops the adapter in any case.

Flow (`onReady`):

1. `getApiKey` — loads https://speedtest.vodafone.de/, searches all `/_next/static/**.js` chunks for the runtime
   config (`"<32 chars>";if(...)throw ... NEXT_PUBLIC_API_KEY`). The chunk names change with every deployment.
   Do **not** search for `NEXT_PUBLIC_API_KEY=`: the bundled build scripts contain keys of other variants.
   Fallback: `FALLBACK_API_KEY`.
2. `getConfig` — `GET api.speedtest.vodafone.anw.net/v0/config/` (stream count, durations, intervals).
3. `getRemotePort` — `GET rpd.speedtest.vodafone-ip.de/`.
4. `initSBC` — `POST /v0/init/` -> test servers, modem and connection info (states `modem.*`, `isp`, `ip`, ...).
5. Download — `numStreams` parallel GETs per download server, bytes are sampled every `interval` s by
   `transferEnd()`; after `duration` s the requests are destroyed and the samples are sent to
   `PUT /v0/calc/download/`. A value of 0 triggers one retry.
6. Upload — sequential multipart POSTs (field `data`, 10 MB of "0") to the upload server, written in 64 KB chunks
   and counted when handed to the socket; then `PUT /v0/calc/upload/`.
7. Ping — `ping` package, 5 echo requests to the ping server.
8. `writeResult` — states below `Results.*`, then `stop()`.

`*_calc` states are the average of the sampled intermediate values, the states without `_calc` are the values
calculated by the Vodafone API.

All requests use `rejectUnauthorized: false` (as the original adapter did). `bindAddress` (admin: "Local
address") binds all connections and the ping; `0.0.0.0` = any.

## Conventions

- Object IDs, state names, roles and units must not change — existing installations and histories depend on them.
- Timers only via `this.setTimeout` / `this.clearTimeout` (cleared on unload by adapter-core).
- No native dependencies: node-libcurl was removed on purpose (no binaries for Node 22 in v4, vcpkg/OpenSSL
  build on every Windows installation in v5).
- Changelog entries go below `### **WORK IN PROGRESS**` in README.md; `common.news` is written by the
  release script.
