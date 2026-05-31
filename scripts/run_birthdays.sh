#!/bin/bash
# Wrapper called by launchd — picks mode based on hour.
HOUR=$(date +%H)
if [ "$HOUR" = "19" ]; then
  MODE="evening"
else
  MODE="daytime"
fi

SCRIPT_DIR="$(dirname "$0")"

# Load env vars
ENV_FILE="$SCRIPT_DIR/../.env"
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi

exec "$SCRIPT_DIR/venv/bin/python" "$SCRIPT_DIR/birthdays.py" "$MODE"
