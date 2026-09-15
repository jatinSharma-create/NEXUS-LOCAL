#!/usr/bin/env bash
# Back-compat name. Production bootstrap uses server-bootstrap.sh.
exec "$(cd "$(dirname "$0")" && pwd)/server-bootstrap.sh" "$@"
