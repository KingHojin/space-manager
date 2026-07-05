import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DRIFT } from "../data/constants";
import { generateSector, findRoute, rollEncounter, routeDistance } from "../systems/navigationSystem";

const TRAVEL_MINUTES_PER_DISTANCE = 11;
const FUEL_PER_DISTANCE = 1.15;
const DISCOVERY_RADIUS_STEPS = 1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function firstNodeId(sector) {
  return sector?.nodes?.[0]?.id ?? null;
}

function normalizeSector(sector) {
  if (sector?.nodes?.length) return sector;
  return generateSector("phase-8-start");
}

function revealNeighbors(sector, discoveredIds, nodeId) {
  const discovered = new Set(discoveredIds);
  discovered.add(nodeId);
  let frontier = [nodeId];
  for (let depth = 0; depth < DISCOVERY_RADIUS_STEPS; depth += 1) {
    const nextFrontier = [];
    frontier.forEach((id) => {
      const node = sector.nodes.find((entry) => entry.id === id);
      (node?.connections ?? []).forEach((connectedId) => {
        if (!discovered.has(connectedId)) nextFrontier.push(connectedId);
        discovered.add(connectedId);
      });
    });
    frontier = nextFrontier;
  }
  return [...discovered];
}

function withNodeFlags(sector, visitedIds, discoveredIds) {
  const visited = new Set(visitedIds);
  const discovered = new Set(discoveredIds);
  return { ...sector, nodes: sector.nodes.map((node) => ({ ...node, visited: visited.has(node.id), discovered: discovered.has(node.id) })) };
}

function nextSeed(seed, index) {
  return `${seed ?? "sector"}-${index + 1}`;
}

function createDriftState(currentMinute, reason = "fuel_empty") {
  return { reason, startedAt: currentMinute, lastTickAt: currentMinute, rescueEta: currentMinute + DRIFT.RESCUE_CHECK_MINUTES, severity: 1, pressure: 0 };
}

function driftSeverity(minutesDrifting) {
  if (minutesDrifting >= 720) return 4;
  if (minutesDrifting >= 360) return 3;
  if (minutesDrifting >= 120) return 2;
  return 1;
}

function buildTravelPlan(state, targetNodeId, currentMinute = 0, metadata = {}) {
  if (state.pendingEncounter) return { ok: false, reason: "pendingEncounter" };
  if (state.travel) return { ok: false, reason: "traveling" };
  if (state.driftState || state.fuel <= 0) return { ok: false, reason: "drifting" };
  const route = findRoute(state.sector, state.currentNodeId, targetNodeId);
  if (route.length < 2) return { ok: false, reason: "noRoute" };
  const distance = routeDistance(state.sector, route);
  const fuelCost = Math.max(2, distance * FUEL_PER_DISTANCE);
  const duration = Math.max(18, Math.round(distance * TRAVEL_MINUTES_PER_DISTANCE));
  const travel = {
    fromId: route[0],
    toId: route[1],
    targetId: targetNodeId,
    route,
    progress: 0,
    etaMinutes: duration,
    duration,
    fuelCost,
    startedAt: currentMinute,
    completeAt: currentMinute + duration,
    lastFuelAt: currentMinute,
    missionId: metadata.missionId ?? null,
    missionTitle: metadata.missionTitle ?? null,
    missionDestinationName: metadata.missionDestinationName ?? null,
  };
  return { ok: true, route, distance, fuelCost, duration, travel };
}

export const useNavStore = create(
  persist(
    (set, get) => {
      const initialSector = generateSector("phase-8-start");
      const startId = firstNodeId(initialSector);
      return {
        sector: withNodeFlags(initialSector, [startId], revealNeighbors(initialSector, [startId], startId)),
        sectorIndex: 0,
        currentNodeId: startId,
        selectedNodeId: null,
        route: [startId],
        travel: null,
        fuel: 100,
        discovered: revealNeighbors(initialSector, [startId], startId),
        visited: [startId],
        pendingEncounter: null,
        driftState: null,
        recruitCandidates: [],
        navLog: ["항해 컴퓨터 초기화: 노드 기반 성계 지도가 활성화되었습니다."],
        selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
        generateSector: (seed = Date.now()) => {
          const sector = generateSector(seed);
          const start = firstNodeId(sector);
          const discovered = revealNeighbors(sector, [start], start);
          set({ sector: withNodeFlags(sector, [start], discovered), sectorIndex: 0, currentNodeId: start, selectedNodeId: null, route: [start], travel: null, fuel: 100, discovered, visited: [start], pendingEncounter: null, driftState: null, navLog: ["새 섹터 지도가 생성되었습니다."] });
        },
        previewRoute: (targetNodeId, currentMinute = 0) => buildTravelPlan(get(), targetNodeId, currentMinute),
        planRoute: (targetNodeId, currentMinute = 0, metadata = {}) => {
          const state = get();
          const plan = buildTravelPlan(state, targetNodeId, currentMinute, metadata);
          if (!plan.ok) return plan;
          const missionPrefix = plan.travel.missionTitle ? `임무 항로 결재: ${plan.travel.missionTitle} · ` : "항로 결재: ";
          set({ route: plan.route, selectedNodeId: targetNodeId, travel: plan.travel, navLog: [`${missionPrefix}${plan.route[0]} → ${targetNodeId} · ${Math.round(plan.distance)}u`, ...state.navLog].slice(0, 10) });
          return { ok: true, travel: plan.travel, route: plan.route, distance: plan.distance };
        },
        enterDrift: (currentMinute = 0, reason = "fuel_empty") => {
          const state = get();
          const driftState = state.driftState ?? createDriftState(currentMinute, reason);
          set({ driftState, travel: null, fuel: 0, navLog: ["연료 고갈: 함선이 표류 상태에 들어갔습니다.", ...state.navLog].slice(0, 10) });
          return { effects: [{ kind: "log", message: "연료 고갈로 표류 상태가 되었습니다. 이동이 중단되고 승무원 생활 압박이 증가합니다." }], logs: ["연료 고갈로 표류 상태가 되었습니다."] };
        },
        tickTravel: (deltaMinutes = 0, currentMinute = 0) => {
          if (deltaMinutes <= 0) return { effects: [], logs: [] };
          const state = get();
          if (state.driftState) return { effects: [], logs: [] };
          if (!state.travel || state.pendingEncounter) return { effects: [], logs: [] };
          if (state.fuel <= 0) return get().enterDrift(currentMinute, "fuel_empty");
          const elapsed = Math.max(0, currentMinute - state.travel.startedAt);
          const progress = clamp((elapsed / Math.max(1, state.travel.duration)) * 100, 0, 100);
          const fuelBurn = (state.travel.fuelCost / Math.max(1, state.travel.duration)) * deltaMinutes;
          const fuel = clamp(state.fuel - fuelBurn, 0, 100);
          if (fuel <= 0 && progress < 100) {
            set({ fuel: 0 });
            return get().enterDrift(currentMinute, "fuel_depleted_mid_route");
          }
          if (progress < 100) {
            set({ travel: { ...state.travel, progress, lastFuelAt: currentMinute }, fuel });
            return { effects: [], logs: [] };
          }
          const arrival = get().arriveNode(state.travel.toId, currentMinute, fuel);
          return { effects: [...(arrival.effects ?? [])], logs: arrival.logs ?? [] };
        },
        tickDrift: (deltaMinutes = 0, currentMinute = 0) => {
          const state = get();
          if (!state.driftState || deltaMinutes <= 0) return { effects: [], logs: [] };
          const minutesDrifting = Math.max(0, currentMinute - state.driftState.startedAt);
          const severity = driftSeverity(minutesDrifting);
          const hours = deltaMinutes / 60;
          const pressure = clamp((state.driftState.pressure ?? 0) + hours * severity * 4, 0, 100);
          const effects = [{ kind: "driftPressure", severity, deltaMinutes, minutesDrifting }, { kind: "crewNeeds", mode: "drift", severity, deltaMinutes }, { kind: "resource", delta: { oxygen: -DRIFT.OXYGEN_LOSS_PER_HOUR * hours * severity, hull: -DRIFT.HULL_LOSS_PER_HOUR * hours * severity } }];
          const logs = [];
          if (severity !== state.driftState.severity) logs.push(`표류 단계 상승: severity ${severity}. 승무원 스트레스와 고립감이 증가합니다.`);
          if (Math.random() < DRIFT.CRISIS_ROLL_PER_HOUR * hours * severity) effects.push({ kind: "spawnCrisis", roomId: "engineering", type: "power_loss", severity: Math.min(3, severity) });
          set({ driftState: { ...state.driftState, lastTickAt: currentMinute, severity, pressure } });
          return { effects, logs };
        },
        arriveNode: (nodeId, currentMinute = 0, forcedFuel = null) => {
          const state = get();
          const node = state.sector.nodes.find((entry) => entry.id === nodeId);
          if (!node) return { effects: [], logs: [] };
          const visited = Array.from(new Set([...state.visited, nodeId]));
          const discovered = revealNeighbors(state.sector, state.discovered, nodeId);
          const remainingRoute = (state.travel?.route ?? []).slice(1);
          const sector = withNodeFlags(state.sector, visited, discovered);
          const encounter = rollEncounter({ ...node, discovered: true, visited: true }, visited.length);
          const missionArrival = state.travel?.missionId && state.travel.targetId === nodeId;
          const logs = missionArrival ? [`임무 목적지 도착: ${state.travel.missionTitle ?? "계약 임무"} · ${node.name}. 조우 결재 후 임무 처리가 가능합니다.`] : [`노드 도착: ${node.name}. 결재 대기 조우가 발생했습니다.`];
          set({ sector, currentNodeId: nodeId, selectedNodeId: null, route: remainingRoute.length > 0 ? remainingRoute : [nodeId], travel: null, fuel: forcedFuel ?? state.fuel, discovered, visited, pendingEncounter: encounter, navLog: [...logs, ...state.navLog].slice(0, 10) });
          return { effects: [{ kind: "log", message: logs[0] }], logs };
        },
        resolveEncounter: (optionId) => {
          const state = get();
          const encounter = state.pendingEncounter;
          if (!encounter) return { effects: [], logs: [] };
          const option = encounter.options.find((entry) => entry.id === optionId) ?? encounter.options[0];
          const effects = option?.outcome ?? [];
          const logs = [`조우 결재: ${encounter.title} · ${option?.label ?? "선택"}`];
          let nextSectorState = {};
          if (effects.some((effect) => effect.kind === "nextSector")) {
            const seed = nextSeed(state.sector.seed, state.sectorIndex);
            const sector = generateSector(seed);
            const start = firstNodeId(sector);
            const discovered = revealNeighbors(sector, [start], start);
            nextSectorState = { sector: withNodeFlags(sector, [start], discovered), sectorIndex: state.sectorIndex + 1, currentNodeId: start, selectedNodeId: null, route: [start], travel: null, discovered, visited: [start], driftState: null };
          }
          set({ pendingEncounter: null, ...nextSectorState, navLog: [...logs, ...state.navLog].slice(0, 10) });
          return { effects, logs };
        },
        refuel: (amount = 100) => set((state) => ({ fuel: clamp(state.fuel + amount, 0, 100), driftState: state.fuel + amount > 0 ? null : state.driftState, navLog: state.fuel + amount > 0 && state.driftState ? ["긴급 보급 성공: 표류 상태 해제.", ...state.navLog].slice(0, 10) : state.navLog })),
        addRecruitCandidate: (templateId) => set((state) => ({ recruitCandidates: Array.from(new Set([...(state.recruitCandidates ?? []), templateId])) })),
        getNavCard: () => {
          const state = get();
          if (state.pendingEncounter) return { mode: "encounter", priority: "critical", title: state.pendingEncounter.title, desc: state.pendingEncounter.description, meta: state.pendingEncounter.typeLabel };
          if (state.travel) return { mode: "travel", priority: "medium", title: state.travel.missionTitle ? "임무 항해 중" : "항해 진행 중", desc: state.travel.missionTitle ? `${state.travel.missionTitle} · ${state.travel.fromId} → ${state.travel.toId}` : `${state.travel.fromId} → ${state.travel.toId}`, meta: `${Math.round(state.travel.progress ?? 0)}%` };
          if (state.driftState) return { mode: "drift", priority: "critical", title: "표류 상태", desc: `연료가 없어 이동할 수 없습니다. 압박 ${Math.round(state.driftState.pressure ?? 0)}%`, meta: `severity ${state.driftState.severity ?? 1}` };
          const current = state.sector.nodes.find((node) => node.id === state.currentNodeId);
          const next = (current?.connections ?? []).map((id) => state.sector.nodes.find((node) => node.id === id)).filter(Boolean)[0];
          return { mode: "idle", priority: "medium", title: "다음 목적지 선택", desc: next ? `${next.name} 항로 결재 가능` : "연결 노드를 찾을 수 없습니다.", meta: `${Math.round(state.fuel)} fuel` };
        },
      };
    },
    {
      name: "space-manager-nav",
      merge: (persistedState, currentState) => {
        const sector = normalizeSector(persistedState?.sector ?? currentState.sector);
        const currentNodeId = persistedState?.currentNodeId ?? firstNodeId(sector);
        const discovered = persistedState?.discovered ?? revealNeighbors(sector, [currentNodeId], currentNodeId);
        const visited = persistedState?.visited ?? [currentNodeId];
        return { ...currentState, ...(persistedState ?? {}), sector: withNodeFlags(sector, visited, discovered), currentNodeId, discovered, visited, route: persistedState?.route ?? [currentNodeId], travel: persistedState?.travel ?? null, fuel: clamp(persistedState?.fuel ?? 100, 0, 100), pendingEncounter: persistedState?.pendingEncounter ?? null, driftState: persistedState?.driftState ?? null, recruitCandidates: persistedState?.recruitCandidates ?? [], navLog: persistedState?.navLog ?? currentState.navLog };
      },
    },
  ),
);
