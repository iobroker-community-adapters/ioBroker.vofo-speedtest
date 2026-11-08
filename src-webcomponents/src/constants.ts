/** Tag of the custom element; a host checks that the module defines exactly this one */
export const TAG = 'iob-vofo-speedtest';

/** The built module, next to its manifest */
export const MODULE_FILE = 'vofo-speedtest.js';

/** The manifest the build writes next to the module; `common.webComponents` names this one */
export const MANIFEST_FILE = 'vofo-speedtest.json';

/** Where `tasks.mts` puts the module in the admin folder; the React import is relative to it */
export const MODULE_PATH = `webcomponents/${MODULE_FILE}`;

/** The values of the settings of the manifest; a setting without a value is missing */
export type SpeedtestSettings = {
    /** Instance of the adapter: `vofo-speedtest.0` (JSON-Config), also `0` or `system.adapter.vofo-speedtest.0` */
    instance?: string;
    /** `full` - the gauges, `strip` - one line, `mini` - a square */
    layout?: string;
    /** The end of the scale in Mb/s; 0: the booked speed or automatic */
    maxSpeed?: number;
    showStart?: boolean;
    /** Shown above the gauges */
    title?: string;
};
