#!/usr/bin/env bash
# Back-compat name. Production updates use deploy-update.sh.
exec "$(cd "$(dirname "$0")" && pwd)/deploy-update.sh"
