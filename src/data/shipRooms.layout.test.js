import { describe, expect, it } from "vitest";
import { DISPLAY_ROOMS, DISPLAY_ROUTES, ROOMS, ROUTES } from "./shipRooms";
import { ROOM_ANCHORS } from "./shipInteriorLayout";

function expectWithinCanvas(room) {
  expect(room.left).toBeGreaterThanOrEqual(0);
  expect(room.top).toBeGreaterThanOrEqual(0);
  expect(room.left + room.width).toBeLessThanOrEqual(100);
  expect(room.top + room.height).toBeLessThanOrEqual(100);
}

describe("ship deck layout", () => {
  it("keeps every room id unique and inside the deck canvas", () => {
    const ids = DISPLAY_ROOMS.map((room) => room.id);
    expect(new Set(ids).size).toBe(ids.length);
    DISPLAY_ROOMS.forEach(expectWithinCanvas);
  });

  it("keeps every route endpoint resolvable", () => {
    const ids = new Set(DISPLAY_ROOMS.map((room) => room.id));
    [...ROUTES, ...DISPLAY_ROUTES].forEach(([from, to]) => {
      expect(ids.has(from)).toBe(true);
      expect(ids.has(to)).toBe(true);
    });
  });

  it("preserves the required operational room contract", () => {
    expect(ROOMS.map((room) => room.id).sort()).toEqual([
      "bridge",
      "cargo",
      "engineering",
      "galley",
      "living",
      "medbay",
      "ops",
    ]);
  });

  it("keeps all crew anchor offsets inside every operational room", () => {
    ROOMS.forEach((room) => {
      const centerX = room.width / 2;
      const centerY = room.height / 2;
      ROOM_ANCHORS.forEach(({ x, y }) => {
        expect(centerX + x).toBeGreaterThanOrEqual(0);
        expect(centerX + x).toBeLessThanOrEqual(room.width);
        expect(centerY + y).toBeGreaterThanOrEqual(0);
        expect(centerY + y).toBeLessThanOrEqual(room.height);
      });
    });
  });
});
