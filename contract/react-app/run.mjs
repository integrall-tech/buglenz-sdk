// Drives the built app in headless Chromium: a click-handler exception, an unhandled promise
// rejection and a render error caught by the wrapper's ErrorBoundary. Every envelope request
// body is saved, so the assertions can check what really left the browser.
//
//   node run.mjs http://127.0.0.1:4273 ../.state/react-envelopes.jsonl
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [url, out] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node run.mjs <app url> <envelopes file>');
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const bodies = [];
page.on('request', (req) => {
  if (req.url().includes('/envelope/')) bodies.push(req.postData() ?? '');
});
page.on('pageerror', (err) => console.log(`[page] ${err.name}: ${err.message}`));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('#resumo');
await page.click('#btn-click');
await page.click('#btn-promise');
await page.click('#btn-render');
await page.waitForSelector('#fallback');
await page.waitForTimeout(3000);
await page.close();
await page.context().close();
await browser.close();

writeFileSync(out, bodies.map((b) => JSON.stringify({ body: b })).join('\n') + '\n');
console.log(`envelopes sent: ${bodies.length}`);
if (bodies.length < 4) {
  console.error('expected at least 4 envelope requests (3 errors + session)');
  process.exit(1);
}
