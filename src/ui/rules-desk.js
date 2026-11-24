// Rules desk: a question box that answers from the checked-in rules index.
// Every answer shows the literal source quote with its path and line. When
// no indexed clause shares words with the question, the desk says so.
//
// Browser-safe: no filesystem, network or model access. The index is built by
// `node scripts/build-rules-desk.mjs` from prototypes/showdown/RULEBOOK.md and
// .kiro/specs/night-shift-balance-contract/requirements.md.

import RULES_INDEX from './rules-desk.data.json' with { type: 'json' };

export { RULES_INDEX };

// Each preset is answered by the same search a typed question uses, and
// tests/match/rules-desk.test.js pins the clause it must reach.
export const PRESET_LABELS_KO = ['제물은 부대 비용이 얼마인가요?', '누가 먼저 하나요?', '처음에 카드를 몇 장 받나요?', '부대는 등장한 턴에 공격할 수 있나요?', '기지는 언제 공격할 수 있나요?', '공격한 뒤에도 카드를 낼 수 있나요?', '패가 가득 차면 어떻게 되나요?', '함정은 언제 발동하나요?', '80턴 이후 게임은 어떻게 끝나나요?', '균형 요건은 무엇인가요?'];
export const PRESET_QUESTIONS = [
  'How many tributes does a troop cost?',
  'Who goes first?',
  'How many cards do I start with?',
  'Can a troop attack the turn it arrives?',
  'When can a troop attack the Base?',
  'Can I play cards after attacking?',
  'What happens when my hand is full?',
  'When does a trap spring?',
  'How does a game end after turn 80?',
  'What are the balance requirements?',
];

const STOP_WORDS = new Set(`
  a an the i im me my mine you your yours we us our they them their he she it its
  this that these those there here can cant could may might must shall should will
  would do dont does doesnt did done is isnt are arent was were be been being am
  to of in on at by for with from into onto about as and or but if so than then
  also just what whats when who whom whose how why which where many much any some
  all get got have has had happen happens happened please tell explain mean means
  rule rules question no not
`.split(/\s+/).filter(Boolean));

// Common game words. A match on one of them counts for less and cannot carry
// an answer alone; two of them on the same clause can.
const WEAK_TOKENS = new Set([
  'troop', 'card', 'turn', 'base', 'orb', 'attack', 'game', 'side', 'player', 'play', 'go', 'after',
]);

const STRONG_POINTS = 3;
const WEAK_POINTS = 1;
const TEXT_POINTS = 0.5;
const RELATED_SHARE = 0.6;
const RELATED_MAX = 2;

const HANGUL = /[가-힣]/;
const KO_ENDINGS = /(하나요|되나요|인가요|있나요|받나요|끝나나요|나요|가요|까요|해요|어요|야)$/;
const KO_STOP = new Set(['언제', '어떻게', '무엇', '뭐', '얼마', '몇', '누가', '어디', '왜', '어떤', '뭔가요', '있어', '해', '수', '뒤에', '낼', '처음', '장', '차면', '지나면', '요건', '이후', '게임', '카드', '받', '되', '있']);
const KO_PARTICLES = /(으로|에서|에게|은|는|이|가|을|를|의|에|로|도|와|과)$/;
export function normalizeToken(raw) {
  if (HANGUL.test(raw)) { const t = String(raw).replace(KO_ENDINGS, '').replace(KO_PARTICLES, ''); return t.length ? t : ''; }
  let word = String(raw).toLowerCase().replace(/[’`]/g, "'").replace(/'s$/, '').replace(/'/g, '');
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('ing') && word.length - 3 >= 4) return word.slice(0, -3);
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) word = word.slice(0, -1);
  return word;
}

export function tokenize(text) {
  const seen = new Set();
  for (const raw of String(text ?? '').toLowerCase().split(/[^a-z0-9가-힣'’]+/)) {
    const clean = raw.replace(/[’']/g, '');
    if (!clean || STOP_WORDS.has(clean) || KO_STOP.has(clean)) continue;
    const token = normalizeToken(raw);
    if (token && !STOP_WORDS.has(token)) seen.add(token);
  }
  return [...seen];
}

const prepared = new WeakMap();

function prepare(index) {
  if (!prepared.has(index)) {
    prepared.set(index, index.clauses.map((clause) => ({
      clause,
      keys: new Set(clause.keywords.map(normalizeToken)),
      text: new Set(tokenize(`${clause.label} ${clause.quote}`)),
    })));
  }
  return prepared.get(index);
}

// Returns { status, question, tokens, ... }.
//   status 'empty'   no searchable words
//   status 'abstain' no clause shares a keyword with the question
//   status 'partial' a clause matched, but some distinctive words did not
//   status 'answer'  a clause matched every distinctive word
export function searchRules(question, index = RULES_INDEX) {
  const tokens = tokenize(question);
  if (!tokens.length) return { status: 'empty', question, tokens };

  const scored = prepare(index).map(({ clause, keys, text }, order) => {
    let score = 0;
    const strong = [];
    const weak = [];
    for (const token of tokens) {
      if (keys.has(token) || (HANGUL.test(token) && token.length > 1 && [...keys].some((k) => HANGUL.test(k) && k.length > 1 && (k.startsWith(token) || token.startsWith(k))))) {
        if (WEAK_TOKENS.has(token)) {
          score += WEAK_POINTS;
          weak.push(token);
        } else {
          score += STRONG_POINTS;
          strong.push(token);
        }
      } else if (text.has(token)) {
        score += TEXT_POINTS;
      }
    }
    return { clause, order, score, strong, weak };
  });

  const eligible = scored
    .filter((s) => s.strong.length >= 1 || s.weak.length >= 2)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  if (!eligible.length) return { status: 'abstain', question, tokens };

  const [top, ...rest] = eligible;
  const unmatched = tokens.filter((t) => !WEAK_TOKENS.has(t) && !top.strong.includes(t));
  const related = rest
    .filter((s) => s.strong.length >= 1 && s.score >= top.score * RELATED_SHARE)
    .slice(0, RELATED_MAX)
    .map((s) => s.clause);
  return {
    status: unmatched.length ? 'partial' : 'answer',
    question,
    tokens,
    clause: top.clause,
    matched: [...top.strong, ...top.weak],
    unmatched,
    related,
  };
}

const GITHUB_REPO = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COMMIT = /^[0-9a-f]{40}$/;
const REF = /^[A-Za-z0-9._/-]+$/;

// source: { repo: 'https://github.com/owner/name', ref: '<40-hex commit or branch>' }.
// A commit ref gives a pinned permalink. A branch ref is labelled as current
// source, since its lines can move. Without a valid repo and ref no link is made.
export function sourceLink(clause, source = {}) {
  const text = `${clause.path}, ${clause.line}행`;
  const repo = typeof source?.repo === 'string' ? source.repo.replace(/\/+$/, '') : '';
  const ref = typeof source?.ref === 'string' ? source.ref : '';
  if (!GITHUB_REPO.test(repo) || !REF.test(ref) || ref.includes('..')) {
    return { href: null, text, pin: 'unlinked', pinLabel: '이 체크아웃의 현재 소스 (저장소 링크 미설정)' };
  }
  const path = clause.path.split('/').map(encodeURIComponent).join('/');
  const href = `${repo}/blob/${ref}/${path}?plain=1#L${clause.line}`;
  if (COMMIT.test(ref)) return { href, text, pin: 'commit', pinLabel: `커밋 ${ref.slice(0, 12)}에 고정` };
  return { href, text, pin: 'branch', pinLabel: `${ref}의 현재 소스, 줄 번호는 바뀔 수 있음` };
}

function el(doc, tag, props = {}, children = []) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  if (children.length) node.append(...children);
  return node;
}

// The quote is shown as written; markdown **bold** markers become <strong>.
function quoteNodes(doc, quote) {
  return quote.split('**').map((part, i) => (i % 2 ? el(doc, 'strong', { text: part }) : doc.createTextNode(part)));
}

function citation(doc, clause, source) {
  const link = sourceLink(clause, source);
  const where = link.href
    ? el(doc, 'a', { href: link.href, target: '_blank', rel: 'noopener noreferrer', text: link.text })
    : el(doc, 'span', { text: link.text });
  return el(doc, 'p', { class: 'rules-desk-cite' }, [
    doc.createTextNode('출처: '),
    where,
    el(doc, 'span', { class: 'rules-desk-pin', text: ` (${link.pinLabel})` }),
  ]);
}

function quoteBlock(doc, clause) {
  return el(doc, 'blockquote', { class: 'rules-desk-quote' }, quoteNodes(doc, clause.quote));
}

function renderResult(doc, result, source) {
  if (result.status === 'empty') {
    return [el(doc, 'p', { text: '규칙 질문을 입력하거나 자주 묻는 질문을 고르세요.' })];
  }
  if (result.status === 'abstain') {
    return [
      el(doc, 'p', { class: 'rules-desk-abstain' }, [el(doc, 'strong', { text: '맞는 규칙이 없습니다.' })]),
      el(doc, 'p', {
        text: '쇼다운 규칙서나 균형 요건의 어떤 조항도 이 질문과 겹치는 단어가 없어 답하지 않습니다. '
          + '다른 단어로 물어보거나 prototypes/showdown/RULEBOOK.md를 읽어 보세요.',
      }),
    ];
  }
  const nodes = [];
  if (result.status === 'partial') {
    nodes.push(el(doc, 'p', {
      class: 'rules-desk-partial',
      text: `가장 가까운 조항만 보여 드립니다. 다음 단어는 어떤 규칙과도 맞지 않았습니다: ${result.unmatched.join(', ')}. `
        + '질문의 답이 아닐 수 있습니다.',
    }));
  }
  const { clause } = result;
  nodes.push(
    el(doc, 'h3', { text: clause.label }),
    el(doc, 'p', { class: 'rules-desk-summary', text: clause.answer }),
    quoteBlock(doc, clause),
    citation(doc, clause, source),
    el(doc, 'p', { class: 'rules-desk-note', text: '인용문(영어 원문)이 규칙입니다. 위의 한국어 요약은 읽기 도움일 뿐입니다.' }),
  );
  if (result.related.length) {
    nodes.push(
      el(doc, 'h4', { text: '관련 조항' }),
      el(doc, 'ul', { class: 'rules-desk-related' }, result.related.map((other) => el(doc, 'li', {}, [
        el(doc, 'p', { text: other.label }),
        quoteBlock(doc, other),
        citation(doc, other, source),
      ]))),
    );
  }
  return nodes;
}

let mounts = 0;

// Mounts the desk into host. options.source sets the repository link target
// (see sourceLink). Returns { element, ask(question), destroy() }.
export function mountRulesDesk(host, options = {}) {
  if (!host || typeof host.append !== 'function' || !host.ownerDocument) {
    throw new TypeError('mountRulesDesk(host) needs a DOM element');
  }
  const doc = host.ownerDocument;
  const source = options.source ?? {};
  const uid = `rules-desk-${++mounts}`;

  const input = el(doc, 'input', {
    id: `${uid}-q`,
    type: 'search',
    name: 'q',
    autocomplete: 'off',
    'aria-describedby': `${uid}-hint`,
  });
  const form = el(doc, 'form', { class: 'rules-desk-form', role: 'search', 'aria-label': '규칙 질문' }, [
    el(doc, 'label', { for: `${uid}-q`, text: '규칙 질문하기' }),
    input,
    el(doc, 'button', { type: 'submit', text: '질문' }),
    el(doc, 'p', { id: `${uid}-hint`, class: 'rules-desk-hint', text: '규칙에 나오는 단어를 쓰세요. 예: 제물, 함정, 80턴.' }),
  ]);
  const output = el(doc, 'div', { class: 'rules-desk-answer', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });

  const ask = (question) => {
    const result = searchRules(question);
    output.replaceChildren(...renderResult(doc, result, source));
    return result;
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input.value);
  });

  const presets = el(doc, 'div', { class: 'rules-desk-presets', role: 'group', 'aria-label': '자주 묻는 질문' },
    PRESET_QUESTIONS.map((question, i) => {
      const button = el(doc, 'button', { type: 'button', text: PRESET_LABELS_KO[i] ?? question });
      button.addEventListener('click', () => {
        input.value = PRESET_LABELS_KO[i] ?? question;
        ask(question);
      });
      return button;
    }));

  const element = el(doc, 'section', { class: 'rules-desk', 'aria-labelledby': `${uid}-title` }, [
    el(doc, 'h2', { id: `${uid}-title`, text: '규칙 데스크' }),
    el(doc, 'p', {
      class: 'rules-desk-intro',
      text: '답변은 쇼다운 규칙서와 균형 요건의 정확한 줄을 인용합니다(원문은 영어). '
        + '맞는 규칙이 없으면 추측하지 않고 그렇게 알려 드립니다.',
    }),
    form,
    presets,
    output,
  ]);
  host.append(element);

  return {
    element,
    ask,
    destroy() {
      element.remove();
    },
  };
}
