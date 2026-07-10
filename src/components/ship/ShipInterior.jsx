import { Activity, AlertTriangle, Cpu, Flame, Rocket, Shield, ShieldAlert, Sparkles, Thermometer, Zap, ZapOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DISPLAY_ROOMS, DISPLAY_ROUTES } from "../../data/shipRooms";
import { displayRoomCenter, roomAnchorPoint, roomForCrewActivity } from "../../data/shipInteriorLayout";
import { calculateRoomModifiers } from "../../data/roomModules";
import { ROOM_SLOTS, WEAR } from "../../data/constants";
import { CRISIS_CATALOG } from "../../systems/crisisSystem";
import { getRoomJob } from "../../systems/roomJobs";
import { useGameStore } from "../../stores/gameStore";
import { useShipStore } from "../../stores/shipStore";
import { deriveAnimationIntent, deriveTargetAnimState, useCrewMotionStore } from "../../stores/crewMotionStore";
import CrewLayer, { CrewActivitySummary } from "./CrewLayer";

const SLOT_ICON = { engine: Rocket, "weapon-a": Zap, "weapon-b": Zap, shield: Shield, cargo: Cpu, special: Sparkles };

const CRISIS_ICONS = { overheat: Thermometer, fire: Flame, power_loss: ZapOff, hull_breach: ShieldAlert, intruder: AlertTriangle };

function RoomWearEffects({ condition }) {
  if (condition > WEAR.warnCondition) return null;
  const danger = condition <= WEAR.dangerCondition;
  return (
    <>
      <span className="room-wear-spark" style={{ left: "22%", top: "58%" }} />
      {danger && <span className="room-wear-spark" style={{ left: "68%", top: "40%" }} />}
      {danger && <span className="room-wear-smoke" style={{ left: "45%" }} />}
    </>
  );
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

function assignedNames(assignments = []) {
  return assignments.map((entry) => entry.member?.name).filter(Boolean);
}

function roomJobDiagnostic(room, assignments = [], compact = false) {
  if (!room) return null;
  const job = getRoomJob(room.id);
  const workers = assignedNames(assignments);
  if (room.jobId) {
    return {
      label: compact ? `${workers.length || 1}명 작업` : `${job?.label ?? room.jobId} · ${Math.round(room.progress ?? 0)}%`,
      tone: "bg-cyan-300/20 text-cyan-50 border-cyan-300/40",
    };
  }
  if (room.status === "위험" || room.status === "점검 필요") {
    return {
      label: workers.length > 0 ? `출동 ${workers.length}명` : "대기열 확인",
      tone: workers.length > 0 ? "bg-amber-300/20 text-amber-50 border-amber-300/40" : "bg-red-400/20 text-red-50 border-red-300/45",
    };
  }
  return null;
}

function roomTooltip(roomDef, roomState, assignments = []) {
  if (!roomState) return `${roomDef.label} (${roomDef.id})`;
  const job = getRoomJob(roomDef.id);
  const workers = assignedNames(assignments).join(", ") || "없음";
  return [
    `${roomDef.label} (${roomDef.id})`,
    `상태: ${roomState.status ?? "미상"}`,
    `condition: ${Math.round(roomState.condition ?? 0)} / load: ${Math.round(roomState.load ?? 0)}`,
    `job: ${roomState.jobId ? `${job?.label ?? roomState.jobId} (${roomState.jobId})` : job?.id ?? "없음"}`,
    `progress: ${Math.round(roomState.progress ?? 0)}%`,
    `assigned: ${workers}`,
  ].join("\n");
}

function buildRoomDiagnostics(rooms, roomAssignments) {
  return DISPLAY_ROOMS
    .filter((room) => !room.decorative)
    .map((room) => {
      const state = rooms[room.id];
      const assigned = roomAssignments.filter((entry) => entry.roomId === room.id);
      const job = getRoomJob(room.id);
      const diagnostic = roomJobDiagnostic(state, assigned, false);
      return { room, state, assigned, job, diagnostic };
    })
    .filter(({ state, assigned, diagnostic }) => diagnostic || state?.status === "위험" || state?.status === "점검 필요" || assigned.some((entry) => entry.activity?.intent === "room-job"))
    .sort((a, b) => {
      const priority = { 위기: 4, 위험: 3, "점검 필요": 2, "작업 중": 1, 안정: 0 };
      return (priority[b.state?.status] ?? 0) - (priority[a.state?.status] ?? 0);
    })
    .slice(0, 6);
}

function RouteLine({ from, to, active }) {
  const start = displayRoomCenter(from);
  const end = displayRoomCenter(to);
  const horizontalFirst = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const path = horizontalFirst
    ? `M ${start.x} ${start.y} H ${end.x} V ${end.y}`
    : `M ${start.x} ${start.y} V ${end.y} H ${end.x}`;
  return (
    <svg className="ship-corridor-route absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path className={active ? "ship-corridor-path ship-corridor-path-active" : "ship-corridor-path"} d={path} vectorEffect="non-scaling-stroke" />
    </svg>
  );
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

function EquipmentBadges({ roomId, installed, modulesById, compact }) {
  const slots = ROOM_SLOTS[roomId];
  if (!slots || slots.length === 0) return null;
  return (
    <div className="absolute right-1 top-6 flex flex-col items-end gap-0.5">
      {slots.map((slot) => {
        const module = modulesById.get(installed[slot]);
        const Icon = SLOT_ICON[slot] ?? Cpu;
        return (
          <span key={slot} title={`${slot}: ${module?.name ?? "미장착"}`} className={`flex items-center gap-0.5 rounded border px-1 text-[9px] font-bold ${module ? "border-cyan-300/40 bg-slate-950/70 text-cyan-100" : "border-slate-700/60 bg-slate-950/50 text-slate-500"}`}>
            <Icon size={compact ? 9 : 10} />
            {!compact && (module ? `Lv${module.level}` : "-")}
          </span>
        );
      })}
    </div>
  );
}

export default function ShipInterior({ crew = [], activities = [], rooms = {}, activeCrises = [], compact = false, showEquipment = false, onCrewClick, onRoomClick }) {
  const isPaused = useGameStore((state) => state.isPaused);
  const shipModules = useShipStore((state) => state.modules);
  const installed = useShipStore((state) => state.installed);
  const modulesById = useMemo(() => new Map(shipModules.map((module) => [module.id, module])), [shipModules]);
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
  const roomDiagnostics = useMemo(() => buildRoomDiagnostics(rooms, roomAssignments), [rooms, roomAssignments]);

  const motionTargets = useMemo(() => roomAssignments.map(({ member, activity, roomId, slotIndex }) => {
    const point = roomAnchorPoint(roomId, member.id, slotIndex);
    const animState = deriveTargetAnimState(activity, member);
    const animationIntent = deriveAnimationIntent(activity, member, animState);
    return { crewId: member.id, roomId, targetX: point.x, targetY: point.y, animState, animationIntent, barkTrigger: deriveBarkTrigger(activity, animState), updatedAt: activity?.updatedAt ?? 0 };
  }), [roomAssignments]);

  useEffect(() => {
    syncTargets(motionTargets);
  }, [motionTargets, syncTargets]);

  return (
    <section className="ship-deck-section overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="section-title"><Activity size={18} />함선 덱</div>
        <div className="flex flex-wrap justify-end gap-1.5"><span className="hud-chip hud-chip-accent">DECK VIEW</span><span className="hud-chip">구역 {DISPLAY_ROOMS.length}</span><span className="hud-chip">승무원 {aliveCrew.length}</span>{roomDiagnostics.length > 0 && <span className="hud-chip hud-chip-accent">작업 {roomDiagnostics.length}</span>}{!mapInView && <span className="hud-chip">절전</span>}{activeCrises.length > 0 && <span className="hud-chip hud-chip-danger">위기 {activeCrises.length}</span>}</div>
      </div>
      <div ref={mapRef} className={`ship-interior-map ship-deck-map relative mt-4 overflow-hidden ${compact ? "h-[280px]" : "h-[500px]"}`} style={{ "--ship-map-w": `${mapSize.width}px`, "--ship-map-h": `${mapSize.height}px` }}>
        <div className="ship-hull-shell absolute inset-[3%]" />
        <div className="ship-hull-keel absolute left-1/2 top-[8%] h-[82%] w-px -translate-x-1/2" />
        <div className="ship-engine-pod ship-engine-pod-left absolute" />
        <div className="ship-engine-pod ship-engine-pod-right absolute" />
        <div className="ship-engine-glow absolute bottom-[1%] left-[35%] h-[8%] w-[30%] rounded-full" />
        <span className="ship-deck-label ship-deck-label-bow">BOW</span>
        <span className="ship-deck-label ship-deck-label-core">CORE</span>
        <span className="ship-deck-label ship-deck-label-stern">STERN</span>
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
          const diagnostic = operational ? roomJobDiagnostic(roomState, assigned, compact) : null;
          const badge = !operational
            ? { label: room.tag ?? "AUX", tone: "bg-slate-400/10 text-slate-300 border-slate-500/30" }
            : crisis
              ? { label: `${crisisConfig?.label ?? "위기"} ${crisis.severity}`, tone: "bg-red-400/25 text-red-50 border-red-300/60" }
              : roomConditionBadge(roomState) ?? buildRoomState(room.id, assigned.map((entry) => entry.member), assigned.map((entry) => entry.activity), roomState);
          const clickable = operational && Boolean(onRoomClick);
          const activateRoom = () => {
            if (clickable) onRoomClick(room.id);
          };
          return (
            <div
              key={room.id}
              title={roomTooltip(room, roomState, assigned)}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={activateRoom}
              onKeyDown={clickable ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  activateRoom();
                }
              } : undefined}
              className={`ship-room-zone absolute border p-2 ${operational ? "ship-room-operational" : "ship-room-aux"} ${clickable ? "cursor-pointer transition hover:brightness-110" : ""} ${crisis ? "animate-pulse border-red-300/70 bg-red-500/15 ring-2 ring-red-400/45" : `${room.tone} ${activeRooms.has(room.id) ? "ring-1 ring-blue-200/40" : ""} ${operational && !crisis && (roomState?.condition ?? 100) <= WEAR.dangerCondition ? "border-amber-400/60" : ""}`}`}
              style={{ left: `${room.left}%`, top: `${room.top}%`, width: `${room.width}%`, height: `${room.height}%` }}
            >
              <div className="ship-room-title flex items-center justify-between gap-1"><span className="truncate">{room.label}</span>{CrisisIcon ? <CrisisIcon size={compact ? 12 : 14} className="text-red-100" /> : <Icon size={compact ? 12 : 14} />}</div>
              {operational && !compact && <div className="ship-room-telemetry mt-1 flex flex-wrap gap-1"><span>상태 {Math.round(roomState?.condition ?? 0)}</span><span>부하 {Math.round(roomState?.load ?? 0)}</span></div>}
              {operational && showEquipment && <EquipmentBadges roomId={room.id} installed={installed} modulesById={modulesById} compact={compact} />}
              {operational && <span className="ship-room-tier absolute right-1 top-1">Lv{roomState?.tier ?? 1}</span>}
              {operational && !compact && <span className="ship-room-slots absolute bottom-1.5 right-1">{Math.round(modifiers?.slots ?? 1)}석</span>}
              {!crisis && diagnostic && <span className={`absolute left-1 top-7 max-w-[calc(100%-0.5rem)] truncate rounded border px-1.5 py-0.5 text-[9px] font-black ${diagnostic.tone}`}>{diagnostic.label}</span>}
              {badge && <span className={`absolute bottom-1.5 left-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${badge.tone}`}>{badge.label}</span>}
              {crisis && <span className="absolute right-1 top-6 rounded border border-red-300/45 bg-red-400/20 px-1 text-[9px] font-black text-red-50">{Math.round(crisis.progress ?? 0)}%</span>}
              {crisis ? <div className="absolute inset-x-1 bottom-0.5 h-0.5 overflow-hidden rounded bg-slate-950/60"><div className="h-full bg-red-300/80" style={{ width: `${crisis.progress ?? 0}%` }} /></div> : operational && roomState?.jobId && <div className="absolute inset-x-1 bottom-0.5 h-0.5 overflow-hidden rounded bg-slate-950/60"><div className="h-full bg-blue-300/70" style={{ width: `${roomState.progress}%` }} /></div>}
              {operational && !crisis && <RoomWearEffects condition={roomState?.condition ?? 100} />}
            </div>
          );
        })}
        <CrewLayer roomAssignments={roomAssignments} motionByCrewId={motionByCrewId} jobOwnerIds={jobOwnerIds} compact={compact} onCrewClick={onCrewClick} />
      </div>
      {!compact && roomDiagnostics.length > 0 && <div className="mt-3 grid gap-2 md:grid-cols-2">{roomDiagnostics.map(({ room, state, assigned, job, diagnostic }) => <div key={room.id} className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2"><div className="flex items-center justify-between gap-2"><div className="font-semibold text-slate-100">{room.label}</div><span className={`hud-chip shrink-0 ${state?.status === "위험" ? "hud-chip-danger" : state?.status === "점검 필요" ? "hud-chip-warn" : "hud-chip-accent"}`}>{state?.status ?? "미상"}</span></div><div className="mt-1 text-xs text-slate-400">{job?.label ?? "room-job"} · 상태 {Math.round(state?.condition ?? 0)} / 부하 {Math.round(state?.load ?? 0)} · {diagnostic?.label ?? "관찰 중"}</div><div className="mt-1 truncate text-[11px] text-blue-100">담당: {assignedNames(assigned).join(", ") || "아직 없음"}</div></div>)}</div>}
      {!compact && <CrewActivitySummary roomAssignments={roomAssignments} motionByCrewId={motionByCrewId} onCrewClick={onCrewClick} />}
    </section>
  );
}
