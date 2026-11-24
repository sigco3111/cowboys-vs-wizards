// K-096: Boot Hill practice. The reference Boot Hill duel (Trail duel 1 on newSave(): starter deck, no grit),
// dealt from one allowlisted seed and held in memory only. It reuses the screen's no-settle path (kind "turn"):
// finishing, Retry and Restart settle nothing and add no playtest line, so a saved career is never touched.
// Opened from the Camp's practice links or ?practice=<seed>; ?seed keeps its own meaning for Camp duels.
// Pure: no DOM, storage or network.
import {bootHill} from "./showdown-session.js";

export const PRACTICE_SEEDS = [0, 60];
const NOTE = "연습: 여기서는 아무것도 저장되지 않습니다.";

// The seed for a raw ?practice value, or null. Only the exact strings "0" and "60" pass.
export function practiceSeed(raw) {
  return typeof raw === "string" && PRACTICE_SEEDS.map(String).includes(raw) ? Number(raw) : null;
}

// The ?practice value of a query string, or null when it is absent, repeated or not allowlisted.
export function practiceFromQuery(search) {
  const values = new URLSearchParams(search).getAll("practice");
  return values.length === 1 ? practiceSeed(values[0]) : null;
}

// The duel and deal for an allowlisted seed, or null.
export function practiceDuel(seed) {
  if (!PRACTICE_SEEDS.includes(seed)) return null;
  const duel = bootHill();
  return {seed, duel: {...duel, id: `practice:${seed}`, kind: "turn", name: `Practice: ${duel.name}`, lesson: `${NOTE} ${duel.lesson}`}};
}
