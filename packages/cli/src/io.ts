/**
 * All CLI output goes through an Io object so tests can run commands in-process
 * and assert on what a user would have seen.
 */
export interface Io {
  /** Write a line to stdout. */
  out(line?: string): void;
  /** Write a line to stderr. */
  err(line?: string): void;
  /** Read the whole of stdin (used by `add --json`). */
  readStdin(): Promise<string>;
  /** Whether stdin is an interactive terminal (enables the prompts). */
  isTTY: boolean;
  /** Ask the user a question. Only called when isTTY is true. */
  question(prompt: string): Promise<string>;
}

export function defaultIo(): Io {
  return {
    out(line = "") {
      process.stdout.write(`${line}\n`);
    },
    err(line = "") {
      process.stderr.write(`${line}\n`);
    },
    async readStdin() {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
      }
      return Buffer.concat(chunks).toString("utf8");
    },
    get isTTY() {
      return Boolean(process.stdin.isTTY && process.stdout.isTTY);
    },
    async question(prompt: string) {
      const { createInterface } = await import("node:readline/promises");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(prompt);
      } finally {
        rl.close();
      }
    },
  };
}

/** An Io that records everything, for tests. */
export interface MemoryIo extends Io {
  stdout: string[];
  stderr: string[];
}

export function memoryIo(options: { stdin?: string; isTTY?: boolean; answers?: string[] } = {}): MemoryIo {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const answers = [...(options.answers ?? [])];
  return {
    stdout,
    stderr,
    out(line = "") {
      stdout.push(line);
    },
    err(line = "") {
      stderr.push(line);
    },
    async readStdin() {
      return options.stdin ?? "";
    },
    isTTY: options.isTTY ?? false,
    async question() {
      return answers.shift() ?? "";
    },
  };
}
