import { DISPLAY_ROOMS, ROOMS, ROUTES } from "./shipRooms";

export const ROLE_ROOM = { 함교: "bridge", 포탑: "ops", 기관실: "engineering", 의무실: "medbay" };

export const ROOM_ANCHORS = [
  { x: 0, y: 0 },
  { x: -5, y: -3 },
  { x: 5, y: 3 },
  { x: -4, y: 5 },
  { x: 4, y: -5 },
  { x: 0, y: 7 },
  { x: 7, y: 0 },
  { x: -7, y: 0 },
  { x: -8, y: 7 },
  { x: 8, y: -7 },
];

function stableIndex(text, length) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash % length;
}

export function roomForCrewActivity(member, activity) {
  if (activity?.roomId) return activity.roomId;
  const text = `${activity?.station ?? ""} ${activity?.action ?? ""}`;
  if (/브릿지|함교|항로|지휘/.test(text)) return "bridge";
  if (/관제|포탑|표적|센서|감시|외곽/.test(text)) return "ops";
  if (/의무|치료|응급|산소|피로/.test(text)) return "medbay";
  if (/기관|엔진|추진|수리|연료|선체|출력|냉각|전력/.test(text)) return "engineering";
  if (/창고|화물|보급|적재|장비/.test(text)) return "cargo";
  if (/생활|휴식|식사|대화|훈련/.test(text)) return "living";
  return ROLE_ROOM[member.role] ?? "living";
}

export function roomCenter(roomId) {
  const room = ROOMS.find((entry) => entry.id === roomId) ?? ROOMS[0];
  return { x: room.left + room.width / 2, y: room.top + room.height / 2 };
}

export function displayRoomCenter(roomId) {
  const room = DISPLAY_ROOMS.find((entry) => entry.id === roomId) ?? ROOMS[0];
  return { x: room.left + room.width / 2, y: room.top + room.height / 2 };
}

export function roomAnchorPoint(roomId, memberId, slotIndex = null) {
  const index = slotIndex === null || slotIndex === undefined ? stableIndex(memberId, ROOM_ANCHORS.length) : slotIndex % ROOM_ANCHORS.length;
  const offset = ROOM_ANCHORS[index];
  const center = roomCenter(roomId);
  return { x: center.x + offset.x, y: center.y + offset.y };
}

export function roomGraph() {
  const graph = new Map(ROOMS.map((room) => [room.id, []]));
  ROUTES.forEach(([from, to]) => {
    graph.get(from)?.push(to);
    graph.get(to)?.push(from);
  });
  return graph;
}

export function findRoomRoute(fromRoomId, toRoomId) {
  if (!fromRoomId || !toRoomId || fromRoomId === toRoomId) return [toRoomId].filter(Boolean);
  const graph = roomGraph();
  const queue = [[fromRoomId]];
  const visited = new Set([fromRoomId]);
  while (queue.length > 0) {
    const path = queue.shift();
    const last = path[path.length - 1];
    if (last === toRoomId) return path;
    (graph.get(last) ?? []).forEach((next) => {
      if (visited.has(next)) return;
      visited.add(next);
      queue.push([...path, next]);
    });
  }
  return [fromRoomId, toRoomId];
}

export function buildCrewWaypoints(fromRoomId, toRoomId, finalPoint) {
  const route = findRoomRoute(fromRoomId, toRoomId);
  if (route.length <= 1) return [finalPoint];
  const roomCenters = route.slice(1, -1).map(roomCenter);
  return [...roomCenters, finalPoint];
}
