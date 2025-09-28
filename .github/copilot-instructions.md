# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

## Adapter-Specific Context
- **Adapter Name**: iobroker.vofo-speedtest
- **Primary Function**: Speedtest of Vodafone.de - implements same technique as https://speedtest.vodafone.de
- **Key Dependencies**: node-libcurl (for HTTP requests), ping (for latency testing), uuid (for unique identifiers)
- **Target Service**: Vodafone.de speedtest infrastructure 
- **Configuration Requirements**: bindAddress, useCurl option, scheduled execution
- **Execution Mode**: Schedule-based (runs every 11 and 41 minutes of each hour)
- **OS Dependencies**: curl (Linux requirement)
- **Data Collection**: Download/upload speeds, ping latency, connection quality metrics

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Verify expected states exist
                        const states = await harness.states.getKeysAsync('*');
                        console.log(`Found ${states.length} states`);
                        
                        // Test specific functionality
                        const connectionState = await harness.states.getStateAsync('your-adapter.0.info.connection');
                        if (!connectionState || !connectionState.val) {
                            reject(new Error('Adapter should be connected'));
                            return;
                        }
                        
                        console.log('✅ Integration test passed');
                        resolve();
                        
                    } catch (error) {
                        console.error('Integration test failed:', error);
                        reject(error);
                    }
                });
            });
        });
    }
});
```

**Key Integration Testing Rules**:

1. **Never skip the `defineAdditionalTests` wrapper** - this is required for proper test isolation
2. **Always use `getHarness()` inside test functions** - not in outer scope
3. **Use promisified patterns for async operations** - wrap callbacks in Promises
4. **Set realistic timeouts** - network operations need adequate time
5. **Test both success and failure scenarios** - verify error handling
6. **Clean up resources properly** - ensure tests don't interfere with each other

#### Network Testing Specific Patterns

For adapters like vofo-speedtest that perform network operations:

```javascript
// Test network connectivity and speed measurement
it('should perform speed test and update states', async function() {
    this.timeout(60000); // Network tests need longer timeouts
    
    // Configure for speed test
    await harness.changeAdapterConfig('vofo-speedtest', {
        native: {
            bindAddress: '0.0.0.0',
            useCurl: true
        }
    });
    
    await harness.startAdapter();
    
    // Wait for speed test completion
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Verify speed test results
    const downloadState = await harness.states.getStateAsync('vofo-speedtest.0.download');
    const uploadState = await harness.states.getStateAsync('vofo-speedtest.0.upload');
    const pingState = await harness.states.getStateAsync('vofo-speedtest.0.ping');
    
    expect(downloadState).to.not.be.null;
    expect(uploadState).to.not.be.null;  
    expect(pingState).to.not.be.null;
    
    // Verify reasonable values (not exact due to network variability)
    expect(downloadState.val).to.be.greaterThan(0);
    expect(uploadState.val).to.be.greaterThan(0);
    expect(pingState.val).to.be.greaterThan(0);
});
```

## ioBroker Adapter Core Patterns

### Lifecycle Management
```javascript
class AdapterName extends utils.Adapter {
  constructor(options = {}) {
    super({ ...options, name: 'adapter-name' });
    this.on('ready', this.onReady.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));
    this.on('unload', this.onUnload.bind(this));
  }

  async onReady() {
    // Initialize adapter
    this.setState('info.connection', false, true);
    
    // Setup configuration
    await this.setupConfiguration();
    
    // Start main functionality
    await this.startMainLoop();
  }

  onStateChange(id, state) {
    if (state && !state.ack) {
      // Handle state changes from user/admin
      this.handleStateChange(id, state);
    }
  }

  onUnload(callback) {
    try {
      // Clean up timers
      if (this.mainTimer) {
        clearTimeout(this.mainTimer);
        this.mainTimer = undefined;
      }
      
      // Clean up connections
      if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = undefined;
      }
      // Close connections, clean up resources
      callback();
    } catch (e) {
      callback();
    }
  }
}
```

### State Management
```javascript
// Create states with proper structure
await this.setObjectNotExistsAsync('download', {
  type: 'state',
  common: {
    name: 'Download Speed',
    type: 'number',
    role: 'value',
    unit: 'Mbps',
    read: true,
    write: false,
  },
  native: {},
});

// Update states with acknowledgment
this.setState('download', { val: downloadSpeed, ack: true });
```

### Error Handling
```javascript
// Proper error handling with logging
try {
  const result = await this.performSpeedTest();
  this.setState('info.connection', true, true);
  this.processSpeedTestResult(result);
} catch (error) {
  this.log.error(`Speed test failed: ${error.message}`);
  this.setState('info.connection', false, true);
  
  // Set error state for debugging
  this.setState('lastError', {
    val: error.message,
    ack: true,
    ts: Date.now()
  });
}
```

### Network Operations with Retry Logic

For network-dependent adapters like vofo-speedtest:

```javascript
async performSpeedTest(retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      this.log.debug(`Speed test attempt ${attempt}/${retries}`);
      
      const result = await this.executeSpeedTest();
      this.log.info(`Speed test successful: ${result.download} Mbps down, ${result.upload} Mbps up`);
      
      return result;
    } catch (error) {
      this.log.warn(`Speed test attempt ${attempt} failed: ${error.message}`);
      
      if (attempt === retries) {
        throw new Error(`Speed test failed after ${retries} attempts: ${error.message}`);
      }
      
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, attempt * 5000));
    }
  }
}
```

## JSON Configuration (Admin UI)

This adapter uses JSON-based configuration. Admin UI configuration should follow these patterns:

### Basic Configuration Structure
```json
{
  "type": "panel",
  "items": {
    "bindAddress": {
      "type": "text",
      "label": "Bind Address",
      "default": "0.0.0.0",
      "help": "Network interface to bind to"
    },
    "useCurl": {
      "type": "checkbox", 
      "label": "Use curl instead of internal HTTP client",
      "default": false
    }
  }
}
```

### Network Configuration Patterns
For network adapters, provide clear configuration options:

```json
{
  "connection": {
    "type": "panel",
    "label": "Connection Settings",
    "items": {
      "timeout": {
        "type": "number",
        "label": "Request timeout (seconds)",
        "min": 5,
        "max": 300,
        "default": 30
      },
      "retries": {
        "type": "number", 
        "label": "Number of retries",
        "min": 1,
        "max": 10,
        "default": 3
      }
    }
  }
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example for testing network connectivity:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Run integration tests with network connectivity
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("Network Connectivity Testing", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to Vodafone speedtest service", async () => {
                console.log("Testing network connectivity to Vodafone...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                await harness.changeAdapterConfig("vofo-speedtest", {
                    native: {
                        bindAddress: "0.0.0.0",
                        useCurl: true
                    }
                });

                console.log("Starting adapter for network test...");
                await harness.startAdapter();
                
                // Wait for speed test execution
                await new Promise(resolve => setTimeout(resolve, 45000));
                
                const connectionState = await harness.states.getStateAsync("vofo-speedtest.0.info.connection");
                const downloadState = await harness.states.getStateAsync("vofo-speedtest.0.download");
                
                if (connectionState && connectionState.val === true && downloadState && downloadState.val > 0) {
                    console.log("✅ SUCCESS: Network connectivity established and speed test completed");
                    return true;
                } else {
                    throw new Error("Network Test Failed: Expected successful speed test execution. " +
                        "Check logs above for specific network errors (DNS resolution, connectivity issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

## Network Speed Testing Specific Patterns

For vofo-speedtest adapter, consider these specific patterns:

### Speed Test Execution
```javascript
async executeSpeedTest() {
  const startTime = Date.now();
  
  try {
    // Perform download test
    const downloadResult = await this.performDownloadTest();
    
    // Perform upload test  
    const uploadResult = await this.performUploadTest();
    
    // Perform ping test
    const pingResult = await this.performPingTest();
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    return {
      download: downloadResult.speed,
      upload: uploadResult.speed, 
      ping: pingResult.latency,
      testDuration: duration,
      timestamp: startTime
    };
  } catch (error) {
    this.log.error(`Speed test execution failed: ${error.message}`);
    throw error;
  }
}
```

### Data Processing and State Updates
```javascript
async processSpeedTestResult(result) {
  // Update individual measurement states
  await this.setStateAsync('download', result.download, true);
  await this.setStateAsync('upload', result.upload, true);
  await this.setStateAsync('ping', result.ping, true);
  
  // Update metadata
  await this.setStateAsync('lastTest', result.timestamp, true);
  await this.setStateAsync('testDuration', result.testDuration, true);
  
  // Calculate and store derived values
  const ratio = result.upload / result.download;
  await this.setStateAsync('uploadDownloadRatio', ratio, true);
  
  this.log.info(`Speed test completed: ${result.download} Mbps ↓, ${result.upload} Mbps ↑, ${result.ping} ms ping`);
}
```