import { roomAnchorPoint } from "../../data/shipInteriorLayout";
import { getPriorityConfig } from "../../systems/priorities";
import { deriveTargetAnimState } from "../../stores/crewMotionStore";

const ANIM_STATE_META = {
  idle: { label: "대기", symbol: "·", chipTone: "" },
  walk: { label: "이동", symbol: "›", chipTone: "hud-chip-accent" },
  work: { label: "작업", symbol: "⚙", chipTone: "hud-chip-accent" },
  rest: { label: "휴식", symbol: "Z", chipTone: "hud-chip-success" },
  treat: { label: "치료", symbol: "+", chipTone: "hud-chip-success" },
  panic: { label: "긴급", symbol: "!", chipTone: "hud-chip-danger" },
  down: { label: "쓰러짐", symbol: "×", chipTone: "hud-chip-danger" },
};

const IDLE_ACTION_META = {
  stand: { label: "대기", symbol: "·" },
  look: { label: "주변 확인", symbol: "?" },
  stretch: { label: "기지개", symbol: "↕" },
  coffee: { label: "휴식", symbol: "☕" },
  chat: { label: "대화", symbol: "…" },
};

function markerTone(priority) {
  if (priority === "emergency") return "border-red-300 bg-red-300 text-red-950";
  if (priority === "high") return "border-amber-200 bg-amber-200 text-amber-950";
  if (priority === "low") return "border-slate-300 bg-slate-300 text-slate-950";
  return "border-blue-200 bg-blue-200 text-blue-950";
}

function animMeta(animState, idleAction = "stand") {
  if (animState === "idle") return { ...ANIM_STATE_META.idle, ...(IDLE_ACTION_META[idleAction] ?? IDLE_ACTION_META.stand) };
  return ANIM_STATE_META[animState] ?? ANIM_STATE_META.idle;
}

function chipToneForAnim(animState, priority) {
  return animMeta(animState).chipTone || priority.tone;
}

function crewMarkerTransform(point) {
  return `translate(calc(${point.x} * var(--ship-map-w) / 100), calc(${point.y} * var(--ship-map-h) / 100)) translate(-50%, -50%)`;
}

function spriteTitle({ member, activity, roomId, meta }) {
  return `${member.name} · ${activity?.station ?? "대기"} · ${activity?.action ?? "대기"} · ${activity?.roomId ?? roomId} · ${meta.label}`;
}

export function CrewSprite({ member, activity, roomId, point, motion, jobOwnerIds, compact = false, onCrewClick }) {
  const isJobOwner = jobOwnerIds?.has?.(member.id) && activity?.intent === "room-job";
  const isCrisisResponder = activity?.intent === "crisis-response";
  const animState = motion?.animState ?? deriveTargetAnimState(activity, member);
  const idleAction = motion?.idleAction ?? "stand";
  const animationIntent = motion?.animationIntent ?? activity?.animationIntent ?? animState;
  const meta = animMeta(animState, idleAction);
  const moving = animState === "walk";
  const barkText = motion?.bark?.text;

  return (
    <button
      key={member.id}
      className="absolute left-0 top-0 z-20"
      style={{ transform: crewMarkerTransform(point), willChange: moving ? "transform" : "auto" }}
      onClick={() => onCrewClick?.(member)}
      title={spriteTitle({ member, activity, roomId, meta })}
      aria-label={`${member.name}, ${meta.label}`}
    >
      {!compact && barkText && <span className={`crew-bark-bubble crew-bark-${motion.bark.trigger ?? "default"}`} aria-hidden="true">{barkText}</span>}
      <span data-animation-intent={animationIntent} className={`crew-marker-core crew-marker-${animState} crew-idle-${idleAction} relative grid h-7 w-7 place-items-center rounded-full border text-[11px] font-black shadow-lg ${markerTone(activity?.priority)} ${isJobOwner ? "ring-2 ring-blue-300 ring-offset-1 ring-offset-slate-950" : ""} ${isCrisisResponder ? "ring-2 ring-red-300 ring-offset-1 ring-offset-slate-950" : ""}`}>
        <span className={`crew-marker-avatar ${motion?.facing === "left" ? "crew-marker-facing-left" : ""}`}>{member.name.slice(0, 1)}</span>
        <span className={`crew-marker-state-badge crew-marker-state-${animState}`}>{meta.symbol}</span>
        <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-slate-950 ${activity?.priority === "emergency" ? "animate-pulse bg-red-400" : activity?.priority === "high" ? "bg-amber-300" : "bg-emerald-300"}`} />
      </span>
      {!compact && <span className="mt-1 block max-w-24 truncate rounded-lg border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-100">{member.name} · {meta.label}</span>}
    </button>
  );
}

export function CrewActivitySummary({ roomAssignments = [], motionByCrewId = {}, onCrewClick }) {
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-2">
      {roomAssignments.slice(0, 6).map(({ member, activity }) => {
        const priority = getPriorityConfig(activity?.priority ?? "normal");
        const motion = motionByCrewId[member.id];
        const animState = motion?.animState ?? deriveTargetAnimState(activity, member);
        const idleAction = motion?.idleAction ?? "stand";
        const meta = animMeta(animState, idleAction);
        return (
          <button key={member.id} className="ui-feed-item items-center text-left" onClick={() => onCrewClick?.(member)}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${markerTone(activity?.priority)} text-xs font-bold`}>{member.name.slice(0, 1)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-slate-100">{member.name}</span>
              <span className="mt-0.5 block truncate text-xs text-slate-400">{activity?.station ?? "대기"} · {activity?.action ?? meta.label}{activity?.jobId ? " · 작업 배정" : ""}</span>
            </span>
            <span className={`hud-chip shrink-0 ${chipToneForAnim(animState, priority)}`}>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function CrewLayer({ roomAssignments = [], motionByCrewId = {}, jobOwnerIds = new Set(), compact = false, onCrewClick }) {
  return (
    <>
      {roomAssignments.map(({ member, activity, roomId, slotIndex }) => {
        const motion = motionByCrewId[member.id];
        const fallbackPoint = roomAnchorPoint(roomId, member.id, slotIndex);
        const point = motion ? { x: motion.x, y: motion.y } : fallbackPoint;
        return <CrewSprite key={member.id} member={member} activity={activity} roomId={roomId} point={point} motion={motion} jobOwnerIds={jobOwnerIds} compact={compact} onCrewClick={onCrewClick} />;
      })}
    </>
  );
}
