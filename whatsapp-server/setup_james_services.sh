#!/bin/bash
# Run on James: bash ~/Code/todo-list/whatsapp-server/setup_james_services.sh
# Sets up launchd services for:
#   1. whatsapp-server (continuous, auto-restarts)
#   2. birthdays.py (5x daily: 7, 10, 13, 16, 19)
#
# Prerequisites:
#   - ~/Code/whatsapp-server/index.js exists and has been patched
#   - ~/Code/todo-list/ exists (git pull from VPS or copy)
#   - python3 is available

set -e
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$HOME/logs"

# ── Pre-flight checks ─────────────────────────────────────────────────────────
if [ ! -f "$HOME/Code/todo-list/scripts/birthdays.py" ]; then
  echo ""
  echo "❌ $HOME/Code/todo-list/scripts/birthdays.py not found."
  echo "   Copy the todo-list/scripts folder to James first:"
  echo "   On James: mkdir -p ~/Code/todo-list/scripts"
  echo "   From VPS: scp root@<vps-ip>:/root/todo-list/scripts/birthdays.py ~/Code/todo-list/scripts/"
  echo "   Also copy any .env or requirements (check if birthdays.py has imports)"
  echo ""
  echo "   Then re-run this script."
  exit 1
fi

if [ ! -f "$HOME/Code/whatsapp-server/index.js" ]; then
  echo "❌ whatsapp-server/index.js not found at ~/Code/whatsapp-server/"
  exit 1
fi

NODE=$(which node || echo "/opt/homebrew/bin/node")
PYTHON=$(which python3 || echo "/usr/bin/python3")

echo "Using node: $NODE"
echo "Using python3: $PYTHON"

# ── 1. whatsapp-server ────────────────────────────────────────────────────────

cat > "$LAUNCH_AGENTS/com.james.whatsapp-server.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.james.whatsapp-server</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$HOME/Code/whatsapp-server/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$HOME/Code/whatsapp-server</string>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/logs/whatsapp-server.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/logs/whatsapp-server.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF

echo "✓ whatsapp-server plist written"

# ── 2. birthdays.py wrapper script ───────────────────────────────────────────

mkdir -p "$HOME/Code/scripts"
cat > "$HOME/Code/scripts/run_birthdays.sh" << 'SCRIPT'
#!/bin/bash
cd $HOME/Code/todo-list/scripts
HOUR=$(date +%H)
if [ "$HOUR" = "19" ]; then
  python3 birthdays.py evening
else
  python3 birthdays.py daytime
fi
SCRIPT
chmod +x "$HOME/Code/scripts/run_birthdays.sh"
echo "✓ birthdays wrapper script written"

# ── 3. birthdays launchd plist (runs at 7, 10, 13, 16, 19) ──────────────────

cat > "$LAUNCH_AGENTS/com.james.birthdays.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.james.birthdays</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$HOME/Code/scripts/run_birthdays.sh</string>
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
  <string>$HOME/logs/birthdays.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/logs/birthdays.log</string>
</dict>
</plist>
EOF

echo "✓ birthdays plist written"

# ── 4. Load all services ──────────────────────────────────────────────────────

UID_VAL=$(id -u)

# Unload first if already loaded (ignore errors)
launchctl bootout gui/$UID_VAL "$LAUNCH_AGENTS/com.james.whatsapp-server.plist" 2>/dev/null || true
launchctl bootout gui/$UID_VAL "$LAUNCH_AGENTS/com.james.birthdays.plist"       2>/dev/null || true

launchctl bootstrap gui/$UID_VAL "$LAUNCH_AGENTS/com.james.whatsapp-server.plist"
echo "✓ whatsapp-server loaded"

launchctl bootstrap gui/$UID_VAL "$LAUNCH_AGENTS/com.james.birthdays.plist"
echo "✓ birthdays loaded"

echo ""
echo "All done! Check status with:"
echo "  launchctl list | grep james"
echo ""
echo "View logs:"
echo "  tail -f ~/logs/whatsapp-server.log"
echo "  tail -f ~/logs/birthdays.log"
echo ""
echo "NOTE: If whatsapp-server was already running in a terminal, kill it first:"
echo "  pkill -f 'node.*index.js'"
