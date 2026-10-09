// Assertions of the contract run, against the instance's API and the saved raw envelopes.
//
//   node assert.mjs react|spring|flutter
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const state = join(dirname(fileURLToPath(import.meta.url)), '.state');
const env = JSON.parse(readFileSync(join(state, 'env.json'), 'utf8'));
const LEAKS = ['ana@example.com', 'hunter2', '529.982.247-25', '52998224725', '1.2.3.4'];

const api = async (path) => {
  const r = await fetch(env.base + path, { headers: { Authorization: `Bearer ${env.token}` } });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : ` ${detail}`}`);
  if (!ok) failures.push(what);
};

async function until(fn, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(1000);
  }
  return null;
}

const items = (d) => (Array.isArray(d) ? d : d.items ?? []);
const frames = (o) => (o && typeof o === 'object' ? [...(Array.isArray(o.frames) ? o.frames : []), ...Object.values(o).flatMap(frames)] : []);

async function issuesOf(project, n) {
  return until(async () => {
    const list = items(await api(`/api/projects/${project.id}/issues?per_page=50`));
    return list.length >= n ? list : null;
  });
}

async function eventOf(project, issue) {
  const [first] = items(await api(`/api/projects/${project.id}/issues/${issue.id}/events?per_page=1`));
  return api(`/api/projects/${project.id}/issues/${issue.id}/events/${first.id}`);
}

function rawLeaks(file) {
  const raw = readFileSync(file, 'utf8');
  return LEAKS.filter((l) => raw.includes(l));
}

async function react() {
  const p = env.web;
  const issues = await issuesOf(p, 3);
  check(issues?.length === 3, 'three issues', `got ${issues?.length}`);
  if (!issues) return;
  check(issues.every((i) => Number(i.event_count) === 1), 'one event per issue (identical errors deduplicated by the SDK)');

  const click = issues.find((i) => JSON.stringify(i).includes('pedido sem itens'));
  check(!!click, 'click-handler issue found, title already masked');
  if (click) {
    const d = await eventOf(p, click);
    const data = d.data ?? d;
    const app = frames(d).filter((f) => String(f.filename ?? f.abs_path ?? '').endsWith('pedido.ts')).at(-1);
    check(app?.lineno === 12, 'source-mapped frame is pedido.ts:12', JSON.stringify(app && [app.filename, app.lineno]));
    check(/TypeError/.test(app?.context_line ?? ''), 'frame carries the original context line');
    check(JSON.stringify(data.user) === '{"id":"u-1"}', 'stored user is the id only', JSON.stringify(data.user));
    check(!data.extra || data.extra.password === undefined || data.extra.password === '[Filtered]', 'password never stored in clear');
    check(data.tags?.cliente === 'acme' && data.tags?.tenant === 't1', 'tags cliente and tenant', JSON.stringify(data.tags));
    check(d.release === 'contract-web@1.0.0' || data.release === 'contract-web@1.0.0', 'release is contract-web@1.0.0');
    check(JSON.stringify(d).includes('[cpf]'), 'document masked to [cpf]');
    const stored = JSON.stringify(d);
    check(LEAKS.every((l) => !stored.includes(l)), 'no original personal value in the stored event', LEAKS.filter((l) => stored.includes(l)).join(','));
  }

  const leaks = rawLeaks(join(state, 'react-envelopes.jsonl'));
  check(leaks.length === 0, 'no original personal value in what left the browser', leaks.join(','));

  const stats = await until(async () => {
    const rows = items(await api(`/api/projects/${p.id}/sessions/stats?period=24h`));
    return rows.some((r) => (r.total ?? 0) > 0) ? rows : null;
  });
  const row = stats?.[0];
  check(!!row && row.total >= 1, 'session counted in release health', JSON.stringify(row));
  check(!!row && row.crashed === 0 && row.errored >= 1 && row.healthy >= 0, 'unhandled session is errored, not crashed', JSON.stringify(row));
}

async function spring() {
  const p = env.api;
  const issues = await issuesOf(p, 2);
  check(issues?.length === 2, 'two issues', `got ${issues?.length}`);
  if (!issues) return;
  const handled = issues.find((i) => JSON.stringify(i).includes('IllegalStateException'));
  const fatal = issues.find((i) => JSON.stringify(i).includes('uncaught in worker'));
  check(!!handled && JSON.stringify(handled).includes('cpf [cpf] ([email])'), 'handled exception title masked');
  check(!!fatal, 'uncaught exception reported');
  for (const issue of [handled, fatal].filter(Boolean)) {
    const d = await eventOf(p, issue);
    const data = d.data ?? d;
    check(JSON.stringify(data.user) === '{"id":"u-42"}', 'stored user is the id only', JSON.stringify(data.user));
    check(data.extra?.password === '[Filtered]', 'extra.password filtered');
    check(data.tags?.cliente === 'acme' && data.tags?.tenant === 't1' && data.tags?.nota === 'contato [email]', 'tags kept, personal tag masked', JSON.stringify(data.tags));
    check((d.release ?? data.release) === 'contract-api@1.0.0', 'release is contract-api@1.0.0');
    const stored = JSON.stringify(d);
    check(LEAKS.every((l) => !stored.includes(l)), 'no original personal value in the stored event', LEAKS.filter((l) => stored.includes(l)).join(','));
  }
  const leaks = rawLeaks(join(state, 'spring-traffic.jsonl'));
  check(leaks.length === 0, 'no original personal value in what left the JVM', leaks.join(','));
  const raw = readFileSync(join(state, 'spring-traffic.jsonl'), 'utf8');
  check(!raw.includes('"type":"session"'), 'no session item sent by the wrapper');
  const rows = items(await api(`/api/projects/${p.id}/sessions/stats?period=24h`));
  check(rows.length === 0, 'release health stays empty, no negative values', JSON.stringify(rows));
}

async function flutter() {
  const p = env.mobile;
  const issues = await issuesOf(p, 2);
  check(issues?.length === 2, 'two issues', `got ${issues?.length}`);
  if (!issues) return;
  const handled = issues.find((i) => JSON.stringify(i).includes('Bad state'));
  const second = issues.find((i) => JSON.stringify(i).includes('uncaught in worker'));
  check(!!handled && JSON.stringify(handled).includes('cpf [cpf] ([email])'), 'exception title masked');
  check(!!second, 'second exception reported');
  for (const issue of [handled, second].filter(Boolean)) {
    const d = await eventOf(p, issue);
    const data = d.data ?? d;
    check(JSON.stringify(data.user) === '{"id":"u-42"}', 'stored user is the id only', JSON.stringify(data.user));
    check(data.tags?.cliente === 'acme' && data.tags?.tenant === 't1' && data.tags?.nota === 'contato [email]', 'tags kept, personal tag masked', JSON.stringify(data.tags));
    check((d.release ?? data.release) === 'contract-mobile@1.0.0+1', 'release is contract-mobile@1.0.0+1 (the + of the pubspec kept)', String(d.release ?? data.release));
    check((data.environment ?? d.environment) === 'homolog', 'environment is homolog');
    check(data.contexts?.extra?.password === '[Filtered]', 'custom context password filtered', JSON.stringify(data.contexts?.extra));
    const stored = JSON.stringify(d);
    check(LEAKS.every((l) => !stored.includes(l)), 'no original personal value in the stored event', LEAKS.filter((l) => stored.includes(l)).join(','));
  }
  const leaks = rawLeaks(join(state, 'flutter-traffic.jsonl'));
  check(leaks.length === 0, 'no original personal value in what left the app', leaks.join(','));
  const raw = readFileSync(join(state, 'flutter-traffic.jsonl'), 'utf8');
  check(!/"device_unique_identifier"|"installation_id"/.test(raw), 'no device identifier left the app');
}

const which = process.argv[2];
await (which === 'react' ? react() : which === 'spring' ? spring() : which === 'flutter' ? flutter() : Promise.reject(new Error('usage: assert.mjs react|spring|flutter')));
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
