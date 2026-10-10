export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function printLines(lines: string[]): void {
  process.stdout.write(`${lines.join("\n")}\n`);
}

export function summarizeTask(task: string, logRaw: boolean): string {
  if (logRaw) return task.slice(0, 200);
  const tokens = task.trim().split(/\s+/).slice(0, 8);
  return tokens.join(" ") + (task.trim().split(/\s+/).length > 8 ? "…" : "");
}
