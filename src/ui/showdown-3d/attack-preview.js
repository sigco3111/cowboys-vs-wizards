import { TYPES } from "../../game/showdown/cards.js";
import { applyAction, createShowdown, legalActions, opponent } from "../../game/showdown/rules.js";
import { viewFor } from "../../game/showdown/contract.js";
import { presentEvent } from "../../game/showdown/presenter.js";

export function attackPreviews(id) {
  if (id === "wizard-hellfire") return [["cast", "지옥불 보기"]];
  if (id === "cowboy-lasso") return [["cast", "올가미 보기"]];
  if (id === "wizard-singularity") {
    return [["sheriffs", "보안관 셋을 상대로"], ["graveyard", "해골과 용을 상대로"]];
  }
  const card = TYPES[id];
  if (card?.kind !== "troop") return [];
  if (card.attack === 0) return [["guard", "수호 보기"]];
  const label = {
    "cowboy-dynamiter": "다이너마이트 보기",
    "cowboy-gatling-crew": "휩쓸기 보기",
  }[id] ?? "공격 보기";
  const options = [["attack", label]];
  if (card.keys.includes("ride")) options.push(["ride", "돌파 보기"]);
  if (card.keys.includes("laststand")) options.push(["laststand", "최후의 저항 보기"]);
  return options;
}

export function attackExample(id, mode) {
  if (!attackPreviews(id).some(([key]) => key === mode)) return null;
  if (id === "wizard-hellfire") return hellfireExample();
  if (id === "cowboy-lasso")
    return spellExample(id, { cowboy: [{ type: "cowboy-sheriff" }], wizard: [{ type: "wizard-wizard" }] });
  if (id === "wizard-singularity") return singularityExample(mode);
  const card = TYPES[id];
  const side = card.side;
  const enemy = opponent(side);
  const defender = side === "cowboy" ? "wizard-skeleton" : "cowboy-sheriff";
  const returning = mode === "guard" || mode === "laststand";
  const other = [{ type: id === "cowboy-gatling-crew" ? "wizard-wizard" : defender }];
  if (mode === "guard") other.push({ type: "cowboy-billy" });
  if (mode === "attack" && card.keys.includes("sweep"))
    other.push(
      { type: side === "cowboy" ? "wizard-skeleton" : "cowboy-billy" },
      { type: side === "cowboy" ? "wizard-headless-horseman" : "cowboy-dynamiter" },
    );
  const first = returning ? enemy : side;
  const state = createShowdown(7, { first, opening: { [side]: [{ type: id }], [enemy]: other } });
  state.turn = 5;
  const action = legalActions(state).find(
    (each) => each.type === "attack" && each.slot === 0 && each.target === (mode === "ride" ? "base" : 0),
  );
  const { state: after, events } = applyAction(state, action);
  const before = viewFor(state, side),
    end = viewFor(after, side);
  const summary =
    (mode === "guard" ? "수호 때문에 적은 뼈 방벽을 먼저 공격해야 합니다. " : "") +
    events.map((event) => presentEvent(event)).join(" ");
  return { before, end, trace: [{ before, after: end, events }], summary };
}

function hellfireExample() {
  return spellExample("wizard-hellfire", {
    wizard: [{ type: "wizard-wizard" }],
    cowboy: [{ type: "cowboy-sheriff" }, { type: "cowboy-mounted-billy" }, { type: "cowboy-gatling-crew" }],
  });
}

function spellExample(id, opening) {
  const { side } = TYPES[id];
  const state = createShowdown(7, { first: side, opening });
  state.turn = 5;
  const cardId = id + "-71";
  state.sides[side].hand[0] = cardId;
  const action = legalActions(state).find((each) => each.type === "spell" && each.cardId === cardId);
  const { state: after, events } = applyAction(state, action);
  const before = viewFor(state, side), end = viewFor(after, side);
  return { before, end, trace: [{ before, after: end, events }], summary: events.map((event) => presentEvent(event)).join(" ") };
}

// Use the existing lawful area attack to drive the proposed spell's gallery replay.
function singularityExample(mode) {
  const sheriffs = mode === "sheriffs";
  const side = sheriffs ? "wizard" : "cowboy";
  const enemy = opponent(side);
  const targets = sheriffs
    ? Array.from({length: 3}, () => ({type: "cowboy-sheriff"}))
    : [{type: "wizard-skeleton", health: 1}, {type: "wizard-dragon"}];
  const start = createShowdown(7, {
    first: side,
    opening: {[side]: [{type: "wizard-wizard"}], [enemy]: targets},
  });
  start.turn = 5;
  // Opening fixtures normally contain one boss. This replay needs three distinct copies.
  start.sides[enemy].board.forEach((troop, slot) => {
    if (troop) troop.cardId = `${targets[slot].type}-${31 + slot}`;
  });
  const caster = start.sides[side].board[0].cardId;
  const effect = "wizard-hellfire-71";
  const spell = "wizard-singularity-71";
  start.sides[side].hand[0] = effect;
  const attack = legalActions(start).find((action) => action.type === "spell" && action.cardId === effect);
  const {state: after, events} = applyAction(start, attack);
  start.sides[side].hand[0] = spell;
  after.sides[side].discard[0] = spell;
  const before = viewFor(start, side);
  const end = viewFor(after, side);
  return {
    before, end,
    trace: [{before, after: end, events: events.map((event) => ({...event, cardId: spell, caster, areaVortex: true}))}],
    summary: sheriffs ? "보안관마다 오브 하나를 잃습니다."
      : "해골이 쓰러집니다. 묘지의 용은 오브 하나를 잃지만 버팁니다.",
  };
}
