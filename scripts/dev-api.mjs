import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const virtualenvPython = process.platform === 'win32'
  ? resolve(projectRoot, '.venv', 'Scripts', 'python.exe')
  : resolve(projectRoot, '.venv', 'bin', 'python');
const python = process.env.PYTHON
  ?? (existsSync(virtualenvPython) ? virtualenvPython : 'python3');
const backend = spawn(
  python,
  ['backend/server.py'],
  { cwd: projectRoot, stdio: 'inherit' },
);

backend.on('error', error => {
  console.error(error);
  process.exitCode = 1;
});
backend.on('exit', code => {
  process.exitCode = code ?? 1;
});
process.on('SIGINT', () => backend.kill('SIGINT'));
process.on('SIGTERM', () => backend.kill('SIGTERM'));
