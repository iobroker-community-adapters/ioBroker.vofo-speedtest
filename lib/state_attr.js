// Classification of all state attributes possible
const state_attrb = {
	// Speed results
	"running_download": {
		name: "Currently download test in progress ?",
		type: "boolean",
		role: "info.status",
	},
	"running_upload": {
		name: "Currently upload test in progress ?",
		type: "boolean",
		role: "info.status",
	},
	"running": {
		name: "Currently Speed test in progress ?",
		type: "boolean",
		role: "info.status",
	},
	"download_MB": {
		name: "Download bandwidth in MegaBytes per second",
		type: "number",
		role: "state",
		unit: "MB/s",
	},
	"download_Mb": {
		name: "Download bandwidth in Megabits per second",
		type: "number",
		role: "state",
		unit: "Mb/s",
	},
	"upload_MB": {
		name: "Upload bandwidth in MegaBytes per second",
		type: "number",
		role: "state",
		unit: "MB/s",
	},
	"upload_Mb": {
		name: "Upload bandwidth in Megabits per second",
		type: "number",
		role: "state",
		unit: "Mb/s",
	},

	// Client details
	"ip": {
		name: "Ip of client",
		type: "number",
		role: "info.ip",
	},
	"ipCountry": {
		name: "Country of client",
		type: "mixed",
		role: "state",
	},
	"isp": {
		name: "Clients ISP",
		type: "mixed",
		role: "state",
	},
	"isCustomer": {
		name: "Maybe if is UnityMedia customer?",
		type: "boolean",
		role: "state",
	},
	"downstreamSpeed": {
		name: "download bandwidth in kbit per second",
		type: "number",
		role: "state",
		unit: "Mb/s",
	},
	"upstreamSpeed": {
		name: "upload bandwidth in kbit per second",
		type: "number",
		role: "state",
		unit: "Mb/s",
	},
	"downstreamBooked": {
		name: "booked downloadh bandwidth in mbit per second",
		type: "number",
		role: "state",
		unit: "Mb/s",
	},
	"upstreamBooked": {
		name: "booked upload bandwidth in mbit per second",
		type: "number",
		role: "state",
		unit: "Mb/s",
	},

	// Modem Details
	"modem": {
		name: "Modem",
		type: "device"
	},
	"vendor": {
		name: "Modem vendor",
		type: "mixed",
		role: "state",
	},
	"code": {
		name: "Modem code",
		type: "mixed",
		role: "state",
	},
	"name": {
		name: "Modem name",
		type: "mixed",
		role: "state",
	},
	"text": {
		name: "Modem text",
		type: "mixed",
		role: "state",
	},

	// General details
	"Last_Run_Timestamp": {
		name: "Timestamp of last test-execution",
		type: "number",
		role: "value.time",
	},
};

module.exports = state_attrb;