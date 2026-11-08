/*!
 * Build tasks of ioBroker.vofo-speedtest
 *
 * Three front-ends live next to the adapter, all built with vite - the first two with module federation:
 *
 *   src-widgets/        -> widgets/vofo-speedtest/   the vis-2 widget set (loaded by vis-2)
 *   src-devices/        -> admin/dm-widgets/         the tile ioBroker.devices shows in its dashboard
 *   src-webcomponents/  -> admin/webcomponents/      the web component <iob-vofo-speedtest> for Aura, admin and every
 *                                                    other host of `@iobroker/web-components`
 *
 * All of them draw the same view: src-shared/speedtest.ts.
 *
 * This file is run straight from source - `node tasks.mts` - by the type stripping node brings along, so it must stay
 * free of syntax that a compiler would have to rewrite. `npm run check` enforces that with `erasableSyntaxOnly`.
 */
import { existsSync } from 'node:fs';
import { deleteFoldersRecursive, npmInstall, buildReact, copyFiles } from '@iobroker/build-tools';

/** Directory of this file, and with it the root of the adapter */
const ROOT: string = import.meta.dirname;
const SRC_WIDGETS = `${ROOT}/src-widgets`;
const SRC_DEVICES = `${ROOT}/src-devices`;
const SRC_WC = `${ROOT}/src-webcomponents`;
/** Served as `/adapter/vofo-speedtest/webcomponents/`; must match `common.webComponents` in io-package.json */
const WC_DEST = 'admin/webcomponents/';

async function installIfNeeded(dir: string): Promise<void> {
    if (!existsSync(`${dir}/node_modules`)) {
        await npmInstall(dir);
    }
}

async function buildWidgets(): Promise<void> {
    deleteFoldersRecursive(`${ROOT}/widgets/vofo-speedtest`);
    deleteFoldersRecursive(`${SRC_WIDGETS}/build`);
    await installIfNeeded(SRC_WIDGETS);
    await buildReact(SRC_WIDGETS, { rootDir: ROOT, vite: true });
    // mf-manifest.json is kept: vis-2 reads it to decide whether the set was built against a compatible React
    copyFiles(['src-widgets/build/**/*', '!src-widgets/build/index.html'], 'widgets/vofo-speedtest/');
}

/** `admin/dm-widgets/` is where the devices adapter loads the tile from - see `common.deviceWidgets` */
async function buildDevices(): Promise<void> {
    deleteFoldersRecursive(`${ROOT}/admin/dm-widgets`);
    deleteFoldersRecursive(`${SRC_DEVICES}/build`);
    await installIfNeeded(SRC_DEVICES);
    await buildReact(SRC_DEVICES, { rootDir: SRC_DEVICES, vite: true });
    copyFiles(['src-devices/build/**/*', '!src-devices/build/index.html'], 'admin/dm-widgets/');
    copyFiles(['src-devices/img/**/*'], 'admin/dm-widgets');
    copyFiles(['src-devices/src/i18n/*.json'], 'admin/dm-widgets/i18n');
}

/**
 * One ES module and its manifest. The build fails if the manifest does not pass `checkManifest`. The destination is
 * emptied first, so no module of an earlier build is published with the next release.
 */
async function buildWebComponents(): Promise<void> {
    deleteFoldersRecursive(`${ROOT}/${WC_DEST}`);
    deleteFoldersRecursive(`${SRC_WC}/build`);
    await installIfNeeded(SRC_WC);
    await buildReact(SRC_WC, { rootDir: SRC_WC, vite: true });
    copyFiles(['src-webcomponents/build/*.js', 'src-webcomponents/build/*.json'], WC_DEST);
}

async function main(): Promise<void> {
    if (process.argv.includes('--install')) {
        // `npm run lint` needs the dependencies of the front-ends, and CI lints before anything is built
        await installIfNeeded(SRC_WIDGETS);
        await installIfNeeded(SRC_DEVICES);
        await installIfNeeded(SRC_WC);
        return;
    }
    if (process.argv.includes('--devices')) {
        await buildDevices();
        return;
    }
    if (process.argv.includes('--wc')) {
        await buildWebComponents();
        return;
    }
    await buildWidgets();
}

main().catch((e: unknown) => {
    console.error(`Cannot build: ${e as string}`);
    process.exit(2);
});
