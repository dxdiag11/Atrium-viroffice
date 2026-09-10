#!/bin/sh
# Self-signed cert for LAN testing. Browsers block getUserMedia on plain http://
# unless the host is localhost, so a friend on another machine needs https.
# Re-run this whenever your LAN IP changes.
set -e
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1)
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=gather-mvp" \
  -addext "subjectAltName=IP:$IP,IP:127.0.0.1,DNS:localhost" 2>/dev/null
echo "cert ready for $IP"
echo "share this link: https://$IP:3443"
