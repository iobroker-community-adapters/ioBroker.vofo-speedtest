// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
let Curl;
let CurlFeature;
const https = require('https');
const ping = require('ping');
const uuid = require('uuid');
const stateAttr = require('./lib/stateAttr.js');

try {
    const NodeCurl = require('node-libcurl');
    Curl = NodeCurl.Curl;
    CurlFeature = NodeCurl.CurlFeature;
} catch (e) {
    // curl is not available
}

let that = null;

let useCurl = false;
//const ping_interval_time = 1000;
//const ping_time = 8;
const bytes_loaded = [];
let download_streams = [];
let upload_streams = [];
let bytes_loaded_last_section = 0;
let running = null;
let timeSection = null;
let timeStart = null;
let retry_download = false;
let remote_port = 0;
let provider_download = 0;
let provider_upload = 0;
let timers = [];
const isWin = process.platform === 'win32';
const data = [{
    name: 'data',
    contents: ''
}];
const result = {
    download_raw: Array(),
    upload_raw: Array(),
    ping_raw: Array(),
    overall_time: {
        ping: 0
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
    jitter: 0,
    webench: Array(),
    webench_result: 0,
};
let stopHandler;

let conf = {
    data: {
        version: '0.28.9',
        remotePortDetectionUrl: 'https://rpd.speedtest.vodafone-ip.de',
        ipDetectionUrl: {
            ipv4: 'https://ip4.system.info',
            ipv6: 'https://speedtest-21v6.vodafone.anw.net/empty.txt'
        },
        download: {
            numStreams: 6,
            duration: 10,
            interval: 0.75
        },
        upload: {
            duration: 12,
            interval: 0.75,
            maxBytes: 10485760
        },
        ping: {
            duration: 8,
            interval: 1
        },
        cpuBenchmark: false,
        webBenchmark: false,
        tcpRetrans: false,
        connection: {
            ip: '127.0.0.1',
            ipVersion: 'v4'
        }
    }
};
let init = {
    data: {
        speedtest: {
            id: 'XXXXXXXXX',
            servers: {
                downloadServers: {
                    dualstack: [
                        'https://speedtest-60.speedtest.vodafone-ip.de/data.zero.bin.512M',
                        'https://speedtest-53.speedtest.vodafone-ip.de/data.zero.bin.512M'
                    ],
                    ipv6: [
                        'https://speedtest-60v6.speedtest.vodafone-ip.de/data.zero.bin.512M',
                        'https://speedtest-53v6.speedtest.vodafone-ip.de/data.zero.bin.512M'
                    ]
                },
                uploadServer: {
                    dualstack: 'https://speedtest-60.speedtest.vodafone-ip.de/empty.txt',
                    ipv6: 'https://speedtest-60v6.speedtest.vodafone-ip.de/empty.txt'
                },
                pingServer: {
                    dualstack: 'https://speedtest-60.speedtest.vodafone-ip.de',
                    ipv6: 'https://speedtest-60v6.speedtest.vodafone-ip.de'
                },
                wsPingServer: {
                    dualstack: 'wss://speedtest-21.vodafone.anw.net/ping/',
                    ipv6: 'wss://speedtest-21v6.vodafone.anw.net/ping/'
                }
            }
        }
    }
};
let apikeyfile = '';
let xapikey = '';

class VofoSpeedtest extends utils.Adapter {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        // @ts-ignore
        super({
            ...options,
            name: 'vofo-speedtest',
        });

        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // this.setState("info.connection", false, true);
        that = this;
        useCurl = Curl && this.config.useCurl;
        this.updateData();
    }

    async errorHandling(codePart, error) {
        this.log.error(`[${codePart}] error: ${error.message}, stack: ${error.stack}`);
        if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
            const sentryInstance = this.getPluginInstance('sentry');
            if (sentryInstance) {
                sentryInstance.getSentryObject().captureException(error);
            }
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info('starting cleanup...');
            if (typeof stopHandler === 'number') {
                clearTimeout(stopHandler);
                stopHandler = null;
            }
            timers.forEach(timer => clearTimeout(timer));
            timers = [];
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

    stopNow() {
        if (this.stop) {
            this.stop();
        }
    }

    updateData() {
        this.getApiKeyFile();
        //timers["updateData"] = setTimeout(() => this.updateData(), this.config.interval * 60000);
    }

    getApiKeyFile() {
        this.log.debug('getApiKeyFile start...');
        const options = {
            hostname: 'speedtest.vodafone.de',
            port: 443,
            path: '/',
            method: 'GET',
            rejectUnauthorized: false,
            resolveWithFullResponse: true,
            timeout: 60000,
        };

        const req = https.request(options, res => {
            let page = '';
            res.on('data', d => page += d);
            res.on('end', () => {
                this.log.debug(`getApiKeyFile finished with code ${res.statusCode}`);
                if (res.statusCode === 200) {
                    ////<script src="/_next/static/chunks/_app-784-16521bb81c5071f679b8.js" defer="">
                    const regex = /<script src="(\/_next\/static\/chunks\/pages\/_app-[0-9a-z]+\.js)" defer="">/s;
                    const settings = page.match(regex);
                    if (settings) {
                        apikeyfile = settings[1];
                        this.getApiKey();
                    }
                } else {
                    that.log.error("Couldn't get .js file for API Key");
                    that.stopNow();
                }
            });
        });

        req.on('error', e => {
            this.log.error(`getApiKeyFile error: ${JSON.stringify(e)}`);
            this.stopNow();
        });

        req.on('abort', e => {
            this.log.warn(`getApiKeyFile abort: ${JSON.stringify(e)}`);
            this.stopNow();
        });
        req.end();

    }

    getApiKey() {
        this.log.debug('getApiKey start...');
        const options = {
            hostname: 'speedtest.vodafone.de',
            port: 443,
            path: apikeyfile,
            method: 'GET',
            rejectUnauthorized: false,
            resolveWithFullResponse: true,
            timeout: 60000,
        };

        const req = https.request(options, res => {
            let page = '';
            res.on('data', d => page += d);
            res.on('end', () => {
                this.log.debug(`getApiKey finished with code ${res.statusCode}`);
                if (res.statusCode === 200) {
                    // 32 char long API key like "eiquo8HuP0aeDoinono2nao4keip1the"
                    const regex = /"([a-zA-Z0-9]{32})"/s;
                    const settings = page.match(regex);
                    if (settings != null) {
                        xapikey = settings[1];
                        this.getConfig();
                    } else {
                        that.log.error("Couldn't extract API Key");
                        that.stopNow();
                    }
                } else {
                    that.log.error("Couldn't get API Key");
                    that.stopNow();
                }
            });
        });

        req.on('error', e => {
            this.log.error(`getApiKey error: ${JSON.stringify(e)}`);
            this.stopNow();
        });

        req.on('abort', e => {
            this.log.warn(`getApiKey abort: ${JSON.stringify(e)}`);
            this.stopNow();
        });
        req.end();

    }

    getConfig() {
        this.log.debug('getConfig start...');
        //r = null !== (e = "eiquo8HuP0aeDoinono2nao4keip1the") ? e : ""
        //
        const options = {
            hostname: 'api.speedtest.vodafone.anw.net',
            port: 443,
            path: '/v0/config/',
            method: 'GET',
            rejectUnauthorized: false,
            resolveWithFullResponse: true,
            timeout: 60000,
            headers: {
                'X-APIKEY': xapikey,
            }
        };

        const req = https.request(options, res => {
            let page = '';
            res.on('data', d => page += d);
            res.on('end', () => {
                this.log.debug(`getConfig finished with code ${res.statusCode}`);
                if (res.statusCode === 200) {
                    //https://speedtest-60.speedtest.vodafone-ip.de/data.zero.bin.512M?0.9984625503642759
                    conf = JSON.parse(page);
                    this.getRemotePort();
                } else {
                    that.log.error("Couldn't get Speedtest Config");
                    that.stopNow();
                }
            });
        });

        req.on('error', e => {
            this.log.error(`getConfig error: ${JSON.stringify(e)}`);
            this.stopNow();
        });

        req.on('abort', e => {
            this.log.warn(`getConfig abort: ${JSON.stringify(e)}`);
            this.stopNow();
        });
        req.end();
    }

    getRemotePort() {
        this.log.debug('getRemotePort start...');
        //r = null !== (e = "eiquo8HuP0aeDoinono2nao4keip1the") ? e : ""
        //
        const options = {
            hostname: 'rpd.speedtest.vodafone-ip.de',
            port: 443,
            path: '/',
            method: 'GET',
            rejectUnauthorized: false,
            resolveWithFullResponse: true,
            timeout: 60000,
        };

        const req = https.request(options, res => {
            let page = '';
            res.on('data', d => page += d);
            res.on('end', () => {
                this.log.debug(`getRemotePort finished with code ${res.statusCode}`);
                if (res.statusCode === 200) {
                    const d = JSON.parse(page);
                    if (d) {
                        remote_port = d.port;
                        this.initSBC();
                    }
                } else {
                    that.log.error("Couldn't get Remote Port");
                    that.stopNow();
                }
            });
        });

        req.on('error', e => {
            this.log.error(`getRemotePort error: ${JSON.stringify(e)}`);
            this.stopNow();
        });

        req.on('abort', e => {
            this.log.warn(`getRemotePort abort: ${JSON.stringify(e)}`);
            this.stopNow();
        });
        req.end();
    }

    initSBC() {
        this.log.debug('initSBC start...');
        const options = {
            hostname: 'api.speedtest.vodafone.anw.net',
            port: 443,
            path: '/v0/init/',
            method: 'POST',
            rejectUnauthorized: false,
            resolveWithFullResponse: true,
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'X-APIKEY': xapikey
            }
        };

        const req = https.request(options, async res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', async () => {
                this.log.debug(`initSBC finished with code ${res.statusCode}`);
                if (res.statusCode === 200) {
                    const args = JSON.parse(data);
                    init = args;
                    provider_download = args.data.modem.provisionedDownloadSpeed;
                    provider_upload = args.data.modem.provisionedUploadSpeed;
                    await this._createState('modem', 'modem');
                    await this._createState('modem.vendor', 'vendor', args.data.modem.vendor);
                    await this._createState('modem.code', 'code', (args.data.modem.code != null ? args.data.modem.code : null));
                    await this._createState('modem.name', 'name', (args.data.modem.name != null ? args.data.modem.name : null));
                    await this._createState('modem.text', 'text', (args.data.modem.type != null ? args.data.modem.type : null));
                    await this._createState('isCustomer', 'isCustomer', args.data.connection.isCustomer);
                    await this._createState('isp', 'isp', args.data.connection.isp);
                    await this._createState('ip', 'ip', args.data.connection.ip);
                    await this._createState('ipCountry', 'ipCountry', args.data.connection.ipCountry);
                    await this._createState('downstreamSpeed', 'downstreamSpeed', args.data.modem.provisionedDownloadSpeed);
                    await this._createState('upstreamSpeed', 'upstreamSpeed', args.data.modem.provisionedUploadSpeed);
                    await this._createState('downstreamBooked', 'downstreamBooked', args.data.modem.bookedDownloadSpeedMax);
                    await this._createState('upstreamBooked', 'upstreamBooked', args.data.modem.bookedUploadSpeedMax);
                    // this.setState("info.connection", true, true);
                    this.log.debug(`SBC-Init (Success): ${JSON.stringify(args)}`);
                    this.startDownload();
                } else {
                    that.log.error('initSBC: Unknown Error');
                    that.stopNow();
                }
            });
        });

        req.on('error', e => {
            this.log.error(`initSBC: ${JSON.stringify(e)}`);
            this.stopNow();
        });
        const toSend = JSON.stringify({
            uuid: uuid.v1(),
            remotePort: remote_port,
            deviceInfo: {
                model: null,
                systemVersion: '10',
                systemName: 'Windows',
                displayResolution: {
                    width: 1920,
                    height: 1080
                },
                networkInterfaceTypes: [],
                userDefinedName: 'speedtest.vodafone.de'
            },
            clientBundleId: '@visonum/network-quality-sdk',
            clientVersion: '1.2.1'
        });
        req.write(toSend);
        req.end();
        this.log.debug(`initSBC: ${JSON.stringify(options)}`);
    }

    startDownload() {
        this.log.debug(`startDownload start: ${running}`);
        if (running) {
            return;
        }
        running = 'download';
        // this.log.silly(init.data.speedtest.servers);
        init.data.speedtest.servers.downloadServers.dualstack.forEach(testServer => {
            if (typeof bytes_loaded[testServer] === 'undefined') {
                bytes_loaded[testServer] = [];
            }
            for (let i = 0; i < conf.data.download.numStreams; i++) {
                bytes_loaded[testServer][i] = 0;

                let downloadStream;
                if (useCurl) {
                    const curl = new Curl();
                    curl.setOpt(Curl.option.URL, `${testServer}?${Math.random()}`);
                    curl.setOpt(Curl.option.NOPROGRESS, false);
                    curl.setOpt(Curl.option.SSL_VERIFYPEER, false);
                    curl.setOpt(Curl.option.CONNECTTIMEOUT, 5);
                    curl.setOpt(Curl.option.TIMEOUT, 120);
                    curl.enable(CurlFeature.NoStorage);
                    curl.setProgressCallback((dltotal, dlnow) => {
                        bytes_loaded[testServer][i] = dlnow;
                        return 0;
                    });

                    curl.on('end', () => {
                        that.log.debug('Download ended');
                        curl.close();
                    });

                    curl.on('error', (error) => {
                        that.log.debug(`Failed to download file ${error}`);
                        curl.close();
                    });

                    downloadStream = {
                        req: curl
                    };
                } else {
                    const options = {
                        hostname: testServer.replace('https://', '').replace('/data.zero.bin.512M', ''),
                        port: 443,
                        path: `/data.zero.bin.512M?${Math.random()}`,
                        method: 'GET',
                        rejectUnauthorized: false,
                        resolveWithFullResponse: true,
                        timeout: 120000,
                    };

                    const req = https.request(options, res => {
                        res.on('data', d => bytes_loaded[testServer][i] += Buffer.byteLength(d, 'utf8'));
                        res.on('end', () => {});
                    });

                    req.on('error', e => {
                        // @ts-ignore
                        if (e.code !== 'ECONNRESET') {
                            this.log.error(`startDownload error: ${JSON.stringify(e)}`);
                            this.stopNow();
                        }
                    });

                    req.on('abort', e =>
                        this.log.debug(`startDownload abort: ${JSON.stringify(e)}`));

                    downloadStream = {
                        options,
                        req,
                    };
                }
                download_streams.push(downloadStream);
                // this.log.silly("starDownload: " + JSON.stringify(downloadStream));
            }
        });

        this.interval(this.transferEnd, conf.data.download.interval * 1000, this.intervalRoundTrips(conf.data.download.duration, conf.data.download.interval * 1000));
        if (typeof stopHandler === 'number') {
            this.log.debug('resetting Timeout download');
            clearTimeout(stopHandler);
            stopHandler = null;
        }
        stopHandler = setTimeout(() => this.stopDownloadTest(), conf.data.download.duration * 1000);
        timeStart = new Date();
        timeSection = timeStart;
        for (let k = 0; k < download_streams.length; k++) {
            if (useCurl) {
                download_streams[k].req.perform();
            } else {
                download_streams[k].req.end();
            }
        }
    }

    startUpload() {
        if (running) {
            return;
        }
        if (Curl) {
            running = 'upload';
            data[0].contents = '0'.repeat(1E7);
            bytes_loaded_last_section = 0;
            bytes_loaded[0] = 0;
            this.interval(this.transferEnd, conf.data.upload.interval * 1000, this.intervalRoundTrips(conf.data.upload.duration, conf.data.upload.interval * 1000));
            if (typeof stopHandler === 'number') {
                this.log.debug('resetting Timeout upload');
                clearTimeout(stopHandler);
                stopHandler = null;
            }
            stopHandler = setTimeout(this.stopUploadTest, conf.data.upload.duration * 1000);

            timeStart = new Date();
            timeSection = timeStart;
            this.pushData(0);
        } else {
            this.stopUploadTest();
        }
    }

    async startPing() {
        if (running) {
            return;
        }
        timeStart = new Date();
        running = 'ping';
        if (typeof stopHandler === 'number') {
            this.log.debug('resetting Timeout ping');
            clearTimeout(stopHandler);
            stopHandler = null;
        }
        stopHandler = setTimeout(this.stopPingTest, conf.data.ping.duration * 1000);
        const options = {
            timeout: conf.data.ping.interval,
            extra: ['-c', '5'],
        };
        if (isWin) {
            options.extra = ['-n', '5'];
        }
        const res = await ping.promise.probe(init.data.speedtest.servers.pingServer.dualstack.replace('https://', ''), options);
        result.ping.min = res.min;
        result.ping.max = res.max;
        result.ping.avg = res.avg;
        result.ping.packetLoss = res.packetLoss;
        await this.stopPingTest();
    }

    async stopPingTest() {
        running = null;
        const now = new Date();
        result.overall_time.ping = now.getTime() - timeStart.getTime();
        await that.writeResult();
    }

    pushData(id) {
        if (useCurl && Curl) {
            const curl = new Curl();
            curl.setOpt(Curl.option.URL, init.data.speedtest.servers.uploadServer.dualstack);
            curl.setOpt(Curl.option.NOPROGRESS, false);
            curl.setOpt(Curl.option.SSL_VERIFYPEER, false);
            curl.setOpt(Curl.option.CONNECTTIMEOUT, 5);
            curl.setOpt(Curl.option.TIMEOUT, 120);
            curl.enable(CurlFeature.NoStorage);
            curl.setOpt(Curl.option.HTTPPOST, data);
            curl.setProgressCallback((dltotal, dlnow, ultotal, ulnow) => {
                bytes_loaded[id] = ulnow;
                return 0;
            });

            curl.on('end', () => {
                this.log.debug('Upload ended');
                curl.close();
                if (running === 'upload') {
                    this.pushData(id + 1);
                }
            });

            curl.on('error', error => {
                this.log.debug(`Failed to upload file: ${error}`);
                curl.close();
            });

            curl.perform();
        }
    }

    getBytesUntilNow() {
        let bytesLoadedUntilNow = 0;
        that.log.debug(`gbun ${running}`);
        if (running === 'download') {
            init.data.speedtest.servers.downloadServers.dualstack.forEach(testServer => {
                for (let i = 0; i < conf.data.download.numStreams; i++) {
                    bytesLoadedUntilNow += bytes_loaded[testServer][i];
                }
            });
        }
        if (running === 'upload') {
            bytes_loaded.forEach(bl => bytesLoadedUntilNow += bl);
        }
        that.log.silly(JSON.stringify(bytes_loaded));
        that.log.silly(bytesLoadedUntilNow);
        return bytesLoadedUntilNow;
    }

    transferEnd() {
        const bytesLoadedUntilNow = that.getBytesUntilNow();
        const now = new Date();
        const newBytes = bytesLoadedUntilNow - bytes_loaded_last_section;
        const newTime = now.getTime() - timeSection.getTime();
        const overallTime = now.getTime() - timeStart.getTime();
        const newSpeed = Math.round(8 * newBytes / newTime);
        result.overall_time[running] = overallTime;
        result.overall_bytes[running] = bytesLoadedUntilNow;
        that.log.silly(`nB: ${newBytes} nT: ${newTime}`);
        if (newBytes > 0 && newTime > 0) {
            timeSection = now;
            bytes_loaded_last_section = bytesLoadedUntilNow;
            that.log.silly(`dit/2: ${conf.data.download.interval * 1000 / 2}`);
            if (newTime > conf.data.download.interval * 1000 / 2) {
                that.log.silly(`running: ${running}`);
                if (running === 'download') {
                    result.download_raw.push(newSpeed);
                    that.log.silly(`draw: ${JSON.stringify(result.download_raw)}`);
                }
                if (running === 'upload') {
                    result.upload_raw.push(newSpeed);
                    that.log.silly(`uraw: ${JSON.stringify(result.upload_raw)}`);
                }
            }
        }
    }

    run(type) {
        this.log.debug(`run: ${type}`);
        switch (type) {
            case 'download':
                this.startDownload();
                break;
            case 'upload':
                this.startUpload();
                break;
            case 'ping':
                this.startPing();
                break;
            /*case "upload_ws":
                startUploadWS();
                break;
            case "webench":
                startWebench();
                break*/
        }
    }

    resultFromArray(arr, type, ref, time, bytes) {
        const data = JSON.stringify({
            speedtestId: init.data.speedtest.id,
            intermediateValues: arr,
            transferDuration: time,
            transferredBytes: bytes
        });

        //https://api.speedtest.vodafone.anw.net/v0/calc/download/
        const options = {
            hostname: 'api.speedtest.vodafone.anw.net',
            port: 443,
            path: `/v0/calc/${type}/`,
            method: 'PUT',
            rejectUnauthorized: false,
            resolveWithFullResponse: true,
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data, 'utf8'),
                'X-APIKEY': xapikey
            }
        };

        const req = https.request(options, res => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const args = JSON.parse(data);
                    switch (type) {
                        case 'download':
                            result.download = args.data.value;
                            if (!parseInt(args.data.value, 10)) {
                                if (!retry_download) {
                                    that.log.debug('second download test');
                                    retry_download = true;
                                    that.startDownload();
                                } else {
                                    that.log.error('retry error');
                                }
                            } else {
                                timers.resultFromArray = setTimeout(() => this.run('upload'), 500);
                            }
                            break;
                        case 'upload':
                            result.upload = args.data.value;
                            timers.resultFromArray = setTimeout(() => this.run('ping'), 500);
                            break;
                    }
                    this.log.debug(`result: ${JSON.stringify(args)}`);
                } else {
                    this.log.error(`result: Unknown Error ${res.statusCode}`);
                }
            });
        });

        req.on('error', e => {
            this.log.error(`result: ${JSON.stringify(e)}`);
            this.stopNow();
        });
        req.write(data);
        req.end();
        this.log.debug(`result start: ${JSON.stringify(data)}`);
    }

    async writeResult() {
        this.extendObject('Results', {
            type: 'channel',
            common: {
                name: 'Test results of latest run',
            },
            native: {},
        });
        await this._createState('Results.Last_Run', 'Last_Run_Timestamp', new Date().getTime());

        await this._createState('Results.download_MB', 'download_MB', result.download / 8 / 1000);
        await this._createState('Results.download_Mb', 'download_Mb', result.download / 1000);

        await this._createState('Results.upload_MB', 'upload_MB', result.upload / 8 / 1000);
        await this._createState('Results.upload_Mb', 'upload_Mb', result.upload / 1000);

        const download_calc = result.download_raw.reduce((acc, c) => acc + c, 0) / result.download_raw.length;
        const upload_calc = result.upload_raw.reduce((acc, c) => acc + c, 0) / result.upload_raw.length;

        await this._createState('Results.download_MB_calc', 'download_MB_calc', download_calc / 8 / 1000);
        await this._createState('Results.download_Mb_calc', 'download_Mb_calc', download_calc / 1000);

        await this._createState('Results.upload_MB_calc', 'upload_MB_calc', upload_calc / 8 / 1000);
        await this._createState('Results.upload_Mb_calc', 'upload_Mb_calc', upload_calc / 1000);

        this.extendObject('Results.ping', {
            type: 'channel',
            common: {
                name: 'Ping results of latest run',
            },
            native: {},
        });

        await this._createState('Results.ping.min', 'min', parseInt(result.ping.min));
        await this._createState('Results.ping.max', 'max', parseInt(result.ping.max));
        await this._createState('Results.ping.avg', 'avg', parseInt(result.ping.avg));
        await this._createState('Results.ping.packetLoss', 'packetLoss', parseInt(result.ping.packetLoss));

        this.log.info(`Vofo-Speedtest finished with ${result.download / 1000}mbit download speed and ${result.upload / 1000}mbit upload speed.`);
        this.stopNow();
    }

    stopDownloadTest() {
        that.log.debug(`stopDownloadTest stopped: ${running}`);
        stopHandler && clearTimeout(stopHandler);
        stopHandler = null;
        for (let i = 0; i < download_streams.length; i++) {
            if (useCurl) {
                download_streams[i].req.close();
            } else {
                download_streams[i].req.abort();
            }
        }
        download_streams = [];
        running = null;
        that.resultFromArray(result.download_raw, 'download', provider_download, result.overall_time.download, result.overall_bytes.download);
    }

    stopUploadTest() {
        stopHandler && clearTimeout(stopHandler);
        stopHandler = null;
        for (let i = 0; i < upload_streams.length; i++) {
            upload_streams[i].req.abort();
        }
        running = null;
        data[0].contents = '';
        upload_streams = [];
        that.resultFromArray(result.upload_raw, 'upload', provider_upload, result.overall_time.upload, result.overall_bytes.upload);
    }

    interval(func, wait, times) {
        const intervalClosure = function (w, t) {
            return function () {
                if (typeof t === 'undefined' || t-- > 0) {
                    timers.interval1 = setTimeout(intervalClosure, w);
                    try {
                        func.call(null);
                        that.log.silly(`interval: #${t} @${new Date()}`);
                    } catch (e) {
                        t = 0;
                        that.log.error(e);
                        throw e;
                    }
                }
            };
        }(wait, times);
        timers.interval2 = setTimeout(intervalClosure, wait);
    }

    intervalRoundTrips(runtime, interval) {
        return Math.round((runtime * 1000) / interval) + 1;
    }

    async _createState(state, name, value) {
        this.log.debug(`_createState called for: ${state} with value : ${value}`);

        try {
            // Try to get details from state lib, if not use defaults. throw warning if states are not known in an attribute list
            if (stateAttr[name] === undefined) {
                this.log.warn(`State attribute definition missing for + ${name}`);
            }
            const writable = stateAttr[name] !== undefined ? stateAttr[name].write || false : false;
            const state_name = stateAttr[name] !== undefined ? stateAttr[name].name || name : name;
            const role = stateAttr[name] !== undefined ? stateAttr[name].role || 'state' : 'state';
            const type = stateAttr[name] !== undefined ? stateAttr[name].type || 'mixed' : 'mixed';
            const unit = stateAttr[name] !== undefined ? stateAttr[name].unit || '' : '';
            this.log.debug(`Write value: ${writable}`);

            if (type === 'device') {
                await this.extendObjectAsync(state, {
                    type: 'device',
                    common: {
                        name: state_name
                    },
                    native: {}
                });
            } else {
                await this.extendObjectAsync(state, {
                    type: 'state',
                    common: {
                        name: state_name,
                        role: role,
                        type: type,
                        unit: unit,
                        write: writable
                    },
                    native: {},
                });
            }

            // Only set value if input != null
            if (value !== null) {
                await this.setStateAsync(state, { val: value, ack: true });
            }

            // Subscribe on state changes if writable
            if (writable === true) {
                this.subscribeStates(state);
            }
        } catch (error) {
            this.log.error(`Create state error = ${error}`);
        }
    }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new VofoSpeedtest(options);
} else {
    // otherwise start the instance directly
    new VofoSpeedtest();
}
