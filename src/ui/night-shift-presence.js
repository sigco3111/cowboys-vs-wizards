// Night Shift ambient presence: projects stored activity records to the two
// displayable fields and gives each a short on-screen line. Pure; no DOM.
// These lines describe what an observer notices. They are not the decisive
// gameplay actions (confirmed jobs, blocks, edits, posters, passed bells).

export const ACTIVITY_PHASES = Object.freeze([
  "SessionStart", "SessionEnd", "UserPromptSubmit", "Stop", "PermissionRequest",
  "PreToolUse", "PostToolUse", "PostFileCreate", "PostFileSave", "PostFileDelete",
  "PreTaskExecution", "PostTaskExecution", "PreCompact", "PostCompact",
]);
export const ACTIVITY_ACTORS = Object.freeze(["sheriff", "wizard", "hunter", "singularity"]);

const ACTOR_NAME = Object.freeze({
  sheriff: "보안관",
  wizard: "마법사",
  hunter: "현상금 사냥꾼",
  singularity: "싱귤래리티",
});

const SEEN = Object.freeze({
  SessionStart: "새 세션을 위해 등불이 켜지는 것",
  SessionEnd: "등불이 꺼지는 것",
  UserPromptSubmit: "새 요청이 들어오는 것",
  Stop: "에이전트가 멈추는 것",
  PermissionRequest: "누군가 행동 허락을 구하는 것",
  PreToolUse: "도구에 손을 뻗는 것",
  PostToolUse: "도구를 내려놓는 것",
  PostFileCreate: "새 쪽지가 생기는 것",
  PostFileSave: "쪽지가 저장되는 것",
  PostFileDelete: "쪽지가 뜯겨 나가는 것",
  PreTaskExecution: "작업이 시작되는 것",
  PostTaskExecution: "작업이 마무리되는 것",
  PreCompact: "메모를 정리하는 것",
  PostCompact: "메모 정리가 끝나는 것",
});

// {actor, phase} from an allowlisted activity record, or null.
export function cleanActivityFields(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (input.kind !== undefined && input.kind !== "activity") return null;
  const {actor, phase} = input;
  if (!ACTIVITY_ACTORS.includes(actor) || !ACTIVITY_PHASES.includes(phase)) return null;
  return {actor, phase};
}

// Short ambient line such as "Hunter sees a task start", or null.
export function activityLabel(record) {
  const clean = cleanActivityFields(record);
  if (!clean) return null;
  return `${ACTOR_NAME[clean.actor]}: ${SEEN[clean.phase]}을(를) 봄`;
}
