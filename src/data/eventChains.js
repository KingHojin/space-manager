// Phase 24-A only establishes the durable schema/runtime. Story content is
// intentionally empty until the engine has survived integration review.
import { GREYWAKE } from "./constants";

export const EVENT_CHAIN_STATUS = Object.freeze({
  scheduled: "scheduled",
  pending: "pending",
  settling: "settling",
  waitingJob: "waitingJob",
  waitingLocation: "waitingLocation",
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
}, {
  id: GREYWAKE.chainId,
  version: 1,
  enabled: true,
  autoRegister: false,
  title: "GREYWAKE // 마지막 당직",
  stages: [
    {
      id: "recovery-record",
      label: "1/3 · 회수 기록",
      title: "GREYWAKE // 회수 기록",
      scene: "파손된 인양함 GREYWAKE의 기록장치가 아직 미약한 비상 신호를 보낸다. 온전히 회수하면 당장 쓸 수 없는 화물 하나가 함선 작업을 요구한다.",
      risk: "medium",
      icon: "▣",
      options: [
        {
          id: "recover-recorder",
          label: "기록장치를 온전히 회수한다",
          role: "기관실",
          risk: "medium",
          rewardPreview: { storyItem: 1 },
          outcomes: [{ kind: "inventoryGrant", items: [{ itemId: GREYWAKE.recorderItemId, qty: 1 }] }],
          effects: [{ kind: "inventoryGrant", items: [{ itemId: GREYWAKE.recorderItemId, qty: 1 }] }],
          transition: { nextStageId: "ops-wait", delayMinutes: 0 },
        },
        { id: "seal-wreck", label: "좌표를 봉인하고 이탈한다", role: "함교", risk: "low", outcomes: [], effects: [], transition: { terminalStatus: "cancelled" } },
      ],
    },
    {
      id: "ops-wait",
      label: "2/3 · 관제실 대기",
      title: "GREYWAKE // 관제실 대기",
      scene: "기록은 일반 블랙박스 규격이 아니다. 관제실 작업 1개와 승무원 1명을 4시간 투입해야 마지막 당직 좌표를 복원할 수 있다.",
      risk: "medium",
      icon: "⌁",
      options: [
        {
          id: "decode-last-watch",
          label: "관제실 해독 지시 · 4시간",
          role: "관제실",
          risk: "medium",
          outcomes: [{ kind: "inventoryConsume", items: [{ itemId: GREYWAKE.recorderItemId, qty: 1 }] }, { kind: "enqueueStoryJob", duration: GREYWAKE.jobMinutes }],
          effects: [{ kind: "inventoryConsume", items: [{ itemId: GREYWAKE.recorderItemId, qty: 1 }] }, { kind: "enqueueStoryJob", duration: GREYWAKE.jobMinutes, roomId: GREYWAKE.jobRoomId, nextStageId: "last-watch" }],
          transition: { waitingStatus: "waitingJob", nextStageId: "last-watch" },
        },
        { id: "discard-recorder", label: "기록장치를 폐기하고 종료한다", role: "함교", risk: "low", outcomes: [{ kind: "inventoryConsume", items: [{ itemId: GREYWAKE.recorderItemId, qty: 1 }] }], effects: [{ kind: "inventoryConsume", items: [{ itemId: GREYWAKE.recorderItemId, qty: 1 }] }], transition: { terminalStatus: "cancelled" } },
      ],
    },
    {
      id: "last-watch",
      label: "3/3 · 마지막 당직",
      title: "GREYWAKE // 마지막 당직",
      scene: "복원된 좌표에 도착하자 봉인된 구명정과 기업 청구권 집행선의 신호가 동시에 잡힌다. 구조, 교전, 매각 중 하나만 선택할 시간이 남았다.",
      risk: "high",
      icon: "✦",
      options: [
        {
          id: "tow-lifeboat",
          label: `구명정 견인 · 산소 -${GREYWAKE.rescueOxygenCost} · 희귀 센서 분석가 후보 · 편입비 ₢${GREYWAKE.recruitCost} 별도`,
          role: "의무실",
          risk: "medium",
          previewText: `희귀 센서 분석가 후보 · 편입비 ₢${GREYWAKE.recruitCost} 별도`,
          outcomes: [{ kind: "resource", delta: { oxygen: -GREYWAKE.rescueOxygenCost } }, { kind: "recruitOffer", templateId: GREYWAKE.recruitTemplateId }],
          effects: [{ kind: "resource", delta: { oxygen: -GREYWAKE.rescueOxygenCost } }, { kind: "recruitOffer", templateId: GREYWAKE.recruitTemplateId }],
          transition: { terminalStatus: "completed" },
        },
        {
          id: "fight-claim",
          label: `청구권 집행선 교전 · 승리 시 ₢${GREYWAKE.battleCredits} + 전술 AI 칩`,
          role: "포탑",
          risk: "high",
          previewText: `승리 조건 보상 · ₢${GREYWAKE.battleCredits} · tactical-ai-chip x1`,
          outcomes: [{ kind: "combat", enemyId: GREYWAKE.battleEnemyId }],
          effects: [{ kind: "combat", enemyId: GREYWAKE.battleEnemyId, victoryEffects: [{ kind: "resource", delta: { credits: GREYWAKE.battleCredits } }, { kind: "inventoryGrant", items: [{ itemId: GREYWAKE.battleItemId, qty: 1 }] }] }],
          transition: { waitingStatus: "waitingCombat", terminalStatus: "completed" },
        },
        {
          id: "sell-coordinates",
          label: `좌표 매각 · 즉시 ₢${GREYWAKE.saleCredits}`,
          role: "함교",
          risk: "low",
          rewardPreview: { credits: GREYWAKE.saleCredits },
          outcomes: [{ kind: "resource", delta: { credits: GREYWAKE.saleCredits } }],
          effects: [{ kind: "resource", delta: { credits: GREYWAKE.saleCredits } }],
          transition: { terminalStatus: "completed" },
        },
        { id: "withdraw", label: "신호를 폐기하고 철수한다", role: "함교", risk: "low", outcomes: [], effects: [], transition: { terminalStatus: "cancelled" } },
      ],
    },
  ],
}]);

export function getEventChain(chainId) {
  return EVENT_CHAINS.find((chain) => chain.id === chainId) ?? null;
}
