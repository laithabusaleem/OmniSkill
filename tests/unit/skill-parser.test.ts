import { describe, expect, it } from "vitest";
import { parseSkillMarkdown } from "../../src/core/skill-parser.js";
import { OmniError } from "../../src/core/errors.js";

describe("skill-parser", () => {
  it("parses valid SKILL.md", () => {
    const parsed = parseSkillMarkdown(`---
name: demo
description: A demo skill
domains:
  - frontend
triggers: [dark mode, theme]
---
# Body

See [guide](./docs/guide.md).
`);
    expect(parsed.name).toBe("demo");
    expect(parsed.description).toContain("demo skill");
    expect(parsed.references).toContain("docs/guide.md");
  });

  it("rejects missing required fields", () => {
    expect(() =>
      parseSkillMarkdown(`---
name: only
---
body
`),
    ).toThrow(OmniError);
  });

  it("rejects missing frontmatter", () => {
    expect(() => parseSkillMarkdown("# no fm")).toThrow(OmniError);
  });
});
