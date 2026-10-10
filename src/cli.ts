#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "node:module";
import { runAdd } from "./commands/add.js";
import { runApprove } from "./commands/approve.js";
import { runArtifacts } from "./commands/artifacts-cmd.js";
import { runCapabilities } from "./commands/capabilities.js";
import { runClassify } from "./commands/classify.js";
import { runContext } from "./commands/context.js";
import { runDiscover } from "./commands/discover.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runExport } from "./commands/export.js";
import { runFeedback } from "./commands/feedback.js";
import { runInit } from "./commands/init.js";
import { runList } from "./commands/list.js";
import { runLog } from "./commands/log.js";
import { runMatch } from "./commands/match.js";
import { runPlan } from "./commands/plan.js";
import { runPlatformDiscover } from "./commands/platform-discover.js";
import { runRun } from "./commands/run.js";
import { runScan } from "./commands/scan.js";
import { runSync } from "./commands/sync.js";
import { runTools } from "./commands/tools.js";
import { parseAgentKind } from "./core/agent-adapters.js";
import { cliIdentityLine } from "./core/branding.js";
import { formatError, isOmniError } from "./core/errors.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

function action(fn: () => Promise<number>): () => Promise<void> {
  return async () => {
    try {
      process.exitCode = await fn();
    } catch (err) {
      process.stderr.write(`${formatError(err)}\n`);
      process.exitCode = isOmniError(err) ? err.exitCode : 1;
    }
  };
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("omniskill")
    .description("Universal AI capability discovery and workflow orchestration CLI")
    .version(pkg.version)
    .addHelpText("beforeAll", () => `${cliIdentityLine(pkg.version)}\n`);

  program
    .command("init")
    .description("Initialize OmniSkill in the current project")
    .option("--agent <agent>", "claude-code | cursor | portable", "claude-code")
    .option("-y, --yes", "Confirm installation without interactive prompt", false)
    .option("--dry-run", "Preview instruction installation without writing", false)
    .option("--json", "JSON output", false)
    .action((opts: { agent: string; yes?: boolean; dryRun?: boolean; json?: boolean }) =>
      action(() =>
        runInit({
          cwd: process.cwd(),
          agent: parseAgentKind(opts.agent),
          yes: opts.yes,
          dryRun: opts.dryRun,
          json: opts.json,
        }),
      )(),
    );

  program
    .command("scan")
    .description("Rescan the project profile")
    .option("--json", "JSON output", false)
    .action((opts: { json?: boolean }) => action(() => runScan({ cwd: process.cwd(), json: opts.json }))());

  program
    .command("add")
    .description("Discover and register skills from a GitHub repository")
    .argument("<repo>", "owner/repo or GitHub URL")
    .option("--json", "JSON output", false)
    .action((repo: string, opts: { json?: boolean }) =>
      action(() => runAdd({ cwd: process.cwd(), repo, json: opts.json }))(),
    );

  program
    .command("sync")
    .description("Synchronize approved skills and update cache")
    .option("--source <id>", "Limit sync to a source id")
    .option("--json", "JSON output", false)
    .action((opts: { source?: string; json?: boolean }) =>
      action(() => runSync({ cwd: process.cwd(), source: opts.source, json: opts.json }))(),
    );

  program
    .command("list")
    .description("List registered skills")
    .option("--domain <domain>", "Filter by domain")
    .option("--json", "JSON output", false)
    .action((opts: { domain?: string; json?: boolean }) =>
      action(() => runList({ cwd: process.cwd(), domain: opts.domain, json: opts.json }))(),
    );

  program
    .command("match")
    .description("Rank skills for a task")
    .argument("<task>", "Task description")
    .option("--all", "Show all candidates", false)
    .option("--limit <n>", "Max selected skills", (v) => Number(v))
    .option("--json", "JSON output", false)
    .option("--explain", "Show scoring factors", false)
    .action(
      (task: string, opts: { all?: boolean; limit?: number; json?: boolean; explain?: boolean }) =>
        action(() =>
          runMatch({
            cwd: process.cwd(),
            task,
            all: opts.all,
            limit: opts.limit,
            json: opts.json,
            explain: opts.explain,
          }),
        )(),
    );

  program
    .command("export")
    .description("Generate a task-specific skill bundle")
    .argument("<task>", "Task description")
    .option("--agent <agent>", "claude-code | cursor | portable")
    .option("--no-attribution", "Omit OmniSkill attribution footer from the bundle")
    .option("--json", "JSON output", false)
    .action((task: string, opts: { agent?: string; json?: boolean; attribution?: boolean }) =>
      action(() =>
        runExport({
          cwd: process.cwd(),
          task,
          agent: opts.agent ? parseAgentKind(opts.agent) : undefined,
          json: opts.json,
          // Commander maps --no-attribution to attribution: false
          noAttribution: opts.attribution === false,
        }),
      )(),
    );

  program
    .command("log")
    .description("Show recent workflow events")
    .option("--last <n>", "Number of events", (v) => Number(v), 20)
    .option("--json", "JSON output", false)
    .action((opts: { last?: number; json?: boolean }) =>
      action(() => runLog({ cwd: process.cwd(), last: opts.last, json: opts.json }))(),
    );

  program
    .command("feedback")
    .description("Record explicit feedback about selected skills")
    .option("--skills <ids>", "Comma-separated skill ids")
    .option("--relevant", "Skills were relevant")
    .option("--no-relevant", "Skills were not relevant")
    .option("--helpful", "Skills were helpful")
    .option("--no-helpful", "Skills were not helpful")
    .option("--notes <text>", "Optional notes")
    .option("--task-summary <text>", "Optional task summary")
    .option("--json", "JSON output", false)
    .action(
      (opts: {
        skills?: string;
        relevant?: boolean;
        helpful?: boolean;
        notes?: string;
        taskSummary?: string;
        json?: boolean;
      }) =>
        action(() =>
          runFeedback({
            cwd: process.cwd(),
            skills: opts.skills,
            relevant: opts.relevant,
            helpful: opts.helpful,
            notes: opts.notes,
            taskSummary: opts.taskSummary,
            json: opts.json,
          }),
        )(),
    );

  program
    .command("doctor")
    .description("Run diagnostics")
    .option("--online", "Include online source checks", false)
    .option("--json", "JSON output", false)
    .action((opts: { online?: boolean; json?: boolean }) =>
      action(() =>
        runDoctorCommand({
          cwd: process.cwd(),
          online: opts.online,
          json: opts.json,
        }),
      )(),
    );

  program
    .command("classify")
    .description("Classify a task into domains, deliverables, and capability needs")
    .argument("<task>", "Task description")
    .option("--json", "JSON output", false)
    .action((task: string, opts: { json?: boolean }) =>
      action(() => runClassify({ cwd: process.cwd(), task, json: opts.json }))(),
    );

  program
    .command("discover")
    .description("Discover and evaluate skills for a task (local + registry)")
    .argument("<task>", "Task description")
    .option("--local", "Also scan default local skill directories", false)
    .option("--preview", "Show short instruction excerpts when cached", false)
    .option("--json", "JSON output", false)
    .action((task: string, opts: { local?: boolean; preview?: boolean; json?: boolean }) =>
      action(() =>
        runDiscover({
          cwd: process.cwd(),
          task,
          local: opts.local,
          preview: opts.preview,
          json: opts.json,
        }),
      )(),
    );

  program
    .command("plan")
    .description("Build a multi-skill workflow plan for a complex outcome")
    .argument("<task>", "Task description")
    .option("--format <fmt>", "markdown | json", "markdown")
    .option("--no-write", "Print only; do not write under .omni/plans")
    .option("--json", "JSON output", false)
    .action(
      (task: string, opts: { format?: string; write?: boolean; json?: boolean }) =>
        action(() =>
          runPlan({
            cwd: process.cwd(),
            task,
            format: opts.format === "json" ? "json" : "markdown",
            write: opts.write,
            json: opts.json,
          }),
        )(),
    );

  program
    .command("context")
    .description("View or edit opt-in project context")
    .option("--enable", "Enable persistent context", false)
    .option("--disable", "Disable persistent context", false)
    .option("--set <key>", "Set a context key")
    .option("--value <text>", "Value for --set")
    .option("--kind <kind>", "user_fact | external_evidence | ai_assumption", "user_fact")
    .option("--domain <domain>", "Optional domain tag")
    .option("--source-ref <ref>", "Optional source reference for evidence")
    .option("--overwrite", "Allow replacing an existing key", false)
    .option("--delete <key>", "Delete a context key")
    .option("--clear", "Delete the context file", false)
    .option("--export", "Print Markdown export", false)
    .option("--json", "JSON output", false)
    .action(
      (opts: {
        enable?: boolean;
        disable?: boolean;
        set?: string;
        value?: string;
        kind?: string;
        domain?: string;
        sourceRef?: string;
        overwrite?: boolean;
        delete?: string;
        clear?: boolean;
        export?: boolean;
        json?: boolean;
      }) =>
        action(() =>
          runContext({
            cwd: process.cwd(),
            enable: opts.enable,
            disable: opts.disable,
            set: opts.set,
            value: opts.value,
            kind: opts.kind,
            domain: opts.domain,
            sourceRef: opts.sourceRef,
            overwrite: opts.overwrite,
            deleteKey: opts.delete,
            clear: opts.clear,
            exportMd: opts.export,
            json: opts.json,
          }),
        )(),
    );

  program
    .command("capabilities")
    .description("Report which environment capabilities are available")
    .option("--json", "JSON output", false)
    .action((opts: { json?: boolean }) =>
      action(() => runCapabilities({ cwd: process.cwd(), json: opts.json }))(),
    );

  program
    .command("approve")
    .description("Approve, quarantine, or reject a skill after inspection")
    .argument("<skillId>", "Skill id from list/discover")
    .option("--reject", "Block the skill from selection", false)
    .option("--quarantine", "Quarantine for manual review", false)
    .option("--json", "JSON output", false)
    .action(
      (skillId: string, opts: { reject?: boolean; quarantine?: boolean; json?: boolean }) =>
        action(() =>
          runApprove({
            cwd: process.cwd(),
            skillId,
            reject: opts.reject,
            quarantine: opts.quarantine,
            json: opts.json,
          }),
        )(),
    );

  program
    .command("search")
    .description("Universal capability search across skills, tools, and local providers")
    .argument("<task>", "Natural-language outcome")
    .option("--offline", "Do not imply network discovery", false)
    .option("--import-local", "Import local SKILL.md into the skill registry", false)
    .option("--json", "JSON output", false)
    .action(
      (task: string, opts: { offline?: boolean; importLocal?: boolean; json?: boolean }) =>
        action(() =>
          runPlatformDiscover({
            cwd: process.cwd(),
            task,
            offline: opts.offline,
            importLocal: opts.importLocal,
            json: opts.json,
          }),
        )(),
    );

  program
    .command("tools")
    .description("List tools/models in the capability registry; optionally probe host binaries")
    .option("--probe", "Probe adapters (e.g. ffmpeg) and update status", false)
    .option("--json", "JSON output", false)
    .action((opts: { probe?: boolean; json?: boolean }) =>
      action(() => runTools({ cwd: process.cwd(), probe: opts.probe, json: opts.json }))(),
    );

  program
    .command("run")
    .description("Execute a workflow plan with checkpoints (plan ≠ done)")
    .argument("[task]", "Task to plan and execute")
    .option("--approve <stageIds>", "Comma-separated stage ids to approve")
    .option("--media", "Allow media render when ffmpeg is available", false)
    .option("--job <id>", "Show an existing job report")
    .option("--json", "JSON output", false)
    .action(
      (
        task: string | undefined,
        opts: { approve?: string; media?: boolean; job?: string; json?: boolean },
      ) =>
        action(async () => {
          if (opts.job) {
            return runRun({ cwd: process.cwd(), task: "", jobId: opts.job, json: opts.json });
          }
          if (!task) {
            process.stderr.write("Task argument required unless --job is set\n");
            return 1;
          }
          return runRun({
            cwd: process.cwd(),
            task,
            approve: opts.approve,
            media: opts.media,
            json: opts.json,
          });
        })(),
    );

  program
    .command("artifacts")
    .description("List tracked workflow artifacts and verification status")
    .option("--json", "JSON output", false)
    .action((opts: { json?: boolean }) =>
      action(() => runArtifacts({ cwd: process.cwd(), json: opts.json }))(),
    );

  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  process.stderr.write(`${formatError(err)}\n`);
  process.exitCode = isOmniError(err) ? err.exitCode : 1;
});
