#!/bin/bash
# Sets up birthday reminders as a launchd service on James.
# Run from ~/Code/todo-list: bash scripts/setup_birthdays_james.sh

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
ENV_FILE="$REPO_DIR/.env"
VENV="$SCRIPT_DIR/venv"
PLIST="$HOME/Library/LaunchAgents/com.james.birthdays.plist"
LOG="$SCRIPT_DIR/birthdays.log"

echo "=== Birthday reminders setup ==="
echo "Repo: $REPO_DIR"

# ── 1. Check .env ─────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "No .env found at $ENV_FILE. Creating one now:"
  read -p "SUPABASE_URL [https://mezayharkjyvnnhvdlww.supabase.co]: " SB_URL
  SB_URL="${SB_URL:-https://mezayharkjyvnnhvdlww.supabase.co}"
  read -p "SUPABASE_SERVICE_KEY (secret key from Supabase → Settings → API): " SB_KEY
  cat > "$ENV_FILE" <<EOF
SUPABASE_URL=$SB_URL
SUPABASE_SERVICE_KEY=$SB_KEY
EOF
  echo "✓ .env written"
else
  echo "✓ .env already exists"
  # Check it has the service key
  if ! grep -q "SUPABASE_SERVICE_KEY" "$ENV_FILE"; then
    echo ""
    echo "SUPABASE_SERVICE_KEY missing from .env — please add it:"
    read -p "SUPABASE_SERVICE_KEY: " SB_KEY
    echo "SUPABASE_SERVICE_KEY=$SB_KEY" >> "$ENV_FILE"
    echo "✓ Added SUPABASE_SERVICE_KEY to .env"
  fi
fi

# ── 2. Create venv + install deps ────────────────────────────────────────────
echo ""
PYTHON=$(which python3 2>/dev/null || true)
if [ -z "$PYTHON" ]; then
  echo "Python not found. Run: brew install python3"; exit 1
fi

if [ ! -d "$VENV" ] || [ ! -f "$VENV/bin/python" ]; then
  echo "Creating virtual environment..."
  rm -rf "$VENV"
  "$PYTHON" -m venv "$VENV"
fi

echo "Installing dependencies..."
"$VENV/bin/python" -m pip install -q supabase python-dotenv
echo "✓ Dependencies installed"

# ── 3. Make wrapper executable ────────────────────────────────────────────────
chmod +x "$SCRIPT_DIR/run_birthdays.sh"

# ── 4. Write launchd plist ───────────────────────────────────────────────────
echo ""
echo "Writing launchd plist..."
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.james.birthdays</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$SCRIPT_DIR/run_birthdays.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>13</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>16</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>19</integer><key>Minute</key><integer>0</integer></dict>
    </array>
    <key>StandardOutPath</key>
    <string>$LOG</string>
    <key>StandardErrorPath</key>
    <string>$LOG</string>
</dict>
</plist>
EOF
echo "✓ Plist written"

# ── 5. Load the service ───────────────────────────────────────────────────────
echo ""
launchctl bootout "gui/$(id -u)/com.james.birthdays" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✓ Birthday reminders scheduled (07:00 10:00 13:00 16:00 19:00)"

# ── 6. Test run ───────────────────────────────────────────────────────────────
echo ""
echo "Running a quick test (daytime mode)..."
bash "$SCRIPT_DIR/run_birthdays.sh" || true
echo ""
echo "Log: tail -f $LOG"
echo "Done!"
