"use strict";

/*
 * Created with @iobroker/create-adapter v1.23.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
const { Curl, CurlFeature } = require("node-libcurl");
const querystring = require("querystring");
const https = require("https");
const ping = require("ping");
const state_attr = require(__dirname + "/lib/state_attr.js");

let that = null;

let useCurl = false;
const num_download_streams = 6;
let download_time = 10;
const download_interval_time = 750;
const upload_time = 12;
const upload_interval_time = 750;
//const ping_interval_time = 1000;
//const ping_time = 8;
const bytes_loaded = [];
let download_streams = [];
let upload_streams = [];
let bytes_loaded_last_section = 0;
let running = null;
let timeSection = null;
let timeStart = null;
let retry_download = !1;
const remote_port = null;
let provider_download = 0;
let provider_upload = 0;
let initiating = false;
let gotConfig = false;
let retries = 20;
let init_done = !1;
let timers = [];
const isWin = process.platform === "win32";
const ping_time = 8;
const data = [{
	name: "data",
	contents: ""
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
		min: 0,
		max: 0,
		avg: 0,
		packetLoss: 0,
	},
	jitter: 0,
	webench: Array(),
	webench_result: 0,
};
let stopHandler;

// eslint-disable-next-line prefer-const
let conf = JSON.parse('{"debug":false,"webench":[{"id":1,"url":"https://ref-large.system.info"},{"id":2,"url":"https://www.focus.de"},{"id":3,"url":"https://www.formel1.de"},{"id":4,"url":"https://www.chip.de"},{"id":5,"url":"https://www.wikipedia.org"}],"server":{"testServers":["https://speedtest-56.speedtest.vodafone-ip.de","https://speedtest-60.speedtest.vodafone-ip.de"],"pingServer":"https://speedtest-56.speedtest.vodafone-ip.de"}}');

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
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		//this.setState("info.connection", false, true);
		that = this;
		useCurl = this.config.useCurl;
		this.updateData();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info("cleaned everything up...");
			if (typeof stopHandler === "number") {
				clearTimeout(stopHandler);
				stopHandler = null;
			}
			timers.forEach(timer => {
				clearTimeout(timer);
			});
			timers = [];
			callback();
		} catch (e) {
			callback();
		}
	}

	updateData() {
		this.getConfig();
		this.doSpeedtest();
		//timers["updateData"] = setTimeout(() => this.updateData(), this.config.interval * 60000);
	}

	getConfig() {
		const options = {
			hostname: "speedtest.vodafone.de",
			port: 443,
			path: "/",
			method: "GET",
			rejectUnauthorized: false,
			resolveWithFullResponse: true,
			timeout: 60000,
		};

		const req = https.request(options, res => {
			let page = "";
			res.on("data", d => {
				page += d;
			});
			res.on("end", () => {
				if (res.statusCode == 200) {
					const regex = /<script>.*unitymedia\.speedtest\.config = {.*(server: {.*},).*};.*<\/script>/s;
					const settings = page.match(regex);
					if (settings != null) {
						eval("conf = {" + settings[1] + "}");
						gotConfig = true;
					}
				} else {
					that.log.error("Couldnt get Speedtest Config");
				}
			});
		});

		req.on("error", e => {
			this.log.error("getConfig error: " + JSON.stringify(e));
		});

		req.on("abort", e => {
			this.log.warn("getConfig abort: " + JSON.stringify(e));
		});
		req.end();
	}

	doSpeedtest() {
		if (!initiating && !init_done) this.init_sbc();
		this.log.silly("doSpeedtest " + init_done);
		if (!init_done || !gotConfig) {
			if (retries-- > 0) {
				timers["doSpeedtest"] = setTimeout(() => this.doSpeedtest(), 1000);
				return;
			} else {
				this.log.error("doSpeedtest: init_done=" + init_done + " gotConfig=" + gotConfig);
				if (this.stop) {
					this.stop();
				}
			}
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

				let downloadStream;
				if (useCurl) {
					const curl = new Curl();
					curl.setOpt(Curl.option.URL, testServer + "/data.zero.bin.512M?" + Math.random());
					curl.setOpt(Curl.option.NOPROGRESS, false);
					curl.setOpt(Curl.option.SSL_VERIFYPEER, false);
					curl.enable(CurlFeature.NoStorage);
					curl.setProgressCallback((dltotal, dlnow) => {
						bytes_loaded[testServer][i] = dlnow;
						return 0;
					});

					curl.on("end", () => {
						that.log.silly("Download ended");
						curl.close();
					});

					curl.on("error", (error) => {
						that.log.silly("Failed to download file" + error);
						curl.close();
					});

					downloadStream = {
						req: curl
					};
				} else {
					const options = {
						hostname: testServer.replace("https://", ""),
						port: 443,
						path: "/data.zero.bin.512M?" + Math.random(),
						method: "GET",
						rejectUnauthorized: false,
						resolveWithFullResponse: true,
					};

					const req = https.request(options, res => {
						res.on("data", d => {
							//that.log.silly("evt: " + JSON.stringify(d));
							bytes_loaded[testServer][i] += Buffer.byteLength(d, "utf8");
						});
						res.on("end", () => {
						});
					});

					req.on("error", e => {
						if (e.code != "ECONNRESET") {
						this.log.error("startDownload error: " + JSON.stringify(e));
						}
					});

					req.on("abort", e => {
						this.log.silly("startDownload abort: " + JSON.stringify(e));
					});

					downloadStream = {
						options: options,
						req: req
					};
				}
				download_streams.push(downloadStream);
				//this.log.silly("starDownload: " + JSON.stringify(downloadStream));
			}
		});

		this.interval(this.transferEnd, download_interval_time, this.intervalRoundTrips(download_time, download_interval_time));
		if (typeof stopHandler === "number") {
			this.log.debug("resetting Timeout download");
			clearTimeout(stopHandler);
			stopHandler = null;
		}
		stopHandler = setTimeout(this.stopDownloadTest, download_time * 1000);
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
		if (running != null)
			return;
		running = "upload";
		data[0].contents = "0".repeat(1E7);
		bytes_loaded_last_section = 0;
		bytes_loaded[0] = 0;
		this.interval(this.transferEnd, upload_interval_time, this.intervalRoundTrips(upload_time, upload_interval_time));
		if (typeof stopHandler === "number") {
			this.log.silly("resetting Timeout upload");
			clearTimeout(stopHandler);
			stopHandler = null;
		}
		stopHandler = setTimeout(this.stopUploadTest, upload_time * 1000);

		timeStart = new Date();
		timeSection = timeStart;
		this.pushData(0);
	}

	startPing() {
		if (running != null)
			return;
		timeStart = new Date();
		running = "ping";
		if (typeof stopHandler === "number") {
			this.log.debug("resetting Timeout ping");
			clearTimeout(stopHandler);
			stopHandler = null;
		}
		stopHandler = setTimeout(this.stopPingTest, ping_time * 1000);
		const options = {
			timeout: 1,
			extra: ["-c", "5"],
		};
		if (isWin) options.extra = ["-n" , "5"];
		ping.promise.probe(conf.server.testServers[0].replace("https://", ""), options)
			.then((res) => {
				result.ping.min = res.min;
				result.ping.max = res.max;
				result.ping.avg = res.avg;
				result.ping.packetLoss = res.packetLoss;
				this.stopPingTest();
			});
	}

	stopPingTest() {
		running = null;
		const now = new Date();
		result.overall_time.ping = now.getTime() - timeStart.getTime();
		this.writeResult();
	}

	pushData(id) {
		const curl = new Curl();
		curl.setOpt(Curl.option.URL, conf.server.testServers[0] + "/empty.txt");
		curl.setOpt(Curl.option.NOPROGRESS, false);
		curl.setOpt(Curl.option.SSL_VERIFYPEER, false);
		curl.enable(CurlFeature.NoStorage);
		curl.setOpt(Curl.option.HTTPPOST, data);
		curl.setProgressCallback((dltotal, dlnow, ultotal, ulnow) => {
			bytes_loaded[id] = ulnow;
			return 0;
		});

		curl.on("end", () => {
			this.log.silly("Upload ended");
			curl.close();
			if (running == "upload") this.pushData(id + 1);
		});

		curl.on("error", (error) => {
			this.log.silly("Failed to upload file: " + error);
			curl.close();
		});

		curl.perform();
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
					this.create_state("modem", "modem");
					this.create_state("modem.vendor", "vendor", args.vendor);
					this.create_state("modem.code", "code", (args.modemType != null ? args.modemType.code : null));
					this.create_state("modem.name", "name", (args.modemType != null ? args.modemType.name : null));
					this.create_state("modem.text", "text", (args.modemType != null ? args.modemType.text : null));
					this.create_state("isCustomer", "isCustomer", args.isCustomer);
					this.create_state("isp", "isp", args.isp);
					this.create_state("ip", "ip", args.clientIp);
					this.create_state("ipCountry", "ipCountry", args.ipCountry);
					this.create_state("downstreamSpeed", "downstreamSpeed", args.downstreamSpeed);
					this.create_state("upstreamSpeed", "upstreamSpeed", args.upstreamSpeed);
					this.create_state("downstreamBooked", "downstreamBooked", args.downstreamBooked);
					this.create_state("upstreamBooked", "upstreamBooked", args.upstreamBooked);
					init_done = !0;
					initiating = false;
					//this.setState("info.connection", true, true);
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
		that.log.silly("gbun " + running);
		if (running == "download") {
			conf.server.testServers.forEach(testServer => {
				for (let i = 0; i < num_download_streams; i++) {
					bytesLoadedUntilNow += bytes_loaded[testServer][i];
				}
			});
		}
		if (running == "upload") {
			bytes_loaded.forEach(bl => {
				bytesLoadedUntilNow += bl;
			});
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
		that.log.silly("nB: " + newBytes + " nT: " + newTime);
		if (newBytes > 0 && newTime > 0) {
			timeSection = now;
			bytes_loaded_last_section = bytesLoadedUntilNow;
			that.log.silly("dit/2: " + download_interval_time / 2);
			if (newTime > download_interval_time / 2) {
				that.log.silly("running: " + running);
				if (running == "download") {
					result.download_raw.push(newSpeed);
					that.log.silly("draw: " + JSON.stringify(result.download_raw));
				}
				if (running == "upload") {
					result.upload_raw.push(newSpeed);
					that.log.silly("uraw: " + JSON.stringify(result.upload_raw));
				}
			}
		}
	}

	run(type) {
		switch (type) {
			case "download":
				this.startDownload();
				break;
			case "upload":
				this.startUpload();
				break;
			case "ping":
				this.startPing();
				break;
			/*case 'upload_ws':
				startUploadWS();
				break;
			case 'webench':
				startWebench();
				break*/
		}
	}

	result_from_arr(arr, type, ref, time, bytes) {
		let data = querystring.stringify({
			values: arr,
			type: type,
			ref: ref,
			time: time,
			bytes: bytes
		});

		data = data.replace(/values=/g, "values%5B%5D=");

		const options = {
			hostname: "speedtest.vodafone.de",
			port: 443,
			path: "/ajax/result/",
			method: "POST",
			rejectUnauthorized: false,
			resolveWithFullResponse: true,
			headers: {
				"Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
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
								if (retry_download == !1) {
									that.log.debug("second download test");
									retry_download = !0;
									download_time = 5;
									that.startDownload();
								} else {
									that.log.error("retry error");
								}
							} else {
								timers["result_from_arr"] = setTimeout(() => this.run("upload"), 500);
							}
							break;
						case "upload":
							result.upload = args.value;
							timers["result_from_arr"] = setTimeout(() => this.run("ping"), 500);
							break;
					}
					this.log.debug("result:" + JSON.stringify(args));
				} else {
					this.log.error("result: Unknown Error " + res.statusCode);
				}
			});
		});

		req.on("error", e => {
			this.log.error("result: " + JSON.stringify(e));
		});
		req.write(data);
		req.end();
		this.log.silly("result start:" + JSON.stringify(data));
	}

	writeResult() {
		this.extendObject("Results", {
			type: "channel",
			common: {
				name: "Test results of latest run",
			},
			native: {},
		});
		this.create_state("Results.Last_Run", "Last_Run_Timestamp", new Date());

		this.create_state("Results.download_MB", "download_MB", (result.download / 8 / 1000));
		this.create_state("Results.download_Mb", "download_Mb", result.download / 1000);

		this.create_state("Results.upload_MB", "upload_MB", (result.upload / 8 / 1000));
		this.create_state("Results.upload_Mb", "upload_Mb", result.upload / 1000);

		const download_calc = result.download_raw.reduce((acc, c) => acc + c, 0) / result.download_raw.length;
		const upload_calc = result.upload_raw.reduce((acc, c) => acc + c, 0) / result.upload_raw.length;

		this.create_state("Results.download_MB_calc", "download_MB_calc", (download_calc / 8 / 1000));
		this.create_state("Results.download_Mb_calc", "download_Mb_calc", download_calc / 1000);

		this.create_state("Results.upload_MB_calc", "upload_MB_calc", (upload_calc / 8 / 1000));
		this.create_state("Results.upload_Mb_calc", "upload_Mb_calc", upload_calc / 1000);

		this.extendObject("Results.ping", {
			type: "channel",
			common: {
				name: "Ping results of latest run",
			},
			native: {},
		});

		this.create_state("Results.ping.min", "min", result.ping.min);
		this.create_state("Results.ping.max", "max", result.ping.max);
		this.create_state("Results.ping.avg", "avg", result.ping.avg);
		this.create_state("Results.ping.packetLoss", "packetLoss", result.ping.packetLoss);

		this.log.info("Vodafone-Speedtest finished with " + result.download / 1000 + "mbit download speed and " + result.upload / 1000 + "mbit upload speed.");
		if (this.stop) {
			this.stop();
		}
	}

	stopDownloadTest() {
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
		that.result_from_arr(result.download_raw, "download", provider_download, result.overall_time.download, result.overall_bytes.download);
	}

	stopUploadTest() {
		stopHandler && clearTimeout(stopHandler);
		stopHandler = null;
		for (let i = 0; i < upload_streams.length; i++) {
			upload_streams[i].req.abort();
		}
		running = null;
		data[0].contents = "";
		upload_streams = [];
		that.result_from_arr(result.upload_raw, "upload", provider_upload, result.overall_time.upload, result.overall_bytes.upload);
	}

	interval(func, wait, times) {
		const intervalClosure = function (w, t) {
			return function () {
				if (typeof t === "undefined" || t-- > 0) {
					timers["interval1"] = setTimeout(intervalClosure, w);
					try {
						func.call(null);
						that.log.silly("interval: #" + t + " @" + new Date());
					} catch (e) {
						t = 0;
						throw e.toString();
					}
				}
			};
		}(wait, times);
		timers["interval2"] = setTimeout(intervalClosure, wait);
	}

	intervalRoundTrips(runtime, interval) {
		return Math.round((runtime * 1000) / interval) + 1;
	}

	async create_state(state, name, value) {
		this.log.debug("Create_state called for : " + state + " with value : " + value);

		try {
			// Try to get details from state lib, if not use defaults. throw warning if states is not known in attribute list
			if ((state_attr[name] === undefined)) { this.log.warn("State attribute definition missing for + " + name); }
			const writable = (state_attr[name] !== undefined) ? state_attr[name].write || false : false;
			const state_name = (state_attr[name] !== undefined) ? state_attr[name].name || name : name;
			const role = (state_attr[name] !== undefined) ? state_attr[name].role || "state" : "state";
			const type = (state_attr[name] !== undefined) ? state_attr[name].type || "mixed" : "mixed";
			const unit = (state_attr[name] !== undefined) ? state_attr[name].unit || "" : "";
			this.log.debug("Write value : " + writable);

			if (type == "device") {
				await this.extendObjectAsync(state, {
					type: "device",
					common: {
						name: state_name
					},
					native: {}
				});
			} else {
				await this.extendObjectAsync(state, {
					type: "state",
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
			if (value !== null) { await this.setState(state, { val: value, ack: true }); }

			// Subscribe on state changes if writable
			if (writable === true) { this.subscribeStates(state); }

		} catch (error) {
			this.log.error("Create state error = " + error);
		}
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