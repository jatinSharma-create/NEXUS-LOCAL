#!/usr/bin/env bash
# Back-compat name. Bootstrap is host-agnostic now.
exec "$(cd "$(dirname "$0")" && pwd)/server-bootstrap.sh" "$@"
