import { spawn } from 'node:child_process';

export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) =>
      reject(
        (e as NodeJS.ErrnoException).code === 'ENOENT' ? new Error(`${cmd} not installed`) : e,
      ),
    );
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(err.trim() || `${cmd} exited ${code}`)),
    );
  });
}
