#!/usr/bin/env node
// Verify that every English doc under docs/docs/ has an in-sync Italian
// translation under docs/i18n/it/docusaurus-plugin-content-docs/current/.
// Translations carry frontmatter `translation_source_commit: <SHA>` that
// must match the latest commit touching the English source. See
// AGENTS.md §Localization for the workflow.
//
// Modes:
//   (default)              walk all docs, fail (exit 1) on missing/stale translations
//   --diff [FILE=path]     print `git diff` of English changes since stored SHA
//                          for every out-of-sync file (or just FILE= if given)
//   --bump FILE=path       rewrite the Italian translation's
//                          translation_source_commit to the English file's
//                          latest commit SHA
//
// Dependency-free: only Node stdlib + git.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const EN_DIR = path.join(REPO_ROOT, 'docs', 'docs');
const LOCALES = ['it'];
const localeDocsDir = (locale) =>
  path.join(REPO_ROOT, 'docs', 'i18n', locale, 'docusaurus-plugin-content-docs', 'current');

const FRONTMATTER_KEY = 'translation_source_commit';

// Translation backlog: English paths (relative to docs/docs/) that don't
// yet have a translation in some locale. The framework was bootstrapped
// with one translated file; everything else is listed here and gets
// translated incrementally. Adding a new English file forces a
// deliberate choice — translate it, or add the path here. The file
// shrinks to zero as translations land. See AGENTS.md §Localization.
const BACKLOG_FILE = path.join(REPO_ROOT, 'docs', 'i18n', '.translation-backlog');

function loadBacklog() {
  if (!fs.existsSync(BACKLOG_FILE)) return new Set();
  const text = fs.readFileSync(BACKLOG_FILE, 'utf8');
  const set = new Set();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line) set.add(line);
  }
  return set;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && /\.mdx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function latestCommitTouching(file) {
  const sha = execFileSync('git', ['log', '-1', '--format=%H', '--', file], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
  return sha || null;
}

function parseFrontmatterSha(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.startsWith('---\n')) return { sha: null, hasFrontmatter: false };
  const end = text.indexOf('\n---', 4);
  if (end === -1) return { sha: null, hasFrontmatter: false };
  const block = text.slice(4, end);
  const re = new RegExp(`^${FRONTMATTER_KEY}:\\s*(\\S+)\\s*$`, 'm');
  const m = block.match(re);
  return { sha: m ? m[1] : null, hasFrontmatter: true };
}

function writeFrontmatterSha(filePath, newSha) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.startsWith('---\n')) {
    throw new Error(`${filePath}: file has no YAML frontmatter; cannot bump ${FRONTMATTER_KEY}`);
  }
  const end = text.indexOf('\n---', 4);
  if (end === -1) throw new Error(`${filePath}: malformed frontmatter (no closing ---)`);
  const head = text.slice(0, end);
  const tail = text.slice(end);
  const re = new RegExp(`^${FRONTMATTER_KEY}:.*$`, 'm');
  let newHead;
  if (re.test(head)) {
    newHead = head.replace(re, `${FRONTMATTER_KEY}: ${newSha}`);
  } else {
    // Insert just before the closing `---`. `head` ends without a trailing newline
    // because we sliced up to (but not including) the `\n---` delimiter — so add one.
    newHead = `${head}\n${FRONTMATTER_KEY}: ${newSha}`;
  }
  fs.writeFileSync(filePath, newHead + tail);
}

function gitDiff(stored, latest, file) {
  // Use `..` so we see what changed in English between the translation's
  // pinned commit and the current latest. Falls back to `git show` if the
  // stored SHA is unknown (e.g. a fresh translation referencing a future commit).
  try {
    return execFileSync('git', ['--no-pager', 'diff', `${stored}..${latest}`, '--', file], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
  } catch (e) {
    return `(could not produce diff ${stored}..${latest} for ${file}: ${e.message})\n`;
  }
}

// Build the catalog of (english file, latest sha) pairs and matching translation paths.
function buildCatalog() {
  const enFiles = walk(EN_DIR).map((abs) => ({
    abs,
    rel: path.relative(EN_DIR, abs),
  }));
  return enFiles.map((f) => {
    const latest = latestCommitTouching(f.abs);
    const translations = LOCALES.map((locale) => ({
      locale,
      abs: path.join(localeDocsDir(locale), f.rel),
    }));
    return { en: f, latest, translations };
  });
}

function findOrphans() {
  const orphans = [];
  for (const locale of LOCALES) {
    const dir = localeDocsDir(locale);
    if (!fs.existsSync(dir)) continue;
    for (const abs of walk(dir)) {
      const rel = path.relative(dir, abs);
      const en = path.join(EN_DIR, rel);
      if (!fs.existsSync(en)) orphans.push({ locale, abs, rel });
    }
  }
  return orphans;
}

function relFromRoot(abs) {
  return path.relative(REPO_ROOT, abs);
}

// ----------------- modes -----------------

function modeCheck() {
  const catalog = buildCatalog();
  const orphans = findOrphans();
  const backlog = loadBacklog();
  const seenBacklog = new Set();
  let problems = 0;
  let skipped = 0;

  for (const item of catalog) {
    if (!item.latest) {
      // English file not in git history yet (uncommitted). Skip — CI runs on
      // a real ref, so this only happens locally before a first commit.
      console.error(`::warning::${relFromRoot(item.en.abs)} has no commit history yet; skipping`);
      continue;
    }
    if (backlog.has(item.en.rel)) {
      // Translation deliberately deferred. Still allow it to exist (so
      // partial drafts can be staged) but don't require it.
      seenBacklog.add(item.en.rel);
      skipped++;
      continue;
    }
    for (const t of item.translations) {
      if (!fs.existsSync(t.abs)) {
        problems++;
        console.error(
          `::error file=${relFromRoot(item.en.abs)}::missing ${t.locale} translation at ${relFromRoot(t.abs)}`,
        );
        continue;
      }
      const { sha, hasFrontmatter } = parseFrontmatterSha(t.abs);
      if (!hasFrontmatter || !sha) {
        problems++;
        console.error(
          `::error file=${relFromRoot(t.abs)}::translation is missing frontmatter key ${FRONTMATTER_KEY}`,
        );
        continue;
      }
      if (sha !== item.latest) {
        problems++;
        const enRel = relFromRoot(item.en.abs);
        const tRel = relFromRoot(t.abs);
        console.error(`::error file=${tRel}::out of sync with ${enRel}`);
        console.log(`::group::${tRel} (stored ${sha.slice(0, 12)}, latest ${item.latest.slice(0, 12)})`);
        console.log(`English file: ${enRel}`);
        console.log(`Translation:  ${tRel}`);
        console.log(`English changed since translation:`);
        console.log(gitDiff(sha, item.latest, item.en.abs));
        console.log(
          `Fix: update ${tRel} to reflect the diff above, then run\n  task docs:i18n:bump FILE=${enRel}`,
        );
        console.log(`::endgroup::`);
      }
    }
  }

  for (const o of orphans) {
    problems++;
    console.error(
      `::error file=${relFromRoot(o.abs)}::orphan translation — no English source at docs/docs/${o.rel}`,
    );
  }

  // Backlog entries that no longer match a real English file are stale
  // — the file was renamed or deleted. Force the backlog to stay clean.
  for (const rel of backlog) {
    if (!seenBacklog.has(rel)) {
      problems++;
      console.error(
        `::error file=docs/i18n/.translation-backlog::stale entry — no English file at docs/docs/${rel}. Remove the line.`,
      );
    }
  }

  if (problems > 0) {
    console.error(`\nFAIL: ${problems} i18n problem(s). See errors above.`);
    process.exit(1);
  }
  const enforced = catalog.length - skipped;
  const note = skipped > 0 ? ` (${skipped} backlogged, see docs/i18n/.translation-backlog)` : '';
  console.log(`OK: ${enforced}/${catalog.length} English doc(s) in sync across [${LOCALES.join(', ')}]${note}.`);
}

function parseFlag(name) {
  const prefix = `${name}=`;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(prefix)) return a.slice(prefix.length);
  }
  return null;
}

function modeDiff() {
  const filter = parseFlag('FILE');
  const catalog = buildCatalog();
  let printed = 0;
  for (const item of catalog) {
    if (filter && relFromRoot(item.en.abs) !== filter) continue;
    if (!item.latest) continue;
    for (const t of item.translations) {
      if (!fs.existsSync(t.abs)) {
        console.log(`# ${relFromRoot(t.abs)}: missing — translate from scratch`);
        printed++;
        continue;
      }
      const { sha } = parseFrontmatterSha(t.abs);
      if (sha === item.latest) continue;
      console.log(`# ${relFromRoot(item.en.abs)}: ${sha || '(no SHA)'} → ${item.latest}`);
      console.log(gitDiff(sha, item.latest, item.en.abs));
      printed++;
    }
  }
  if (printed === 0) {
    console.log('No out-of-sync translations.');
  }
}

function modeBump() {
  const file = parseFlag('FILE');
  if (!file) {
    console.error('docs:i18n:bump requires FILE=docs/docs/<path>');
    process.exit(2);
  }
  const enAbs = path.resolve(REPO_ROOT, file);
  if (!enAbs.startsWith(EN_DIR + path.sep)) {
    console.error(`FILE must live under docs/docs/ (got ${file})`);
    process.exit(2);
  }
  if (!fs.existsSync(enAbs)) {
    console.error(`English file does not exist: ${file}`);
    process.exit(2);
  }
  const latest = latestCommitTouching(enAbs);
  if (!latest) {
    console.error(`English file has no commit history yet: ${file}`);
    process.exit(2);
  }
  const rel = path.relative(EN_DIR, enAbs);
  let bumped = 0;
  for (const locale of LOCALES) {
    const tAbs = path.join(localeDocsDir(locale), rel);
    if (!fs.existsSync(tAbs)) {
      console.error(`(skipped) ${locale}: translation does not exist at ${relFromRoot(tAbs)}`);
      continue;
    }
    writeFrontmatterSha(tAbs, latest);
    console.log(`bumped ${relFromRoot(tAbs)} → ${latest}`);
    bumped++;
  }
  if (bumped === 0) process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.includes('--bump')) modeBump();
else if (argv.includes('--diff')) modeDiff();
else modeCheck();
