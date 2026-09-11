// Serve a games/* app over the office's own certificate when there is one.
//
// The office runs on https as soon as certs/ exists, because browsers will not hand out
// a mic on a plain LAN origin. An https page cannot iframe an http one, so the games
// have to follow it onto https or the overlay comes up blank.
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');

const CERTS = path.join(__dirname, '..', 'certs');

function createServer(app) {
  const key = path.join(CERTS, 'key.pem');
  const cert = path.join(CERTS, 'cert.pem');
  const secure = !process.env.NO_TLS && fs.existsSync(key) && fs.existsSync(cert);

  const server = secure
    ? https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, app)
    : http.createServer(app);

  server.scheme = secure ? 'https' : 'http';
  return server;
}

function announce(label, server, port) {
  const s = server.scheme;
  console.log('\n  ' + label + '  ' + s + '://localhost:' + port);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('  ' + ' '.repeat(label.length) + '  ' + s + '://' + net.address + ':' + port);
      }
    }
  }
  console.log('');
}

module.exports = { createServer, announce };
