// The Sheriff's Ledger in the Showdown Camp ("The Night Shift" loop): a collapsed, read-only view of the
// 29 catalog cards and the latest Night Watch check. Data is the checked-in payload from
// scripts/build-sheriffs-ledger.mjs; nothing here calls Crew or the network.
// Ruleset-wide numbers are labelled as such. A card shows its own result only when the payload holds per-card
// counts matched to the same run; otherwise it reads "관찰 안 됨" (or "보류" when no run is recorded).
// The open Ledger starts with the Billy replay (src/ui/billy-replay.js), a recorded duel the visitor steps through.
import {LEDGER} from "./sheriffs-ledger.data.js";
import {VERIFIED} from "./outrider-camp.js";
import {OUTRIDER_LEDGER, outriderLedgerHtml, wireReveal} from "./outrider-ledger.js";
import {billyReplayHtml, wireBillyReplay} from "./billy-replay.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
const short = (sha) => sha.slice(0, 7);
const SIDE = {cowboy: "카우보이", wizard: "마법사"};

// Pure: one row per catalog card, with the text each cell shows.
export function ledgerRows(ledger = LEDGER) {
  return ledger.cards.map((card) => ({
    type: card.type, name: card.name, side: card.side,
    detail: `${SIDE[card.side]} ${card.kind} · ${card.rarity}`,
    provenance: `명세 ${card.spec} · 요구사항 ${card.requirement}`,
    starter: card.starter ? `${card.starter}` : "없음",
    latest: card.latest ? `${card.latest.games}판 중 ${card.latest.wins}승 (${pct(card.latest.wins, card.latest.games)}), 리비전 ${short(ledger.run.revision)}`
      : ledger.run ? "관찰 안 됨" : "보류",
  }));
}

const TRIGGER_KO = {"on-demand": "수동 실행", manual: "수동 실행", schedule: "예약 실행"};
const STATE_KO = {steady: "변동 없음", improved: "개선", regressed: "악화"};
const stateKo = (state) => STATE_KO[state] ?? state;

// Pure: the ruleset-wide line, or the pending note when no run is recorded.
export function rulesetSummary(ledger = LEDGER) {
  const r = ledger.run;
  if (!r) return "보류: 이 규칙 묶음에 대한 야간 감시 실행 기록이 없습니다.";
  return `야간 감시 실행 ${r.id} (${TRIGGER_KO[r.trigger] ?? r.trigger}), ${r.local}: 커밋 ${short(r.revision)}, 기준 ${short(r.baseline)}, `
    + `시드 ${r.firstSeed}–${r.firstSeed + r.count - 1}, ${r.games.toLocaleString("en-US")}판, 각 패를 양쪽이 한 번씩 선공으로 진행. `
    + `선공 승리 ${r.first.toLocaleString("en-US")} (${pct(r.first, r.games)}). 카우보이 승리 ${r.cowboy.toLocaleString("en-US")} (${pct(r.cowboy, r.games)}). `
    + `무승부 ${r.draw}. 규칙 테스트 통과: ${r.rulesTests}. 기준 대비 변화: ${stateKo(r.state)}.`;
}

// Pure: one line per Night Shift review of this run (a one-card, one-number candidate). Reviews never change a card.
export function reviewLines(ledger = LEDGER) {
  return (ledger.reviews ?? []).map((v) => `${v.card} ${v.field} ${v.from} → ${v.to}: ${v.verdict}. ${v.reasons.join("; ")}.`);
}

function reviewHtml(ledger) {
  const lines = reviewLines(ledger);
  if (!lines.length) return `<p class="sd-note" id="ledger-review">야간 근무 검토: 이번 실행에 기록된 것이 없습니다.</p>`;
  return `<h3 id="ledger-review-title">야간 근무 검토</h3>
  <ul class="sd-ledger-props" id="ledger-review">${lines.map((line, i) => `<li>${esc(line)} <code>${esc(ledger.reviews[i].source)}</code></li>`).join("")}</ul>
  <p class="sd-note">초안 후보일 뿐입니다. 카드에는 하나도 적용되지 않았으며 Fable과 Alex가 결정합니다.</p>`;
}

export function ledgerHtml(ledger = LEDGER) {
  const rows = ledgerRows(ledger);
  const observed = rows.filter((row) => ledger.cards.find((c) => c.type === row.type).latest).length;
  const r = ledger.run;
  return `<summary>보안관 장부 <span class="sd-note">빌리 대 뼈 방벽 리플레이 · ${ledger.catalog.count} 카드 · ${r ? `마지막 점검 ${esc(stateKo(r.state))}, 리비전 ${short(r.revision)}` : "아직 점검 없음"}</span></summary>
  <section id="ledger-billy" class="sd-billy" aria-labelledby="ledger-billy-title">${billyReplayHtml()}</section>
  <h3 id="ledger-ruleset">전체 규칙 묶음 (카드별 아님)</h3>
  <p id="ledger-run" class="sd-note">${esc(rulesetSummary(ledger))}</p>
  ${r ? `<p class="sd-note">${esc(r.bot)}의 추정치이며 이 시드에만 해당합니다. ${short(r.revision)} 이후 커밋은 여기서 측정하지 않았습니다. 방법: <code>${esc(r.method)}</code>, 기록: <code>${esc(r.source)}</code>.</p>` : ""}
  ${reviewHtml(ledger)}
  <p class="sd-note">모든 카드에 대해 검증한 엔진 속성 (<code>${esc(ledger.properties.source)}</code>):</p>
  <ul class="sd-ledger-props">${ledger.properties.list.map((p) => `<li><strong>${esc(p.id)}</strong> ${esc(p.title)}</li>`).join("")}</ul>
  <p class="sd-note">카드마다 명세가 하나씩 있습니다: ${esc(ledger.requirement.id)} ${esc(ledger.requirement.title)} (<code>${esc(ledger.requirement.path)}</code>), 검증: <code>${esc(ledger.requirement.check)}</code>. R1.1은 이름이 나온 카드 여덟 장을 표시합니다.</p>
  <h3 id="ledger-cards">카드</h3>
  <p class="sd-note" id="ledger-per-card">${observed ? `카드별 결과 출처: <code>${esc(ledger.perCardSource)}</code>, 위 실행과 대조함.` : "이번 실행에는 카드별 결과가 기록되어 있지 않아 모든 카드가 관찰 안 됨으로 표시됩니다."}</p>
  <div class="sd-ledger-wrap" role="region" aria-labelledby="ledger-cards" tabindex="0">
  <table class="sd-ledger-table"><thead><tr><th scope="col">카드</th><th scope="col">기본 덱</th><th scope="col">최근 결과</th></tr></thead>
  <tbody>${rows.map((row) => `<tr class="${row.side}"><th scope="row"><strong>${esc(row.name)}</strong><span class="sd-type">${esc(row.detail)}</span><span class="sd-note sd-ledger-src">${esc(row.provenance)}</span></th><td>${esc(row.starter)}</td><td>${esc(row.latest)}</td></tr>`).join("")}</tbody></table>
  </div>
  <section id="ledger-outrider" aria-labelledby="ledger-outrider-title">${outriderLedgerHtml(OUTRIDER_LEDGER, VERIFIED)}</section>`;
}

// Fills a <details> element once; it starts collapsed so it never covers the Trail or the first turn.
export function mountLedger(details, ledger = LEDGER) {
  if (!details) return;
  details.innerHTML = ledgerHtml(ledger);
  wireReveal(details);
  wireBillyReplay(details);
  details.open = false;
}
