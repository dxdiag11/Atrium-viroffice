#!/bin/sh
# Self-signed cert for a server with only a public IP (no domain yet).
#
# "Mic access failed: Cannot read properties of undefined (reading 'getUserMedia')"
# means the browser decided this isn't a secure origin -- navigator.mediaDevices
# does not even exist on plain http unless the host is literally "localhost". A
# self-signed cert fixes that: once you click through the one-time browser warning,
# the origin counts as secure and the mic API appears.
#
# Usage:
#   ./scripts/make-server-cert.sh              # auto-detects the public IP
#   ./scripts/make-server-cert.sh 203.0.113.10  # or pass it explicitly
#
# Then restart the stack (`docker compose up -d --force-recreate`, or `npm start` /
# `npm run start:all` if you're not using Docker) -- every server here turns on
# https by itself the moment certs/ has key.pem + cert.pem, same as make-cert.sh
# does for a LAN IP.
set -e

IP="${1:-$(curl -fsS4 ifconfig.me 2>/dev/null || curl -fsS4 icanhazip.com 2>/dev/null)}"
if [ -z "$IP" ]; then
  echo "Could not auto-detect a public IP. Run again with it as an argument:" >&2
  echo "  ./scripts/make-server-cert.sh 203.0.113.10" >&2
  exit 1
fi

mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=atrium" \
  -addext "subjectAltName=IP:$IP,IP:127.0.0.1,DNS:localhost" 2>/dev/null

echo "cert ready for $IP"
echo
echo "Restart the stack, then open each of these once and click through the"
echo "self-signed warning (Advanced -> Proceed) before the office menu can load them:"
echo "  https://$IP:3100   (office)"
echo "  https://$IP:3200   (Gaple)"
echo "  https://$IP:3300   (Tumble Rush)"
echo "  https://$IP:3400   (Werewolf)"
