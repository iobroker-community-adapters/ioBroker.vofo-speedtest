'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { tests } = require('@iobroker/testing');

// The tests do not start a speed test: nothing is written to test.start, and the schedule is not due
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Control states', getHarness => {
            it('creates the states the widgets use and is idle', async function () {
                this.timeout(60000);
                const harness = getHarness();
                await harness.changeAdapterConfig('vofo-speedtest', { native: { schedule: '' } });
                await harness.startAdapterAndWait();

                for (const id of ['start', 'running', 'phase', 'speed', 'error']) {
                    assert.ok(await harness.objects.getObjectAsync(`vofo-speedtest.0.test.${id}`), `test.${id} missing`);
                }
                const running = await harness.states.getStateAsync('vofo-speedtest.0.test.running');
                assert.equal(running?.val, false);
            });
        });
    },
});
