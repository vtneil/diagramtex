// Shared isolated browser setup for the functional suite and visual parity checks.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, webkit, firefox } from 'playwright';
import { consoleErrors } from './console-errors.mjs';

export const BROWSER_NAMES = Object.freeze(['chromium', 'webkit', 'firefox']);
/** Shared matrix and optional single-engine selection for every browser suite. */
export function testBrowsers(args = process.argv.slice(2)) {
  const selected = BROWSER_NAMES.filter(name => args.includes('--' + name));
  if (selected.length > 1) throw new Error('Choose one browser flag, or omit browser flags to run all three engines');
  return selected.length ? selected : BROWSER_NAMES;
}
// Startup includes parsing the bundle, restoring IndexedDB and loading fonts.
// Keep this budget separate from the 10-second interaction/assertion timeout.
export const STARTUP_TIMEOUT = 30000;
const startupEvents = new WeakMap();
async function boundedDiagnostic(read) {
  let timer;
  try { return await Promise.race([read(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('diagnostic timed out')), 5000); })]); }
  catch (error) { return { error: String(error) }; }
  finally { clearTimeout(timer); }
}
export async function waitForAppReady(page) {
  const deadline = Date.now() + STARTUP_TIMEOUT;
  const timeout = () => Math.max(1, deadline - Date.now());
  try {
    await page.waitForFunction(() => !!window.TD?.ready, null, { timeout: timeout() });
    await page.waitForFunction(async () => { await TD.ready; await document.fonts.ready; return true; }, null, { timeout: timeout() });
    await page.locator('#splash').waitFor({ state: 'hidden', timeout: timeout() });
  } catch (error) {
    await recordStartupFailure(page, error);
    throw error;
  }
}
export async function reloadApp(page) {
  try { await page.reload(); }
  catch (error) { await recordStartupFailure(page, error); throw error; }
  await waitForAppReady(page);
}
async function recordStartupFailure(page, error) {
  try {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-startup-'));
    const state = await boundedDiagnostic(() => page.evaluate(() => ({
      url: location.href, documentState: document.readyState, language: document.documentElement.lang,
      hasRuntime: !!window.TD, hasReady: !!window.TD?.ready, hasApp: !!window.TD?.app,
      fonts: document.fonts.status, splash: document.querySelector('#splash')?.outerHTML,
      resources: performance.getEntriesByType('resource').map(r => ({ name: r.name, duration: r.duration, transferSize: r.transferSize })),
    })));
    fs.writeFileSync(path.join(directory, 'startup.json'), JSON.stringify({ error: String(error), url: page.url(), events: startupEvents.get(page) || [], state }, null, 2));
    await page.screenshot({ path: path.join(directory, 'startup.png'), timeout: 5000 }).catch(() => {});
    console.error('Browser startup diagnostics: ' + directory);
  } catch (diagnosticError) { console.error('Could not record startup diagnostics: ' + diagnosticError); }
}

const engines = { chromium, webkit, firefox };
const chrome = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(file => fs.existsSync(file));
export async function launchBrowser(name, url, contextOptions = {}, launchOptions = {}) {
  if (!Object.hasOwn(engines, name)) throw new Error('Unknown browser: ' + name);
  // Firefox on Linux draws Thai at 13px or more (font.minimum-size.th), on macOS at any size: set everywhere, so a
  // run on any machine sees the Thai interface as Linux users do (11px names and 12px labels grow)
  const firefoxUserPrefs = name === 'firefox' ? { 'font.minimum-size.th': 13, ...launchOptions.firefoxUserPrefs } : undefined;
  const browser = await engines[name].launch({ headless: true,
    ...(name === 'chromium' && chrome ? { executablePath: chrome } : {}), ...launchOptions, ...(firefoxUserPrefs ? { firefoxUserPrefs } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, serviceWorkers: 'block', locale: 'en-GB', ...contextOptions });
    const page = await context.newPage(), errors = consoleErrors(), logs = errors.logs, warnings = [];
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(STARTUP_TIMEOUT);
    const events = []; startupEvents.set(page, events);
    const record = event => { events.push({ at: Date.now(), ...event }); if (events.length > 100) events.shift(); };
    page.on('requestfailed', request => record({ type: 'requestfailed', url: request.url(), failure: request.failure() }));
    page.on('response', response => { if (response.status() >= 400) record({ type: 'http', url: response.url(), status: response.status() }); });
    page.on('pageerror', error => record({ type: 'pageerror', message: String(error) }));
    page.on('pageerror', error => logs.push('exception: ' + (error.stack || error.message || String(error)))); // a thrown non-Error has no stack
    page.on('console', message => {
      if (message.type() === 'error') errors.record(message.text());
      if (message.type() === 'warning') warnings.push(message.text());
    });
    await page.addInitScript(() => localStorage.setItem('diagramtex.tour', 'seen'));
    try { await page.goto(url); }
    catch (error) { await recordStartupFailure(page, error); throw error; }
    await waitForAppReady(page);
    return { browser, context, page, logs, warnings, consoleErrors: errors,
      ev: body => page.evaluate(`(async () => {${body}\n})()`),
      close: () => browser.close() };
  } catch (error) { await browser.close(); throw error; }
}
