import { Activity, AlertTriangle, Flame, ShieldAlert, Thermometer, ZapOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DISPLAY_ROOMS, DISPLAY_ROUTES } from "../../data/shipRooms";
import { displayRoomCenter, roomAnchorPoint, roomForCrewActivity } from "../../data/shipInteriorLayout";
import { calculateRoomModifiers } from "../../data/roomModules";
import { CRISIS_CATALOG } from "../../systems/crisisSystem";
import { getPriorityConfig } from "../../systems/priorities";
import { useGameStore } from "../../stores/gameStore";
import { deriveTargetAnimState, useCrewMotionStore } from "../../stores/crewMotionStore";

const CRISIS_ICONS = { overheat: Thermometer, fire: Flame, power_loss: ZapOff, hull_breach: ShieldAlert, intruder: AlertTriangle };

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
  look: { label: "두리번", symbol: "?" },
  stretch: { label: "기지개", symbol: "↕" },
  coffee: { label: "커피", symbol: "☕" },
  chat: { label: "잡담", symbol: "…" },
};

function markerTone(priority) {
  if (priority === "emergency") return "border-red-300 bg-red-300 text-red-950";
  if (priority === "high") return "border-amber-200 bg-amber-200 text-amber-950";
  if (priority === "low") return "border-slate-300 bg-slate-300 text-slate-950";
  return "border-cyan-200 bg-cyan-200 text-cyan-950";
}

function animMeta(animState, idleAction = "stand") {
  if (animState === "idle") return { ...ANIM_STATE_META.idle, ...(IDLE_ACTION_META[idleAction] ?? IDLE_ACTION_META.stand) };
  return ANIM_STATE_META[animState] ?? ANIM_STATE_META.idle;
}

function chipToneForAnim(animState, priority) {
  return animMeta(animState).chipTone || priority.tone;
}

function buildRoomState(roomId, roomMembers, roomActivities, roomState) {
  const slots = Math.round(calculateRoomModifiers(roomState).slots ?? 1);
  const highPriorityCount = roomActivities.filter((activity) => ["emergency", "high"].includes(activity?.priority)).length;
  if (highPriorityCount > 0) return { label: `중요 ${highPriorityCount}`, tone: "bg-amber-300/20 text-amber-100 border-amber-300/30" };
  if (roomMembers.length > 0) return { label: `근무 ${roomMembers.length}/${slots}`, tone: "bg-cyan-300/15 text-cyan-100 border-cyan-300/30" };
  if (roomId === "engineering" && roomMembers.length === 0) return { label: "대기", tone: "bg-slate-400/10 text-slate-300 border-slate-500/30" };
  return null;
}

function roomConditionBadge(room) {
  if (!room) return null;
  if (room.status === "위기") return { label: "위기", tone: "bg-red-400/25 text-red-100 border-red-400/45" };
  if (room.status === "위험") return { label: "위험", tone: "bg-red-400/20 text-red-100 border-red-400/35" };
  if (room.status === "점검 필요") return { label: "점검 필요", tone: "bg-amber-300/20 text-amber-100 border-amber-300/30" };
  if (room.status === "작업 중") return { label: "작업 중", tone: "bg-cyan-300/15 text-cyan-100 border-cyan-300/30" };
  return null;
}

function RouteLine({ from, to, active }) {
  const start = displayRoomCenter(from);
  const end = displayRoomCenter(to);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const width = Math.hypot(end.x - start.x, end.y - start.y);
  const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  return <span className={`ship-corridor-line absolute h-[2px] origin-center rounded-full ${active ? "ship-corridor-line-active" : ""}`} style={{ left: `${midX - width / 2}%`, top: `${midY}%`, width: `${width}%`, transform: `rotate(${angle}deg)` }} />;
}

function useShipMapSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const update = () => setSize({ width: Math.max(1, node.clientWidth), height: Math.max(1, node.clientHeight) });
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

function useElementInView(ref) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { threshold: 0.05 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

function usePageVisible() {
  const [visible, setVisible] = useState(() => (typeof document === "undefined" ? true : document.visibilityState !== "hidden"));
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

function useCrewMotionFrame(isPaused) {
  const tick = useCrewMotionStore((state) => state.tick);
  useEffect(() => {
    if (isPaused) return undefined;
    let frameId = null;
    let last = performance.now();
    const frame = (now) => {
      const deltaMs = Math.min(80, now - last);
      last = now;
      tick(deltaMs, now);
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [isPaused, tick]);
}

function slotAssignments(assignments) {
  const counts = new Map();
  return assignments.map((assignment) => {
    const count = counts.get(assignment.roomId) ?? 0;
    counts.set(assignment.roomId, count + 1);
    return { ...assignment, slotIndex: count };
  });
}

function crewMarkerTransform(point) {
  return `translate(calc(${point.x} * var(--ship-map-w) / 100), calc(${point.y} * var(--ship-map-h) / 100)) translate(-50%, -50%)`;
}

function deriveBarkTrigger(activity, animState) {
  const text = `${activity?.detail ?? ""} ${activity?.action ?? ""} ${activity?.station ?? ""}`;
  if (/표류/.test(text)) return "onDrift";
  if (/연료/.test(text)) return "onLowFuel";
  if (animState === "treat") return "onTreat";
  if (animState === "down") return "onDown";
  if (animState === "rest") return "onRest";
  if (activity?.intent === "crisis-response" || animState === "panic") return "onCrisis";
  return null;
}

export default function ShipInterior({ crew = [], activities = [], rooms = {}, activeCrises = [], compact = false, onCrewClick }) {
  const isPaused = useGameStore((state) => state.isPaused);
  const motionByCrewId = useCrewMotionStore((state) => state.motionByCrewId);
  const syncTargets = useCrewMotionStore((state) => state.syncTargets);
  const [mapRef, mapSize] = useShipMapSize();
  const mapInView = useElementInView(mapRef);
  const pageVisible = usePageVisible();
  useCrewMotionFrame(isPaused || !mapInView || !pageVisible);

  const activityByMember = useMemo(() => new Map(activities.map((activity) => [activity.memberId, activity])), [activities]);
  const crisisById = useMemo(() => new Map(activeCrises.map((crisis) => [crisis.id, crisis])), [activeCrises]);
  const aliveCrew = useMemo(() => crew.filter((member) => member.alive), [crew]);
  const roomAssignments = useMemo(() => slotAssignments(aliveCrew.map((member) => ({ member, activity: activityByMember.get(member.id), roomId: roomForCrewActivity(member, activityByMember.get(member.id)) }))), [aliveCrew, activityByMember]);
  const activeRooms = new Set(roomAssignments.map((assignment) => assignment.roomId));
  const jobOwnerIds = new Set(Object.values(rooms).flatMap((room) => room.assignedMemberIds ?? (room.assignedMemberId ? [room.assignedMemberId] : [])).filter(Boolean));

  const motionTargets = useMemo(() => roomAssignments.map(({ member, activity, roomId, slotIndex }) => {
    const point = roomAnchorPoint(roomId, member.id, slotIndex);
    const animState = deriveTargetAnimState(activity, member);
    return { crewId: member.id, roomId, targetX: point.x, targetY: point.y, animState, barkTrigger: deriveBarkTrigger(activity, animState), updatedAt: activity?.updatedAt ?? 0 };
  }), [roomAssignments]);

  useEffect(() => {
    syncTargets(motionTargets);
  }, [motionTargets, syncTargets]);

  return (
    <section className="overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="section-title"><Activity size={18} />함선 내부</div>
        <div className="flex flex-wrap justify-end gap-1.5"><span className="hud-chip hud-chip-accent">Living Crew D</span><span className="hud-chip">구역 {DISPLAY_ROOMS.length}</span><span className="hud-chip">승무원 {aliveCrew.length}</span>{!mapInView && <span className="hud-chip">컬링</span>}{activeCrises.length > 0 && <span className="hud-chip hud-chip-danger">위기 {activeCrises.length}</span>}</div>
      </div>
      <div ref={mapRef} className={`ship-interior-map relative mt-4 overflow-hidden rounded-2xl border border-slate-700/80 ${compact ? "h-[260px]" : "h-[460px]"}`} style={{ "--ship-map-w": `${mapSize.width}px`, "--ship-map-h": `${mapSize.height}px` }}>
        <div className="ship-hull-shell absolute inset-x-[6%] top-[4%] h-[92%] rounded-[44%]" />
        <div className="ship-hull-spine absolute left-[49%] top-[13%] h-[73%] w-[2px]" />
        <div className="ship-hull-deck absolute left-[18%] top-[23%] h-[2px] w-[64%]" />
        <div className="ship-hull-deck absolute left-[16%] top-[50%] h-[2px] w-[68%]" />
        <div className="ship-hull-deck absolute left-[18%] top-[62%] h-[2px] w-[64%]" />
        <div className="ship-engine-glow absolute bottom-[4%] left-[35%] h-[7%] w-[30%] rounded-full" />
        {DISPLAY_ROUTES.map(([from, to]) => <RouteLine key={`${from}-${to}`} from={from} to={to} active={activeRooms.has(from) && activeRooms.has(to)} />)}
        {DISPLAY_ROOMS.map((room) => {
          const Icon = room.icon;
          const operational = !room.decorative;
          const assigned = operational ? roomAssignments.filter((entry) => entry.roomId === room.id) : [];
          const roomState = operational ? rooms[room.id] : null;
          const modifiers = operational ? calculateRoomModifiers(roomState) : null;
          const crisis = operational && roomState?.activeCrisisId ? crisisById.get(roomState.activeCrisisId) : null;
          const crisisConfig = crisis ? CRISIS_CATALOG[crisis.type] : null;
          const CrisisIcon = crisis ? CRISIS_ICONS[crisis.type] ?? AlertTriangle : null;
          const badge = !operational
            ? { label: room.tag ?? "AUX", tone: "bg-slate-400/10 text-slate-300 border-slate-500/30" }
            : crisis
              ? { label: `${crisisConfig?.label ?? "위기"} ${crisis.severity}`, tone: "bg-red-400/25 text-red-50 border-red-300/60" }
              : roomConditionBadge(roomState) ?? buildRoomState(room.id, assigned.map((entry) => entry.member), assigned.map((entry) => entry.activity), roomState);
          return (
            <div key={room.id} className={`ship-room-zone absolute rounded-xl border p-2 ${!operational ? "ship-room-aux" : ""} ${crisis ? "animate-pulse border-red-300/70 bg-red-500/15 ring-2 ring-red-400/45" : `${room.tone} ${activeRooms.has(room.id) ? "ring-1 ring-cyan-200/40" : ""}`}`} style={{ left: `${room.left}%`, top: `${room.top}%`, width: `${room.width}%`, height: `${room.height}%` }}>
              <div className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300"><span className="truncate">{room.label}</span>{CrisisIcon ? <CrisisIcon size={compact ? 12 : 14} className="text-red-100" /> : <Icon size={compact ? 12 : 14} />}</div>
              {operational && <span className="absolute right-1 top-1 rounded border border-cyan-300/35 bg-cyan-300/10 px-1 text-[9px] font-black text-cyan-100">T{roomState?.tier ?? 1}</span>}
              {operational && !compact && <span className="absolute right-1 bottom-1.5 rounded border border-slate-500/40 bg-slate-950/70 px-1 text-[9px] font-bold text-slate-200">S{Math.round(modifiers?.slots ?? 1)}</span>}
              {badge && <span className={`absolute bottom-1.5 left-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${badge.tone}`}>{badge.label}</span>}
              {crisis && <span className="absolute right-1 top-6 rounded border border-red-300/45 bg-red-400/20 px-1 text-[9px] font-black text-red-50">{Math.round(crisis.progress ?? 0)}%</span>}
              {crisis ? <div className="absolute inset-x-1 bottom-0.5 h-0.5 overflow-hidden rounded bg-slate-950/60"><div className="h-full bg-red-300/80" style={{ width: `${crisis.progress ?? 0}%` }} /></div> : operational && roomState?.jobId && <div className="absolute inset-x-1 bottom-0.5 h-0.5 overflow-hidden rounded bg-slate-950/60"><div className="h-full bg-cyan-300/70" style={{ width: `${roomState.progress}%` }} /></div>}
            </div>
          );
        })}
        {roomAssignments.map(({ member, activity, roomId }) => {
          const fallbackPoint = roomAnchorPoint(roomId, member.id);
          const motion = motionByCrewId[member.id];
          const point = motion ? { x: motion.x, y: motion.y } : fallbackPoint;
          const priority = getPriorityConfig(activity?.priority ?? "normal");
          const isJobOwner = jobOwnerIds.has(member.id) && activity?.intent === "room-job";
          const isCrisisResponder = activity?.intent === "crisis-response";
          const animState = motion?.animState ?? deriveTargetAnimState(activity, member);
          const idleAction = motion?.idleAction ?? "stand";
          const meta = animMeta(animState, idleAction);
          const moving = animState === "walk";
          const barkText = motion?.bark?.text;
          return (
            <button key={member.id} className="absolute left-0 top-0 z-20" style={{ transform: crewMarkerTransform(point), willChange: moving ? "transform" : "auto" }} onClick={() => onCrewClick?.(member)} title={`${member.name} · ${activity?.station ?? "대기"} · ${activity?.action ?? "대기"} · ${meta.label}`}>
              {!compact && barkText && <span className={`crew-bark-bubble crew-bark-${motion.bark.trigger ?? "default"}`} aria-hidden="true">{barkText}</span>}
              <span className={`crew-marker-core crew-marker-${animState} crew-idle-${idleAction} relative grid h-7 w-7 place-items-center rounded-full border text-[11px] font-black shadow-lg ${markerTone(activity?.priority)} ${isJobOwner ? "ring-2 ring-cyan-300 ring-offset-1 ring-offset-slate-950" : ""} ${isCrisisResponder ? "ring-2 ring-red-300 ring-offset-1 ring-offset-slate-950" : ""}`}>
                <span className={`crew-marker-avatar ${motion?.facing === "left" ? "crew-marker-facing-left" : ""}`}>{member.name.slice(0, 1)}</span>
                <span className={`crew-marker-state-badge crew-marker-state-${animState}`}>{meta.symbol}</span>
                <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-slate-950 ${activity?.priority === "emergency" ? "animate-pulse bg-red-400" : activity?.priority === "high" ? "bg-amber-300" : "bg-emerald-300"}`} />
              </span>
              {!compact && <span className="mt-1 block max-w-24 truncate rounded border border-slate-700/80 bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-100">{member.name} · {meta.label}</span>}
            </button>
          );
        })}
      </div>
      {!compact && <div className="mt-3 grid gap-2 md:grid-cols-2">{roomAssignments.slice(0, 6).map(({ member, activity }) => { const priority = getPriorityConfig(activity?.priority ?? "normal"); const motion = motionByCrewId[member.id]; const animState = motion?.animState ?? deriveTargetAnimState(activity, member); const idleAction = motion?.idleAction ?? "stand"; const meta = animMeta(animState, idleAction); return <button key={member.id} className="flex items-center justify-between gap-3 rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-left" onClick={() => onCrewClick?.(member)}><div className="min-w-0"><div className="truncate font-semibold text-slate-100">{member.name}</div><div className="mt-0.5 truncate text-xs text-slate-400">{activity?.station ?? "대기"} · {activity?.action ?? "대기"}</div></div><span className={`hud-chip shrink-0 ${chipToneForAnim(animState, priority)}`}>{meta.label}</span></button>; })}</div>}
    </section>
  );
}
