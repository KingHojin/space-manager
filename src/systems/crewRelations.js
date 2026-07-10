// Phase 21-C: pure relationship helpers.
// Relationships are stored as pair-keyed affinity values and are updated from
// structured crew activities, not from log text.

const RELATION_MIN = -100;
const RELATION_MAX = 100;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function pairKey(a, b) {
  return [a, b].filter(Boolean).sort().join("::");
}

export function relationshipBand(affinity = 0) {
  if (affinity >= 35) return "close";
  if (affinity <= -35) return "friction";
  return "neutral";
}

export function normalizeRelationships(relationships = {}) {
  return Object.fromEntries(
    Object.entries(relationships ?? {})
      .map(([key, value]) => {
        const crewIds = Array.isArray(value?.crewIds) ? value.crewIds.filter(Boolean).slice(0, 2).sort() : key.split("::").filter(Boolean).slice(0, 2).sort();
        if (crewIds.length !== 2) return null;
        const normalizedKey = pairKey(crewIds[0], crewIds[1]);
        const affinity = clamp(Number.isFinite(Number(value?.affinity)) ? Number(value.affinity) : 0, RELATION_MIN, RELATION_MAX);
        return [normalizedKey, { crewIds, affinity, band: relationshipBand(affinity), lastSeenAt: value?.lastSeenAt ?? null }];
      })
      .filter(Boolean),
  );
}

export function getRelationshipWorkMultiplier(memberId, peerIds = [], relationships = {}) {
  const normalized = normalizeRelationships(relationships);
  const bands = peerIds
    .filter((peerId) => peerId && peerId !== memberId)
    .map((peerId) => normalized[pairKey(memberId, peerId)]?.band ?? "neutral");
  if (bands.includes("friction")) return 0.9;
  if (bands.includes("close")) return 1.04;
  return 1;
}

function groupedByRoom(activities = []) {
  const groups = new Map();
  activities.forEach((activity) => {
    if (!activity?.memberId || !activity.roomId) return;
    const roomIds = groups.get(activity.roomId) ?? [];
    roomIds.push(activity.memberId);
    groups.set(activity.roomId, roomIds);
  });
  return groups;
}

function relationDeltaForRoom(roomId) {
  if (roomId === "galley" || roomId === "living") return 2;
  return 1;
}

export function updateRelationshipsFromActivities({ relationships = {}, activities = [], crew = [], currentMinute = 0 } = {}) {
  const next = normalizeRelationships(relationships);
  const livingCrewIds = new Set(crew.filter((member) => member.alive !== false).map((member) => member.id));
  groupedByRoom(activities).forEach((memberIds, roomId) => {
    const unique = [...new Set(memberIds)].filter((id) => livingCrewIds.has(id)).sort();
    if (unique.length < 2) return;
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        const key = pairKey(unique[i], unique[j]);
        const current = next[key] ?? { crewIds: [unique[i], unique[j]], affinity: 0, lastSeenAt: null };
        const affinity = clamp((current.affinity ?? 0) + relationDeltaForRoom(roomId), RELATION_MIN, RELATION_MAX);
        next[key] = { crewIds: current.crewIds, affinity, band: relationshipBand(affinity), lastSeenAt: currentMinute };
      }
    }
  });
  return next;
}
