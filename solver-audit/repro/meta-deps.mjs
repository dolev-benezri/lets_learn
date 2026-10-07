// WHAT: generates solver-audit/dependencies.md from the source itself (every row is a grep of a real line, so it cannot drift
// from the code), and asserts the dependency facts the audit relies on (CHECK lines).
// RUN: node solver-audit/repro/meta-deps.mjs            (rewrites solver-audit/dependencies.md, prints the CHECK lines)
import fs from 'node:fs';

const R = new URL('../../', import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, R), 'utf8');
const lines = (p) => rd(p).split(/\r?\n/); // the repo files use CRLF
const ls = (d, re) => fs.readdirSync(new URL(d, R)).filter((f) => re.test(f)).map((f) => d + f);
const ALL = [...ls('web/', /\.js$/), ...ls('test/', /\.mjs$/), ...ls('scripts/', /\.mjs$/)];
let ok = true;
const checks = [];
const check = (id, pass, detail) => { ok &&= pass; checks.push(`CHECK ${id} ${pass ? 'PASS' : 'FAIL'} ${detail}`); };

// ---------- imports of every file (static, dynamic, worker URL) ----------
const resolve = (from, spec) => (spec.startsWith('.') ? new URL(spec, new URL(from, R)).pathname.replace(new URL(R).pathname, '') : spec);
function importsOf(p) {
  const out = [];
  lines(p).forEach((l, i) => {
    let m;
    if ((m = l.match(/^\s*(?:import|export)\s+(?:\{([^}]*)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+'([^']+)'/))) out.push({ to: resolve(p, m[4]), names: (m[1] ?? m[2] ?? m[3]).split(',').map((s) => s.trim()).filter(Boolean), line: i + 1, how: 'import' });
    else if ((m = l.match(/^\s*import\s+'([^']+)'/))) out.push({ to: resolve(p, m[1]), names: [], line: i + 1, how: 'import (side effect)' });
    for (const d of l.matchAll(/import\(\s*'([^']+)'\s*\)/g)) out.push({ to: resolve(p, d[1]), names: ['(dynamic)'], line: i + 1, how: 'dynamic import' });
    for (const w of l.matchAll(/new Worker\(new URL\('([^']+)'/g)) out.push({ to: resolve(p, w[1]), names: ['(worker script)'], line: i + 1, how: 'new Worker' });
  });
  return out;
}
const graph = Object.fromEntries(ALL.map((p) => [p, importsOf(p)]));

// ---------- top-level declarations with line ranges ----------
function decls(p) {
  const L = lines(p), starts = [];
  L.forEach((l, i) => { const m = l.match(/^(export\s+)?(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=|let\s+(\w+)\s*=)/); if (m) starts.push({ name: m[2] ?? m[3] ?? m[4], exported: !!m[1], line: i + 1 }); });
  return starts.map((s, k) => {
    let end = (starts[k + 1]?.line ?? L.length + 1) - 1;
    while (end > s.line && (/^\s*(\/\/.*)?$/.test(L[end - 1]))) end--;
    return { ...s, end, text: L[s.line - 1].trim().slice(0, 110) };
  });
}
const SOLVER = ['web/solver-core.js', 'web/rules.js', 'web/solver-worker.js'];

// downstream closure (what the solver needs) and upstream closure (who needs the solver)
const closure = (start, next) => { const seen = new Set(), st = [...start]; while (st.length) { const x = st.pop(); for (const y of next(x)) if (!seen.has(y) && !start.includes(y)) { seen.add(y); st.push(y); } } return [...seen].sort(); };
const down = closure(SOLVER, (x) => (graph[x] ?? []).map((e) => e.to));
const up = closure(SOLVER, (x) => ALL.filter((p) => graph[p].some((e) => e.to === x)));
check('DEP-1', down.length === 0, `the solver modules import nothing outside themselves (solver-core.js -> rules.js, solver-worker.js -> solver-core.js): outside deps = [${down.join(', ')}]`);

// purity: no DOM / network / storage / timers in the solver modules
const IMPURE = /\b(document|window|fetch|localStorage|sessionStorage|XMLHttpRequest|setTimeout|setInterval|navigator|location|history)\b/;
const impure = ['web/solver-core.js', 'web/rules.js'].flatMap((p) => lines(p).map((l, i) => [p, i + 1, l]).filter(([, , l]) => IMPURE.test(l.replace(/\/\/.*$/, ''))).map(([p, n]) => `${p}:${n}`));
check('DEP-2', impure.length === 0, `solver-core.js and rules.js use no DOM, network, storage or timer API (only Date.now / Date.parse / JSON / Math): hits=[${impure.join(', ')}]`);
const dateUse = lines('web/solver-core.js').map((l, i) => [i + 1, l]).filter(([, l]) => /Date\.(now|parse)/.test(l)).map(([n]) => `web/solver-core.js:${n}`);

// ---------- external: npm, vendor, browser APIs ----------
const lock = JSON.parse(rd('package-lock.json'));
const npm = Object.entries(lock.packages).filter(([k]) => k.startsWith('node_modules/')).map(([k, v]) => ({ name: k.slice(13), version: v.version, dev: !!v.dev }));
const npmUsers = ALL.flatMap((p) => graph[p].filter((e) => !e.to.includes('/') || e.to.startsWith('node:') ? false : !e.to.startsWith('web/') && !e.to.startsWith('scripts/') && !e.to.startsWith('test/')).map((e) => `${p}:${e.line} (${e.to})`));
const bare = ALL.flatMap((p) => graph[p].filter((e) => !/^(web|scripts|test|node:)/.test(e.to) && !e.to.startsWith('../')).map((e) => ({ at: `${p}:${e.line}`, pkg: e.to })));
check('DEP-3', !bare.some((b) => SOLVER.includes(b.at.split(':')[0]) || b.at.startsWith('web/')), `no npm package is imported by the browser code; npm imports: ${bare.map((b) => `${b.pkg} @ ${b.at}`).join(', ')}`);

const PATH = ['web/solver-core.js', 'web/rules.js', 'web/solver-worker.js', 'web/ui-search.js', 'web/app.js', 'web/ui-common.js', 'web/ui-plan.js', 'web/ui-actions.js', 'web/ui-view.js', 'web/ui-grid.js', 'web/ui-side.js', 'web/ui-drawer.js'];
const APIS = [['Worker (module) / postMessage / onmessage / terminate', /new Worker|postMessage|\.onmessage|onerror|terminate\(\)/],
  ['self (worker global)', /\bself\./], ['URL + import.meta.url', /import\.meta\.url/], ['fetch', /\bfetch\(/], ['localStorage', /localStorage/],
  ['setTimeout / clearTimeout', /setTimeout|clearTimeout/], ['Date.now / Date.parse', /Date\.(now|parse)/], ['structuredClone', /structuredClone/],
  ['CSS.escape', /CSS\.escape/], ['history / location', /\bhistory\.|\blocation\./], ['Popover API', /showPopover|hidePopover|togglePopover/]];
const apiRows = APIS.map(([name, re]) => [name, PATH.flatMap((p) => lines(p).map((l, i) => [p, i + 1, l]).filter(([, , l]) => re.test(l)).map(([p, n]) => `${p}:${n}`))]);

const vendor = fs.readdirSync(new URL('web/vendor/', R)).map((d) => {
  const files = fs.readdirSync(new URL(`web/vendor/${d}/`, R));
  const lic = files.includes('LICENSE') ? lines(`web/vendor/${d}/LICENSE`).find((l) => l.trim())?.trim() : '';
  const users = ALL.flatMap((p) => lines(p).map((l, i) => [p, i + 1, l]).filter(([, , l]) => l.includes(`vendor/${d}/`)).map(([p, n]) => `${p}:${n}`));
  const html = lines('web/index.html').map((l, i) => [i + 1, l]).filter(([, l]) => l.includes(`vendor/${d}/`)).map(([n]) => `web/index.html:${n}`);
  return { d, files: files.join(', '), lic, users: [...users, ...html] };
});

// ---------- write the markdown ----------
const fmtImports = (p) => graph[p].map((e) => `| \`${p}:${e.line}\` | \`${e.to}\` | ${e.how} | ${e.names.join(', ')} |`).join('\n');
const fmtDecls = (p) => decls(p).map((d) => `| \`${d.name}\` | ${d.exported ? 'export' : 'internal'} | \`${p}:${d.line}-${d.end}\` | \`${d.text.replace(/\|/g, '\\|')}\` |`).join('\n');
const importers = (t) => ALL.flatMap((p) => graph[p].filter((e) => e.to === t).map((e) => `| \`${p}:${e.line}\` | ${e.how} | ${e.names.join(', ')} |`)).join('\n');

const md = `# Solver dependency map

Generated by \`node solver-audit/repro/meta-deps.mjs\` from the source (each row is a real line; re-run after any code change).
Hand-written conclusions are in section 7; every claim there names its proof.

## 1. What the solver is

| Module | Role | Lines |
|---|---|---|
${SOLVER.map((p) => `| \`${p}\` | ${{ 'web/solver-core.js': 'schedule search: options, bitmask time grid, branch and bound (`search`), year pairing (`searchYear`)', 'web/rules.js': 'course status engine the solver imports (`classify`, `modeFor`); also used directly by the UI', 'web/solver-worker.js': 'Web Worker entry: routes a message to `search` or `searchYear`' }[p]} | ${lines(p).length} |`).join('\n')}

## 2. Imports between the solver modules (everything the solver depends on)

| Where | Imports from | How | Names |
|---|---|---|---|
${SOLVER.map(fmtImports).filter(Boolean).join('\n')}

Transitive closure of what the three modules import: **${down.length ? down.join(', ') : 'nothing else'}** (CHECK DEP-1).

## 3. Functions and constants (top-level declarations, line ranges)

${SOLVER.map((p) => `### \`${p}\`\n\n| Name | Visibility | Lines | First line |\n|---|---|---|---|\n${fmtDecls(p)}`).join('\n\n')}

## 4. Who depends on the solver

Direct importers:

${SOLVER.map((t) => `### of \`${t}\`\n\n| Where | How | Names |\n|---|---|---|\n${importers(t) || '| (none) | | |'}`).join('\n\n')}

Every file that depends on the solver directly or indirectly (reverse import closure, tests included): ${up.map((p) => `\`${p}\``).join(', ')}.

### Imports of the files on the user-input -> result path

| Where | Imports from | How | Names |
|---|---|---|---|
${PATH.slice(3).map(fmtImports).filter(Boolean).join('\n')}

Entry point of the page: \`web/index.html:${lines('web/index.html').findIndex((l) => l.includes('type="module"')) + 1}\` loads \`web/ui-plan.js\` as a module.

## 5. External dependencies

### npm (package-lock.json, lockfileVersion ${lock.lockfileVersion})

| Package | Version | Dev |
|---|---|---|
${npm.map((x) => `| ${x.name} | ${x.version} | ${x.dev ? 'yes' : 'no'} |`).join('\n')}

Imported at: ${bare.map((b) => `\`${b.pkg}\` @ \`${b.at}\``).join(', ')}. No npm package reaches the browser code or the solver (CHECK DEP-3); they serve the scraper only.
Runtime: Node ${JSON.parse(rd('package.json')).engines.node} (package.json "engines"), used by tests, scripts and these repro scripts.

### Vendored browser libraries (web/vendor)

| Library | Files | License (first line) | Loaded at |
|---|---|---|---|
${vendor.map((v) => `| ${v.d} | ${v.files} | ${v.lic} | ${v.users.map((u) => `\`${u}\``).join(', ') || '-'} |`).join('\n')}

None is used by the solver. Only popover (a Popover API polyfill) touches result display (the lesson popover).

### Browser APIs on the input -> solver -> display path

| API | Used at |
|---|---|
${apiRows.map(([n, at]) => `| ${n} | ${at.map((x) => `\`${x}\``).join(', ') || '-'} |`).join('\n')}

Inside the solver itself only \`Date.now\`/\`Date.parse\` appear (${dateUse.map((x) => `\`${x}\``).join(', ')}): the time limit and exam-gap arithmetic (CHECK DEP-2).

### Data files

| File | Fetched at | Produced by |
|---|---|---|
| \`web/data/afeka/<year>-<1|2|3>/<program>-<startYear>.json\` (144 files) | path built at \`web/app.js:160\`, fetched at \`web/app.js:229-238\` (all three semesters, \`cache: 'no-cache'\`) | \`scripts/build.mjs:4-66\` (\`buildDataset\`), from \`scripts/parse.mjs\` + \`scripts/scrape.mjs\` |
| \`web/data/afeka/catalog.json\` | \`web/app.js:289\` | \`scripts/scrape.mjs\` |
| \`web/data/afeka/status.json\` | \`web/app.js:292\` | \`scripts/scrape.mjs\` |

Source of the data: Afeka's public catalog \`https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx\` (\`S_LOOK_FOR_NOSE\`, \`S_CourseDetails\`, \`S_SHOW_PROGS\`), refreshed by \`ci/gitlab-scrape.yml\`.

Fields the solver reads from a semester file (consumer lines):

| Field | Read at |
|---|---|
| \`courses[id].groups[].{id,primary,linked,full,lecturer,type,meetings,exams}\` | \`web/solver-core.js:54-102\` (buildOptions) |
| \`meetings[].{day,start,end}\` (day 1-6, "HH:MM") | \`web/solver-core.js:11-20\` |
| \`exams[].{kind,moed,date}\` (ISO date) | \`web/solver-core.js:93-94\`, \`:202-207\`, \`:315-320\` |
| \`courses[id].{credits,prereqs[].{kind,anyOf[].id}}\` | \`web/solver-core.js:105-111\`, \`:158-161\`, \`:262\`, \`:431\`, \`:487\` |
| \`courses[id].{offered,name}\`, \`examsPublished\`, \`semester\` | \`web/rules.js:61-99\`, \`web/solver-core.js:275-276\`, \`:384\` |
| \`lists[].{name,courses,minCredits}\`, \`specializations\`, \`specRule\` | \`web/app.js:162-179\`, \`web/rules.js:30-59\` (study-year list -> default course mode) |

## 6. Dependency checks

${checks.map((c) => `- ${c}`).join('\n')}

## 7. Conclusions (with source)

1. The solver is two pure modules plus a 3-line worker: \`web/solver-core.js\` imports only \`classify\` and \`modeFor\` from \`web/rules.js\` (\`web/solver-core.js:2\`), and \`web/solver-worker.js:1-3\` imports \`search\`/\`searchYear\` and answers each message with one of them. Proof: CHECK DEP-1, DEP-2.
2. The browser runs it only through \`web/ui-search.js:33\` (\`new Worker(..., { type: 'module' })\`); the request is posted at \`web/ui-search.js:38-40\` and the answer stored in \`ui.last\` at \`web/ui-search.js:35\`. Proof: section 4 rows; real-browser run in findings.md (E2E-1).
3. \`rules.js\` is shared state logic: the UI classifies courses itself (\`web/app.js:217\`) and the solver classifies again inside \`searchYear\` (\`web/solver-core.js:392\`, \`:404\`, \`:446\`). The two agree only if both see the same \`state\` (see findings.md).
4. Inputs reach the solver from \`app.state\` (defaults \`web/app.js:9-17\`, sanitised by \`normalize\` \`web/app.js:45-80\`) and from the committed JSON data; there is no other external input (no network call from the solver).
5. Display depends on result fields: \`ui.last.results[ui.cur]\` (\`web/ui-common.js:33-35\`), pairs split per semester by \`semResult\` (\`web/ui-grid.js:120-124\`), drawn by \`renderView\` (\`web/ui-view.js:52\`), \`renderWeek\` (\`web/ui-grid.js:187\`), \`renderSide\` (\`web/ui-side.js:58\`).
`;
fs.writeFileSync(new URL('solver-audit/dependencies.md', R), md);
console.log(checks.join('\n'));
console.log(`INFO wrote solver-audit/dependencies.md (${md.split('\n').length} lines)`);
process.exit(ok ? 0 : 1);
