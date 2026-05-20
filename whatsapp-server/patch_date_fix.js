'use strict';
// Run on James: node ~/Code/todo-list/whatsapp-server/patch_date_fix.js
// Fixes: calendar event created on wrong day because Qwen 7b can't do date arithmetic.
// Solution: pre-compute a 14-day date table and include it in the prompt.

const fs = require('fs');
const p = '/Users/lowndes/Code/whatsapp-server/index.js';
let s = fs.readFileSync(p, 'utf8');

const oldParseEvent = `async function parseEventRequest(text) {
  const now = new Date().toLocaleString('en-GB', { timeZone: CALENDAR_TZ,
    weekday:'long', day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const prompt = \`You are a calendar assistant. Parse this calendar request into JSON.

Today is \${now}.

Request: \${text}

Return ONLY a valid JSON object:
{"title":"event title","date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","location":null}

Rules:
- "this friday" = the coming Friday
- "next tuesday" = Tuesday of next week
- If no end time, set end_time to 1 hour after start
- If no title given, infer one from context (e.g. "Dentist appointment")
- date format: YYYY-MM-DD, time format: HH:MM (24h)\`;`;

const newParseEvent = `async function parseEventRequest(text) {
  const now = new Date();
  const nowStr = now.toLocaleString('en-GB', { timeZone: CALENDAR_TZ,
    weekday:'long', day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });

  // Pre-compute next 14 days so Qwen doesn't need to do date arithmetic
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const label = d.toLocaleDateString('en-GB', { timeZone: CALENDAR_TZ, weekday: 'long', day: '2-digit', month: 'short' });
    const iso   = d.toLocaleDateString('en-CA', { timeZone: CALENDAR_TZ }); // YYYY-MM-DD
    days.push(\`\${label} → \${iso}\`);
  }
  const dateTable = days.join('\\n');

  const prompt = \`You are a calendar assistant. Parse this calendar request into JSON.

Today is \${nowStr}.

Upcoming dates (use these to resolve day references):
\${dateTable}

Request: \${text}

Return ONLY a valid JSON object:
{"title":"event title","date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","location":null}

Rules:
- Use the date table above to resolve day references like "tuesday", "next friday", "this saturday"
- If no end time, set end_time to 1 hour after start
- If no title given, infer one from context (e.g. "Dentist appointment")
- date format: YYYY-MM-DD, time format: HH:MM (24h)\`;`;

if (s.includes(oldParseEvent)) {
  s = s.replace(oldParseEvent, newParseEvent);
  fs.writeFileSync(p, s);
  console.log('✓ parseEventRequest updated with pre-computed date table');
  console.log('\nRestart whatsapp-server:');
  console.log('  launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.james.whatsapp-server.plist');
  console.log('  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.james.whatsapp-server.plist');
} else {
  console.error('✗ Could not find parseEventRequest — may have already been patched or index.js changed');
  console.error('  Check ~/Code/whatsapp-server/index.js manually');
}
