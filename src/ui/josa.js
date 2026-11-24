// 한국어 조사 선택: 마지막 글자의 받침에 따라 "을/를", "이/가", "은/는", "으로/로"를 붙인다.
const PAIRS = {"을": ["을", "를"], "이": ["이", "가"], "은": ["은", "는"], "으로": ["으로", "로"]};
export function josa(word, kind) {
  const text = String(word).replace(/<[^>]*>|[\s)\]]+$/g, "");
  const code = text.charCodeAt(text.length - 1);
  let batchim;
  if (code >= 0xac00 && code <= 0xd7a3) batchim = (code - 0xac00) % 28;
  else if (/[0136780]/.test(text.slice(-1))) batchim = 1;
  else batchim = 0;
  const [withB, without] = PAIRS[kind];
  return `${word}${kind === "으로" && batchim === 8 ? "로" : batchim ? withB : without}`;
}
