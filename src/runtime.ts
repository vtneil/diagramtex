// One application context shared by domain registrations. Window exposure is only
// the existing debugging/test API; production modules import this context directly.
import type { Runtime } from './runtime-contracts';
export const runtime = (window.TD || {}) as Runtime;
window.TD = runtime;
