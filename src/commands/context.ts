import {
  clearProjectContext,
  deleteContextEntry,
  enableProjectContext,
  exportContextMarkdown,
  loadProjectContext,
  upsertContextEntry,
} from "../core/project-context.js";
import { requireOmniInitialized } from "../core/config.js";
import { printJson, printLines } from "../core/io.js";
import type { ContextFactKind, DomainId } from "../types/index.js";

export async function runContext(options: {
  cwd: string;
  enable?: boolean;
  disable?: boolean;
  set?: string;
  value?: string;
  kind?: string;
  domain?: string;
  sourceRef?: string;
  overwrite?: boolean;
  deleteKey?: string;
  clear?: boolean;
  exportMd?: boolean;
  json?: boolean;
}): Promise<number> {
  requireOmniInitialized(options.cwd);

  if (options.clear) {
    clearProjectContext(options.cwd);
    if (options.json) printJson({ ok: true, cleared: true });
    else printLines(["Project context file deleted."]);
    return 0;
  }

  if (options.enable) {
    const ctx = enableProjectContext(options.cwd, true);
    if (options.json) printJson(ctx);
    else printLines(["Project context enabled (opt-in).", `Entries: ${ctx.entries.length}`]);
    return 0;
  }

  if (options.disable) {
    const ctx = enableProjectContext(options.cwd, false);
    if (options.json) printJson(ctx);
    else printLines(["Project context disabled."]);
    return 0;
  }

  if (options.deleteKey) {
    const ctx = deleteContextEntry(options.cwd, options.deleteKey);
    if (options.json) printJson(ctx);
    else printLines([`Deleted context key: ${options.deleteKey}`, `Remaining: ${ctx.entries.length}`]);
    return 0;
  }

  if (options.set) {
    if (!options.value) {
      printLines(["--set requires --value"]);
      return 1;
    }
    const kind = (options.kind ?? "user_fact") as ContextFactKind;
    const ctx = upsertContextEntry(options.cwd, {
      key: options.set,
      value: options.value,
      kind,
      domain: options.domain as DomainId | undefined,
      sourceRef: options.sourceRef,
      overwrite: options.overwrite,
    });
    if (options.json) printJson(ctx);
    else printLines([`Set ${options.set} (${kind})`, `Entries: ${ctx.entries.length}`]);
    return 0;
  }

  const ctx = loadProjectContext(options.cwd);
  if (options.exportMd) {
    printLines([exportContextMarkdown(ctx).trimEnd()]);
    return 0;
  }
  if (options.json) {
    printJson(ctx);
    return 0;
  }
  printLines([
    `Enabled: ${ctx.enabled}`,
    `Updated: ${ctx.updatedAt}`,
    `Entries: ${ctx.entries.length}`,
    "",
    ...ctx.entries.map((e) => `- ${e.key} [${e.kind}] ${e.domain ?? ""}`),
    ctx.entries.length === 0 ? "(empty — use context --enable then --set)" : "",
  ].filter(Boolean));
  return 0;
}
