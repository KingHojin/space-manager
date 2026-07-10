export const GAME_OVER_CAUSES = {
  hull_destroyed: {
    title: "함선 파괴",
    summary: "선체 내구도가 0에 도달해 함선이 더 이상 항해할 수 없습니다.",
  },
  all_crew_lost: {
    title: "승무원 전멸",
    summary: "생존한 승무원이 없어 항해를 계속할 수 없습니다.",
  },
};

export function evaluateGameOver({ resources, crew }) {
  if ((resources?.hull ?? 0) <= 0) return "hull_destroyed";
  if ((crew ?? []).length > 0 && !(crew ?? []).some((member) => member.alive !== false)) return "all_crew_lost";
  return null;
}

export function getGameOverCause(cause) {
  return GAME_OVER_CAUSES[cause] ?? {
    title: "항해 종료",
    summary: "항해를 계속할 수 없는 상태가 되었습니다.",
  };
}
