import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BEGIN_MARKER,
  END_MARKER,
  installManagedInstructions,
  rollbackFromBackup,
  validateMarkers,
} from "../../src/core/installer.js";
import { OmniError } from "../../src/core/errors.js";
import { makeTempDir } from "../helpers/temp.js";

describe("installer edge cases", () => {
  it("creates backup and supports rollback", () => {
    const root = makeTempDir();
    mkdirSync(join(root, ".omni", "backups"), { recursive: true });
    const dest = join(root, "CLAUDE.md");
    writeFileSync(dest, "# User rules\nKeep forever\n", "utf8");

    const first = installManagedInstructions({
      projectRoot: root,
      destination: dest,
      managedBody: "version-one",
    });
    expect(first.action).toBe("updated");
    expect(first.backupPath).toBeTruthy();
    expect(existsSync(first.backupPath!)).toBe(true);
    expect(readFileSync(first.backupPath!, "utf8")).toContain("Keep forever");

    installManagedInstructions({
      projectRoot: root,
      destination: dest,
      managedBody: "version-two",
    });
    expect(readFileSync(dest, "utf8")).toContain("version-two");

    rollbackFromBackup(dest, first.backupPath!);
    const restored = readFileSync(dest, "utf8");
    expect(restored).toContain("Keep forever");
    expect(restored).not.toContain("version-two");
    expect(restored).not.toContain(BEGIN_MARKER);
  });

  it("rejects END before BEGIN", () => {
    expect(() => validateMarkers(`${END_MARKER}\n${BEGIN_MARKER}`)).toThrow(OmniError);
  });

  it("rejects duplicate END markers", () => {
    expect(() =>
      validateMarkers(`${BEGIN_MARKER}\nbody\n${END_MARKER}\n${END_MARKER}`),
    ).toThrow(/Malformed|duplicate/i);
  });

  it("preserves surrounding user content byte-for-byte outside markers", () => {
    const root = makeTempDir();
    const dest = join(root, "AGENTS.md");
    const user = "# Title\r\n\tkeep-tabs\nfinal line without nl";
    writeFileSync(dest, user, "utf8");
    installManagedInstructions({ projectRoot: root, destination: dest, managedBody: "managed" });
    const next = readFileSync(dest, "utf8");
    expect(next.startsWith("# Title\r\n\tkeep-tabs\nfinal line without nl")).toBe(true);
    expect(next).toContain(BEGIN_MARKER);
  });

  it("handles sequential concurrent-style updates without corrupting markers", () => {
    const root = makeTempDir();
    const dest = join(root, "CLAUDE.md");
    writeFileSync(dest, "user\n", "utf8");
    for (let i = 0; i < 5; i += 1) {
      installManagedInstructions({
        projectRoot: root,
        destination: dest,
        managedBody: `body-${i}`,
      });
    }
    const content = readFileSync(dest, "utf8");
    validateMarkers(content);
    expect(content).toContain("body-4");
    expect(content).toContain("user");
    expect(content.split(BEGIN_MARKER).length - 1).toBe(1);
  });

  it("dry-run does not create backup or modify file", () => {
    const root = makeTempDir();
    const dest = join(root, "CLAUDE.md");
    writeFileSync(dest, "only-user\n", "utf8");
    const result = installManagedInstructions({
      projectRoot: root,
      destination: dest,
      managedBody: "new",
      dryRun: true,
    });
    expect(result.action).toBe("preview");
    expect(result.backupPath).toBeUndefined();
    expect(readFileSync(dest, "utf8")).toBe("only-user\n");
  });

  it("rollback fails clearly when backup missing", () => {
    try {
      rollbackFromBackup("x", join(makeTempDir(), "missing.bak"));
      expect.fail("expected OmniError");
    } catch (err) {
      expect(err).toBeInstanceOf(OmniError);
      expect((err as OmniError).code).toBe("BACKUP_MISSING");
    }
  });
});
