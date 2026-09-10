// Start the Atrium office and both desk games together, with prefixed logs.
// Each is still an ordinary standalone server; this just saves opening three terminals.
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const jobs = [
  { name: 'atrium', dir: root, port: 3100 },
  { name: 'gaple', dir: path.join(root, 'games', 'gaple'), port: 3200 },
  { name: 'tumble', dir: path.join(root, 'games', 'tumble'), port: 3300 },
  { name: 'werewolf', dir: path.join(root, 'games', 'werewolf'), port: 3400 },
];

const procs = jobs.map((j) => {
  const p = spawn(process.execPath, ['server.js'], { cwd: j.dir, env: process.env });
  const tag = '[' + j.name + '] ';
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) out.write(tag + line + '\n');
    });
  };
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on('exit', (code) => console.log(tag + 'exited (' + code + ')'));
  return p;
});

const stop = () => { for (const p of procs) p.kill('SIGINT'); };
process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('SIGTERM', () => { stop(); process.exit(0); });

console.log('\n  Atrium    http://localhost:3100');
console.log('  Gaple     http://localhost:3200   (dibuka dari kursi di kantor)');
console.log('  Tumble    http://localhost:3300   (dibuka dari kursi di kantor)');
console.log('  Werewolf  http://localhost:3400   (dibuka dari kursi di kantor)\n');
