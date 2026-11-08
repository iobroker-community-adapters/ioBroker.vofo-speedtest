/** Last known API key of speedtest.vodafone.de, used if the key cannot be found in the web page */
export const FALLBACK_API_KEY = 'eiquo8HuP0aeDoinono2nao4keip1the';

/**
 * Finds the API key in a Next.js chunk of speedtest.vodafone.de.
 *
 * The minified runtime configuration looks like
 * `let G="eiquo8HuP0aeDoinono2nao4keip1the";if(c.isNil(G))throw(0,a.createNqError)("Cl-5","NEXT_PUBLIC_API_KEY cannot be undefined.")`
 *
 * Do not search for `NEXT_PUBLIC_API_KEY=...`: the chunk contains the build scripts of all variants
 * (staging, other brands) with their own keys, too.
 */
export function extractApiKey(js: string): string | null {
    const m = js.match(/"([a-zA-Z0-9]{32})";if\(.{0,40}?\)throw.{0,80}?NEXT_PUBLIC_API_KEY/);
    return m ? m[1] : null;
}
