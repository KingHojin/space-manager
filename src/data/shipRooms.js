import { Activity, ChefHat, Eye, FlaskConical, Leaf, Package, Radar, Radio, Shield, Utensils, Wrench } from "lucide-react";

// Percentage coordinates are shared by the visual deck, crew anchors, and route
// waypoints. Room ids and graph semantics are intentionally unchanged.
export const ROOMS = [
  { id: "bridge", label: "브릿지", icon: Radar, left: 40, top: 5, width: 20, height: 15, tone: "border-cyan-300/45 bg-cyan-300/10" },
  { id: "ops", label: "관제실", icon: Radar, left: 20, top: 27, width: 24, height: 16, tone: "border-sky-300/35 bg-sky-300/10" },
  { id: "medbay", label: "의무실", icon: Activity, left: 56, top: 27, width: 24, height: 16, tone: "border-emerald-300/35 bg-emerald-300/10" },
  { id: "living", label: "생활구역", icon: Utensils, left: 18, top: 49, width: 24, height: 16, tone: "border-indigo-300/35 bg-indigo-300/10" },
  { id: "galley", label: "식당/조리실", icon: ChefHat, left: 44, top: 49, width: 20, height: 16, tone: "border-orange-300/35 bg-orange-300/10" },
  { id: "engineering", label: "기관실", icon: Wrench, left: 38, top: 71, width: 24, height: 17, tone: "border-amber-300/35 bg-amber-300/10" },
  { id: "cargo", label: "창고", icon: Package, left: 64, top: 71, width: 20, height: 17, tone: "border-violet-300/35 bg-violet-300/10" },
];

export const AUX_ZONES = [
  { id: "armory", label: "무기고", icon: Shield, left: 7, top: 29, width: 10, height: 14, tone: "border-red-300/30 bg-red-300/10", decorative: true, tag: "AUX" },
  { id: "lab", label: "연구실", icon: FlaskConical, left: 45, top: 25, width: 10, height: 12, tone: "border-fuchsia-300/30 bg-fuchsia-300/10", decorative: true, tag: "AUX" },
  { id: "observatory", label: "관측돔", icon: Eye, left: 83, top: 29, width: 10, height: 14, tone: "border-blue-300/30 bg-blue-300/10", decorative: true, tag: "AUX" },
  { id: "hydroponics", label: "수경재배", icon: Leaf, left: 7, top: 51, width: 9, height: 16, tone: "border-lime-300/30 bg-lime-300/10", decorative: true, tag: "LIFE" },
  { id: "comms", label: "통신실", icon: Radio, left: 45, top: 39, width: 10, height: 8, tone: "border-cyan-200/30 bg-cyan-200/10", decorative: true, tag: "AUX" },
  { id: "survey-bay", label: "탐사 베이", icon: Package, left: 87, top: 69, width: 8, height: 17, tone: "border-teal-300/30 bg-teal-300/10", decorative: true, tag: "BAY" },
];

export const DISPLAY_ROOMS = [...ROOMS, ...AUX_ZONES];

export const ROUTES = [
  ["bridge", "ops"],
  ["bridge", "medbay"],
  ["ops", "living"],
  ["living", "galley"],
  ["galley", "engineering"],
  ["engineering", "cargo"],
  ["medbay", "cargo"],
  ["bridge", "engineering"],
];

export const DISPLAY_ROUTES = [
  ...ROUTES,
  ["ops", "armory"],
  ["bridge", "lab"],
  ["bridge", "comms"],
  ["medbay", "observatory"],
  ["living", "hydroponics"],
  ["cargo", "survey-bay"],
];

export const ROOM_IDS = ROOMS.map((room) => room.id);

export function getRoomDef(roomId) {
  return ROOMS.find((room) => room.id === roomId);
}

export function getDisplayRoomDef(roomId) {
  return DISPLAY_ROOMS.find((room) => room.id === roomId);
}
