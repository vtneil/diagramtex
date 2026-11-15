// Shared isolated browser setup for the functional suite and visual parity checks.
import fs from 'node:fs';
import { chromium, webkit, firefox } from 'playwright';
import { consoleErrors } from './console-errors.mjs';

export const BROWSER_NAMES = Object.freeze(['chromium', 'webkit', 'firefox']);
/** Shared matrix and optional single-engine selection for every browser suite. */
export function testBrowsers(args = process.argv.slice(2)) {
  const selected = BROWSER_NAMES.filter(name => args.includes('--' + name));
  if (selected.length > 1) throw new Error('Choose one browser flag, or omit browser flags to run all three engines');
  return selected.length ? selected : BROWSER_NAMES;
}
const engines = { chromium, webkit, firefox };
const chrome = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(file => fs.existsSync(file));
export async function launchBrowser(name, url, contextOptions = {}) {
  if (!Object.hasOwn(engines, name)) throw new Error('Unknown browser: ' + name);
  const browser = await engines[name].launch({ headless: true,
    ...(name === 'chromium' && chrome ? { executablePath: chrome } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, serviceWorkers: 'block', locale: 'en-GB', ...contextOptions });
    const page = await context.newPage(), errors = consoleErrors(), logs = errors.logs, warnings = [];
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => logs.push('exception: ' + error.stack));
    page.on('console', message => {
      if (message.type() === 'error') errors.record(message.text());
      if (message.type() === 'warning') warnings.push(message.text());
    });
    await page.addInitScript(() => localStorage.setItem('diagramtex.tour', 'seen'));
    await page.goto(url);
    await page.waitForFunction(() => !!window.TD?.ready);
    await page.evaluate(() => TD.ready);
    await page.locator('#splash').waitFor({ state: 'hidden' });
    await page.evaluate(() => document.fonts.ready);
    return { browser, context, page, logs, warnings, consoleErrors: errors,
      ev: body => page.evaluate(`(async () => {${body}\n})()`),
      close: () => browser.close() };
  } catch (error) { await browser.close(); throw error; }
}
