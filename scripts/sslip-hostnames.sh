#!/usr/bin/env bash
# Print free sslip.io hostnames for a server IPv4 (no domain purchase needed).
# On Lightsail, pass the STATIC IP — the default public IP changes on stop.
# Usage: ./scripts/sslip-hostnames.sh 13.55.12.34
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 IPV4"
  echo "Example: $0 13.55.12.34"
  exit 1
fi

IP="$1"
SLIP="${IP//./-}.sslip.io"

cat <<EOF

Free hostname for IP ${IP} (no domain purchase):

  App:  https://${SLIP}

Add these three lines to /opt/nexus/.env:

  DOMAIN=${SLIP}
  PUBLIC_APP_URL=https://${SLIP}
  ACME_EMAIL=your-email@gmail.com

One hostname is all you need: downloads are served by the app itself at
/api/files. (On the 4 GB profile, where MinIO runs, you would also set
FILES_DOMAIN=files.${SLIP} and MINIO_PUBLIC_ENDPOINT=https://files.${SLIP}.)

Telnyx webhook:
  https://${SLIP}/api/webhooks/voice/telnyx

No DNS setup required — sslip.io resolves automatically.
Wait 1–2 minutes after first deploy for Let's Encrypt certificate.

EOF
