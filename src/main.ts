import * as utils from '@iobroker/adapter-core';
import { randomUUID } from 'node:crypto';
import type { ClientRequest } from 'node:http';
import { request, type RequestOptions } from 'node:https';
import { promise as pingPromise } from 'ping';

import { extractApiKey, FALLBACK_API_KEY } from './lib/apiKey';
import { STATE_ATTRIBUTES } from './lib/stateAttr';
import type {
    RemotePortResult,
    SpeedtestCalcResult,
    SpeedtestConfig,
    SpeedtestInit,
    TestResult,
    TestType,
    TransferType,
} from './lib/types';

const API_HOST = 'api.speedtest.vodafone.anw.net';
/** The whole test (download, upload, ping) normally takes about 45 seconds */
const WATCHDOG_TIMEOUT = 5 * 60_000;
const WEB_OPTIONS: RequestOptions = {
    hostname: 'speedtest.vodafone.de',
    port: 443,
    method: 'GET',
    rejectUnauthorized: false,
    timeout: 60_000,
    headers: { 'User-Agent': 'Mozilla/5.0 (ioBroker.vofo-speedtest)' },
};
const REQUEST_TIMEOUT = 60_000;
const TRANSFER_TIMEOUT = 120_000;
/** Size of the multipart field "data", that is uploaded again and again during the upload test */
const UPLOAD_SIZE = 1e7;
/** The upload body is written in chunks of this size, so the progress can be measured */
const UPLOAD_CHUNK = Buffer.alloc(64 * 1024, '0');

// Defaults - both are replaced by the answers of the API before they are used
const DEFAULT_CONFIG: SpeedtestConfig = {
    data: {
        version: '0.28.9',
        remotePortDetectionUrl: 'https://rpd.speedtest.vodafone-ip.de',
        ipDetectionUrl: {
            ipv4: 'https://ip4.system.info',
            ipv6: 'https://speedtest-21v6.vodafone.anw.net/empty.txt',
        },
        download: {
            numStreams: 6,
            duration: 10,
            interval: 0.75,
        },
        upload: {
            duration: 12,
            interval: 0.75,
            maxBytes: 10485760,
        },
        ping: {
            duration: 8,
            interval: 1,
        },
        cpuBenchmark: false,
        webBenchmark: false,
        tcpRetrans: false,
        connection: {
            ip: '127.0.0.1',
            ipVersion: 'v4',
        },
    },
};

const DEFAULT_INIT: SpeedtestInit = {
    data: {
        speedtest: {
            id: 'XXXXXXXXX',
            servers: {
                downloadServers: {
                    dualstack: [
                        'https://speedtest-60.speedtest.vodafone-ip.de/data.zero.bin.512M',
                        'https://speedtest-53.speedtest.vodafone-ip.de/data.zero.bin.512M',
                    ],
                    ipv6: [
                        'https://speedtest-60v6.speedtest.vodafone-ip.de/data.zero.bin.512M',
                        'https://speedtest-53v6.speedtest.vodafone-ip.de/data.zero.bin.512M',
                    ],
                },
                uploadServer: {
                    dualstack: 'https://speedtest-60.speedtest.vodafone-ip.de/empty.txt',
                    ipv6: 'https://speedtest-60v6.speedtest.vodafone-ip.de/empty.txt',
                },
                pingServer: {
                    dualstack: 'https://speedtest-60.speedtest.vodafone-ip.de',
                    ipv6: 'https://speedtest-60v6.speedtest.vodafone-ip.de',
                },
                wsPingServer: {
                    dualstack: 'wss://speedtest-21.vodafone.anw.net/ping/',
                    ipv6: 'wss://speedtest-21v6.vodafone.anw.net/ping/',
                },
            },
        },
    },
};

interface HttpsResponse {
    statusCode: number | undefined;
    body: string;
}

class VofoSpeedtest extends utils.Adapter {
    /** Bytes received per download server and stream */
    private readonly downloadBytes: Record<string, number[]> = {};
    /** Bytes sent per upload request */
    private uploadBytes: number[] = [];
    private downloadRequests: ClientRequest[] = [];
    private uploadRequests: ClientRequest[] = [];
    private bytesLoadedLastSection = 0;
    private running: TestType | null = null;
    private timeSection = new Date();
    private timeStart = new Date();
    private retryDownload = false;
    private remotePort = 0;
    private stopHandler: ioBroker.Timeout | undefined = undefined;
    private conf: SpeedtestConfig = DEFAULT_CONFIG;
    private init: SpeedtestInit = DEFAULT_INIT;
    private xApiKey = '';
    private readonly result: TestResult = {
        download_raw: [],
        upload_raw: [],
        overall_time: {
            ping: 0,
        },
        overall_bytes: {
            upload: 0,
            download: 0,
        },
        download: 0,
        upload: 0,
        ping: {
            min: '987',
            max: '987',
            avg: '987',
            packetLoss: '987',
        },
    };

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'vofo-speedtest',
        });

        this.on('ready', () => this.onReady());
        this.on('unload', callback => this.onUnload(callback));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private onReady(): void {
        // The adapter runs in "schedule" mode. If a test hangs, the next start fails with "already running".
        this.setTimeout(() => {
            this.log.error(`Speed test did not finish within ${WATCHDOG_TIMEOUT / 60_000} minutes, stopping`);
            this.stopNow();
        }, WATCHDOG_TIMEOUT);
        this.getApiKey().catch(e => this.onError('getApiKey', e));
    }

    private onError(step: string, e: unknown): void {
        this.log.error(`${step}: ${(e as Error)?.message ?? String(e)}`);
        this.stopNow();
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private onUnload(callback: () => void): void {
        try {
            this.log.info('starting cleanup...');
            // the timers are cleared by adapter-core, the open transfers have to be closed here
            this.downloadRequests.forEach(req => req.destroy());
            this.uploadRequests.forEach(req => req.destroy());
            this.downloadRequests = [];
            this.uploadRequests = [];
            this.log.info('cleaned everything up...');
            callback();
        } catch {
            callback();
        }
    }

    private stopNow(): void {
        if (this.stop) {
            void this.stop();
        }
    }

    /** Sends an HTTPS request and collects the complete answer */
    private httpsRequest(options: RequestOptions, body?: string): Promise<HttpsResponse> {
        return new Promise((resolve, reject) => {
            const req = request(options, res => {
                let page = '';
                res.on('data', (d: Buffer) => (page += d.toString()));
                res.on('end', () => resolve({ statusCode: res.statusCode, body: page }));
            });
            req.on('error', reject);
            if (body !== undefined) {
                req.write(body);
            }
            req.end();
        });
    }

    /**
     * The API key is compiled into one of the Next.js chunks of speedtest.vodafone.de.
     * The chunk names change with every deployment of the web page, so all chunks are searched.
     * If the key cannot be found, the last known key is used.
     */
    private async getApiKey(): Promise<void> {
        this.log.debug('getApiKey start...');
        let key: string | null = null;
        try {
            const res = await this.httpsRequest({ ...WEB_OPTIONS, path: '/' });
            this.log.debug(`getApiKey: web page finished with code ${res.statusCode}`);
            if (res.statusCode === 200) {
                const scripts = [...res.body.matchAll(/<script[^>]+src="(\/_next\/static\/[^"]+\.js)"/g)].map(
                    m => m[1],
                );
                for (const script of scripts) {
                    const chunk = await this.httpsRequest({ ...WEB_OPTIONS, path: script });
                    if (chunk.statusCode === 200) {
                        key = extractApiKey(chunk.body);
                        if (key) {
                            this.log.debug(`getApiKey: found API key in ${script}`);
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            this.log.debug(`getApiKey error: ${(e as Error).message}`);
        }
        if (!key) {
            this.log.warn("Couldn't extract API Key from speedtest.vodafone.de, using the last known key");
            key = FALLBACK_API_KEY;
        }
        this.xApiKey = key;
        await this.getConfig();
    }

    private async getConfig(): Promise<void> {
        this.log.debug('getConfig start...');
        let res: HttpsResponse;
        try {
            res = await this.httpsRequest({
                hostname: API_HOST,
                port: 443,
                path: '/v0/config/',
                method: 'GET',
                rejectUnauthorized: false,
                timeout: REQUEST_TIMEOUT,
                headers: {
                    'X-APIKEY': this.xApiKey,
                },
            });
        } catch (e) {
            this.log.error(`getConfig error: ${JSON.stringify(e)}`);
            this.stopNow();
            return;
        }
        this.log.debug(`getConfig finished with code ${res.statusCode}`);
        if (res.statusCode === 200) {
            this.conf = JSON.parse(res.body) as SpeedtestConfig;
            await this.getRemotePort();
        } else {
            this.log.error("Couldn't get Speedtest Config");
            this.stopNow();
        }
    }

    private async getRemotePort(): Promise<void> {
        this.log.debug('getRemotePort start...');
        let res: HttpsResponse;
        try {
            res = await this.httpsRequest({
                hostname: 'rpd.speedtest.vodafone-ip.de',
                port: 443,
                path: '/',
                method: 'GET',
                rejectUnauthorized: false,
                timeout: REQUEST_TIMEOUT,
            });
        } catch (e) {
            this.log.error(`getRemotePort error: ${JSON.stringify(e)}`);
            this.stopNow();
            return;
        }
        this.log.debug(`getRemotePort finished with code ${res.statusCode}`);
        if (res.statusCode === 200) {
            const d = JSON.parse(res.body) as RemotePortResult | null;
            if (d) {
                this.remotePort = d.port;
                await this.initSBC();
            } else {
                this.log.error("Couldn't get Remote Port: empty answer");
                this.stopNow();
            }
        } else {
            this.log.error("Couldn't get Remote Port");
            this.stopNow();
        }
    }

    private async initSBC(): Promise<void> {
        this.log.debug('initSBC start...');
        const options: RequestOptions = {
            hostname: API_HOST,
            port: 443,
            path: '/v0/init/',
            method: 'POST',
            rejectUnauthorized: false,
            timeout: REQUEST_TIMEOUT,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'X-APIKEY': this.xApiKey,
            },
        };
        const toSend = JSON.stringify({
            uuid: randomUUID(),
            remotePort: this.remotePort,
            deviceInfo: {
                model: null,
                systemVersion: '10',
                systemName: 'Windows',
                displayResolution: {
                    width: 1920,
                    height: 1080,
                },
                networkInterfaceTypes: [],
                userDefinedName: 'speedtest.vodafone.de',
            },
            clientBundleId: '@visonum/network-quality-sdk',
            clientVersion: '1.2.1',
        });

        let res: HttpsResponse;
        try {
            const promise = this.httpsRequest(options, toSend);
            this.log.debug(`initSBC: ${JSON.stringify(options)}`);
            res = await promise;
        } catch (e) {
            this.log.error(`initSBC: ${JSON.stringify(e)}`);
            this.stopNow();
            return;
        }

        this.log.debug(`initSBC finished with code ${res.statusCode}`);
        if (res.statusCode === 200) {
            const args = JSON.parse(res.body) as SpeedtestInit;
            this.init = args;
            const modem = args.data.modem!;
            const connection = args.data.connection!;
            await this.createAndSetState('modem', 'modem');
            await this.createAndSetState('modem.vendor', 'vendor', modem.vendor);
            await this.createAndSetState('modem.code', 'code', modem.code ?? null);
            await this.createAndSetState('modem.name', 'name', modem.name ?? null);
            await this.createAndSetState('modem.text', 'text', modem.type ?? null);
            await this.createAndSetState('isCustomer', 'isCustomer', connection.isCustomer);
            await this.createAndSetState('isp', 'isp', connection.isp);
            await this.createAndSetState('ip', 'ip', connection.ip);
            await this.createAndSetState('ipCountry', 'ipCountry', connection.ipCountry);
            await this.createAndSetState('downstreamSpeed', 'downstreamSpeed', modem.provisionedDownloadSpeed);
            await this.createAndSetState('upstreamSpeed', 'upstreamSpeed', modem.provisionedUploadSpeed);
            await this.createAndSetState('downstreamBooked', 'downstreamBooked', modem.bookedDownloadSpeedMax);
            await this.createAndSetState('upstreamBooked', 'upstreamBooked', modem.bookedUploadSpeedMax);
            this.log.debug(`SBC-Init (Success): ${JSON.stringify(args)}`);
            this.startDownload();
        } else {
            this.log.error('initSBC: Unknown Error');
            this.stopNow();
        }
    }

    private resetStopHandler(type: TestType): void {
        if (this.stopHandler) {
            this.log.debug(`resetting Timeout ${type}`);
            this.clearTimeout(this.stopHandler);
            this.stopHandler = undefined;
        }
    }

    private startDownload(): void {
        this.log.debug(`startDownload start: ${this.running}`);
        if (this.running) {
            return;
        }
        this.running = 'download';
        const numStreams = this.conf.data.download.numStreams;
        this.init.data.speedtest.servers.downloadServers.dualstack.forEach(testServer => {
            this.downloadBytes[testServer] ||= [];
            const bytes = this.downloadBytes[testServer];
            const url = new URL(testServer);

            for (let i = 0; i < numStreams; i++) {
                bytes[i] = 0;
                const req = request(
                    {
                        hostname: url.hostname,
                        port: 443,
                        path: `${url.pathname}?${Math.random()}`,
                        method: 'GET',
                        rejectUnauthorized: false,
                        timeout: TRANSFER_TIMEOUT,
                    },
                    res => res.on('data', (d: Buffer) => (bytes[i] += d.length)),
                );

                req.on('error', (e: NodeJS.ErrnoException) => {
                    // ECONNRESET is the result of destroying the request at the end of the test
                    if (e.code !== 'ECONNRESET') {
                        this.log.error(`startDownload error: ${JSON.stringify(e)}`);
                        this.stopNow();
                    }
                });

                this.downloadRequests.push(req);
            }
        });

        this.interval(
            () => this.transferEnd(),
            this.conf.data.download.interval * 1000,
            this.intervalRoundTrips(this.conf.data.download.duration, this.conf.data.download.interval * 1000),
        );
        this.resetStopHandler('download');
        this.stopHandler = this.setTimeout(() => this.stopDownloadTest(), this.conf.data.download.duration * 1000);
        this.timeStart = new Date();
        this.timeSection = this.timeStart;
        this.downloadRequests.forEach(req => req.end());
    }

    private startUpload(): void {
        if (this.running) {
            return;
        }
        this.running = 'upload';
        this.bytesLoadedLastSection = 0;
        this.uploadBytes = [];
        this.interval(
            () => this.transferEnd(),
            this.conf.data.upload.interval * 1000,
            this.intervalRoundTrips(this.conf.data.upload.duration, this.conf.data.upload.interval * 1000),
        );
        this.resetStopHandler('upload');
        this.stopHandler = this.setTimeout(() => this.stopUploadTest(), this.conf.data.upload.duration * 1000);

        this.timeStart = new Date();
        this.timeSection = this.timeStart;
        this.pushData(0);
    }

    private async startPing(): Promise<void> {
        if (this.running) {
            return;
        }
        this.timeStart = new Date();
        this.running = 'ping';
        this.resetStopHandler('ping');
        this.stopHandler = this.setTimeout(
            () => this.stopPingTest().catch(e => this.onError('ping', e)),
            this.conf.data.ping.duration * 1000,
        );
        const res = await pingPromise.probe(
            this.init.data.speedtest.servers.pingServer.dualstack.replace('https://', ''),
            {
                timeout: this.conf.data.ping.interval,
                // send 5 echo requests (-c 5 on Linux/macOS, -n 5 on Windows)
                min_reply: 5,
            },
        );
        this.result.ping.min = res.min;
        this.result.ping.max = res.max;
        this.result.ping.avg = res.avg;
        this.result.ping.packetLoss = String(res.packetLoss);
        await this.stopPingTest();
    }

    private async stopPingTest(): Promise<void> {
        // called by the timeout and by the end of the ping, the result must be written only once
        if (this.running !== 'ping') {
            return;
        }
        this.resetStopHandler('ping');
        this.running = null;
        this.result.overall_time.ping = Date.now() - this.timeStart.getTime();
        await this.writeResult();
    }

    /**
     * Uploads UPLOAD_SIZE bytes as multipart form field "data" and starts the next upload when finished,
     * until the upload test is over.
     */
    private pushData(id: number): void {
        const url = new URL(this.init.data.speedtest.servers.uploadServer.dualstack);
        const boundary = `----vofo-speedtest-${randomUUID()}`;
        const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n`);
        const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
        this.uploadBytes[id] = 0;

        const req = request(
            {
                hostname: url.hostname,
                port: 443,
                path: `${url.pathname}${url.search}`,
                method: 'POST',
                rejectUnauthorized: false,
                timeout: TRANSFER_TIMEOUT,
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': head.length + UPLOAD_SIZE + tail.length,
                },
            },
            res => {
                res.resume();
                res.on('end', () => {
                    this.log.debug('Upload ended');
                    if (this.running === 'upload') {
                        this.pushData(id + 1);
                    }
                });
            },
        );
        req.on('error', error => this.log.debug(`Failed to upload file: ${error.message}`));
        this.uploadRequests.push(req);

        let written = 0;
        const writeNext = (): void => {
            while (this.running === 'upload' && written < UPLOAD_SIZE) {
                const size = Math.min(UPLOAD_CHUNK.length, UPLOAD_SIZE - written);
                written += size;
                // count the bytes when they are handed over to the socket
                const ok = req.write(
                    size === UPLOAD_CHUNK.length ? UPLOAD_CHUNK : UPLOAD_CHUNK.subarray(0, size),
                    () => {
                        this.uploadBytes[id] += size;
                    },
                );
                if (!ok) {
                    req.once('drain', writeNext);
                    return;
                }
            }
            if (written >= UPLOAD_SIZE) {
                req.end(tail);
            }
        };
        req.write(head);
        writeNext();
    }

    private getBytesUntilNow(): number {
        let bytesLoadedUntilNow = 0;
        this.log.debug(`gbun ${this.running}`);
        if (this.running === 'download') {
            this.init.data.speedtest.servers.downloadServers.dualstack.forEach(testServer => {
                for (let i = 0; i < this.conf.data.download.numStreams; i++) {
                    bytesLoadedUntilNow += this.downloadBytes[testServer][i];
                }
            });
            this.log.silly(JSON.stringify(this.downloadBytes));
        }
        if (this.running === 'upload') {
            this.uploadBytes.forEach(bl => (bytesLoadedUntilNow += bl));
            this.log.silly(JSON.stringify(this.uploadBytes));
        }
        this.log.silly(String(bytesLoadedUntilNow));
        return bytesLoadedUntilNow;
    }

    private transferEnd(): void {
        const running = this.running;
        const bytesLoadedUntilNow = this.getBytesUntilNow();
        const now = new Date();
        const newBytes = bytesLoadedUntilNow - this.bytesLoadedLastSection;
        const newTime = now.getTime() - this.timeSection.getTime();
        const overallTime = now.getTime() - this.timeStart.getTime();
        const newSpeed = Math.round((8 * newBytes) / newTime);
        if (running === 'download' || running === 'upload') {
            this.result.overall_time[running] = overallTime;
            this.result.overall_bytes[running] = bytesLoadedUntilNow;
        }
        this.log.silly(`nB: ${newBytes} nT: ${newTime}`);
        if (newBytes > 0 && newTime > 0) {
            this.timeSection = now;
            this.bytesLoadedLastSection = bytesLoadedUntilNow;
            this.log.silly(`dit/2: ${(this.conf.data.download.interval * 1000) / 2}`);
            // Intentional: the download interval is used for the upload, too
            if (newTime > (this.conf.data.download.interval * 1000) / 2) {
                this.log.silly(`running: ${running}`);
                if (running === 'download') {
                    this.result.download_raw.push(newSpeed);
                    this.log.silly(`draw: ${JSON.stringify(this.result.download_raw)}`);
                }
                if (running === 'upload') {
                    this.result.upload_raw.push(newSpeed);
                    this.log.silly(`uraw: ${JSON.stringify(this.result.upload_raw)}`);
                }
            }
        }
    }

    private run(type: TestType): void {
        this.log.debug(`run: ${type}`);
        switch (type) {
            case 'download':
                this.startDownload();
                break;
            case 'upload':
                this.startUpload();
                break;
            case 'ping':
                this.startPing().catch(e => this.onError('ping', e));
                break;
        }
    }

    private async resultFromArray(arr: number[], type: TransferType, time = 0, bytes = 0): Promise<void> {
        const data = JSON.stringify({
            speedtestId: this.init.data.speedtest.id,
            intermediateValues: arr,
            transferDuration: time,
            transferredBytes: bytes,
        });

        const options: RequestOptions = {
            hostname: API_HOST,
            port: 443,
            path: `/v0/calc/${type}/`,
            method: 'PUT',
            rejectUnauthorized: false,
            timeout: REQUEST_TIMEOUT,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data, 'utf8'),
                'X-APIKEY': this.xApiKey,
            },
        };

        let res: HttpsResponse;
        try {
            const promise = this.httpsRequest(options, data);
            this.log.debug(`result start: ${JSON.stringify(data)}`);
            res = await promise;
        } catch (e) {
            this.log.error(`result: ${JSON.stringify(e)}`);
            this.stopNow();
            return;
        }

        if (res.statusCode === 200) {
            const args = JSON.parse(res.body) as SpeedtestCalcResult;
            const value = Number(args.data.value);
            switch (type) {
                case 'download':
                    this.result.download = value;
                    if (!parseInt(String(args.data.value), 10)) {
                        if (!this.retryDownload) {
                            this.log.debug('second download test');
                            this.retryDownload = true;
                            this.startDownload();
                        } else {
                            // continue with the upload and ping test anyway
                            this.log.error('retry error: download test returned no value twice');
                            this.setTimeout(() => this.run('upload'), 500);
                        }
                    } else {
                        this.setTimeout(() => this.run('upload'), 500);
                    }
                    break;
                case 'upload':
                    this.result.upload = value;
                    this.setTimeout(() => this.run('ping'), 500);
                    break;
            }
            this.log.debug(`result: ${JSON.stringify(args)}`);
        } else {
            this.log.error(`result: Unknown Error ${res.statusCode}`);
            this.stopNow();
        }
    }

    private async writeResult(): Promise<void> {
        const result = this.result;
        await this.extendObject('Results', {
            type: 'channel',
            common: {
                name: 'Test results of latest run',
            },
            native: {},
        });
        await this.createAndSetState('Results.Last_Run', 'Last_Run_Timestamp', Date.now());

        await this.createAndSetState('Results.download_MB', 'download_MB', result.download / 8 / 1000);
        await this.createAndSetState('Results.download_Mb', 'download_Mb', result.download / 1000);

        await this.createAndSetState('Results.upload_MB', 'upload_MB', result.upload / 8 / 1000);
        await this.createAndSetState('Results.upload_Mb', 'upload_Mb', result.upload / 1000);

        const downloadCalc = result.download_raw.reduce((acc, c) => acc + c, 0) / result.download_raw.length;
        const uploadCalc = result.upload_raw.reduce((acc, c) => acc + c, 0) / result.upload_raw.length;

        await this.createAndSetState('Results.download_MB_calc', 'download_MB_calc', downloadCalc / 8 / 1000);
        await this.createAndSetState('Results.download_Mb_calc', 'download_Mb_calc', downloadCalc / 1000);

        await this.createAndSetState('Results.upload_MB_calc', 'upload_MB_calc', uploadCalc / 8 / 1000);
        await this.createAndSetState('Results.upload_Mb_calc', 'upload_Mb_calc', uploadCalc / 1000);

        await this.extendObject('Results.ping', {
            type: 'channel',
            common: {
                name: 'Ping results of latest run',
            },
            native: {},
        });

        await this.createAndSetState('Results.ping.min', 'min', parseInt(result.ping.min));
        await this.createAndSetState('Results.ping.max', 'max', parseInt(result.ping.max));
        await this.createAndSetState('Results.ping.avg', 'avg', parseInt(result.ping.avg));
        await this.createAndSetState('Results.ping.packetLoss', 'packetLoss', parseInt(result.ping.packetLoss));

        this.log.info(
            `Vofo-Speedtest finished with ${result.download / 1000}mbit download speed and ${result.upload / 1000}mbit upload speed.`,
        );
        this.stopNow();
    }

    private stopDownloadTest(): void {
        this.log.debug(`stopDownloadTest stopped: ${this.running}`);
        this.stopHandler && this.clearTimeout(this.stopHandler);
        this.stopHandler = undefined;
        this.downloadRequests.forEach(req => req.destroy());
        this.downloadRequests = [];
        this.running = null;
        this.resultFromArray(
            this.result.download_raw,
            'download',
            this.result.overall_time.download,
            this.result.overall_bytes.download,
        ).catch(e => this.onError('download result', e));
    }

    private stopUploadTest(): void {
        this.stopHandler && this.clearTimeout(this.stopHandler);
        this.stopHandler = undefined;
        this.running = null;
        this.uploadRequests.forEach(req => req.destroy());
        this.uploadRequests = [];
        this.resultFromArray(
            this.result.upload_raw,
            'upload',
            this.result.overall_time.upload,
            this.result.overall_bytes.upload,
        ).catch(e => this.onError('upload result', e));
    }

    /** Calls `func` every `wait` ms, `times` times */
    private interval(func: () => void, wait: number, times: number): void {
        let t = times;
        const tick = (): void => {
            if (t-- > 0) {
                this.setTimeout(tick, wait);
                try {
                    func();
                    this.log.silly(`interval: #${t} @${new Date().toString()}`);
                } catch (e) {
                    t = 0;
                    this.log.error(String(e));
                    throw e;
                }
            }
        };
        this.setTimeout(tick, wait);
    }

    private intervalRoundTrips(runtime: number, interval: number): number {
        return Math.round((runtime * 1000) / interval) + 1;
    }

    private async createAndSetState(id: string, name: string, value: ioBroker.StateValue = null): Promise<void> {
        this.log.debug(`_createState called for: ${id} with value : ${value}`);

        try {
            // Try to get details from state lib, if not use defaults. throw warning if states are not known in an attribute list
            const attr = STATE_ATTRIBUTES[name];
            if (attr === undefined) {
                this.log.warn(`State attribute definition missing for + ${name}`);
            }
            const writable = attr?.write || false;
            const stateName = attr?.name || name;
            const role = attr?.role || 'state';
            const type = attr?.type || 'mixed';
            const unit = attr?.unit || '';
            this.log.debug(`Write value: ${writable}`);

            if (type === 'device') {
                await this.extendObject(id, {
                    type: 'device',
                    common: {
                        name: stateName,
                    },
                    native: {},
                });
            } else {
                await this.extendObject(id, {
                    type: 'state',
                    common: {
                        name: stateName,
                        role,
                        type,
                        unit,
                        read: true,
                        write: writable,
                    },
                    native: {},
                });
            }

            // Only set value if input != null
            if (value !== null) {
                await this.setState(id, { val: value, ack: true });
            }

            // Subscribe on state changes if writable
            if (writable) {
                this.subscribeStates(id);
            }
        } catch (error) {
            this.log.error(`Create state error = ${error}`);
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new VofoSpeedtest(options);
} else {
    // otherwise start the instance directly
    (() => new VofoSpeedtest())();
}
