// K-011: the Outrider section inside the collapsed Sheriff's Ledger. Its data is assembled at build time by
// scripts/outrider-ledger.mjs (build-graybox.mjs defines __CVW_OUTRIDER_LEDGER__) and carries measured results
// only when the gate found both curated cases fresh. Before the reader presses "Show the measured comparison" the
// section shows only the two public positions, their status and the Night Watch identity: no result, score or advice.
/* global __CVW_OUTRIDER_LEDGER__ */
export const OUTRIDER_LEDGER = typeof __CVW_OUTRIDER_LEDGER__ === "undefined"
  ? {status: "missing", statusText: "이 페이지는 아웃라이더 게이트 없이 빌드되어 비교할 것이 없습니다.", positions: [], nightWatch: null}
  : __CVW_OUTRIDER_LEDGER__;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
const short = (sha) => String(sha).slice(0, 7);
const SIDE = {cowboy: "카우보이", wizard: "마법사", draw: "무승부"};

// Pure: the Night Watch relationship line, or null without a receipt.
export function nightWatchLine(section = OUTRIDER_LEDGER) {
  const nw = section.nightWatch;
  if (!nw) return null;
  const head = `야간 감시 영수증 ${nw.source}, ${nw.local} (${nw.trigger}): 커밋 ${short(nw.commit)}, 규칙 blob ${short(nw.rulesBlob)}, `
    + `${nw.bot}, 시드 ${nw.seeds.from}–${nw.seeds.to}, ${nw.games.toLocaleString("en-US")}판. 이 수가 아니라 규칙 묶음 전체를 측정합니다.`;
  const e = nw.engine;
  if (!e?.checked) return `${head} 이 빌드와 엔진을 비교할 수 없었습니다: ${e?.reason ?? "알 수 없음"}.`;
  const same = e.same ? `실행에 쓰인 엔진 파일 ${e.files}개가 이 빌드와 바이트 단위로 같습니다${nw.rulesBlobMatch ? ". 규칙 blob도 일치합니다" : ""}.`
    : `엔진이 이 빌드와 ${e.differ.join(", ")}에서 달라서, 수치는 이전 규칙을 나타냅니다.`;
  const extra = e.notMeasured.length ? ` 아웃라이더 국면은 ${e.notMeasured.join(", ")}도 거치지만, 그 실행은 이를 다루지 않았습니다.` : "";
  return `${head} ${same}${extra}`;
}

// Pure: the result lines for the revealed comparison; [] unless the section is fresh.
export function comparisonLines(section = OUTRIDER_LEDGER) {
  if (section.status !== "fresh") return [];
  return section.positions.map(({id, label}) => { const r = section.results[id];
    return `${label}: 기지로 돌진하면 ${r.ride.turn}턴에 ${SIDE[r.ride.winner]} 승리, 부대와 싸우면 ${r.fight.turn}턴에 ${SIDE[r.fight.winner]} 승리.`; });
}

// Pure: what the search found overall and its limits; null unless fresh.
export function researchLine(section = OUTRIDER_LEDGER) {
  const r = section.status === "fresh" ? section.research : null;
  if (!r) return null;
  const h = r.holdout;
  return `이 둘은 측정된 역전 ${r.rideOnly + r.fightOnly}건(돌진으로만 이김 ${r.rideOnly}건, `
    + `싸워서만 이김 ${r.fightOnly}건) 중 종류별로 하나씩 고른 것입니다. 시드 ${r.tried}개에서 도달한 결정 ${r.reached}건 중입니다. 모든 결과는 이후의 수에 좌우됩니다: 고정된 `
    + `탐욕적 카우보이 정책과 트레일의 0단계 마법사 봇이 나머지를 두었으므로, 다른 수를 두면 결과가 바뀔 수 있습니다. 사전 등록한 단서 `
    + `(${r.cue}, 시드 ${r.derivedOn}에서 ${r.fit.flips}건 중 ${r.fit.correct}건)은 쓰지 않은 `
    + `시드 ${h.range}의 새 역전 ${h.flips}건 중 ${h.correct}건이 맞았고, 항상 돌진하면 ${h.alwaysRide}건: ${h.supported ? "뒷받침됨" : "뒷받침되지 않음"}. 일반 규칙이 증명된 것은 아닙니다.`;
}

export function outriderLedgerHtml(section = OUTRIDER_LEDGER, verified = []) {
  const linkable = new Set(verified.map((c) => c.id));
  const nw = nightWatchLine(section);
  const positions = section.positions.map((p) => `<li data-position="${esc(p.label)}"><strong>${esc(p.label)}</strong>, ${p.turn}턴. `
    + `기지: 내 쪽 ${p.bases.cowboy}, 상대 ${p.bases.wizard}. 내 보드: ${esc(p.cowboy)}. 상대 보드: ${esc(p.wizard)}.`
    + `${linkable.has(p.id) ? ` <button type="button" data-outrider="${esc(p.id)}">${esc(p.label)} 열기</button>` : ""}</li>`).join("");
  const reveal = section.status === "fresh"
    ? `<p><button type="button" id="ledger-outrider-reveal" aria-expanded="false" aria-controls="ledger-outrider-results">측정 비교 보기</button></p>
  <div id="ledger-outrider-results" hidden></div>` : "";
  return `<h3 id="ledger-outrider-title">아웃라이더 실험 (검토용, 조언 아님)</h3>
  <p class="sd-note" id="ledger-outrider-status" role="status" data-status="${esc(section.status)}">${esc(section.statusText)}</p>
  ${positions ? `<p class="sd-note">아웃라이더는 상대 부대를 지나쳐 마법사 기지를 공격하거나, 부대를 공격할 수 있습니다.</p><ul class="sd-ledger-props" id="ledger-outrider-positions">${positions}</ul>` : ""}
  ${reveal}
  ${nw ? `<p class="sd-note" id="ledger-outrider-nightwatch">${esc(nw)}</p>` : ""}
  ${section.record ? `<p class="sd-note">측정한 모든 사례: <code>${esc(section.record)}</code>. 이 중 무엇이 조언이나 현상금이 될지는 Fable이 결정합니다.</p>` : ""}`;
}

// Fills the results only when the reader asks; nothing is in the DOM before that.
export function wireReveal(root, section = OUTRIDER_LEDGER) {
  if (typeof root?.querySelector !== "function") return;
  const button = root.querySelector("#ledger-outrider-reveal");
  const box = root.querySelector("#ledger-outrider-results");
  if (!button || !box) return;
  button.addEventListener("click", () => {
    if (box.hidden) {
      const research = researchLine(section);
      box.innerHTML = `<ul class="sd-ledger-props">${comparisonLines(section).map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`
        + (research ? `<p class="sd-note">${esc(research)}</p>` : "");
    } else box.innerHTML = "";
    box.hidden = !box.hidden;
    button.setAttribute("aria-expanded", String(!box.hidden));
    button.textContent = box.hidden ? "측정 비교 보기" : "측정 비교 숨기기";
  });
}
