// Phase 24-A only establishes the durable schema/runtime. Story content is
// intentionally empty until the engine has survived integration review.
export const EVENT_CHAIN_STATUS = Object.freeze({
  scheduled: "scheduled",
  pending: "pending",
  settling: "settling",
  waitingCombat: "waitingCombat",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
});

// Inert contract fixture: never auto-registered and therefore never appears
// in player saves. It pins the runtime/transition schema before story content.
export const EVENT_CHAINS = Object.freeze([{
  id: "__phase24a-contract",
  version: 1,
  enabled: true,
  autoRegister: false,
  title: "체인 계약 검증",
  stages: [
    { id: "first", label: "1/2", title: "검증 1단계", scene: "테스트 전용", options: [{ id: "continue", label: "계속", manualOnly: true, transition: { nextStageId: "second", delayMinutes: 10, setFlags: { contractContinued: true } } }] },
    { id: "second", label: "2/2", title: "검증 2단계", scene: "테스트 전용", options: [{ id: "finish", label: "종료", manualOnly: true, transition: { terminalStatus: "completed", setFlags: { contractComplete: true } } }] },
  ],
}]);

export function getEventChain(chainId) {
  return EVENT_CHAINS.find((chain) => chain.id === chainId) ?? null;
}
