#!/usr/bin/env bash
# One command to prepare a fresh Ubuntu server for Nexus.
#
# Adds swap, installs Docker, clones the deploy branch, and drops a .env
# template. Stops there so you can fill in .env before anything starts.
# Safe to re-run.
#
#   curl -fsSL https://raw.githubusercontent.com/jatinSharma-create/NEXUS-LOCAL/deploy/scripts/server-bootstrap.sh | bash
set -euo pipefail

REPO_URL="${NEXUS_REPO_URL:-https://github.com/jatinSharma-create/NEXUS-LOCAL.git}"
BRANCH="${NEXUS_BRANCH:-deploy}"
INSTALL_DIR="${NEXUS_INSTALL_DIR:-/opt/nexus}"

# A 2 GB instance needs more swap headroom than a 4 GB one, because Chromium
# render spikes and Postgres have less real memory to share.
if [[ -z "${NEXUS_SWAP_SIZE:-}" ]]; then
  total_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 4096)
  if [[ "$total_mb" -lt 3000 ]]; then
    SWAP_SIZE="4G"
  else
    SWAP_SIZE="2G"
  fi
else
  SWAP_SIZE="$NEXUS_SWAP_SIZE"
fi

# Lightsail and OVH log in as a sudo user; bare VPS images log in as root.
if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
elif command -v sudo >/dev/null; then
  SUDO="sudo"
else
  echo "Run this as root, or install sudo." >&2
  exit 1
fi

echo "==> 1/4 Swap (${SWAP_SIZE}) so the first image build cannot run out of RAM"
# Never fatal: a 4 GB box builds fine without it, and losing swap must not
# stop Docker from installing.
add_swap() {
  if swapon --show 2>/dev/null | grep -q '/swapfile'; then
    echo "    already present, skipping"
    return 0
  fi
  # fallocate is instant but unsupported on some filesystems; dd always works.
  local dd_mb="${SWAP_SIZE%G}"
  dd_mb=$(( dd_mb * 1024 ))
  $SUDO fallocate -l "$SWAP_SIZE" /swapfile 2>/dev/null \
    || $SUDO dd if=/dev/zero of=/swapfile bs=1M count="$dd_mb" status=none
  $SUDO chmod 600 /swapfile
  $SUDO mkswap /swapfile >/dev/null
  $SUDO swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
  echo "    added"
}
add_swap || echo "    could not add swap, continuing anyway"

echo "==> 2/4 Docker"
if command -v docker >/dev/null; then
  echo "    already installed, skipping"
else
  $SUDO apt-get update -qq
  $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl git
  curl -fsSL https://get.docker.com | $SUDO sh
  $SUDO systemctl enable --now docker
fi
# So a non-root user can run docker without sudo on the next login.
if [[ -n "$SUDO" ]]; then
  $SUDO usermod -aG docker "$(id -un)" || true
fi

echo "==> 3/4 Nexus source (branch ${BRANCH})"
$SUDO mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  $SUDO git -C "$INSTALL_DIR" fetch origin
  $SUDO git -C "$INSTALL_DIR" checkout "$BRANCH"
  $SUDO git -C "$INSTALL_DIR" pull origin "$BRANCH"
else
  $SUDO git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi
$SUDO chown -R "$(id -un):$(id -gn)" "$INSTALL_DIR"
chmod +x "$INSTALL_DIR"/scripts/*.sh

echo "==> 4/4 Environment file"
cd "$INSTALL_DIR"
if [[ -f .env ]]; then
  echo "    .env already exists, left untouched"
else
  cp .env.production.example .env
  echo "    created from template"
fi

cat <<EOF

============================================================
  Ready. Two things left.

  1. Fill in the environment file:
       nano $INSTALL_DIR/.env

     Required: DOMAIN, PUBLIC_APP_URL, ACME_EMAIL, APP_PASSWORD,
               FILES_SIGNING_SECRET, NEXUS_IMAGE_OWNER,
               and your Telnyx / Groq / Gemini keys.

     COMPOSE_FILE in that file already selects the right profile, so the
     commands below need no -f flags.

  2. Start it (about 2 minutes — images are prebuilt):
       cd $INSTALL_DIR
       docker compose up -d
============================================================

EOF
