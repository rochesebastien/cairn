/** Process exit codes used across the CLI. */
export const EXIT = {
  /** Everything the user asked for happened. */
  OK: 0,
  /** The command ran but the cairn is unhappy (broken stone, tampered proof). */
  FAILURE: 1,
  /** The command was refused: bad usage, or acceptance criteria that leak code. */
  REFUSED: 2,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/**
 * An error meant for the user, not a stack trace. `details` are printed as
 * indented lines under the message.
 */
export class CliError extends Error {
  readonly exitCode: number;
  readonly details: string[];

  constructor(
    message: string,
    options: { exitCode?: number; details?: string[]; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "CliError";
    this.exitCode = options.exitCode ?? EXIT.FAILURE;
    this.details = options.details ?? [];
  }
}

/** A usage problem: missing flag, unknown id, malformed JSON payload. */
export function usageError(message: string, details: string[] = []): CliError {
  return new CliError(message, { exitCode: EXIT.REFUSED, details });
}
