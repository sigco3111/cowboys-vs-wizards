// The frame says the type: every card category has its own border style, corner mark and
// type line, so a card reads without its art and without colour (docs/card-types.csv).
// Pure data. graybox.css draws the borders from the `data-frame` attribute.
export const FRAMES = Object.freeze({
  troop: Object.freeze({category: "부대", mark: "●", line: "부대"}),
  spell: Object.freeze({category: "주문", mark: "✦", line: "주문"}),
  trap: Object.freeze({category: "함정", mark: "▲", line: "함정"}),
  wanted: Object.freeze({category: "보스 (현상 수배)", mark: "★", line: "보스 · 현상 수배"}),
  captured: Object.freeze({category: "보스 (생포)", mark: "★", line: "보스 · 생포"}),
});

// A bounty card is a boss: Wanted on the Wizard side, Captured once it is a Cowboy card.
// `wanted` marks an ordinary troop that is this hunt's target, such as the Graveyard Dragon.
export function frameOf(card, {wanted = false} = {}) {
  if (wanted || (card.bounty && card.side === "wizard")) return "wanted";
  if (card.bounty) return "captured";
  return card.kind === "troop" ? "troop" : card.kind === "trap" ? "trap" : "spell";
}
export const typeLine = (frame) => `${FRAMES[frame].mark} ${FRAMES[frame].line}`;
