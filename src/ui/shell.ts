import { restoreLocale } from '../i18n';
import { flushSync, hydrate } from 'svelte';
import AppShell from './AppShell.svelte';
// The stable drafting surface and toolbar IDs are shared with the gesture controllers.
hydrate(AppShell, { target: document.body });
flushSync();

// Read preferences after hydration, before the remaining views mount.
restoreLocale();
flushSync();
