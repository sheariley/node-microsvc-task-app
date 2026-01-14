#!/usr/bin/env bash
set -euo pipefail

# Custom entrypoint for OpenSearch containers.
# Behavior:
# - Start the one-time setup script in the background (if present).
# - Exec the original OpenSearch entrypoint (if available) or the provided
#   command arguments so the container behaves like the upstream image.
#
# Usage: mount this script into the container and set it as the entrypoint.

log() { printf '%s [opensearch-entrypoint] %s\n' "$(date --iso-8601=seconds)" "$*"; }

# Locate the setup script in a few likely places. The host repo places
# it under `backend-config/opensearch-initial-setup.sh`; when mounted
# into the container you'll typically map it into the same directory as
# this entrypoint or under `/usr/share/opensearch`.
find_setup_script() {
  local me_dir setup_candidates
  me_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  setup_candidates=(
    "$me_dir/custom-initial-setup.sh"
    "/usr/share/opensearch/custom-initial-setup.sh"
  )
  for p in "${setup_candidates[@]}"; do
    if [ -x "$p" ]; then
      echo "$p"
      return 0
    fi
    if [ -f "$p" ]; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

setup_script=""
if setup_script="$(find_setup_script)"; then
  log "Found setup script at $setup_script — launching in background"
  # Run in background and redirect output to a logfile inside the setup volume
  # TODO: Try using a sub-dir of the opensearch data volume path
  mkdir -p /usr/share/opensearch/data/setup || true
  "$setup_script" >/usr/share/opensearch/data/setup/opensearch-setup.log 2>&1 &
  disown
else
  log "No setup script found; skipping background setup run"
fi

log "Executing default OpenSearch entrypoint"
exec /usr/share/opensearch/opensearch-docker-entrypoint.sh "$@"

