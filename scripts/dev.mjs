import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const processes = [];
let stopping = false;
const virtualenvPython = process.platform === 'win32'
  ? '.venv/Scripts/python.exe'
  : '.venv/bin/python';
const python = process.env.PYTHON
  ?? (existsSync(virtualenvPython) ? virtualenvPython : 'python3');

function stopProcesses(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  process.exitCode = exitCode;
}

const backend = spawn(
  python,
  ['backend/server.py'],
  { stdio: 'inherit' },
);
processes.push(backend);

const frontend = spawn(
  'npm',
  ['run', 'dev:web'],
  { stdio: 'inherit' },
);
processes.push(frontend);

for (const child of processes) {
  child.on('error', error => {
    console.error(error);
    stopProcesses(1);
  });
  child.on('exit', code => {
    if (!stopping) stopProcesses(code ?? 1);
  });
}

process.on('SIGINT', () => stopProcesses());
process.on('SIGTERM', () => stopProcesses());
