import { spawn } from "node:child_process";

const commands = [
  {
    name: "api",
    args: ["run", "dev", "--workspace", "@arch-draw/api"]
  },
  {
    name: "web",
    args: ["run", "dev", "--workspace", "@arch-draw/web"]
  }
];

const children = commands.map(({ name, args }) => {
  const child = spawn("npm", args, {
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => writeOutput(name, chunk));
  child.stderr.on("data", (chunk) => writeOutput(name, chunk));
  child.on("exit", (code, signal) => {
    if (isShuttingDown) return;
    stopAll();
    process.exitCode = code ?? signalToExitCode(signal);
  });

  return child;
});

let isShuttingDown = false;

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

function writeOutput(name, chunk) {
  const lines = chunk.toString().split(/\r?\n/);
  for (const line of lines) {
    if (line.length > 0) process.stdout.write(`[${name}] ${line}\n`);
  }
}

function stopAll() {
  isShuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

function signalToExitCode(signal) {
  return signal ? 1 : 0;
}
