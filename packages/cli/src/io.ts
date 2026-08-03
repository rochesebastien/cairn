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

/**
 * True once a downstream reader has hung up (`cairn list | head -3`).
 * Module-level because it is a property of this process's stdio, not of a
 * particular Io instance.
 */
let downstreamClosed = false;
let epipeHandled = false;

function isEpipe(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "EPIPE";
}

/**
 * Node reports a write to a closed pipe as an asynchronous `error` event, which
 * is fatal when nobody listens — so `cairn show <id> | head` used to die with an
 * EPIPE stack trace instead of printing the first lines. A reader that stopped
 * reading is not a Cairn failure: remember it, stop writing, and let the command
 * still return its real exit code (`cairn verify | head` must keep exiting 1).
 */
function absorbEpipe(): void {
  if (epipeHandled) return;
  epipeHandled = true;
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (error: unknown) => {
      if (isEpipe(error)) {
        downstreamClosed = true;
        return;
      }
      // Anything else is a genuine stdio failure: crash as we always did.
      process.nextTick(() => {
        throw error;
      });
    });
  }
}

function write(stream: NodeJS.WriteStream, line: string): void {
  if (downstreamClosed || stream.destroyed) return;
  try {
    stream.write(`${line}\n`);
  } catch (error) {
    if (!isEpipe(error)) throw error;
    downstreamClosed = true;
  }
}

export function defaultIo(): Io {
  absorbEpipe();
  return {
    out(line = "") {
      write(process.stdout, line);
    },
    err(line = "") {
      write(process.stderr, line);
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
