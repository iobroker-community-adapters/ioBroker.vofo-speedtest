/**
 * The speed test as a web component: `<iob-vofo-speedtest>`.
 *
 * One module for every host - vis-2, devices, Aura, admin (`@iobroker/web-components`). Its manifest is a file of its
 * own (`vofo-speedtest.json`, written by the build from `manifest.ts`), so a host loads this module only when it shows
 * the element. The host sets `socket` and `settings`, and if it has them `theme` and `editMode`.
 *
 * The element shows the states the vis-2 widget and the devices tile show, and its button writes `test.start`.
 *
 * React is not in the module: it comes from `lib/esm/react-19.js` beside `adapter/`, see `vite.config.ts`.
 */
import { createElement, type JSX } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { defineWebComponent, IobWebComponent } from '@iobroker/web-components/element';

import {
    getInstance,
    getStartStateId,
    getStateIds,
    renderHint,
    renderSpeedtest,
    type CreateElement,
    type SpeedtestLayout,
    type SpeedtestValues,
} from '../../src-shared/speedtest';
import { TAG, type SpeedtestSettings } from './constants';

const h = createElement as unknown as CreateElement<JSX.Element>;

/** The element fills the box of the host and inherits `color` and `font`, so it follows the theme of the host */
const STYLES = `
:host {
    display: block;
    width: 100%;
    height: 100%;
}
.mount {
    width: 100%;
    height: 100%;
    font-size: var(--iob-font-size, 14px);
    -webkit-tap-highlight-color: transparent;
}
button:focus-visible {
    outline: 2px solid var(--iob-primary, #2196f3);
    outline-offset: 2px;
}
`;

const LAYOUTS: SpeedtestLayout[] = ['full', 'strip', 'mini'];

class VofoSpeedtest extends IobWebComponent<SpeedtestSettings> {
    readonly #root: Root;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = STYLES;
        const mount = document.createElement('div');
        mount.className = 'mount';
        shadow.append(style, mount);
        this.#root = createRoot(mount);
    }

    protected override getStateIds(settings: SpeedtestSettings): string[] {
        const instance = getInstance(settings.instance);
        return instance ? Object.values(getStateIds(instance)) : [];
    }

    protected override render(): void {
        this.#root.render(this.#view());
    }

    #view(): JSX.Element {
        const settings = this.settings;
        const lang = this.systemLang;
        const instance = getInstance(settings.instance);
        if (!instance) {
            return renderHint(h, lang);
        }
        const values: SpeedtestValues = {};
        for (const [key, id] of Object.entries(getStateIds(instance))) {
            values[key as keyof SpeedtestValues] = this.states[id]?.val;
        }
        return renderSpeedtest(h, {
            values,
            lang,
            layout: LAYOUTS.find(layout => layout === settings.layout) ?? 'full',
            title: settings.title,
            showStart: settings.showStart !== false,
            maxSpeed: Number(settings.maxSpeed) || 0,
            editMode: this.editMode,
            onStart: () => {
                this.setState(getStartStateId(instance), true).catch((e: unknown) => {
                    console.warn(`Cannot start the speed test: ${e as string}`);
                });
            },
        });
    }
}

defineWebComponent(TAG, VofoSpeedtest);
