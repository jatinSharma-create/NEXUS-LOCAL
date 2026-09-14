#!/usr/bin/env bash
# Back-compat name. Production bootstrap uses hetzner-bootstrap.sh.
exec "$(cd "$(dirname "$0")" && pwd)/hetzner-bootstrap.sh"
