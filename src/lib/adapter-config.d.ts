// Augments the globally declared ioBroker types with everything this adapter adds.
// Keep in sync with `native` in io-package.json and with admin/jsonConfig.json.
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            /** Local address to bind the test connections to, "0.0.0.0" = any */
            bindAddress: string;
        }
    }
}

export {};
