import { Clock3, Cross, Cpu, Users, Wrench } from "lucide-react";
import { formatMinutes } from "../../data/moduleRecipes";
import { formatGameDate } from "../../systems/gameClock";
import { comparePriorityTasks, getNextPriority, getPriorityConfig, normalizePriority } from "../../systems/priorities";
import { useCrewStore } from "../../stores/crewStore";
import { useGameStore } from "../../stores/gameStore";
import { useShipStore } from "../../stores/shipStore";
import { statLabel } from "../../utils/format";

function clampProgress(task, currentMinute) {
  return Math.max(0, Math.min(100, Math.round(((currentMinute - task.startedAt) / Math.max(1, task.duration)) * 100)));
}

function remainingText(task, currentMinute) {
  return task.completeAt <= currentMinute ? "완료 대기" : `남은 ${formatMinutes(Math.ceil(task.completeAt - currentMinute))}`;
}

function TaskRow({ task, currentMinute, onNavigate, onCyclePriority }) {
  const progress = clampProgress(task, currentMinute);
  const Icon = task.icon;
  const priority = getPriorityConfig(task.priority);

  return (
    <div className={`rounded border p-3 text-left ${task.tone}`}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded border border-white/10 bg-slate-950/50">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-50">{task.title}</div>
              <div className="mt-0.5 text-xs text-slate-400">{task.subtitle}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="hud-chip">{task.kind}</span>
              <span className={`hud-chip ${priority.tone}`}>우선 {priority.shortLabel}</span>
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="hud-label">진행률</span>
              <span className="hud-value">{progress}%</span>
            </div>
            <div className="hud-gauge">
              <span className="hud-gauge-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <span className="hud-chip hud-chip-accent">{remainingText(task, currentMinute)}</span>
            <span className="hud-chip">완료 {formatGameDate(task.completeAt)}</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="secondary-button min-h-8 text-xs" onClick={() => onNavigate?.(task.targetPanel)}>관리 화면</button>
            <button className="secondary-button min-h-8 text-xs" onClick={() => onCyclePriority?.(task)}>우선순위 변경</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TaskQueuePanel({ onNavigate }) {
  const currentMinute = useGameStore((state) => state.currentMinute);
  const addLog = useGameStore((state) => state.addLog);
  const crew = useCrewStore((state) => state.crew);
  const trainingQueue = useCrewStore((state) => state.trainingQueue ?? []);
  const treatmentQueue = useCrewStore((state) => state.treatmentQueue ?? []);
  const setTrainingPriority = useCrewStore((state) => state.setTrainingPriority);
  const setTreatmentPriority = useCrewStore((state) => state.setTreatmentPriority);
  const modules = useShipStore((state) => state.modules);
  const installationQueue = useShipStore((state) => state.installationQueue ?? []);
  const setInstallationPriority = useShipStore((state) => state.setInstallationPriority);

  const crewById = new Map(crew.map((member) => [member.id, member]));
  const moduleById = new Map(modules.map((module) => [module.id, module]));

  const tasks = [
    ...trainingQueue.map((task) => {
      const member = crewById.get(task.memberId);
      return {
        ...task,
        priority: normalizePriority(task.priority),
        queueType: "training",
        kind: "훈련 중",
        title: member?.name ?? "승무원 훈련",
        subtitle: `${member?.role ?? "승무원"} · ${statLabel[task.statKey] ?? task.statKey} +1 예정`,
        icon: Users,
        tone: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
        targetPanel: "crew",
      };
    }),
    ...treatmentQueue.map((task) => {
      const member = crewById.get(task.memberId);
      return {
        ...task,
        priority: normalizePriority(task.priority),
        queueType: "treatment",
        kind: "치료 중",
        title: member?.name ?? "의무실 치료",
        subtitle: `${task.injury ?? member?.injury ?? "부상"} 치료 · 비용 ₢${task.cost ?? 0}`,
        icon: Cross,
        tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
        targetPanel: "crew",
      };
    }),
    ...installationQueue.map((task) => {
      const module = moduleById.get(task.moduleId);
      const isUpgrade = task.type === "upgrade";
      return {
        ...task,
        priority: normalizePriority(task.priority),
        queueType: "ship",
        kind: isUpgrade ? "개선 중" : "장착 중",
        title: module?.name ?? "함선 모듈 작업",
        subtitle: isUpgrade ? `Lv.${module?.level ?? 1} → Lv.${(module?.level ?? 1) + 1}` : `${task.slot} 슬롯 장착 예정`,
        icon: isUpgrade ? Cpu : Wrench,
        tone: isUpgrade ? "border-violet-400/30 bg-violet-400/10 text-violet-100" : "border-amber-400/30 bg-amber-400/10 text-amber-100",
        targetPanel: "ship",
      };
    }),
  ].sort(comparePriorityTasks);

  const onCyclePriority = (task) => {
    const nextPriority = getNextPriority(task.priority);
    if (task.queueType === "training") setTrainingPriority(task.id, nextPriority);
    if (task.queueType === "treatment") setTreatmentPriority(task.id, nextPriority);
    if (task.queueType === "ship") setInstallationPriority(task.id, nextPriority);
    addLog(`${task.title} 작업 우선순위 변경: ${getPriorityConfig(nextPriority).label}.`);
  };

  const visibleTasks = tasks.slice(0, 5);
  const topPriority = tasks[0] ? getPriorityConfig(tasks[0].priority).label : "없음";

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div className="section-title"><Clock3 size={18} />진행 중 작업 큐</div>
        <div className="flex gap-1.5">
          <span className={`hud-chip ${tasks.length > 0 ? "hud-chip-accent" : ""}`}>{tasks.length}건</span>
          {tasks.length > 0 && <span className="hud-chip hud-chip-warn">최우선 {topPriority}</span>}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="mt-3 rounded border border-slate-700/70 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">
          현재 진행 중인 훈련, 치료, 장착, 개선 작업이 없습니다. 승무원/함선 메뉴에서 새 작업을 예약하면 이곳에 표시됩니다.
        </div>
      ) : (
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {visibleTasks.map((task) => <TaskRow key={task.id} task={task} currentMinute={currentMinute} onNavigate={onNavigate} onCyclePriority={onCyclePriority} />)}
          {tasks.length > visibleTasks.length && (
            <button className="secondary-button h-full min-h-20" onClick={() => onNavigate?.("crew")}>+{tasks.length - visibleTasks.length}개 추가 작업 보기</button>
          )}
        </div>
      )}
    </section>
  );
}
