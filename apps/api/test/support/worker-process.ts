import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { inject } from 'vitest';

const apiDir = fileURLToPath(new URL('../..', import.meta.url));

/** Builds the API and the packages it uses, since a real worker process runs from dist/. */
export async function buildWorker(): Promise<void> {
  await promisify(execFile)('pnpm', ['--filter', '@stay-flow/api...', 'build'], { cwd: apiDir });
}

/** A worker process, as production runs it, with its output kept for when a test fails. */
export class WorkerProcess {
  private output = '';

  private constructor(private readonly child: ChildProcess) {
    const keep = (chunk: Buffer) => {
      this.output += chunk.toString();
    };
    child.stdout?.on('data', keep);
    child.stderr?.on('data', keep);
  }

  static start(env: Record<string, string>): WorkerProcess {
    const child = spawn(process.execPath, ['dist/worker.js'], {
      cwd: apiDir,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        LOG_LEVEL: 'info',
        DATABASE_URL: inject('databaseUrl'),
        HOLD_SWEEP_INTERVAL_MS: '0',
        OUTBOX_POLL_INTERVAL_MS: '50',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new WorkerProcess(child);
  }

  get logs(): string {
    return this.output;
  }

  /** Sends `signal` and waits for the process to end. */
  async stop(signal: NodeJS.Signals): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return;
    }
    const exited = once(this.child, 'exit');
    this.child.kill(signal);
    await exited;
  }

  get exited(): boolean {
    return this.child.exitCode !== null || this.child.signalCode !== null;
  }
}

/** Polls `check` until it returns true, or fails after `timeoutMs`. */
export async function waitFor(
  check: () => Promise<boolean>,
  { timeoutMs = 15_000, what = 'the condition' } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
