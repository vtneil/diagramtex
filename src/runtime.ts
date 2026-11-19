// One application context shared by domain registrations. Window exposure is only
// the existing debugging/test API; production modules import this context directly.
import type { Runtime } from './runtime-contracts';
// Prerendering the shell (scripts/prerender.js) loads the kit's components, and so this module, outside a browser:
// there it is an empty context that nothing uses.
const host = (typeof window === 'undefined' ? {} : window) as { TD?: Runtime };
export const runtime = (host.TD || {}) as Runtime;
host.TD = runtime;
