import { ENCOUNTER_TABLE, NODE_TYPE_ICONS, NODE_TYPE_LABELS, normalizeNodeType } from "../data/navEncounters";

const NODE_TYPES = ["station", "nebula", "debris", "distress", "unknown", "debris", "unknown", "exit"];
const NAME_PARTS = ["앵커", "청색", "마레", "이온", "코퍼", "무음", "장막", "유리", "엄브라", "아크", "코로스", "에오스"];
const NAME_SUFFIX = ["정거장", "표류대", "잔해", "암초", "달", "궤도", "관문", "등대", "회랑", "전초지", "파편장", "항로"];

function hashSeed(seed) {
  return String(seed ?? "phase-8").split("").reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
}

function createRng(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function distance(a, b) {
  const dx = (a.x ?? a.pos?.x ?? 0) - (b.x ?? b.pos?.x ?? 0);
  const dy = (a.y ?? a.pos?.y ?? 0) - (b.y ?? b.pos?.y ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function edgeId(a, b) {
  return [a, b].sort().join("--");
}

function buildConnections(nodes, rng) {
  const edges = new Map();
  for (let i = 0; i < nodes.length - 1; i += 1) {
    edges.set(edgeId(nodes[i].id, nodes[i + 1].id), { from: nodes[i].id, to: nodes[i + 1].id, distance: distance(nodes[i], nodes[i + 1]) });
  }

  nodes.forEach((node) => {
    const nearest = nodes
      .filter((other) => other.id !== node.id)
      .map((other) => ({ other, d: distance(node, other) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2 + Math.floor(rng() * 2));
    nearest.forEach(({ other, d }) => {
      if (rng() < 0.72) edges.set(edgeId(node.id, other.id), { from: node.id, to: other.id, distance: d });
    });
  });

  return [...edges.values()];
}

function hydrateNodeConnections(nodes, edges) {
  const connectionMap = new Map(nodes.map((node) => [node.id, new Set()]));
  edges.forEach((edge) => {
    connectionMap.get(edge.from)?.add(edge.to);
    connectionMap.get(edge.to)?.add(edge.from);
  });
  return nodes.map((node) => ({ ...node, connections: [...(connectionMap.get(node.id) ?? [])] }));
}

export function assertConnected(nodes, edges, startId) {
  const graph = new Map(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => {
    graph.get(edge.from)?.push(edge.to);
    graph.get(edge.to)?.push(edge.from);
  });
  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const id = queue.shift();
    (graph.get(id) ?? []).forEach((next) => {
      if (seen.has(next)) return;
      seen.add(next);
      queue.push(next);
    });
  }
  return seen.size === nodes.length;
}

export function generateSector(seed = "helios-rim", nodeCount = 10) {
  const rng = createRng(seed);
  const safeCount = Math.max(7, Math.min(14, nodeCount));
  let nodes = Array.from({ length: safeCount }).map((_, index) => {
    const type = index === 0 ? "station" : index === safeCount - 1 ? "exit" : NODE_TYPES[index % NODE_TYPES.length];
    const angle = (Math.PI * 2 * index) / safeCount + rng() * 0.55;
    const radius = index === 0 ? 8 : 18 + index * 5 + rng() * 8;
    const x = Math.round(50 + Math.cos(angle) * radius);
    const y = Math.round(50 + Math.sin(angle) * radius);
    return {
      id: `nav-${seed}-${index}`.replace(/[^a-zA-Z0-9-_]/g, "-"),
      type,
      name: index === 0 ? "앵커 정거장" : index === safeCount - 1 ? "섹터 관문" : `${pick(rng, NAME_PARTS)} ${pick(rng, NAME_SUFFIX)}`,
      x: Math.max(6, Math.min(94, x)),
      y: Math.max(6, Math.min(94, y)),
      pos: { x: Math.max(6, Math.min(94, x)), y: Math.max(6, Math.min(94, y)) },
      danger: type === "station" ? 1 : type === "exit" ? 4 : 1 + Math.floor(rng() * 5),
      richness: type === "station" ? 1 : 1 + Math.floor(rng() * 5),
      distance: index,
      visited: index === 0,
      discovered: index <= 2,
      encounterSeed: `${seed}-${index}-${Math.floor(rng() * 10000)}`,
    };
  });

  let edges = buildConnections(nodes, rng);
  nodes = hydrateNodeConnections(nodes, edges);
  if (!assertConnected(nodes, edges, nodes[0].id)) {
    edges = nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id, distance: distance(nodes[index], node) }));
    nodes = hydrateNodeConnections(nodes, edges);
  }

  return { id: `sector-${seed}`, name: `개척 섹터 ${String(seed).slice(-4)}`, seed, nodes, edges };
}

export function sectorFromLegacyZones(zones = [], seed = "legacy") {
  const nodes = zones.map((zone, index) => ({
    ...zone,
    type: normalizeNodeType(zone.type),
    x: zone.pos?.x ?? zone.x ?? 50,
    y: zone.pos?.y ?? zone.y ?? 50,
    visited: index === 0 || Boolean(zone.visited),
    discovered: Boolean(zone.discovered) || index < 2,
    connections: [],
    encounterSeed: `${seed}-${zone.id}`,
  }));
  const rng = createRng(seed);
  const edges = buildConnections(nodes, rng);
  return { id: `sector-${seed}`, name: "헬리오스 외연", seed, nodes: hydrateNodeConnections(nodes, edges), edges };
}

export function findRoute(sector, fromId, targetId) {
  if (!sector || fromId === targetId) return [fromId].filter(Boolean);
  const graph = new Map((sector.nodes ?? []).map((node) => [node.id, []]));
  (sector.edges ?? []).forEach((edge) => {
    graph.get(edge.from)?.push({ id: edge.to, cost: edge.distance ?? 1 });
    graph.get(edge.to)?.push({ id: edge.from, cost: edge.distance ?? 1 });
  });

  const dist = new Map([[fromId, 0]]);
  const prev = new Map();
  const open = new Set([fromId]);
  while (open.size > 0) {
    const current = [...open].sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity))[0];
    open.delete(current);
    if (current === targetId) break;
    (graph.get(current) ?? []).forEach((next) => {
      const cost = (dist.get(current) ?? Infinity) + next.cost;
      if (cost < (dist.get(next.id) ?? Infinity)) {
        dist.set(next.id, cost);
        prev.set(next.id, current);
        open.add(next.id);
      }
    });
  }

  if (!dist.has(targetId)) return [];
  const route = [targetId];
  let cursor = targetId;
  while (prev.has(cursor)) {
    cursor = prev.get(cursor);
    route.unshift(cursor);
  }
  return route;
}

export function routeDistance(sector, route = []) {
  if (!sector || route.length < 2) return 0;
  const edgeMap = new Map((sector.edges ?? []).flatMap((edge) => [[edgeId(edge.from, edge.to), edge.distance ?? 1]]));
  return route.slice(1).reduce((sum, nodeId, index) => sum + (edgeMap.get(edgeId(route[index], nodeId)) ?? 1), 0);
}

export function rollEncounter(node, seedOffset = 0) {
  if (!node) return null;
  const pool = ENCOUNTER_TABLE[node.type] ?? ENCOUNTER_TABLE.unknown;
  const rng = createRng(`${node.encounterSeed}-${seedOffset}`);
  const template = pick(rng, pool);
  return { ...template, nodeId: node.id, nodeType: node.type, icon: NODE_TYPE_ICONS[node.type], typeLabel: NODE_TYPE_LABELS[node.type] };
}

export function nodeToZone(node) {
  return {
    ...node,
    pos: node.pos ?? { x: node.x, y: node.y },
    type: node.type,
    distance: node.distance ?? 0,
  };
}
