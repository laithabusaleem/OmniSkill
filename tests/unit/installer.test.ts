import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  BEGIN_MARKER,
  END_MARKER,
  installManagedInstructions,
  upsertManagedBlock,
  validateMarkers,
} from "../../src/core/installer.js";
import { OmniError } from "../../src/core/errors.js";

describe("installer", () => {
  it("creates missing destination", () => {
    const root = join(tmpdir(), `omniskill-inst-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    const dest = join(root, "CLAUDE.md");
    const result = installManagedInstructions({
      projectRoot: root,
      destination: dest,
      managedBody: "hello",
    });
    expect(result.action).toBe("created");
    expect(readFileSync(dest, "utf8")).toContain(BEGIN_MARKER);
    expect(readFileSync(dest, "utf8")).toContain("hello");
  });

  it("preserves user content and is idempotent", () => {
    const root = join(tmpdir(), `omniskill-inst2-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    const dest = join(root, "CLAUDE.md");
    writeFileSync(dest, "# User rules\nKeep me\n", "utf8");
    installManagedInstructions({ projectRoot: root, destination: dest, managedBody: "v1" });
    const once = readFileSync(dest, "utf8");
    expect(once.startsWith("# User rules\nKeep me\n")).toBe(true);
    const second = installManagedInstructions({ projectRoot: root, destination: dest, managedBody: "v1" });
    expect(second.action).toBe("unchanged");
    const third = installManagedInstructions({ projectRoot: root, destination: dest, managedBody: "v2" });
    expect(third.action).toBe("updated");
    expect(third.backupPath).toBeTruthy();
    expect(readFileSync(dest, "utf8")).toContain("Keep me");
    expect(readFileSync(dest, "utf8")).toContain("v2");
  });

  it("detects malformed markers", () => {
    expect(() => validateMarkers(`${BEGIN_MARKER}\n${BEGIN_MARKER}\n${END_MARKER}`)).toThrow(OmniError);
  });

  it("supports dry run", () => {
    const root = join(tmpdir(), `omniskill-inst3-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    const dest = join(root, "CLAUDE.md");
    writeFileSync(dest, "user\n", "utf8");
    const result = installManagedInstructions({
      projectRoot: root,
      destination: dest,
      managedBody: "preview",
      dryRun: true,
    });
    expect(result.action).toBe("preview");
    expect(readFileSync(dest, "utf8")).toBe("user\n");
  });

  it("upserts block content", () => {
    const next = upsertManagedBlock("before\n", "body");
    expect(next).toContain("before");
    expect(next).toContain(END_MARKER);
  });
});
