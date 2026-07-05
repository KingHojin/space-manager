import { Activity, Package, Radar, Utensils, Wrench } from "lucide-react";
import { getPriorityConfig } from "../../systems/priorities";

const ROOMS = [
  { id: "bridge", label: "브릿지", icon: Radar, left: 38, top: 8, width: 24, height: 18, tone: "border-cyan-300/40 bg-cyan-300/10" },
  { id: "ops", label: "관제실", icon: Radar, left: 12, top: 33, width: 25, height: 22, tone: "border-sky-300/35 bg-sky-300/10" },
  { id: "medbay", label: "의무실", icon: Activity, left: 63, top: 33, width: 25, height: 22, tone: "border-emerald-300/35 bg-emerald-300/10" },
  { id: "living", label: "생활구역", icon: Utensils, left: 12, top: 61, width: 25, height: 24, tone: "border-indigo-300/35 bg-indigo-300/10" },
  { id: "engineering", label: "기관실", icon: Wrench, left: 38, top: 61, width: 24, height: 24, tone: "border-amber-300/35 bg-amber-300/10" },
  { id: "cargo", label: "창고", icon: Package, left: 63, top: 61, width: 25, height: 24, tone: "border-violet-300/35 bg-violet-300/10" },
];

const ROUTES = [
  ["bridge", "ops"],
  ["bridge", "medbay"],
  ["ops", "living"],
  ["medbay", "cargo"],
  ["living", "engineering"],
  ["engineering", "cargo"],
  ["bridge", "engineering"],
];

const ROLE_ROOM = { 함교: "bridge", 포탑: "ops", 기관실: "engineering", 의무실: "medbay" };
const OFFSETS = [[0, 0], [-5, -3], [5, 3], [-4, 5], [4, -5], [0, 7], [7, 0], [-7, 0]];

function stableIndex(text, length) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash % length;
}

function roomFor(member, activity) {
  const text = `${activity?.station ?? ""} ${activity?.action ?? ""}`;
  if (/브릿지|함교|항로|지휘/.test(text)) return "bridge";
  if (/관제|포탑|표적|센서|감시/.test(text)) return "ops";
  if (/의무|치료|응급|산소|피로/.test(text)) return "medbay";
  if (/기관|엔진|추진|수리|연료|선체|출력/.test(text)) return "engineering";
  if (/창고|화물|보급|적재|장비/.test(text)) return "cargo";
  if (/생활|휴식|식사|대화|훈련/.test(text)) return "living";
  return ROLE_ROOM[member.role] ?? "living";
}

function roomCenter(roomId) {
  const room = ROOMS.find((entry) => entry.id === roomId) ?? ROOMS[0];
  return { x: room.left + room.width / 2, y: room.top + room.height / 2 };
}

function roomPoint(roomId, memberId) {
  const [offsetX, offsetY] = OFFSETS[stableIndex(memberId, OFFSETS.length)];
  const center = roomCenter(roomId);
  return { x: center.x + offsetX, y: center.y + offsetY };
}

function markerTone(priority) {
  if (priority === "emergency") return "border-red-300 bg-red-300 text-red-950";
  if (priority === "high") return "border-amber-200 bg-amber-200 text-amber-950";
  if (priority === "low") return "border-slate-300 bg-slate-300 text-slate-950";
  return "border-cyan-200 bg-cyan-200 text-cyan-950";
}

function buildRoomState(roomId, roomMembers, roomActivities) {
  const highPriorityCount = roomActivities.filter((activity) => ["emergency", "high"].includes(activity?.priority)).length;
  if (highPriorityCount > 0) return { label: `중요 ${highPriorityCount}`, tone: "bg-amber-300/20 text-amber-100 border-amber-300/30" };
  if (roomMembers.length > 1) return { label: `근무 ${roomMembers.length}`, tone: "bg-cyan-300/15 text-cyan-100 border-cyan-300/30" };
  if (roomId === "engineering" && roomMembers.length === 0) return { label: "대기", tone: "bg-slate-400/10 text-slate-300 border-slate-500/30" };
  return null;
}

function RouteLine({ from, to, active }) {
  const start = roomCenter(from);
  const end = roomCenter(to);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const width = Math.hypot(end.x - start.x, end.y - start.y);
  const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  return <span className={`absolute h-[2px] origin-center rounded-full ${active ? "bg-cyan-200/50" : "bg-cyan-300/12"}`} style={{ left: `${midX - width / 2}%`, top: `${midY}%`, width: `${width}%`, transform: `rotate(${angle}deg)` }} />;
}

export default function ShipInterior({ crew = [], activities = [], compact = false, onCrewClick }) {
  const activityByMember = new Map(activities.map((activity) => [activity.memberId, activity]));
  const aliveCrew = crew.filter((member) => member.alive);
  const roomAssignments = aliveCrew.map((member) => ({ member, activity: activityByMember.get(member.id), roomId: roomFor(member, activityByMember.get(member.id)) }));
  const activeRooms = new Set(roomAssignments.map((assignment) => assignment.roomId));

  return (
    <section className="overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="section-title"><Activity size={18} />함선 내부</div>
        <div className="flex flex-wrap justify-end gap-1.5"><span className="hud-chip hud-chip-accent">실시간 이동</span><span className="hud-chip">승무원 {aliveCrew.length}</span></div>
      </div>
      <div className={`relative mt-4 overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/80 ${compact ? "h-[240px]" : "h-[420px]"}`}>
        <div className="absolute inset-x-[8%] top-[6%] h-[90%] rounded-[42%] border border-cyan-300/20 bg-gradient-to-b from-slate-900/80 to-slate-950/90" />
        {ROUTES.map(([from, to]) => <RouteLine key={`${from}-${to}`} from={from} to={to} active={activeRooms.has(from) && activeRooms.has(to)} />)}
        <div className="absolute left-[49%] top-[18%] h-[58%] w-[2px] bg-cyan-300/10" />
        <div className="absolute left-[22%] top-[50%] h-[2px] w-[56%] bg-cyan-300/10" />
        <div className="absolute left-[22%] top-[66%] h-[2px] w-[56%] bg-cyan-300/10" />
        {ROOMS.map((room) => {
          const Icon = room.icon;
          const assigned = roomAssignments.filter((entry) => entry.roomId === room.id);
          const state = buildRoomState(room.id, assigned.map((entry) => entry.member), assigned.map((entry) => entry.activity));
          return (
            <div key={room.id} className={`absolute rounded-xl border p-2 ${room.tone} ${activeRooms.has(room.id) ? "ring-1 ring-cyan-200/40" : ""}`} style={{ left: `${room.left}%`, top: `${room.top}%`, width: `${room.width}%`, height: `${room.height}%` }}>
              <div className="flex items-center justify-between gap-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-300"><span className="truncate">{room.label}</span><Icon size={compact ? 12 : 14} /></div>
              {state && <span className={`absolute bottom-1 left-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${state.tone}`}>{state.label}</span>}
            </div>
          );
        })}
        {roomAssignments.map(({ member, activity, roomId }) => {
          const point = roomPoint(roomId, member.id);
          const priority = getPriorityConfig(activity?.priority ?? "normal");
          return (
            <button key={member.id} className="absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-in-out" style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={() => onCrewClick?.(member)} title={`${member.name} · ${activity?.station ?? "대기"} · ${activity?.action ?? "대기"}`}>
              <span className={`relative grid h-7 w-7 place-items-center rounded-full border text-[11px] font-black shadow-lg ${markerTone(activity?.priority)}`}>{member.name.slice(0, 1)}<span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-slate-950 ${activity?.priority === "emergency" ? "animate-pulse bg-red-400" : activity?.priority === "high" ? "bg-amber-300" : "bg-emerald-300"}`} /></span>
              {!compact && <span className="mt-1 block max-w-24 truncate rounded border border-slate-700/80 bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-100">{member.name} · {priority.shortLabel}</span>}
            </button>
          );
        })}
      </div>
      {!compact && <div className="mt-3 grid gap-2 md:grid-cols-2">{roomAssignments.slice(0, 6).map(({ member, activity }) => { const priority = getPriorityConfig(activity?.priority ?? "normal"); return <button key={member.id} className="flex items-center justify-between gap-3 rounded border border-slate-700/70 bg-slate-950/60 px-3 py-2 text-left" onClick={() => onCrewClick?.(member)}><div className="min-w-0"><div className="truncate font-semibold text-slate-100">{member.name}</div><div className="mt-0.5 truncate text-xs text-slate-400">{activity?.station ?? "대기"} · {activity?.action ?? "대기"}</div></div><span className={`hud-chip shrink-0 ${priority.tone}`}>{priority.shortLabel}</span></button>; })}</div>}
    </section>
  );
}
