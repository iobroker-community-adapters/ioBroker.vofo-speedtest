// The speed test as a tile of ioBroker.devices: the last result, the running test and a button to start one.
import WidgetGeneric, {
    React,
    MuiMaterial,
    getTileStyles,
    isNeumorphicTheme,
    AdapterReact,
    type WidgetGenericProps,
    type WidgetGenericState,
    type CustomWidgetPlugin,
} from '@iobroker/dm-widgets';
import type { BoxProps, Theme } from '@mui/material';
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/dm-utils';
import type { ConfigItemPanel as JsonConfigItemPanel } from '@iobroker/json-config';
import type { Icon as IconType } from '@iobroker/gui-components';

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

const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Icon = AdapterReact.Icon as typeof IconType;

const h = React.createElement as unknown as CreateElement<React.JSX.Element>;

interface VofoSpeedtestSettings extends CustomWidgetPlugin {
    /** Instance of the adapter, e.g. `vofo-speedtest.0` */
    instance?: string;
    /** The end of the scale in Mb/s; 0: the booked speed or automatic */
    maxSpeed?: number | string;
    showStart?: boolean;
}

interface VofoSpeedtestComponentState extends WidgetGenericState {
    /** State values keyed by object id */
    values: Record<string, ioBroker.StateValue>;
}

export class VofoSpeedtestComponent extends WidgetGeneric<VofoSpeedtestComponentState, VofoSpeedtestSettings> {
    private subscribed: { id: string; handler: (id: string, state: ioBroker.State) => void }[] = [];

    constructor(props: WidgetGenericProps<VofoSpeedtestSettings>) {
        super(props);
        this.state = { ...this.state, values: {} };
    }

    static override getConfigSchema(): { name: string; schema: ConfigItemPanel | ConfigItemTabs } {
        const schema: JsonConfigItemPanel = {
            type: 'panel',
            items: {
                instance: {
                    type: 'instance',
                    adapter: 'vofo-speedtest',
                    label: 'vofodm_instance',
                    default: 'vofo-speedtest.0',
                    sm: 12,
                },
                maxSpeed: {
                    type: 'number',
                    min: 0,
                    label: 'vofodm_max_speed',
                    help: 'vofodm_max_speed_help',
                    default: 0,
                    sm: 6,
                },
                showStart: {
                    type: 'checkbox',
                    label: 'vofodm_show_start',
                    default: true,
                    sm: 6,
                },
                icon: {
                    type: 'component',
                    subType: 'iconSelect',
                    label: 'vofodm_icon',
                    sm: 6,
                },
                name: {
                    type: 'text',
                    label: 'vofodm_name',
                    sm: 6,
                },
            },
        };

        // the type of json-config knows newer items than the one of dm-utils; this panel uses none of them
        return { name: 'VofoSpeedtest', schema: schema as unknown as ConfigItemPanel };
    }

    private get instance(): string | null {
        return getInstance(this.props.settings.instance ?? 'vofo-speedtest.0');
    }

    componentDidMount(): void {
        super.componentDidMount?.();
        this.subscribeStates();
    }

    componentDidUpdate(prevProps: Readonly<WidgetGenericProps<VofoSpeedtestSettings>>): void {
        super.componentDidUpdate?.(prevProps, this.state);
        if (prevProps.settings.instance !== this.props.settings.instance) {
            this.unsubscribeStates();
            this.setState({ values: {} }, () => this.subscribeStates());
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unsubscribeStates();
    }

    private subscribeStates(): void {
        const instance = this.instance;
        if (!instance) {
            return;
        }
        const context = this.props.stateContext;
        for (const id of Object.values(getStateIds(instance))) {
            const handler = (_id: string, state: ioBroker.State): void => {
                this.setState(prev => ({ values: { ...prev.values, [id]: state ? state.val : null } }));
            };
            context.getState(id, handler);
            this.subscribed.push({ id, handler });
        }
    }

    private unsubscribeStates(): void {
        const context = this.props.stateContext;
        for (const { id, handler } of this.subscribed) {
            context.removeState(id, handler);
        }
        this.subscribed = [];
    }

    /** Colored while a test is running */
    protected isTileActive(): boolean {
        const instance = this.instance;
        return !!instance && !!this.state.values[getStateIds(instance).running];
    }

    protected getAccentColor(): string | undefined {
        return this.isTileActive() ? '#2196f3' : undefined;
    }

    protected renderTileIcon(): React.JSX.Element | null {
        const custom = this.props.settings?.icon;
        return custom ? (
            <Icon
                src={custom}
                style={{ width: 22, height: 22, flex: '0 0 auto' }}
            />
        ) : null;
    }

    private start(instance: string): void {
        this.props.stateContext
            .getSocket()
            .setState(getStartStateId(instance), true)
            .catch((e: unknown) => {
                console.warn(`Cannot start the speed test: ${e as string}`);
            });
    }

    private renderView(layout: SpeedtestLayout, dense?: boolean): React.JSX.Element {
        const instance = this.instance;
        const lang = this.props.stateContext.language;
        if (!instance) {
            return renderHint(h, lang);
        }
        const values: SpeedtestValues = {};
        for (const [key, id] of Object.entries(getStateIds(instance))) {
            values[key as keyof SpeedtestValues] = this.state.values[id];
        }
        const settings = this.props.settings;
        return renderSpeedtest(h, {
            values,
            lang,
            layout,
            dense,
            title: dense ? undefined : settings.name || this.state.name || undefined,
            showStart: settings.showStart !== false,
            maxSpeed: Number(settings.maxSpeed) || 0,
            // the host has no edit mode: tiles are arranged in the settings
            editMode: false,
            onStart: () => this.start(instance),
        });
    }

    private renderTile(
        outerStyle: (theme: Theme) => React.CSSProperties,
        padding: (neumorphic: boolean) => string,
        inner: React.CSSProperties,
        content: React.JSX.Element,
        /** Gives a tile without its own height the height of the grid: the width of a square, the tile lies on it */
        sizerWidth?: string,
    ): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();

        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={outerStyle}
            >
                {sizerWidth ? <Box sx={{ width: sizerWidth, aspectRatio: '1' }} /> : null}
                <Box
                    sx={theme => ({
                        boxSizing: 'border-box',
                        display: 'flex',
                        width: '100%',
                        overflow: 'hidden',
                        ...(getTileStyles(theme, isActive, accent) as Record<string, unknown>),
                        padding: padding(isNeumorphicTheme(theme)),
                        ...inner,
                    })}
                >
                    <div
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        style={{ display: 'contents' }}
                    >
                        {this.renderIndicators(this.renderSettingsButton())}
                    </div>
                    {content}
                </Box>
            </Box>
        );
    }

    /** 1x1: both values, the ping and the button */
    renderCompact(): React.JSX.Element {
        return this.renderTile(
            theme => WidgetGeneric.getStyleCompact(theme),
            neumorphic => (neumorphic ? '10px' : '12px'),
            { flexDirection: 'column' },
            <Box sx={{ width: '100%', aspectRatio: '1', minWidth: 0 }}>{this.renderView('mini')}</Box>,
        );
    }

    /** 2x0.5: one line */
    renderWide(): React.JSX.Element {
        return this.renderTile(
            theme => WidgetGeneric.getStyleWide(theme),
            neumorphic => (neumorphic ? '6px' : '8px'),
            { alignItems: 'center' },
            this.renderView('strip'),
        );
    }

    /** 2x1 and 2x2: the gauges. 2x1 is one column high (the gap of the grid is 12 px) */
    renderWideTall(): React.JSX.Element {
        const huge = this.props.settings.size === '2x2';
        return this.renderTile(
            theme => WidgetGeneric.getStyleWideTall(theme),
            neumorphic => (neumorphic ? '8px' : '10px'),
            { flexDirection: 'column', position: 'absolute', inset: 0 },
            this.renderView('full', !huge),
            huge ? '100%' : 'calc(50% - 6px)',
        );
    }
}

export default VofoSpeedtestComponent;
