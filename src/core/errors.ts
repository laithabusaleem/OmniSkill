export class OmniError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly hint?: string;

  constructor(code: string, message: string, options?: { exitCode?: number; hint?: string; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "OmniError";
    this.code = code;
    this.exitCode = options?.exitCode ?? 1;
    this.hint = options?.hint;
  }
}

export function isOmniError(err: unknown): err is OmniError {
  return err instanceof OmniError;
}

export function formatError(err: unknown): string {
  if (isOmniError(err)) {
    const hint = err.hint ? `\nHint: ${err.hint}` : "";
    return `[${err.code}] ${err.message}${hint}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
