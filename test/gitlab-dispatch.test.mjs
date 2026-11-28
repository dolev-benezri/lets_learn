import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const config = () => readFileSync('ci/gitlab-scrape.yml', 'utf8').replace(/\r\n/g, '\n');
const job = (name) => config().match(new RegExp(`^${name}:\\n([\\s\\S]*?)(?=^\\S|$(?![\\s\\S]))`, 'm'))?.[1];

test('GitLab dispatch: only schedule plus ROLE dispatch runs the checkout-free job', () => {
  const block = job('dispatch');
  assert.ok(block, 'dispatch job exists');
  assert.match(block, /image: node:24\n/);
  assert.match(block, /GIT_STRATEGY: none\n/);
  assert.match(block, /rules:\n    - if: '\$CI_PIPELINE_SOURCE == "schedule" && \$ROLE == "dispatch"'\n/);
  assert.equal((block.match(/- if:/g) ?? []).length, 1);
  assert.doesNotMatch(block, /git clone|npm ci|allow_failure: true/);
});

for (const name of ['scrape', 'token-expiry']) {
  test(`GitLab dispatch: ${name} excludes ROLE dispatch before existing rules`, () => {
    const block = job(name);
    assert.match(block, /rules:\n    - if: '\$ROLE == "dispatch"'\n      when: never\n    - if: \$CI_PIPELINE_SOURCE =~ \/\^\(schedule\|web\|api\)\$\//);
  });
}

test('GitLab dispatch: posts pull-check, requires 204, and keeps the token out of logs', () => {
  const block = job('dispatch');
  assert.ok(block, 'dispatch job exists');
  assert.match(block, /https:\/\/api.github.com\/repos\/lets-learn-il\/lets-learn-il.github.io\/dispatches/);
  assert.match(block, /-X POST/);
  assert.match(block, /\{"event_type":"pull-check"\}/);
  assert.match(block, /Authorization: Bearer \$\{GH_PUSH_TOKEN\}/);
  assert.match(block, /"\$code" != 204/);
  assert.match(block, /Asia\/Jerusalem/);
  assert.doesNotMatch(block, /set\s+-[^\n]*x|(?:^|\s)(?:-v|--verbose|--trace(?:-ascii)?)(?:\s|$)|(?:echo|printf)[^\n]*\$\{?GH_PUSH_TOKEN/);
});

for (const [name, code, curlExit, hour, days, expected] of [
  ['204 accepted outside the expiry hour', '204', 0, '14', 10, 0],
  ['401 rejected', '401', 0, '14', 30, 1],
  ['network error', '000', 7, '14', 30, 1],
  ['hour 01 with ten days left', '204', 0, '01', 10, 1],
  ['hour 01 with thirty days left', '204', 0, '01', 30, 0],
]) {
  test(`GitLab dispatch shell: ${name}`, () => {
    const script = job('dispatch')?.split('  script:\n    - |\n')[1]?.replace(/^      /gm, '');
    assert.ok(script, 'dispatch shell exists');
    const dir = mkdtempSync(join(tmpdir(), 'gitlab-dispatch-'));
    try {
      // The real job shell runs with PATH stubs: no request can reach GitHub.
      writeFileSync(join(dir, 'curl'), `#!/bin/sh
printf '%s\\n' "$@" > "$STUB_ARGS"
header=
while [ "$#" -gt 0 ]; do
  case "$1" in -D|--dump-header) shift; header=$1 ;; esac
  shift
done
[ -n "$header" ] || exit 99
printf 'HTTP/2 %s\\r\\nGiThUb-AuThEnTiCaTiOn-ToKeN-ExPiRaTiOn: 2026-12-28 00:00:00 UTC\\r\\n' "$STUB_CODE" > "$header"
printf '%s' "$STUB_CODE"
exit "$STUB_CURL_EXIT"
`, { mode: 0o755 });
      writeFileSync(join(dir, 'node'), '#!/bin/sh\nprintf "%s\\n" "$STUB_HOUR"\n', { mode: 0o755 });
      writeFileSync(join(dir, 'date'), `#!/bin/sh
if [ "$1" = -d ]; then printf '%s\\n' "$STUB_EXPIRY"; else printf '1800000000\\n'; fi
`, { mode: 0o755 });
      const args = join(dir, 'curl-args');
      const child = spawnSync('bash', ['--noprofile', '--norc', '-c',
        'export PATH="$PWD:$PATH"\n' + script], {
        cwd: dir, encoding: 'utf8', timeout: 5000,
        env: { ...process.env, GH_PUSH_TOKEN: 'fake-secret-do-not-print', STUB_ARGS: args,
          STUB_CODE: code, STUB_CURL_EXIT: String(curlExit), STUB_HOUR: hour,
          STUB_EXPIRY: String(1800000000 + days * 86400) },
      });
      assert.equal(child.status, expected, child.error?.message ?? child.stderr + child.stdout);
      assert.doesNotMatch(child.stdout + child.stderr, /fake-secret-do-not-print/);
      const request = readFileSync(args, 'utf8');
      assert.match(request, /Authorization: Bearer fake-secret-do-not-print/);
      assert.match(request, /\{"event_type":"pull-check"\}/);
      assert.match(request, /https:\/\/api.github.com\/repos\/lets-learn-il\/lets-learn-il.github.io\/dispatches/);
      if (curlExit || code !== '204') assert.match(child.stdout, new RegExp(`HTTP ${code}`));
      if (hour === '01') {
        assert.match(child.stdout, new RegExp(`\\(${days} days\\)`));
        if (expected) assert.match(child.stdout, /docs\/OPERATIONS.md/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
