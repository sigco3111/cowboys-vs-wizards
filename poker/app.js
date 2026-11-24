// Browser front end. Same engine, controls and screen as cli.mjs.
import { applyKey, keyToAction, startSession } from './controls.js';
import { viewState } from './engine.js';
import { renderScreen, toHtml } from './render.js';

const screen = document.getElementById('screen');
const params = new URLSearchParams(location.search);
let session;

try {
  session = startSession({
    seed: params.get('seed') ?? 17,
    first: params.get('first') ?? 'cowboy',
    strategy: params.get('strategy') ?? 'standard',
  });
} catch (error) {
  screen.textContent = `Boot Hill Poker could not start: ${error.message}`;
  throw error;
}

function paint() {
  const view = viewState(session.state);
  screen.innerHTML = toHtml(renderScreen(view, session));
  for (const button of document.querySelectorAll('[data-key]')) {
    const action = keyToAction(button.dataset.key);
    const needsTurn = action.type === 'toggle' || action.type === 'draw';
    button.disabled = session.hungUp ? action.type === 'quit' : needsTurn && !view.canAct;
    if (action.type === 'toggle') button.setAttribute('aria-pressed', String(view.marked.includes(action.index)));
  }
  try {
    const url = new URL(location.href);
    url.searchParams.set('seed', String(session.state.seed));
    url.searchParams.set('first', session.state.first);
    history.replaceState(null, '', url);
  } catch {
    // file:// pages may refuse URL updates; the game still works.
  }
}

function press(key) {
  session = applyKey(session, key);
  paint();
}

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  // A focused button already handles Enter/Space through its click event.
  if (event.target instanceof HTMLButtonElement && (event.key === 'Enter' || event.key === ' ')) return;
  if (!keyToAction(event.key) && !(session.hungUp && event.key.length === 1)) return;
  event.preventDefault();
  press(event.key);
});

for (const button of document.querySelectorAll('[data-key]')) {
  button.addEventListener('click', () => press(button.dataset.key));
}

paint();
