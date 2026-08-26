import { describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSkillFile } from "../src/skill.js";

const SKILL_PATH = fileURLToPath(new URL("../skills/bailian-kb/SKILL.md", import.meta.url));

describe("parseSkillFile", () => {
  it("takes name and description from frontmatter and strips the block from the body", () => {
    const parsed = parseSkillFile(
      [
        "---",
        "name: demo-skill",
        "description: >-",
        "  First line of the folded description,",
        "  continued on the next source line.",
        "---",
        "",
        "# Heading",
        "",
        "Body text.",
        "",
      ].join("\n"),
    );
    expect(parsed?.name).toBe("demo-skill");
    // A folded scalar joins its lines with spaces; the value must arrive unfolded.
    expect(parsed?.description).toBe(
      "First line of the folded description, continued on the next source line.",
    );
    // The registry performs no parsing of its own, so the YAML must already be gone.
    expect(parsed?.content).toBe("\n# Heading\n\nBody text.\n");
    expect(parsed?.content).not.toContain("---");
    expect(parsed?.content).not.toContain("description:");
  });

  it("carries optional whenToUse and metadata, omitting them when absent or blank", () => {
    const withExtras = parseSkillFile(
      [
        "---",
        "name: demo-skill",
        "description: Routing text.",
        "whenToUse: Extra guidance.",
        "metadata:",
        "  owner: platform",
        "---",
        "Body.",
      ].join("\n"),
    );
    expect(withExtras?.whenToUse).toBe("Extra guidance.");
    expect(withExtras?.metadata).toEqual({ owner: "platform" });

    const bare = parseSkillFile("---\nname: demo-skill\ndescription: Routing text.\n---\nBody.");
    expect(bare).not.toHaveProperty("whenToUse");
    expect(bare).not.toHaveProperty("metadata");
  });

  it("rejects a file without usable frontmatter instead of throwing", () => {
    // No fence at all: a plain markdown file.
    expect(parseSkillFile("# Just markdown\n")).toBeUndefined();
    // Opening fence never closes.
    expect(parseSkillFile("---\nname: demo-skill\n")).toBeUndefined();
    // Unparsable YAML inside the fence.
    expect(parseSkillFile("---\nname: [unclosed\n---\nBody.")).toBeUndefined();
    // Scalar and sequence roots are not frontmatter records.
    expect(parseSkillFile("---\njust a string\n---\nBody.")).toBeUndefined();
    expect(parseSkillFile("---\n- one\n- two\n---\nBody.")).toBeUndefined();
    // name or description missing, blank, or the wrong type.
    expect(parseSkillFile("---\ndescription: Routing text.\n---\nBody.")).toBeUndefined();
    expect(parseSkillFile("---\nname: demo-skill\n---\nBody.")).toBeUndefined();
    expect(parseSkillFile('---\nname: demo-skill\ndescription: "   "\n---\nBody.')).toBeUndefined();
    expect(parseSkillFile("---\nname: 42\ndescription: Routing text.\n---\nBody.")).toBeUndefined();
  });
});

describe("the packaged bailian-kb SKILL.md", () => {
  const parsed = parseSkillFile(readFileSync(SKILL_PATH, "utf8"));

  it("parses, and is the single source of the registered name and description", () => {
    expect(parsed?.name).toBe("bailian-kb");
    expect(parsed?.description).toContain("bl");
    // The frontmatter must state where credentials come from: that sentence used
    // to live in skill.ts and would otherwise be lost with the duplicate.
    expect(parsed?.description).toContain("DASHSCOPE_API_KEY");
  });

  it("keeps its description within the catalog truncation budget", () => {
    // tool-skill publishes catalog entries through catalogDescription(), which
    // whitespace-normalizes and hard-truncates at 500 characters.
    const normalized = (parsed?.description ?? "").replaceAll(/\s+/g, " ").trim();
    expect(normalized.length).toBeLessThanOrEqual(500);
  });

  it("registers a body with no frontmatter residue", () => {
    expect(parsed?.content.startsWith("---")).toBe(false);
    expect(parsed?.content).not.toContain("description: >-");
    // The real body still begins with the document heading.
    expect(parsed?.content.trimStart().startsWith("#")).toBe(true);
  });
});
