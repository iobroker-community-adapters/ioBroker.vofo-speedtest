# CLAUDE.md — ioBroker.vofo-speedtest

ioBroker adapter that runs the speed test of https://speedtest.vodafone.de (download, upload, ping) and writes
the results into states. Community adapter (iobroker-community-adapters), MIT.

## Commands

```bash
npm run build          # adapter and all three front-ends (build:ts, build:widgets, build:devices, build:wc)
npm run build:ts       # tsc -p tsconfig.build.json -> build/ (gitignored, common.nogit: true)
npm run check          # type check of the adapter, tasks.mts and src-shared; front-ends: npx tsc --noEmit in their folder
npm run lint           # installs the front-ends if needed, lints all; fix with: npx eslint -c eslint.config.mjs --fix
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

The adapter runs in **daemon mode**: a host can only start a test of a running process, and the contract of the web
components allows `setState` but no change of the instance object. Tests start by `native.schedule` (`node-schedule`,
empty = on demand only) or by `test.start` with ack=false; a start during a test is ignored. Every dead end of a test
must call `failTest()` or `finishTest()`, otherwise `test.running` stays true and no further test starts. A watchdog
(5 min) ends the test in any case. `migrateSchedule()` moves `common.schedule` of an installation from the schedule
mode to `native.schedule`. The result of a test must not depend on the previous one: `startTest()` resets its fields.

Control states (`instanceObjects`): `test.start`, `test.running`, `test.phase` (`init`, `download`, `upload`,
`ping`, empty), `test.speed` (live, Mb/s), `test.error`.

Flow (`startTest`):

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
8. `writeResult` — states below `Results.*`, then `finishTest('')`.

`*_calc` states are the average of the sampled intermediate values, the states without `_calc` are the values
calculated by the Vodafone API.

All requests use `rejectUnauthorized: false` (as the original adapter did). `bindAddress` (admin: "Local
address") binds all connections and the ping; `0.0.0.0` = any.

## Front-ends

All three draw the same view, `src-shared/speedtest.ts` (state IDs, words in 11 languages, gauges, layouts `full`,
`strip`, `mini`). It imports nothing: each front-end hands in its `createElement`, because a `react` import from a
folder outside of the projects could not be resolved. Built by `tasks.mts`:

- `src-widgets/` -> `widgets/vofo-speedtest/` (gitignored, built on publish): vis-2 widget `tplVofoSpeedtest`,
  module federation, i18n keys without the prefix `vofo_`.
- `src-devices/` -> `admin/dm-widgets/` (committed): tile `VofoSpeedtestComponent`, module federation, i18n keys with
  the prefix `vofodm_`. The name must match `common.deviceWidgets`.
- `src-webcomponents/` -> `admin/webcomponents/` (committed): `<iob-vofo-speedtest>`, no federation, React from
  `lib/esm/react-19.js`. Its manifest takes its words from the two dictionaries above and `io-package.json`.
  `admin/jsonConfig.json` shows it in the instance settings (`custom` with `webComponent`, `${_instance}` in its
  settings): this is why the adapter requires admin >= 8.3.10.

## Conventions

- Object IDs, state names, roles and units must not change — existing installations and histories depend on them.
- Timers only via `this.setTimeout` / `this.clearTimeout` (cleared on unload by adapter-core).
- No native dependencies: node-libcurl was removed on purpose (no binaries for Node 22 in v4, vcpkg/OpenSSL
  build on every Windows installation in v5).
- Changelog entries go below `### **WORK IN PROGRESS**` in README.md; `common.news` is written by the
  release script.
