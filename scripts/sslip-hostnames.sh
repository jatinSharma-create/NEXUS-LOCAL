#!/usr/bin/env bash
# Print free sslip.io hostnames for a Lightsail static IP (no domain purchase needed).
# Usage: ./scripts/sslip-hostnames.sh 54.123.45.67
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 STATIC_IP"
  echo "Example: $0 54.123.45.67"
  exit 1
fi

IP="$1"
SLIP="${IP//./-}.sslip.io"

cat <<EOF

Free hostnames for IP ${IP} (no domain purchase):

  App:    https://${SLIP}
  Files:  https://files.${SLIP}

Add these to /opt/nexus/.env:

  DOMAIN=${SLIP}
  FILES_DOMAIN=files.${SLIP}
  PUBLIC_APP_URL=https://${SLIP}
  MINIO_PUBLIC_ENDPOINT=https://files.${SLIP}
  ACME_EMAIL=your-email@gmail.com

Telnyx webhook:
  https://${SLIP}/api/webhooks/telnyx

No DNS setup required — sslip.io resolves automatically.
Wait 1–2 minutes after first deploy for Let's Encrypt certificate.

EOF
