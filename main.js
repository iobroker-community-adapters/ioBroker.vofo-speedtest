"use strict";

/*
 * Created with @iobroker/create-adapter v1.23.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const https = require("https");

let that = null;

const num_download_streams = 6;
const download_time = 10;
const download_interval_time = 750;
/*const upload_time = 12;
const upload_interval_time = 750;
const ping_interval_time = 1000;
const webench_time = 30;
const ping_time = 8;*/
const bytes_loaded = [];
const download_streams = [];
//const upload_streams = [];
let bytes_loaded_last_section = 0;
let running = null;
let timeSection = null;
let timeStart = null;
let timeEnd = null;
let remote_port = null;
let provider_download = 0;
let provider_upload = 0;
let currentSpeedtestId = null;
let is_umCustomer = !1;
let isp = null;
let initiating = false;
let init_done = !1;
const result = {
	download_raw: Array(),
	upload_raw: Array(),
	ping_raw: Array(),
	overall_time: Array(),
	overall_bytes: Array(),
	download: 0,
	upload: 0,
	ping: 0,
	jitter: 0,
	webench: Array(),
	webench_result: 0,
};
let stopHandler;

const conf = JSON.parse('{"debug":false,"webench":[{"id":1,"url":"https://ref-large.system.info"},{"id":2,"url":"https://www.focus.de"},{"id":3,"url":"https://www.formel1.de"},{"id":4,"url":"https://www.chip.de"},{"id":5,"url":"https://www.wikipedia.org"}],"server":{"testServers":["https://speedtest-10g-ham-2.kabel-deutschland.de","https://speedtest-10g-fra-2.kabel-deutschland.de"],"pingServer":"https://speedtest-10g-ham-2.kabel-deutschland.de"}}');


class VodafoneSpeedtest extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "vodafone-speedtest",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("objectChange", this.onObjectChange.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		this.setState("info.connection", false, true);
		that = this;
		this.updateData();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info("cleaned everything up...");
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	onObjectChange(id, obj) {
		if (obj) {
			// The object was changed
			this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deconsted
			this.log.info(`object ${id} deconsted`);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deconsted
			this.log.info(`state ${id} deconsted`);
		}
	}

	updateData() {
		this.doSpeedtest();
		//this.timer = setTimeout(() => this.updateData(), this.config.interval * 60000);
	}

	doSpeedtest() {
		if (!initiating && !init_done) this.init_sbc();
		this.log.silly("doSpeedtest " + init_done);
		if (!init_done) {
			setTimeout(() => this.doSpeedtest(), 5000);
			return;
		}
		this.startDownload();
	}

	startDownload() {
		this.log.silly("startDownload start: " + running);
		if (running != null) return;
		running = "download";
		this.log.silly(conf.server.testServers);
		conf.server.testServers.forEach(testServer => {
			if (typeof bytes_loaded[testServer] == "undefined") { bytes_loaded[testServer] = []; }
			for (let i = 0; i < num_download_streams; i++) {

				bytes_loaded[testServer][i] = 0;

				const downloadStream = {
					url: testServer + "/data.zero.bin.512M?" + Math.random(),
					req: new XMLHttpRequest(),
					updateProgress: function (evt) {
						bytes_loaded[this.testServer][this.id] = evt.loaded;
					}
				};
				downloadStream.req.id = i;
				downloadStream.req.testServer = testServer;
				downloadStream.req.open("GET", downloadStream.url, !0);
				downloadStream.req.onprogress = downloadStream.updateProgress;
				downloadStream.req.onload = this.transferEnd;
				downloadStream.req.onerror = this.transferEnd;
				downloadStream.req.onabort = this.transferEnd;
				downloadStream.req.responseType = "blob";
				download_streams.push(downloadStream);
				this.log.silly("starDownload: " + JSON.stringify(downloadStream));
			}
		});

		this.interval(this.transferEnd, download_interval_time, this.intervalRoundTrips(download_time, download_interval_time));
		if (typeof stopHandler === "number") {
			console.debug("resetting Timeout download");
			clearTimeout(stopHandler);
			stopHandler = null;
		}
		stopHandler = setTimeout(this.stopDownloadTest, download_time * 1000);
		timeStart = new Date();
		timeSection = timeStart;
		for (let k = 0; k < download_streams.length; k++) {
			download_streams[k].req.send();
		}
	}

	init_sbc() {
		initiating = true;
		const options = {
			hostname: "speedtest.vodafone.de",
			port: 443,
			path: "/ajax/speedtest-init/?port=" + remote_port,
			method: "GET",
			rejectUnauthorized: false,
			resolveWithFullResponse: true,
			timeout: 60000,
			headers: {
				"Content-Type": "application/json; charset=utf-8",
			}
		};

		const req = https.request(options, res => {
			let data = "";
			res.on("data", d => {
				data += d;
			});
			res.on("end", () => {
				if (res.statusCode == 200) {
					const args = JSON.parse(data);
					provider_download = args.downstreamSpeed;
					provider_upload = args.upstreamSpeed;
					currentSpeedtestId = args.speedtestId;
					is_umCustomer = args.isCustomer;
					isp = args.isp;
					init_done = !0;
					initiating = false;
					this.log.debug("SBC-Init (Success):" + JSON.stringify(args));
				} else {
					initiating = false;
					this.log.error("init_sbc: Unknown Error");
				}
			});
		});

		req.on("error", e => {
			initiating = false;
			this.log.error("init_sbc: " + JSON.stringify(e));
		});
		req.end();
		this.log.silly("init_sbc: " + JSON.stringify(options));
	}


	getBytesUntilNow() {
		let bytesLoadedUntilNow = 0;
		if (running == "download") {
			conf.server.testServers.forEach(testServer => {
				for (let i = 0; i < num_download_streams; i++) {
					bytesLoadedUntilNow += bytes_loaded[testServer][i];
				}
			});
		}
		if (running == "upload") {
			bytesLoadedUntilNow = bytes_loaded[0]; //+ bytes_loaded_push
		}
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
		this.log.silly("nB: "+newBytes +" nT: "+newTime);
		if (newBytes > 0 && newTime > 0) {
			timeSection = now;
			bytes_loaded_last_section = bytesLoadedUntilNow;
			this.log.silly("dit/2: "+ download_interval_time / 2);
			if (newTime > download_interval_time / 2) {
				this.log.silly("running: "+running);
				if (running == "download") {
					result.download_raw.push(newSpeed);
					this.log.silly("draw: "+JSON.stringify(result.download_raw));
				}
				if (running == "upload") {
					result.upload_raw.push(newSpeed);
				}
			}
		}
	}

	run(type) {
		switch (type) {
			case "download":
				this.startDownload();
				break;
			/*case 'upload':
				startUpload();
				break;
			case 'upload_ws':
				startUploadWS();
				break;
			case 'ping':
				startPing();
				break;
			case 'webench':
				startWebench();
				break*/
		}
	}

	result_from_arr(arr, type, ref, time, bytes) {
		const data = JSON.stringify({
			values: arr,
			type: type,
			ref: ref,
			time: time,
			bytes: bytes
		});

		const options = {
			hostname: "speedtest.vodafone.de",
			port: 443,
			path: "/ajax/result/",
			method: "POST",
			rejectUnauthorized: false,
			resolveWithFullResponse: true,
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				"Content-Length": Buffer.byteLength(data, "utf8")
			}
		};

		const req = https.request(options, res => {
			let data = "";
			res.on("data", d => {
				data += d;
			});
			res.on("end", () => {
				if (res.statusCode == 200) {
					const args = JSON.parse(data);
					switch (args.type) {
						case "download":
							result.download = args.value;
							if (parseInt(args.value, 10) == 0) {
								if (false /*_$.retry.download == !1*/) {
									/*this.log.debug('second download test');
									retry.download = !0;
									download_time = 5;
									startDownload()*/
								} else {
									this.log.debug("retry error");
								}
							} else {
								setTimeout(() => this.run("upload"), 500);
							}
							break;
					}
					this.log.debug("result:" + JSON.stringify(args));
				} else {
					this.log.error("result: Unknown Error "+ res.statusCode);
				}
			});
		});

		req.on("error", e => {
			this.log.error("result: " + JSON.stringify(e));
		});
		req.write(data);
		req.end();
		this.log.silly("result start:" + JSON.stringify(data));

		/*success: function (args) {
			switch (args.type) {
				case 'download':
					_$.result.download = args.value;
					if (parseInt(args.value, 10) == 0) {
						if (_$.retry.download == !1) {
							_$.log('second download test');
							_$.retry.download = !0;
							download_time = 5;
							_$.startDownload()
						} else {
							_$.config.callback_error(500)
						}
					} else {
						_$.config.callback_progress('download_finished', _$.result.download);
						window.setTimeout(function () {
							_$.run('upload')
						}, 500)
					}
					break;
				case 'upload':
					_$.result.upload = args.value;
					_$.config.callback_progress('upload_finished', _$.result.upload);
					window.setTimeout(function () {
						_$.run('ping')
					}, 500);
					break;
				case 'ping':
					_$.result.ping = args.value;
					_$.result.jitter = args.jitter;
					_$.config.callback_progress('ping_finished', _$.result.ping);
					if (_$.webench_active === !0) {
						window.setTimeout(function () {
							_$.run('webench')
						}, 500)
					} else {
						window.setTimeout(function () {
							_$.config.callback_progress('finished')
						}, 500)
					}
					break
			}
		}*/
	}

	stopDownloadTest() {
		stopHandler && clearTimeout(stopHandler);
		stopHandler = null;
		for (let i = 0; i < download_streams.length; i++) {
			download_streams[i].req.abort();
		}
		running = null;
		that.result_from_arr(result.download_raw, "download", provider_download, result.overall_time.download, result.overall_bytes.download);
	}

	interval(func, wait, times) {
		const intervalClosure = function (w, t) {
			return function () {
				if (typeof t === "undefined" || t-- > 0) {
					setTimeout(intervalClosure, w);
					try {
						func.call(null);
						console.debug("interval: #" + t + " @" + new Date());
					} catch (e) {
						t = 0;
						throw e.toString();
					}
				}
			};
		}(wait, times);
		setTimeout(intervalClosure, wait);
	}

	intervalRoundTrips(runtime, interval) {
		return Math.round((runtime * 1000) / interval) + 1;
	}
}


// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new VodafoneSpeedtest(options);
} else {
	// otherwise start the instance directly
	new VodafoneSpeedtest();
}