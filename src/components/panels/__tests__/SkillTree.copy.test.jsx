import { describe, expect, it } from "vitest";
import { getSkillById } from "../../../data/skills";
import { getSkillDisplayDescription, INACTIVE_SKILL_COPY } from "../SkillTree";

describe("SkillTree release copy", () => {
  it("shows implemented descriptions and masks inactive promised effects", () => {
    const implemented = getSkillById("diplomacy-contract");
    const inactive = getSkillById("diplomacy-market");

    expect(getSkillDisplayDescription(implemented)).toBe(implemented.desc);
    expect(getSkillDisplayDescription(inactive)).toBe(INACTIVE_SKILL_COPY);
    expect(getSkillDisplayDescription(inactive)).not.toContain("비용을 낮춥니다");
  });
});
