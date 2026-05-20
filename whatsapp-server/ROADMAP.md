# James WhatsApp Channel — Roadmap

## Things To Do On James (run these now)

### 1. Apply calendar/reminder patch
```bash
node ~/Code/todo-list/whatsapp-server/patch_calendar_diary.js
```
Then add to `~/Code/whatsapp-server/.env`:
```
MS_CLIENT_ID=<azure app client id — same as in morning-briefing .env>
MS_TOKEN_PATH=/Users/lowndes/Code/morning-briefing/ms_token.json
```

### 2. Set up whatsapp-server + birthdays as launchd services
```bash
# First: copy birthdays.py to James if not already there
scp root@<vps-ip>:/root/todo-list/scripts/birthdays.py ~/Code/todo-list/scripts/

# Then run setup script
bash ~/Code/todo-list/whatsapp-server/setup_james_services.sh
```
This sets up whatsapp-server as an auto-restart service and birthdays.py at 7/10/13/16/19h.

### 3. Kill VPS cron jobs (SSH to Hetzner, then `crontab -e`)
Remove these three lines:
```
0 5 * * 1-5  cd /root/todo-list/scripts && python3 prioritise.py
0 11 * * 1-5 cd /root/todo-list/scripts && python3 digest.py
0 6 * * 1    cd /root/todo-list/scripts && python3 weekly_insights.py
```
Keep the birthday cron until James birthdays service is confirmed working.

### 4. Calendar event creation: re-authorise if needed
If creating events gives a 403 error, the ms_token.json needs `Calendars.ReadWrite` scope.
The current token was authorised with `Calendars.Read` only.
Fix: re-run the MS OAuth flow on James with the expanded scope.

---

## Bugs / Known Issues

- **Missed messages during internet outage**: Baileys reconnects but catch-up messages arrive as type `append` not `notify` — our handler ignores them. Fix: also handle `append` but filter to messages received in last 5 minutes.

- **Qwen geography**: Qwen 7b doesn't always know Vienna districts well. Improve JAMES_SYSTEM prompt with more local context, or add "Vienna, Austria" to all location queries automatically.

- **Family member JIDs**: Only Astrid is configured. Need Niko, Max, Alex, Vicky to message James once — capture their `@lid` JIDs from terminal and update Supabase `people` table.

- **Reminder persistence**: Reminders are in-memory only — lost if James restarts. Fine for same-day use. For overnight reminders, need Supabase `reminders` table + polling loop.

## Features to Build

### Email actions from WhatsApp
- Reply to digest items: "reply to the funding application email saying I'll submit by Friday"
- Flag/move emails: "move that invoice to archive"
- Quick compose: "James, email Niko's school asking about the trip"

### Claude escalation
- Complex research tasks (hotels in Japan, compare options) → route to Claude Haiku
- Guard rails: max tokens, cost threshold alert if a single response exceeds €0.10
- Prefix override: "Claude: find me hotels in Tokyo for August" forces Claude

### Smarter local knowledge
- Add Vienna-specific context to JAMES_SYSTEM (districts, local services)
- Or: give James a tool to search the web for local queries

## Nice to Have
- Message James ignores during outage get queued and processed on reconnect
- Conversation session timeout currently 30 min — make configurable per person
- Weekly summary of what James was asked (sent via email)
