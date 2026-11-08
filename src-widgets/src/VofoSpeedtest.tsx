import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic from './Generic';
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

const h = React.createElement as unknown as CreateElement<React.JSX.Element>;

interface VofoSpeedtestRxData {
    /** Number of the instance of the adapter, e.g. `0` */
    instance: string;
    layout: SpeedtestLayout;
    /** The end of the scale in Mb/s; 0: the booked speed or automatic */
    maxSpeed: number | string;
    showStart: boolean;
    noCard: boolean;
    widgetTitle: string;
}

interface VofoSpeedtestState extends VisRxWidgetState {
    /** State values keyed by object id */
    speedtest: Record<string, ioBroker.StateValue>;
}

/** The last result and the running test of a speed test instance, with a button to start a test */
export default class VofoSpeedtest extends Generic<VofoSpeedtestRxData, VofoSpeedtestState> {
    private subscribed: string[] = [];

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, speedtest: {} };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplVofoSpeedtest',
            visSet: 'vofo-speedtest',
            visSetLabel: 'set_label',
            visName: 'Speed test',
            visWidgetLabel: 'widget_label',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'instance',
                            type: 'instance',
                            adapter: 'vofo-speedtest',
                            isShort: true,
                            default: '0',
                            label: 'instance',
                        },
                        {
                            name: 'layout',
                            type: 'select',
                            default: 'full',
                            label: 'layout',
                            options: [
                                { value: 'full', label: 'layout_full' },
                                { value: 'strip', label: 'layout_strip' },
                                { value: 'mini', label: 'layout_mini' },
                            ],
                        },
                        {
                            name: 'maxSpeed',
                            type: 'number',
                            min: 0,
                            default: 0,
                            label: 'max_speed',
                            tooltip: 'max_speed_help',
                            hidden: 'data.layout !== "full"',
                        },
                        { name: 'showStart', type: 'checkbox', default: true, label: 'show_start' },
                        { name: 'noCard', type: 'checkbox', label: 'without_card' },
                        { name: 'widgetTitle', label: 'name', hidden: '!!data.noCard' },
                    ],
                },
            ],
            visDefaultStyle: { width: 440, height: 300, position: 'relative' },
            visPrev: 'widgets/vofo-speedtest/img/speedtest.png',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return VofoSpeedtest.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.resubscribe();
    }

    componentWillUnmount(): void {
        this.unsubscribeAll();
        super.componentWillUnmount();
    }

    onRxDataChanged(): void {
        this.resubscribe();
    }

    private get instance(): string | null {
        return getInstance(this.state.rxData.instance ?? '0');
    }

    private onStateChange = (id: string, state: ioBroker.State | null | undefined): void => {
        this.setState(prev => ({ speedtest: { ...prev.speedtest, [id]: state ? state.val : null } }));
    };

    private unsubscribeAll(): void {
        if (this.subscribed.length) {
            this.props.context.socket.unsubscribeState(this.subscribed, this.onStateChange);
            this.subscribed = [];
        }
    }

    private resubscribe(): void {
        const instance = this.instance;
        const wanted = instance ? Object.values(getStateIds(instance)) : [];
        if (wanted.length === this.subscribed.length && wanted.every(id => this.subscribed.includes(id))) {
            return;
        }
        this.unsubscribeAll();
        if (!wanted.length) {
            return;
        }
        this.subscribed = wanted;
        this.props.context.socket.subscribeState(wanted, this.onStateChange).catch((e: unknown) => {
            console.warn(`Cannot subscribe on the speed test states: ${e as string}`);
        });
    }

    private start(instance: string): void {
        this.props.context.socket.setState(getStartStateId(instance), true).catch((e: unknown) => {
            console.warn(`Cannot start the speed test: ${e as string}`);
        });
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);

        const { rxData, speedtest } = this.state;
        const instance = this.instance;
        const lang = this.props.context.lang;
        let content: React.JSX.Element;
        if (instance) {
            const values: SpeedtestValues = {};
            for (const [key, id] of Object.entries(getStateIds(instance))) {
                values[key as keyof SpeedtestValues] = speedtest[id];
            }
            content = renderSpeedtest(h, {
                values,
                lang,
                layout: rxData.layout || 'full',
                showStart: rxData.showStart !== false,
                maxSpeed: Number(rxData.maxSpeed) || 0,
                editMode: this.props.editMode,
                onStart: () => this.start(instance),
            });
        } else {
            content = renderHint(h, lang);
        }

        return rxData.noCard ? content : this.wrapContent(content);
    }
}
