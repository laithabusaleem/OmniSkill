import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "dist", "cli.js");
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function run(cwd, args, env = {}) {
  const res = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", ...env },
  });
  return {
    code: res.status ?? 1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

const root = join(tmpdir(), `omniskill-rc-${Date.now()}`);
mkdirSync(root, { recursive: true });
writeFileSync(
  join(root, "package.json"),
  JSON.stringify({
    name: "sample-rc",
    private: true,
    dependencies: { next: "14.0.0", react: "18.0.0" },
  }),
);
writeFileSync(join(root, "CLAUDE.md"), "# Keep User Header\nUser authored content must survive.\n");
writeFileSync(join(root, "tsconfig.json"), "{}\n");
console.log(`SAMPLE=${root}`);

let r = run(root, ["--version"]);
record("cli --version", r.code === 0 && r.stdout.trim() === "0.1.0", `code=${r.code} out=${JSON.stringify(r.stdout.trim())}`);

r = run(root, ["--help"]);
const help = r.stdout;
const cmds = ["init", "scan", "add", "sync", "list", "match", "export", "log", "feedback", "doctor"];
const missing = cmds.filter((c) => !new RegExp(`\\b${c}\\b`).test(help));
record("cli --help lists commands", r.code === 0 && missing.length === 0, missing.join(",") || "ok");
record("cli --help identity line", help.includes("OmniSkill") && help.includes("Project-aware AI skill router"));

r = run(root, ["init", "--yes", "--json"]);
let initOk = false;
try {
  const j = JSON.parse(r.stdout);
  initOk = r.code === 0 && j.ok === true;
} catch {
  initOk = false;
}
record("init --yes --json", initOk, `code=${r.code}`);

let claude = readFileSync(join(root, "CLAUDE.md"), "utf8");
const begin1 = (claude.match(/OMNISKILL:BEGIN/g) || []).length;
record("preserves user CLAUDE.md header", claude.startsWith("# Keep User Header\n"));
record("installs managed markers once", begin1 === 1 && claude.includes("User authored content must survive"));

r = run(root, ["init", "--yes", "--json"]);
claude = readFileSync(join(root, "CLAUDE.md"), "utf8");
const begin2 = (claude.match(/OMNISKILL:BEGIN/g) || []).length;
record("re-init does not duplicate markers", r.code === 0 && begin2 === 1);
record("re-init keeps user content", claude.includes("User authored content must survive"));

r = run(root, ["scan", "--json"]);
try {
  const j = JSON.parse(r.stdout);
  record("scan --json", r.code === 0 && Array.isArray(j.frameworks), `frameworks=${(j.frameworks || []).join(",")}`);
} catch (e) {
  record("scan --json", false, String(e));
}

r = run(root, ["list", "--json"]);
let listCount = 0;
try {
  const j = JSON.parse(r.stdout);
  listCount = j.skills?.length ?? 0;
  record("list --json", r.code === 0 && listCount > 0, `skills=${listCount}`);
} catch (e) {
  record("list --json", false, String(e));
}

const skillId = "seed__frontend-ui";
const skillDir = join(root, ".omni", "skills", skillId);
mkdirSync(skillDir, { recursive: true });
const skillBody = `---
name: frontend-ui
description: UI theming
---
Dark mode guidance
`;
writeFileSync(join(skillDir, "SKILL.md"), skillBody);
const hash = createHash("sha256").update(skillBody).digest("hex");
writeFileSync(
  join(skillDir, "meta.json"),
  JSON.stringify({ sourceId: "anthropics__skills", path: "seed/frontend-ui/SKILL.md", contentHash: hash, syncedAt: new Date().toISOString() }, null, 2),
);
const regPath = join(root, ".omni", "skill-registry.json");
const reg = JSON.parse(readFileSync(regPath, "utf8"));
reg.skills = reg.skills.map((s) => (s.id === skillId ? { ...s, cacheStatus: "cached" } : s));
writeFileSync(regPath, JSON.stringify(reg, null, 2));

r = run(root, ["match", "Build a dark mode toggle", "--explain", "--json"]);
let selectedIds = [];
try {
  const j = JSON.parse(r.stdout);
  selectedIds = (j.selected || []).map((s) => s.skillId);
  record("match --json", r.code === 0 && selectedIds.length > 0, `selected=${selectedIds.join(",")}`);
} catch (e) {
  record("match --json", false, String(e));
}

r = run(root, ["export", "Build a dark mode toggle", "--agent", "portable", "--json"]);
try {
  const j = JSON.parse(r.stdout);
  const body = readFileSync(j.path, "utf8");
  record(
    "export bundle provenance+attribution",
    r.code === 0 && body.includes("## Provenance") && body.includes("Generated with OmniSkill") && typeof j.attributionFooter === "string",
    `attr=${j.attributionFooter}`,
  );
} catch (e) {
  record("export bundle provenance+attribution", false, String(e));
}

r = run(root, ["export", "Build a dark mode toggle", "--agent", "portable", "--no-attribution", "--json"]);
try {
  const j = JSON.parse(r.stdout);
  const body = readFileSync(j.path, "utf8");
  record(
    "export --no-attribution",
    r.code === 0 && j.attributionFooter === null && !/Generated with OmniSkill\s*$/m.test(body) && !body.includes("_Generated with OmniSkill_"),
  );
} catch (e) {
  record("export --no-attribution", false, String(e));
}

const ids = selectedIds.length ? selectedIds.join(",") : skillId;
r = run(root, ["feedback", "--skills", ids, "--relevant", "--helpful", "--json"]);
record("feedback --json", r.code === 0 && r.stdout.includes('"ok"'));

r = run(root, ["log", "--last", "5", "--json"]);
record("log --json", r.code === 0 && r.stdout.includes("events"));

r = run(root, ["doctor", "--json"]);
try {
  const j = JSON.parse(r.stdout);
  record("doctor --json", r.code === 0 || r.code === 1, `status=${j.status ?? j.ok}`);
} catch (e) {
  record("doctor --json", false, String(e));
}

// Offline: match with cached data, no token
r = run(root, ["match", "dark mode", "--json"], { GITHUB_TOKEN: "" });
record("offline match with cache", r.code === 0 && r.stdout.includes("selected"));

// Optional network: add + sync
let networkOk = false;
try {
  const net = spawnSync(process.execPath, ["-e", "fetch('https://api.github.com').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], {
    encoding: "utf8",
    timeout: 15000,
  });
  networkOk = net.status === 0;
} catch {
  networkOk = false;
}

if (networkOk) {
  r = run(root, ["add", "anthropics/skills", "--json"]);
  let addOk = r.code === 0;
  try {
    const j = JSON.parse(r.stdout);
    addOk = r.code === 0 && (j.ok === true || j.skillsAdded !== undefined || j.discovered !== undefined || j.sourceId);
  } catch {
    addOk = r.code === 0;
  }
  record("live add anthropics/skills", addOk, `code=${r.code} out=${r.stdout.slice(0, 120).replace(/\n/g, " ")}`);

  r = run(root, ["sync", "--json"]);
  record("live sync", r.code === 0, `code=${r.code}`);
} else {
  record("live GitHub smoke (optional)", true, "SKIPPED — network unavailable");
}

// Packaging cross-check: dist data present
record("runtime assets present", existsSync(join(repoRoot, "dist", "data", "seed-registry.json")) && existsSync(join(repoRoot, "dist", "data", "master-prompt.md")));
record("branding assets present", existsSync(join(repoRoot, "assets", "branding", "omniskill-mark.svg")));

const failed = results.filter((x) => !x.ok);
console.log("\n--- summary ---");
console.log(`passed=${results.filter((x) => x.ok).length} failed=${failed.length} sample=${root}`);
if (failed.length) {
  for (const f of failed) console.log(`  FAIL: ${f.name} ${f.detail}`);
  process.exitCode = 1;
} else {
  process.exitCode = 0;
}
