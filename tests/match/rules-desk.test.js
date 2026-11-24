// Rules desk: quotes are real source lines, the index is current, and the
// search abstains when a question shares no keyword with any clause.
// Run: node --test tests/match/rules-desk.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BALANCE,
  CLAUSES,
  INDEX_PATH,
  RULEBOOK,
  buildIndex,
  checkIndex,
  readRepoText,
} from '../../scripts/build-rules-desk.mjs';
import {
  PRESET_QUESTIONS,
  PRESET_LABELS_KO,
  RULES_INDEX,
  mountRulesDesk,
  normalizeToken,
  searchRules,
  sourceLink,
  tokenize,
} from '../../src/ui/rules-desk.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stored = JSON.parse(readFileSync(join(ROOT, INDEX_PATH), 'utf8'));

test('every indexed quote is literally on its cited 1-based line', () => {
  assert.ok(stored.clauses.length >= 14, 'expected a real selection of clauses');
  for (const clause of stored.clauses) {
    const lines = readRepoText(clause.path).split(/\r?\n/);
    const line = lines[clause.line - 1];
    assert.equal(typeof line, 'string', `${clause.id}: line ${clause.line} exists`);
    assert.ok(line.includes(clause.quote), `${clause.id}: ${clause.path}:${clause.line} contains the quote`);
    assert.ok(clause.quote.length >= 20, `${clause.id}: quote is a full clause`);
  }
});

test('index covers the rulebook and both named balance requirements', () => {
  const rulebook = stored.clauses.filter((c) => c.path === RULEBOOK);
  assert.ok(rulebook.length >= 12 && rulebook.length <= 18, `rulebook clauses: ${rulebook.length}`);
  const balance = stored.clauses.filter((c) => c.path === BALANCE).map((c) => c.quote.slice(0, 6));
  assert.deepEqual(balance, ['NSB-1:', 'NSB-2:']);
  assert.equal(new Set(stored.clauses.map((c) => c.id)).size, stored.clauses.length);
});

test('checked-in index equals a fresh build', () => {
  assert.deepEqual(stored, buildIndex());
  assert.deepEqual(RULES_INDEX, stored);
  assert.deepEqual(checkIndex(stored), []);
});

test('--check passes on the current sources', () => {
  const run = spawnSync(process.execPath, ['scripts/build-rules-desk.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});

test('check reports stale lines when the rulebook shifts', () => {
  const shifted = (path) => (path === RULEBOOK ? `New first line\n${readRepoText(path)}` : readRepoText(path));
  const problems = checkIndex(stored, shifted);
  const tribute = stored.clauses.find((c) => c.id === 'tribute');
  assert.ok(problems.some((p) => p.startsWith(`stale line: tribute cites ${RULEBOOK}:${tribute.line}`)
    && p.endsWith(`now on line ${tribute.line + 1}`)), problems.join('\n'));
  assert.ok(problems.some((p) => p.includes('differs from a fresh build')));
  assert.ok(!problems.some((p) => p.includes('nsb-1')), 'balance clauses are unaffected');
});

test('check and build fail when a quote is gone or ambiguous', () => {
  const edited = (path) => (path === RULEBOOK
    ? readRepoText(path).replace('Nobody attacks on turn 1.', 'Nobody attacks on turn 2.')
    : readRepoText(path));
  assert.ok(checkIndex(stored, edited).some((p) => p.includes('turn-1') && p.includes('gone from the file')));
  assert.throws(() => buildIndex(edited), /turn-1: quote not found/);

  const doubled = [{ ...CLAUSES[0], id: 'dup', quote: 'Base' }];
  assert.throws(() => buildIndex(readRepoText, doubled), /must be unique/);
});

const PRESET_TARGETS = {
  'How many tributes does a troop cost?': 'tribute',
  'Who goes first?': 'first-player',
  'How many cards do I start with?': 'opening-hand',
  'Can a troop attack the turn it arrives?': 'resting',
  'When can a troop attack the Base?': 'base-attack',
  'Can I play cards after attacking?': 'act',
  'What happens when my hand is full?': 'hand-limit',
  'When does a trap spring?': 'trap-spring',
  'How does a game end after turn 80?': 'turn-80',
  'What are the balance requirements?': 'nsb-1',
};

test('each preset question reaches its supporting clause with a full match', () => {
  assert.deepEqual(Object.keys(PRESET_TARGETS).sort(), [...PRESET_QUESTIONS].sort());
  for (const question of PRESET_QUESTIONS) {
    const result = searchRules(question);
    assert.equal(result.status, 'answer', question);
    assert.equal(result.clause.id, PRESET_TARGETS[question], question);
  }
  assert.deepEqual(searchRules('Who goes first?').related.map((c) => c.id), ['best-of-three']);
  assert.deepEqual(searchRules('What are the balance requirements?').related.map((c) => c.id), ['nsb-2']);
  assert.equal(searchRules('Who may open a turn?').clause.id, 'first-player');
});

test('questions without keyword overlap abstain instead of guessing', () => {
  for (const question of [
    'Can I cast without a troop?',
    'What is the airspeed of a swallow?',
    'Tell me a joke',
    'base',
    'troop',
  ]) {
    assert.equal(searchRules(question).status, 'abstain', question);
  }
  assert.equal(searchRules('').status, 'empty');
  assert.equal(searchRules('   ?! ').status, 'empty');
});

test('a partial match is labelled and names the unmatched words', () => {
  const result = searchRules('Can I cast a spell without a troop?');
  assert.equal(result.status, 'partial');
  assert.equal(result.clause.id, 'other-card');
  assert.deepEqual(result.unmatched.sort(), ['cast', 'without']);
});

test('every non-abstaining result rests on words shared with the clause', () => {
  const vocabulary = new Set(stored.clauses.flatMap((c) => c.keywords.map(normalizeToken)));
  const probes = [...PRESET_QUESTIONS, 'Do I draw on turn 1?', 'Must I attack the Guard?', 'How do I win?', 'hand limit',
    'Does cover protect my base?', 'Which troop can I target?'];
  for (const question of probes) {
    const result = searchRules(question);
    if (result.status === 'abstain' || result.status === 'empty') continue;
    assert.ok(result.matched.length >= 1, question);
    for (const token of result.matched) {
      assert.ok(tokenize(question).includes(token), `${question}: ${token} comes from the question`);
      assert.ok(vocabulary.has(token), `${question}: ${token} is an indexed keyword`);
    }
  }
});

test('source links pin commits, label branches and never invent a repository', () => {
  const clause = stored.clauses.find((c) => c.id === 'tribute');
  const sha = '0123456789abcdef0123456789abcdef01234567';
  const pinned = sourceLink(clause, { repo: 'https://github.com/owner/game', ref: sha });
  assert.equal(pinned.href, `https://github.com/owner/game/blob/${sha}/prototypes/showdown/RULEBOOK.md?plain=1#L${clause.line}`);
  assert.equal(pinned.pin, 'commit');
  const branch = sourceLink(clause, { repo: 'https://github.com/owner/game/', ref: 'main' });
  assert.equal(branch.pin, 'branch');
  assert.match(branch.pinLabel, /main의 현재 소스/);
  for (const source of [undefined, {}, { repo: 'https://evil.example/owner/game', ref: 'main' },
    { repo: 'https://github.com/owner/game', ref: '../x' }, { repo: 'javascript:alert(1)', ref: 'main' }]) {
    const link = sourceLink(clause, source);
    assert.equal(link.href, null);
    assert.equal(link.pin, 'unlinked');
  }
  const balance = sourceLink(stored.clauses.find((c) => c.id === 'nsb-2'), { repo: 'https://github.com/owner/game', ref: sha });
  assert.match(balance.href, /\/\.kiro\/specs\/night-shift-balance-contract\/requirements\.md\?plain=1#L\d+$/);
});

test('the browser module has no filesystem, process or network imports', () => {
  const source = readFileSync(join(ROOT, 'src/ui/rules-desk.js'), 'utf8');
  const imports = [...source.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['./rules-desk.data.json']);
  assert.doesNotMatch(source, /\b(require\(|fetch\(|XMLHttpRequest|process\.|node:)/);
});

// Minimal DOM stand-in: enough for mountRulesDesk, no dependency.
class FakeText {
  constructor(text) { this.textContent = text; this.parent = null; }
}
class FakeElement {
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.parent = null;
    this.value = '';
    this.ownText = '';
  }
  set className(value) { this.attributes.class = value; }
  get textContent() { return this.ownText + this.children.map((c) => c.textContent).join(''); }
  set textContent(value) { this.children = []; this.ownText = String(value); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.ownText = ''; this.append(...nodes); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatch(type) {
    const event = { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of this.listeners[type] ?? []) fn(event);
    return event;
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
}
const fakeDocument = {
  createElement(tag) { return new FakeElement(fakeDocument, tag); },
  createTextNode(text) { return new FakeText(text); },
};
function* walk(node) {
  yield node;
  for (const child of node.children ?? []) yield* walk(child);
}
const find = (root, matches) => [...walk(root)].filter((n) => n instanceof FakeElement && matches(n));

test('mounted desk answers presets and typed questions with cited quotes', () => {
  const host = fakeDocument.createElement('div');
  const sha = 'fedcba9876543210fedcba9876543210fedcba98';
  const desk = mountRulesDesk(host, { source: { repo: 'https://github.com/owner/game', ref: sha } });
  assert.equal(host.children[0], desk.element);

  const [input] = find(host, (n) => n.tagName === 'INPUT');
  const [label] = find(host, (n) => n.tagName === 'LABEL');
  assert.equal(label.getAttribute('for'), input.getAttribute('id'));
  const [output] = find(host, (n) => n.getAttribute('aria-live') === 'polite');
  const presetButtons = find(host, (n) => n.tagName === 'BUTTON' && n.getAttribute('type') === 'button');
  assert.deepEqual(presetButtons.map((b) => b.textContent), PRESET_LABELS_KO);

  presetButtons[0].dispatch('click');
  const tribute = stored.clauses.find((c) => c.id === 'tribute');
  assert.equal(input.value, PRESET_LABELS_KO[0]);
  assert.ok(output.textContent.includes(tribute.quote.replaceAll('**', '')), output.textContent);
  assert.ok(output.textContent.includes(`${RULEBOOK}, ${tribute.line}행`));
  const [link] = find(output, (n) => n.tagName === 'A');
  assert.ok(link.getAttribute('href').endsWith(`/blob/${sha}/${RULEBOOK}?plain=1#L${tribute.line}`));
  assert.match(output.textContent, /커밋 fedcba987654에 고정/);

  const [form] = find(host, (n) => n.tagName === 'FORM');
  input.value = 'Can I cast without a troop?';
  assert.equal(form.dispatch('submit').defaultPrevented, true);
  assert.match(output.textContent, /맞는 규칙이 없습니다\./);
  assert.equal(find(output, (n) => n.tagName === 'BLOCKQUOTE').length, 0, 'no quote shown when abstaining');

  desk.destroy();
  assert.equal(host.children.length, 0);
});

test('mounted desk without a repository labels the current source and makes no link', () => {
  const host = fakeDocument.createElement('div');
  const desk = mountRulesDesk(host);
  desk.ask('When does a trap spring?');
  const [output] = find(host, (n) => n.getAttribute('aria-live') === 'polite');
  assert.equal(find(output, (n) => n.tagName === 'A').length, 0);
  assert.match(output.textContent, /이 체크아웃의 현재 소스/);
  assert.throws(() => mountRulesDesk(null), TypeError);
});
