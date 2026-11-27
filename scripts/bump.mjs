// Bumps the version in package.json, package-lock.json and RELEASE_NOTES.md together, dated in Pacific time:
//   npm run bump -- "Changed: what the release does."   (add --minor or --major for those)
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const NOTES_WIDTH = 72;

export function nextVersion(version, part = 'patch') {
  const [major, minor, patch] = version.split('.').map(Number);
  if (part === 'major') return `${major + 1}.0.0`;
  if (part === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function pacificDate(when = new Date()) {
  return when.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

// The entry as a bullet wrapped to the notes' width, its later lines indented under the text.
export function noteBullet(text) {
  const lines = [];
  let line = '-';
  for (const word of text.trim().split(/\s+/)) {
    if (line.length + 1 + word.length > NOTES_WIDTH && line !== '-') {
      lines.push(line);
      line = ' ';
    }
    line += ` ${word}`;
  }
  return [...lines, line].join('\n');
}

export function withRelease(notes, version, date, entry) {
  const stamped = notes.replace(/^\*\*Latest release:\*\* v\S+ \(\d{4}-\d{2}-\d{2}\)$/m, `**Latest release:** v${version} (${date})`);
  const first = stamped.search(/^## v/m);
  if (stamped === notes || first < 0) throw new Error('RELEASE_NOTES.md has no latest-release stamp or release heading');
  return `${stamped.slice(0, first)}## v${version} — ${date}\n\n${noteBullet(entry)}\n\n${stamped.slice(first)}`;
}

function main(args) {
  const part = args.includes('--major') ? 'major' : args.includes('--minor') ? 'minor' : 'patch';
  const entry = args.filter((a) => !a.startsWith('--')).join(' ');
  if (!entry.trim()) throw new Error('usage: npm run bump -- [--minor|--major] "Changed: what the release does."');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const version = nextVersion(pkg.version, part);
  const setVersion = (file, count) => {
    const text = readFileSync(file, 'utf8');
    const from = `"version": "${pkg.version}"`;
    if (text.split(from).length - 1 !== count) throw new Error(`${file} does not hold version ${pkg.version} exactly ${count} times`);
    writeFileSync(file, text.replaceAll(from, `"version": "${version}"`));
  };
  setVersion('package.json', 1);
  setVersion('package-lock.json', 2);
  writeFileSync('RELEASE_NOTES.md', withRelease(readFileSync('RELEASE_NOTES.md', 'utf8'), version, pacificDate(), entry));
  console.log(`v${version}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
