/**
 * The view of the speed test, shared by the vis-2 widget, the devices tile and the web component.
 *
 * This file imports nothing, not even React: each front-end gets React in its own way (module federation from the
 * host, or `lib/esm/react-19.js`), so it hands in its `createElement`. All colors of the text come from `currentColor`,
 * so the view follows the theme of the host; only the two colors of the gauges are fixed.
 */

export type CreateElement<N> = (type: string, props: Record<string, unknown> | null, ...children: unknown[]) => N;

export type SpeedtestLayout = 'full' | 'strip' | 'mini';

type StateValue = string | number | boolean | null;

export interface SpeedtestValues {
    download?: StateValue;
    upload?: StateValue;
    ping?: StateValue;
    loss?: StateValue;
    lastRun?: StateValue;
    bookedDownload?: StateValue;
    bookedUpload?: StateValue;
    running?: StateValue;
    phase?: StateValue;
    speed?: StateValue;
    error?: StateValue;
    alive?: StateValue;
}

const STATE_NAMES: Record<Exclude<keyof SpeedtestValues, 'alive'>, string> = {
    download: 'Results.download_Mb',
    upload: 'Results.upload_Mb',
    ping: 'Results.ping.avg',
    loss: 'Results.ping.packetLoss',
    lastRun: 'Results.Last_Run',
    bookedDownload: 'downstreamBooked',
    bookedUpload: 'upstreamBooked',
    running: 'test.running',
    phase: 'test.phase',
    speed: 'test.speed',
    error: 'test.error',
};

/**
 * The instance a setting names
 *
 * @param instance `vofo-speedtest.0`, `system.adapter.vofo-speedtest.0` or `0`
 * @returns `vofo-speedtest.0`, or null if it names no instance of this adapter
 */
export function getInstance(instance: string | number | null | undefined): string | null {
    const text = instance === undefined || instance === null ? '' : String(instance).trim();
    const match = text.match(/^(?:(?:system\.adapter\.)?vofo-speedtest\.)?(\d+)$/);
    return match ? `vofo-speedtest.${parseInt(match[1], 10)}` : null;
}

/** The object IDs of the values of an instance */
export function getStateIds(instance: string): Record<keyof SpeedtestValues, string> {
    const ids = { alive: `system.adapter.${instance}.alive` } as Record<keyof SpeedtestValues, string>;
    for (const [key, name] of Object.entries(STATE_NAMES)) {
        ids[key as keyof typeof STATE_NAMES] = `${instance}.${name}`;
    }
    return ids;
}

/** Written with `true` and ack=false: starts a test */
export function getStartStateId(instance: string): string {
    return `${instance}.test.start`;
}

const EN = {
    download: 'Download',
    upload: 'Upload',
    ping: 'Ping',
    loss: 'Loss',
    lastRun: 'Last test',
    start: 'Start test',
    init: 'Preparing…',
    phaseDownload: 'Download test…',
    phaseUpload: 'Upload test…',
    phasePing: 'Ping test…',
    ofBooked: 'of booked',
    notRunning: 'The adapter instance is not running',
    chooseInstance: 'Choose an instance in the settings',
};

type WordKey = keyof typeof EN;

const WORDS: Record<string, Partial<Record<WordKey, string>>> = {
    en: EN,
    de: {
        loss: 'Verlust',
        lastRun: 'Letzter Test',
        start: 'Test starten',
        init: 'Vorbereitung…',
        phaseDownload: 'Download-Test…',
        phaseUpload: 'Upload-Test…',
        phasePing: 'Ping-Test…',
        ofBooked: 'vom Tarif',
        notRunning: 'Die Adapterinstanz läuft nicht',
        chooseInstance: 'Instanz in den Einstellungen wählen',
    },
    ru: {
        download: 'Загрузка',
        upload: 'Отдача',
        ping: 'Пинг',
        loss: 'Потери',
        lastRun: 'Последний тест',
        start: 'Запустить тест',
        init: 'Подготовка…',
        phaseDownload: 'Тест загрузки…',
        phaseUpload: 'Тест отдачи…',
        phasePing: 'Тест пинга…',
        ofBooked: 'от тарифа',
        notRunning: 'Экземпляр адаптера не запущен',
        chooseInstance: 'Выберите экземпляр в настройках',
    },
    pt: {
        loss: 'Perda',
        lastRun: 'Último teste',
        start: 'Iniciar teste',
        init: 'A preparar…',
        phaseDownload: 'Teste de download…',
        phaseUpload: 'Teste de upload…',
        phasePing: 'Teste de ping…',
        ofBooked: 'do plano',
        notRunning: 'A instância do adaptador não está em execução',
        chooseInstance: 'Escolha uma instância nas configurações',
    },
    nl: {
        loss: 'Verlies',
        lastRun: 'Laatste test',
        start: 'Test starten',
        init: 'Voorbereiden…',
        phaseDownload: 'Downloadtest…',
        phaseUpload: 'Uploadtest…',
        phasePing: 'Pingtest…',
        ofBooked: 'van abonnement',
        notRunning: 'De adapterinstantie is niet actief',
        chooseInstance: 'Kies een instantie in de instellingen',
    },
    fr: {
        download: 'Descendant',
        upload: 'Montant',
        loss: 'Perte',
        lastRun: 'Dernier test',
        start: 'Lancer le test',
        init: 'Préparation…',
        phaseDownload: 'Test descendant…',
        phaseUpload: 'Test montant…',
        phasePing: 'Test de ping…',
        ofBooked: 'de l’abonnement',
        notRunning: "L'instance de l'adaptateur n'est pas en cours d'exécution",
        chooseInstance: 'Choisissez une instance dans les paramètres',
    },
    it: {
        loss: 'Perdita',
        lastRun: 'Ultimo test',
        start: 'Avvia test',
        init: 'Preparazione…',
        phaseDownload: 'Test di download…',
        phaseUpload: 'Test di upload…',
        phasePing: 'Test di ping…',
        ofBooked: 'del piano',
        notRunning: "L'istanza dell'adattatore non è in esecuzione",
        chooseInstance: "Scegli un'istanza nelle impostazioni",
    },
    es: {
        download: 'Descarga',
        upload: 'Subida',
        loss: 'Pérdida',
        lastRun: 'Última prueba',
        start: 'Iniciar prueba',
        init: 'Preparando…',
        phaseDownload: 'Prueba de descarga…',
        phaseUpload: 'Prueba de subida…',
        phasePing: 'Prueba de ping…',
        ofBooked: 'del plan',
        notRunning: 'La instancia del adaptador no se está ejecutando',
        chooseInstance: 'Elija una instancia en la configuración',
    },
    pl: {
        download: 'Pobieranie',
        upload: 'Wysyłanie',
        loss: 'Utrata',
        lastRun: 'Ostatni test',
        start: 'Uruchom test',
        init: 'Przygotowanie…',
        phaseDownload: 'Test pobierania…',
        phaseUpload: 'Test wysyłania…',
        phasePing: 'Test pingu…',
        ofBooked: 'z taryfy',
        notRunning: 'Instancja adaptera nie działa',
        chooseInstance: 'Wybierz instancję w ustawieniach',
    },
    uk: {
        download: 'Завантаження',
        upload: 'Вивантаження',
        ping: 'Пінг',
        loss: 'Втрати',
        lastRun: 'Останній тест',
        start: 'Запустити тест',
        init: 'Підготовка…',
        phaseDownload: 'Тест завантаження…',
        phaseUpload: 'Тест вивантаження…',
        phasePing: 'Тест пінгу…',
        ofBooked: 'від тарифу',
        notRunning: 'Екземпляр адаптера не запущено',
        chooseInstance: 'Виберіть екземпляр у налаштуваннях',
    },
    'zh-cn': {
        download: '下载',
        upload: '上传',
        ping: '延迟',
        loss: '丢包',
        lastRun: '上次测试',
        start: '开始测试',
        init: '准备中…',
        phaseDownload: '下载测试…',
        phaseUpload: '上传测试…',
        phasePing: '延迟测试…',
        ofBooked: '签约速率',
        notRunning: '适配器实例未运行',
        chooseInstance: '请在设置中选择实例',
    },
};

function word(lang: string, key: WordKey): string {
    return WORDS[lang]?.[key] || EN[key];
}

const COLOR_DOWNLOAD = '#2196f3';
const COLOR_UPLOAD = '#4caf50';
const COLOR_ERROR = '#f44336';
/** The steps of the scale without a booked speed */
const SCALE_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function toNumber(value: StateValue | undefined): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function formatSpeed(value: number | null): string {
    if (value === null) {
        return '–';
    }
    return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

/**
 * The end of the scale of a gauge: the setting, the booked speed, or the next step above the value
 *
 * @param value the shown value
 * @param booked the booked speed, if the provider knows one
 * @param setting the scale from the settings, 0 or nothing for automatic
 */
export function getScale(value: number | null, booked: number | null, setting: number | undefined): number {
    const wanted = setting && setting > 0 ? setting : booked && booked > 0 ? booked : 0;
    if (wanted && (value === null || value <= wanted)) {
        return wanted;
    }
    const least = Math.max(value ?? 0, wanted);
    return SCALE_STEPS.find(step => step >= least) ?? Math.ceil(least);
}

function formatTime(value: StateValue | undefined, lang: string): string {
    const ts = toNumber(value);
    if (!ts) {
        return '';
    }
    return new Date(ts).toLocaleString(lang, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** A point of the circle of the gauge; 0° is to the right, clockwise */
function point(angle: number): string {
    const radians = (angle * Math.PI) / 180;
    return `${(60 + 48 * Math.cos(radians)).toFixed(2)} ${(56 + 48 * Math.sin(radians)).toFixed(2)}`;
}

/** The gauge covers 270°: from the bottom left over the top to the bottom right */
const ARC = `M ${point(135)} A 48 48 0 1 1 ${point(45)}`;

interface GaugeProps {
    label: string;
    value: number | null;
    max: number;
    booked: number | null;
    color: string;
    /** The value is the one measured right now */
    live: boolean;
    /** The test is measuring the other direction: this value is the old one */
    dimmed: boolean;
    bookedText: string;
}

function gauge<N>(h: CreateElement<N>, props: GaugeProps): N {
    const { value, max, booked } = props;
    const percent = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
    const children: N[] = [
        h('path', {
            d: ARC,
            fill: 'none',
            stroke: 'currentColor',
            strokeOpacity: 0.15,
            strokeWidth: 9,
            strokeLinecap: 'round',
        }),
    ];
    if (percent > 0) {
        children.push(
            h('path', {
                d: ARC,
                fill: 'none',
                stroke: props.color,
                strokeWidth: 9,
                strokeLinecap: 'round',
                pathLength: 100,
                strokeDasharray: `${percent.toFixed(1)} 100`,
                // the live value arrives every 0.75 s: the arc moves instead of jumping
                style: { transition: 'stroke-dasharray 0.6s ease-out' },
            }),
        );
    }
    children.push(
        h(
            'text',
            { x: 60, y: 58, textAnchor: 'middle', fontSize: 25, fontWeight: 700, fill: 'currentColor' },
            formatSpeed(value),
        ),
        h('text', { x: 60, y: 71, textAnchor: 'middle', fontSize: 9, fill: 'currentColor', fillOpacity: 0.65 }, 'Mb/s'),
    );
    if (booked && value !== null && !props.live) {
        children.push(
            h(
                'text',
                { x: 60, y: 84, textAnchor: 'middle', fontSize: 8, fill: 'currentColor', fillOpacity: 0.65 },
                `${Math.round((value / booked) * 100)} % ${props.bookedText}`,
            ),
        );
    }
    children.push(
        h(
            'text',
            {
                x: 60,
                y: 103,
                textAnchor: 'middle',
                fontSize: 11,
                fontWeight: props.live ? 700 : 400,
                fill: props.live ? props.color : 'currentColor',
            },
            props.label,
        ),
    );
    return h(
        'svg',
        {
            viewBox: '0 0 120 106',
            preserveAspectRatio: 'xMidYMid meet',
            role: 'img',
            'aria-label': `${props.label}: ${formatSpeed(value)} Mb/s`,
            style: {
                flex: '1 1 0',
                minWidth: 0,
                minHeight: 0,
                width: '100%',
                height: '100%',
                opacity: props.dimmed ? 0.45 : 1,
            },
        },
        ...children,
    );
}

export interface SpeedtestViewProps {
    values: SpeedtestValues;
    /** The language of the system */
    lang: string;
    layout: SpeedtestLayout;
    /** Little height: the gauges get the room of the time of the last test */
    dense?: boolean;
    title?: string;
    /** Whether to show the start button at all */
    showStart: boolean;
    /** The end of the scale in Mb/s; 0 or nothing: the booked speed or automatic */
    maxSpeed?: number;
    /** In the editor of a host nothing reacts to clicks */
    editMode: boolean;
    onStart: () => void;
}

/** The instance is known not to run: `undefined` is a value that has not arrived yet, `null` a state without value */
function isOff(values: SpeedtestValues): boolean {
    return values.alive === false || values.alive === null;
}

/** A crashed adapter leaves `test.running` set */
function isRunning(values: SpeedtestValues): boolean {
    return !!values.running && !isOff(values);
}

function button<N>(h: CreateElement<N>, props: SpeedtestViewProps, compact: boolean): N {
    const { values, lang } = props;
    const running = isRunning(values);
    // Not known yet is not "off": the button works until the host has the answer
    const off = isOff(values);
    const phases: Record<string, WordKey> = {
        init: 'init',
        download: 'phaseDownload',
        upload: 'phaseUpload',
        ping: 'phasePing',
    };
    const text = running ? word(lang, phases[String(values.phase)] || 'init') : word(lang, 'start');
    const disabled = running || off || props.editMode;
    return h(
        'button',
        {
            type: 'button',
            disabled,
            title: off ? word(lang, 'notRunning') : text,
            onClick: (e: { stopPropagation: () => void }) => {
                // a click on a tile may open something in the host
                e.stopPropagation();
                if (!disabled) {
                    props.onStart();
                }
            },
            style: {
                flex: 'none',
                boxSizing: 'border-box',
                border: 'none',
                borderRadius: 'var(--iob-border-radius, 4px)',
                padding: compact ? '2px 8px' : '5px 12px',
                font: 'inherit',
                fontSize: compact ? '0.85em' : '0.9em',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                color: 'var(--iob-primary-contrast, #fff)',
                backgroundColor: 'var(--iob-primary, #2196f3)',
                cursor: disabled ? 'default' : 'pointer',
                opacity: off || (props.editMode && !running) ? 0.5 : running ? 0.75 : 1,
            },
        },
        text,
    );
}

function errorLine<N>(h: CreateElement<N>, values: SpeedtestValues): N | null {
    const error = values.error ? String(values.error) : '';
    if (!error || isRunning(values)) {
        return null;
    }
    return h(
        'div',
        {
            title: error,
            style: {
                flex: 'none',
                color: COLOR_ERROR,
                fontSize: '0.85em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
            },
        },
        error,
    );
}

const ROOT_STYLE = {
    boxSizing: 'border-box',
    display: 'flex',
    width: '100%',
    height: '100%',
    minWidth: 0,
    overflow: 'hidden',
    color: 'inherit',
    lineHeight: 1.25,
};

/** One line: arrows with the values, the ping, the button */
function renderStrip<N>(h: CreateElement<N>, props: SpeedtestViewProps): N {
    const { values, lang } = props;
    const running = isRunning(values);
    const download = running && values.phase === 'download' ? toNumber(values.speed) : toNumber(values.download);
    const upload = running && values.phase === 'upload' ? toNumber(values.speed) : toNumber(values.upload);
    const ping = toNumber(values.ping);
    const item = (color: string, sign: string, text: string, title: string): N =>
        h(
            'span',
            { title, style: { whiteSpace: 'nowrap', fontWeight: 600 } },
            h('span', { style: { color, marginRight: 3 } }, sign),
            text,
        );
    return h(
        'div',
        { style: { ...ROOT_STYLE, flexDirection: 'row', alignItems: 'center', gap: 10 } },
        item(COLOR_DOWNLOAD, '↓', `${formatSpeed(download)} Mb/s`, word(lang, 'download')),
        item(COLOR_UPLOAD, '↑', `${formatSpeed(upload)} Mb/s`, word(lang, 'upload')),
        h(
            'span',
            { title: word(lang, 'ping'), style: { whiteSpace: 'nowrap', opacity: 0.7 } },
            ping === null ? '' : `${ping} ms`,
        ),
        h('span', { style: { flex: '1 1 auto' } }),
        props.showStart ? button(h, props, true) : null,
    );
}

/** A square: both values below each other, the button below them */
function renderMini<N>(h: CreateElement<N>, props: SpeedtestViewProps): N {
    const { values, lang } = props;
    const running = isRunning(values);
    const download = running && values.phase === 'download' ? toNumber(values.speed) : toNumber(values.download);
    const upload = running && values.phase === 'upload' ? toNumber(values.speed) : toNumber(values.upload);
    const ping = toNumber(values.ping);
    const line = (color: string, sign: string, value: number | null, title: string): N =>
        h(
            'div',
            { title, style: { fontWeight: 700, fontSize: '1.25em', whiteSpace: 'nowrap' } },
            h('span', { style: { color, marginRight: 4 } }, sign),
            formatSpeed(value),
            h('span', { style: { fontSize: '0.6em', fontWeight: 400, opacity: 0.65, marginLeft: 3 } }, 'Mb/s'),
        );
    return h(
        'div',
        { style: { ...ROOT_STYLE, flexDirection: 'column', justifyContent: 'space-between', gap: 4 } },
        h(
            'div',
            null,
            line(COLOR_DOWNLOAD, '↓', download, word(lang, 'download')),
            line(COLOR_UPLOAD, '↑', upload, word(lang, 'upload')),
            ping === null
                ? null
                : h('div', { style: { fontSize: '0.85em', opacity: 0.7 } }, `${word(lang, 'ping')}: ${ping} ms`),
        ),
        props.showStart ? button(h, props, true) : null,
    );
}

/** The gauges, the ping and the button */
function renderFull<N>(h: CreateElement<N>, props: SpeedtestViewProps): N {
    const { values, lang } = props;
    const running = isRunning(values);
    const liveDownload = running && values.phase === 'download';
    const liveUpload = running && values.phase === 'upload';
    const download = liveDownload ? toNumber(values.speed) : toNumber(values.download);
    const upload = liveUpload ? toNumber(values.speed) : toNumber(values.upload);
    const bookedDownload = toNumber(values.bookedDownload);
    const bookedUpload = toNumber(values.bookedUpload);
    const ping = toNumber(values.ping);
    const loss = toNumber(values.loss);
    const lastRun = formatTime(values.lastRun, lang);
    const bookedText = word(lang, 'ofBooked');

    const stats = [
        ping === null ? '' : `${word(lang, 'ping')}: ${ping} ms`,
        loss === null ? '' : `${word(lang, 'loss')}: ${loss} %`,
        lastRun && !props.dense ? `${word(lang, 'lastRun')}: ${lastRun}` : '',
    ].filter(Boolean);

    return h(
        'div',
        { style: { ...ROOT_STYLE, flexDirection: 'column', gap: 4 } },
        props.title
            ? h(
                  'div',
                  { style: { flex: 'none', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' } },
                  props.title,
              )
            : null,
        h(
            'div',
            { style: { flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'row', gap: 6 } },
            gauge(h, {
                label: word(lang, 'download'),
                value: download,
                max: getScale(download, bookedDownload, props.maxSpeed),
                booked: bookedDownload,
                color: COLOR_DOWNLOAD,
                live: liveDownload,
                dimmed: running && !liveDownload,
                bookedText,
            }),
            gauge(h, {
                label: word(lang, 'upload'),
                value: upload,
                max: getScale(upload, bookedUpload, props.maxSpeed),
                booked: bookedUpload,
                color: COLOR_UPLOAD,
                live: liveUpload,
                dimmed: running && !liveUpload,
                bookedText,
            }),
        ),
        errorLine(h, values),
        h(
            'div',
            {
                style: {
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                },
            },
            // the text wraps in its own column, so the button keeps its place at the right
            h('span', { style: { flex: '1 1 0', fontSize: '0.8em', opacity: 0.75, minWidth: 0 } }, stats.join(' · ')),
            props.showStart ? button(h, props, false) : null,
        ),
    );
}

/** What all front-ends show */
export function renderSpeedtest<N>(h: CreateElement<N>, props: SpeedtestViewProps): N {
    if (props.layout === 'strip') {
        return renderStrip(h, props);
    }
    if (props.layout === 'mini') {
        return renderMini(h, props);
    }
    return renderFull(h, props);
}

/** The hint of a front-end without an instance */
export function renderHint<N>(h: CreateElement<N>, lang: string): N {
    return h(
        'div',
        { style: { ...ROOT_STYLE, alignItems: 'center', justifyContent: 'center', textAlign: 'center', opacity: 0.7 } },
        word(lang, 'chooseInstance'),
    );
}
