export const number = (value, digits = 0) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);

export const percent = (value) => `${Math.round(value)}%`;

export const statLabel = {
  piloting: "조종",
  gunnery: "사격",
  engineering: "공학",
  medicine: "의료",
  scouting: "탐사",
};
