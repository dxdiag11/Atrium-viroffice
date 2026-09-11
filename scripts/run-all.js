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
  { name: 'penyusup', dir: path.join(root, 'games', 'impostor'), port: 3500 },
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

// Every server picks up certs/ on its own; this is only for the banner.
const fs = require('fs');
const tls = !process.env.NO_TLS && fs.existsSync(path.join(root, 'certs', 'cert.pem'));
const scheme = tls ? 'https' : 'http';
const officePort = tls ? 3443 : 3100;

console.log('\n  Atrium    ' + scheme + '://localhost:' + officePort);
for (const j of jobs.slice(1)) {
  console.log('  ' + j.name.padEnd(9) + ' ' + scheme + '://localhost:' + j.port + '   (dibuka dari kursi di kantor)');
}
if (tls) {
  console.log('\n  Sertifikatnya self-signed, jadi tiap port harus diterima sekali.');
  console.log('  Buka tiap alamat game di atas satu kali sebelum main.\n');
} else {
  console.log('');
}
