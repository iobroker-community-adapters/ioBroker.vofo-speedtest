/**
 * The manifest of `<iob-vofo-speedtest>`. Read by the build only (`vite.config.ts`), which writes it as
 * `vofo-speedtest.json` next to the module - a host reads that file for its palette and its settings without loading
 * the module.
 *
 * All words come from the native widgets: the name and the description from the devices widget in `io-package.json`,
 * the labels from `src-devices/src/i18n/` and `src-widgets/src/i18n/`. The build reads them.
 */
import type { WebComponentManifest, WebComponentText } from '@iobroker/web-components';

// with the extension: `vite.config.ts` imports this file, and Vite may load its config natively
import { MODULE_FILE, TAG } from './constants.ts';

export { MANIFEST_FILE, MODULE_FILE, MODULE_PATH, TAG } from './constants.ts';

/** The words of the native widgets, read by the build */
export interface ManifestTexts {
    /**
     * `label` of the devices widget in `io-package.json`. The same name, per language, makes vis-2 and devices
     * offer the native widget instead of this component
     */
    name: WebComponentText;
    /** `description` of the devices widget in `io-package.json` */
    description: WebComponentText;
    /** A word of the devices tile (`src-devices/src/i18n/`) in every language */
    devices: (key: string) => WebComponentText;
    /** A word of the vis-2 widget (`src-widgets/src/i18n/`, without the prefix `vofo_`) in every language */
    vis: (key: string) => WebComponentText;
}

/**
 * The manifest with the words of the native widgets
 *
 * @param texts what the build read from `io-package.json` and the dictionaries
 */
export function buildManifest(texts: ManifestTexts): WebComponentManifest {
    const { devices, vis } = texts;
    return {
        $schema: 'https://raw.githubusercontent.com/ioBroker/web-components/main/schemas/manifest.json',
        manifestVersion: 1,
        tag: TAG,
        name: texts.name,
        description: texts.description,
        // relative to this file: /adapter/vofo-speedtest/dm-widgets/speedtest.png, the icon of the devices widget
        icon: '../dm-widgets/speedtest.png',
        module: MODULE_FILE,
        // the default size of the vis-2 widget
        size: { width: 440, height: 300 },
        settings: {
            type: 'panel',
            items: {
                instance: {
                    type: 'instance',
                    adapter: 'vofo-speedtest',
                    default: 'vofo-speedtest.0',
                    label: devices('vofodm_instance'),
                },
                layout: {
                    type: 'select',
                    default: 'full',
                    label: vis('layout'),
                    options: [
                        { value: 'full', label: vis('layout_full') },
                        { value: 'strip', label: vis('layout_strip') },
                        { value: 'mini', label: vis('layout_mini') },
                    ],
                },
                title: {
                    type: 'text',
                    label: devices('vofodm_name'),
                    hidden: 'data.layout === "strip" || data.layout === "mini"',
                },
                maxSpeed: {
                    type: 'number',
                    min: 0,
                    default: 0,
                    label: devices('vofodm_max_speed'),
                    help: devices('vofodm_max_speed_help'),
                    hidden: 'data.layout === "strip" || data.layout === "mini"',
                },
                showStart: {
                    type: 'checkbox',
                    default: true,
                    label: devices('vofodm_show_start'),
                },
            },
        },
    };
}
