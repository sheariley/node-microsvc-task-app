#!/usr/bin/env bash
set -euo pipefail

# Run-once setup helper for OpenSearch container
# This script is intended to be executed at container startup. It will
# run the commands in the "ONE-TIME SETUP SCRIPT" section exactly once for
# the lifetime of the container (or until the marker file is removed).

# Configurable paths (override with env vars if needed)
MARKER="${OPENSEARCH__SETUP_MARKER:-/usr/share/opensearch/data/setup/.opensearch-initial-setup-done}"
LOCKDIR="${OPENSEARCH__SETUP_LOCKDIR:-/usr/share/opensearch/data/setup/opensearch-initial-setup.lock}"
# How long (seconds) to wait for lock acquisition before failing
LOCK_WAIT_SECONDS="${OPENSEARCH__SETUP_LOCK_WAIT:-30}"
SLEEP_INTERVAL=1

log() {
	printf '%s [opensearch-setup] %s\n' "$(date --iso-8601=seconds)" "$*"
}

if [ -f "$MARKER" ]; then
	log "Setup marker exists at $MARKER — skipping run-once steps."
	exit 0
fi

# Acquire lockdir (mkdir is atomic). Wait up to $LOCK_WAIT_SECONDS.
count=0
while ! mkdir "$LOCKDIR" 2>/dev/null; do
	count=$((count+1))
	if [ "$count" -ge "$LOCK_WAIT_SECONDS" ]; then
		log "Timeout waiting for setup lock after $LOCK_WAIT_SECONDS seconds. Exiting with error."
		exit 1
	fi
	sleep "$SLEEP_INTERVAL"
done

# Ensure lockdir is removed on exit
trap 'rm -rf "$LOCKDIR"' EXIT

# Re-check marker after acquiring the lock (another process may have finished while we waited)
if [ -f "$MARKER" ]; then
	log "Marker created while waiting for lock — nothing to do."
	exit 0
fi

log "Running one-time OpenSearch setup..."

# Helper: wait for OpenSearch to be reachable using the same auth and mTLS
# options used by the docker-compose healthcheck. Respects these env vars:
# - OPENSEARCH__ADMIN_USER (default: admin)
# - OPENSEARCH__ADMIN_PASS or OPENSEARCH_INITIAL_ADMIN_PASSWORD
# - OPENSEARCH__CERT_PATH (default: /run/secrets/opensearch.cert.pem)
# - OPENSEARCH__KEY_PATH  (default: /run/secrets/opensearch.key.pem)
# - OPENSEARCH__WAIT_SECONDS (how long to wait before failing; default: 60)
OPENSEARCH__ADMIN_USER="${OPENSEARCH__ADMIN_USER:-admin}"
OPENSEARCH__ADMIN_PASS="${OPENSEARCH__ADMIN_PASS:-${OPENSEARCH_INITIAL_ADMIN_PASSWORD:-}}"
OPENSEARCH__CERT_PATH="${OPENSEARCH__CERT_PATH:-/run/secrets/opensearch.cert.pem}"
OPENSEARCH__KEY_PATH="${OPENSEARCH__KEY_PATH:-/run/secrets/opensearch.key.pem}"
OPENSEARCH__WAIT_SECONDS="${OPENSEARCH__WAIT_SECONDS:-60}"

# Build curl args conditionally
curl_args=( -k )
if [ -n "$OPENSEARCH__ADMIN_PASS" ]; then
  curl_args+=( -u "${OPENSEARCH__ADMIN_USER}:${OPENSEARCH__ADMIN_PASS}" )
fi
if [ -f "$OPENSEARCH__CERT_PATH" ]; then
  curl_args+=( --cert "$OPENSEARCH__CERT_PATH" )
fi
if [ -f "$OPENSEARCH__KEY_PATH" ]; then
  curl_args+=( --key "$OPENSEARCH__KEY_PATH" )
fi

wait_for_up() {
	log "Waiting for OpenSearch at https://localhost:9200 (timeout ${OPENSEARCH__WAIT_SECONDS}s)"
	count=0
	
	while ! curl "${curl_args[@]}" --silent --fail "https://localhost:9200/_cluster/health?local=true" >/dev/null 2>&1; do
		count=$((count+1))
		if [ "$count" -ge "$OPENSEARCH__WAIT_SECONDS" ]; then
			log "Timed out waiting for OpenSearch after ${OPENSEARCH__WAIT_SECONDS}s"
			return 1
		fi
		sleep 1
	done
	log "OpenSearch is responding"
	return 0
}

# Wait for OpenSearch before running one-time setup commands. If the wait
# fails, we abort to avoid running setup against an unavailable cluster.
if ! wait_for_up; then
	log "OpenSearch not available; aborting one-time setup."
	exit 1
fi

# === BEGIN ONE-TIME SETUP SCRIPT ===

log "Creating the underlying index pattern for the log data stream"
curl "${curl_args[@]}" --fail -X PUT "https://localhost:9200/_index_template/logs-stream-template" \
    -H 'Content-Type: application/json' \
    -d '{ "index_patterns": "logs-stream", "data_stream": {}, "priority": 100 }'

log "Creating the log data stream"
curl "${curl_args[@]}" --fail -X PUT "https://localhost:9200/_data_stream/logs-stream"

# TODO: Add a command to setup a cron job to rollover the log data stream every day at midnight

# TODO: Setup retention command to trim old logs from logs data stream based on specified retention period


# === END ONE-TIME SETUP SCRIPT ===

# Create the marker file to record that setup completed successfully.
mkdir -p "$(dirname "$MARKER")"
: > "$MARKER"
log "OpenSearch one-time setup complete; marker created at $MARKER"

exit 0

