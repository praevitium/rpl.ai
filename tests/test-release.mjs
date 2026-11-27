// The version stamps agree, and scripts/bump.mjs moves them together.
import { readFileSync } from 'node:fs';
import { nextVersion, pacificDate, noteBullet, withRelease } from '../scripts/bump.mjs';
import { assert } from './helpers.mjs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const notes = read('RELEASE_NOTES.md');
const stamp = /^\*\*Latest release:\*\* v(\S+) \((\d{4}-\d{2}-\d{2})\)$/m.exec(notes);
const heading = /^## v(\S+) — (\d{4}-\d{2}-\d{2})$/m.exec(notes);

assert(lock.version === pkg.version && lock.packages[''].version === pkg.version,
  `release: package-lock.json's two versions match package.json (${pkg.version})`);
assert(stamp?.[1] === pkg.version && heading?.[1] === pkg.version && stamp[2] === heading[2],
  'release: RELEASE_NOTES.md stamps and heads the version package.json holds, with one date');

assert(nextVersion('0.9.32') === '0.9.33' && nextVersion('0.9.32', 'minor') === '0.10.0' && nextVersion('0.9.32', 'major') === '1.0.0',
  'bump: a patch bump by default, and minor or major on request');
assert(pacificDate(new Date('2026-11-27T05:00:00Z')) === '2026-11-26' && pacificDate(new Date('2026-07-01T08:00:00Z')) === '2026-07-01',
  'bump: the release is dated in Pacific time, standard or daylight');
assert(noteBullet('Changed: nothing a user sees. The markdown renderer for the assistant\'s replies and the tutor\'s cards moved.')
  === '- Changed: nothing a user sees. The markdown renderer for the\n  assistant\'s replies and the tutor\'s cards moved.',
'bump: the entry is a bullet wrapped to the notes\' width, its later lines under the text');
{
  const before = '# Notes\n\n**Latest release:** v1.2.3 (2026-01-01)\n\n---\n\n## v1.2.3 — 2026-01-01\n\n- Fixed: x.\n';
  const after = withRelease(before, '1.2.4', '2026-01-02', 'Added: y.');
  assert(after === '# Notes\n\n**Latest release:** v1.2.4 (2026-01-02)\n\n---\n\n## v1.2.4 — 2026-01-02\n\n- Added: y.\n\n## v1.2.3 — 2026-01-01\n\n- Fixed: x.\n',
    'bump: the stamp takes the new version and date, and its entry goes above the last release');
  let refused = false;
  try { withRelease('# Notes\n', '1.2.4', '2026-01-02', 'Added: y.'); } catch { refused = true; }
  assert(refused, 'bump: notes without a stamp or a release heading are refused, not written');
}

{
  const { badgedReference } = await import('../scripts/update-hp50-badges.mjs');
  const { allOps } = await import('../www/src/rpl/ops.js');
  const reference = read('www/docs/hp50-commands.html');
  const { html, inAppCount, totalCount } = badgedReference(reference);
  assert(html === reference,
    `reference: every command's in-app badge and link match the registry (${inAppCount} of ${totalCount}); npm run update-hp50-badges brings them up to date`);
  const claimed = /command set: (\d+) commands/.exec(read('README.md'))?.[1];
  assert(Number(claimed) === allOps().length,
    `README: the command count it gives (${claimed}) is the registry's (${allOps().length})`);
}
