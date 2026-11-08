'use strict';

const path = require('node:path');
const { tests } = require('@iobroker/testing');

// The adapter runs in "schedule" mode: it runs one speed test against the Vodafone servers and stops itself.
// `stop()` / `terminate()` end the process with 0 or 11 (ADAPTER_REQUESTED_TERMINATION), both are regular ends here.
tests.integration(path.join(__dirname, '..'), {
    allowedExitCodes: [0, 11],
});
