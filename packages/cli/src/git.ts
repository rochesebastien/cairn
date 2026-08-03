import { runArgv } from "./proc.js";

/**
 * The commit a green run happened on, recorded in `lastGreen.commit`.
 * Git is optional: a project without it simply records no commit.
 */
export async function currentCommit(root: string): Promise<string | undefined> {
  const result = await runArgv("git", ["rev-parse", "HEAD"], { cwd: root });
  if (result.error || result.code !== 0) return undefined;
  const commit = result.stdout.trim();
  return /^[0-9a-f]{7,40}$/i.test(commit) ? commit : undefined;
}
