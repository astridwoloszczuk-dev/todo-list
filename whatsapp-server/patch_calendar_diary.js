'use strict';
// Run once on James: node patch_calendar_diary.js
// Adds two WhatsApp features:
//   1. Create Outlook calendar events ("add dentist Friday 3pm")
//   2. Set reminders ("remind me to call school at 4pm")
//
// Prerequisites:
//   - ms_token.json must have Calendars.ReadWrite scope
//     If you get a 403 when creating events, you need to re-authorise:
//     cd ~/Code/morning-briefing && python3 ms_auth.py  (run interactively)
//     Then add Calendars.ReadWrite to the scope list in that script first.
//   - Add to whatsapp-server .env:
//       MS_CLIENT_ID=<your azure app client id>
//       MS_TOKEN_PATH=/Users/lowndes/Code/morning-briefing/ms_token.json

const fs = require('fs');
const p = '/Users/lowndes/Code/whatsapp-server/index.js';
let s = fs.readFileSync(p, 'utf8');
let changes = 0;

// ── 1. Update BRAIN_SYSTEM ───────────────────────────────────────────────────
// Add create_event and set_reminder intents alongside diary

const oldBrainIntents = `- diary: The message is about scheduling something at a specific time or date (appointments, events, meetings)
- unknown: Anything else (greetings, questions, gibberish)`;

const newBrainIntents = `- create_event: The person wants to add an appointment, event, or meeting to the calendar
- set_reminder: The person wants to be reminded about something at a specific time ("remind me", "don't let me forget", "ping me")
- diary: (alias for create_event — treat the same)
- unknown: Anything else (greetings, questions, gibberish)`;

if (s.includes(oldBrainIntents)) {
  s = s.replace(oldBrainIntents, newBrainIntents);
  changes++;
  console.log('+ Updated BRAIN_SYSTEM intents');
} else {
  console.warn('! BRAIN_SYSTEM diary line not found — already patched?');
}

const oldBrainExamples = `{"intent": "diary", "request": "the original request text"}
{"intent": "unknown"}`;

const newBrainExamples = `{"intent": "create_event", "request": "the original request text"}
{"intent": "set_reminder", "request": "the original request text"}
{"intent": "diary", "request": "the original request text"}
{"intent": "unknown"}`;

if (s.includes(oldBrainExamples)) {
  s = s.replace(oldBrainExamples, newBrainExamples);
  changes++;
  console.log('+ Updated BRAIN_SYSTEM examples');
}

// ── 2. Add MS Graph + reminder helpers ──────────────────────────────────────
// Insert before handleGeneralAI

const helperCode = `
// ── MS Graph calendar ─────────────────────────────────────────────────────────
const MS_TOKEN_PATH = process.env.MS_TOKEN_PATH || '/Users/lowndes/Code/morning-briefing/ms_token.json';
const MS_TOKEN_URL  = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const MS_GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const CALENDAR_TZ   = 'Europe/Vienna';

let _msToken = null;

function loadMsToken() {
  try {
    return JSON.parse(fs.readFileSync(MS_TOKEN_PATH, 'utf8'));
  } catch (e) {
    console.error('MS token file not found:', MS_TOKEN_PATH);
    return null;
  }
}

async function refreshMsToken(token) {
  const clientId = process.env.MS_CLIENT_ID;
  if (!clientId) throw new Error('MS_CLIENT_ID not set in .env');
  const params = new URLSearchParams({
    client_id:     clientId,
    refresh_token: token.refresh_token,
    grant_type:    'refresh_token',
    scope:         'Calendars.ReadWrite offline_access',
  });
  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(\`Token refresh failed: \${res.status}\`);
  const newToken = await res.json();
  fs.writeFileSync(MS_TOKEN_PATH, JSON.stringify(newToken, null, 2));
  return newToken;
}

async function getMsAccessToken() {
  let token = loadMsToken();
  if (!token) return null;
  // Check if access_token is expired (exp minus 5 min buffer)
  const exp = token.ext_expires_in
    ? (token._fetched_at || 0) + (token.ext_expires_in - 300) * 1000
    : 0;
  if (Date.now() > exp) {
    try { token = await refreshMsToken(token); } catch (e) {
      console.warn('MS token refresh failed, trying existing:', e.message);
    }
  }
  return token.access_token;
}

async function callMsGraph(method, path, body) {
  const accessToken = await getMsAccessToken();
  if (!accessToken) throw new Error('No MS access token available');
  const res = await fetch(MS_GRAPH_BASE + path, {
    method,
    headers: {
      Authorization: \`Bearer \${accessToken}\`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 403) throw new Error('Permission denied — token needs Calendars.ReadWrite scope. Re-authorise via ms_auth.py on James.');
  if (!res.ok) throw new Error(\`MS Graph \${method} \${path} → \${res.status}\`);
  return res.status === 204 ? null : res.json();
}

// Add one hour to HH:MM string
function addOneHour(t) {
  const [h, m] = t.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  d.setHours(d.getHours() + 1);
  return \`\${String(d.getHours()).padStart(2,'0')}:\${String(d.getMinutes()).padStart(2,'0')}\`;
}

// ── Event creation ────────────────────────────────────────────────────────────
async function parseEventRequest(text) {
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
- date format: YYYY-MM-DD, time format: HH:MM (24h)\`;

  const raw = await callQwen([{ role: 'user', content: prompt }], QWEN_CHAT_MODEL);
  const cleaned = raw.replace(/\`\`\`json\\n?/g, '').replace(/\`\`\`/g, '').trim();
  return JSON.parse(cleaned);
}

async function handleCreateEvent(sock, person, text) {
  let parsed;
  try {
    parsed = await parseEventRequest(text);
  } catch (e) {
    console.error(\`[\${person.name}] Event parse error: \${e.message}\`);
    await send(sock, person.whatsapp_number,
      "Sorry, I couldn't parse that. Try something like:\\n• add dentist friday 3pm\\n• tennis saturday 10am to 12pm");
    return;
  }

  try {
    const endTime = parsed.end_time || addOneHour(parsed.start_time);
    const event = {
      subject: parsed.title,
      start: { dateTime: \`\${parsed.date}T\${parsed.start_time}:00\`, timeZone: CALENDAR_TZ },
      end:   { dateTime: \`\${parsed.date}T\${endTime}:00\`,         timeZone: CALENDAR_TZ },
    };
    if (parsed.location) event.location = { displayName: parsed.location };

    await callMsGraph('POST', '/me/events', event);

    let reply = \`✅ Done!\\n\\n*\${parsed.title}*\\n\${parsed.date} · \${parsed.start_time}–\${endTime}\`;
    if (parsed.location) reply += \`\\n📍 \${parsed.location}\`;
    await send(sock, person.whatsapp_number, reply);
    console.log(\`[\${person.name}] create_event → \${parsed.title} \${parsed.date} \${parsed.start_time}\`);
  } catch (e) {
    console.error(\`[\${person.name}] Event create error: \${e.message}\`);
    await send(sock, person.whatsapp_number, \`Sorry, couldn't create the event: \${e.message}\`);
  }
}

// ── Reminders ─────────────────────────────────────────────────────────────────
// In-memory scheduling. Reminders lost on restart (acceptable for same-day use).

async function parseReminderRequest(text) {
  const now = new Date().toLocaleString('en-GB', { timeZone: CALENDAR_TZ,
    weekday:'long', day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const prompt = \`You are a reminder assistant. Parse this reminder request into JSON.

Now is \${now}.

Request: \${text}

Return ONLY a valid JSON object:
{"message":"what to remind","due":"YYYY-MM-DDTHH:MM:00"}

Examples:
"remind me to call school at 4pm" → {"message":"Call school","due":"YYYY-MM-DDT16:00:00"}
"ping me about the dentist in 2 hours" → {"message":"Dentist","due":"YYYY-MM-DDT<now+2h>:00"}
"don't let me forget to pick up Vicky this afternoon" → {"message":"Pick up Vicky","due":"YYYY-MM-DDT15:30:00"}

Rules:
- "this afternoon" = 15:30 today
- "this evening" = 19:00 today
- "tonight" = 20:00 today
- "in X hours" = now + X hours
- Return today's date in due field\`;

  const raw = await callQwen([{ role: 'user', content: prompt }], QWEN_CHAT_MODEL);
  const cleaned = raw.replace(/\`\`\`json\\n?/g, '').replace(/\`\`\`/g, '').trim();
  return JSON.parse(cleaned);
}

async function handleSetReminder(sock, person, text) {
  let parsed;
  try {
    parsed = await parseReminderRequest(text);
  } catch (e) {
    console.error(\`[\${person.name}] Reminder parse error: \${e.message}\`);
    await send(sock, person.whatsapp_number,
      "Sorry, I couldn't parse that. Try: \\"remind me to call Niko at 6pm\\"");
    return;
  }

  const dueDate = new Date(parsed.due);
  const delayMs = dueDate.getTime() - Date.now();

  if (delayMs <= 0) {
    await send(sock, person.whatsapp_number, \`That time is already past. Try a future time.\`);
    return;
  }

  const dueStr = dueDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: CALENDAR_TZ });
  await send(sock, person.whatsapp_number, \`⏰ Reminder set for \${dueStr}: \${parsed.message}\`);
  console.log(\`[\${person.name}] reminder set: "\${parsed.message}" in \${Math.round(delayMs/60000)} min\`);

  setTimeout(async () => {
    try {
      await send(sock, person.whatsapp_number, \`⏰ Reminder: \${parsed.message}\`);
      console.log(\`[\${person.name}] reminder fired: "\${parsed.message}"\`);
    } catch (e) {
      console.error(\`[\${person.name}] Reminder send failed: \${e.message}\`);
    }
  }, delayMs);
}

`;

// Insert before handleGeneralAI
const genAIAnchor = 'async function handleGeneralAI(';
if (!s.includes('async function handleCreateEvent(')) {
  if (s.includes(genAIAnchor)) {
    s = s.replace(genAIAnchor, helperCode + genAIAnchor);
    changes++;
    console.log('+ Added MS Graph + reminder helper functions');
  } else {
    console.error('! Could not find handleGeneralAI anchor — aborting helper insertion');
    process.exit(1);
  }
} else {
  console.warn('! handleCreateEvent already exists — skipping helper insertion');
}

// ── 3. Update handleInbound switch to route new intents ──────────────────────
// Add cases for create_event, set_reminder, diary (→ create_event)

const oldDiaryCase = `case 'diary':
      await handleDiary(client, person, text);
      break;`;

const newDiaryCases = `case 'create_event':
    case 'diary':
      await handleCreateEvent(sock, person, text);
      break;
    case 'set_reminder':
      await handleSetReminder(sock, person, text);
      break;`;

// The on-James version uses 'sock' not 'client' in handleInbound
// Try both patterns
const oldDiaryCaseSock = `case 'diary':
      await handleDiary(sock, person, text);
      break;`;

if (s.includes(oldDiaryCase)) {
  s = s.replace(oldDiaryCase, newDiaryCases);
  changes++;
  console.log('+ Updated switch: routed diary/create_event/set_reminder (client)');
} else if (s.includes(oldDiaryCaseSock)) {
  s = s.replace(oldDiaryCaseSock, newDiaryCases);
  changes++;
  console.log('+ Updated switch: routed diary/create_event/set_reminder (sock)');
} else {
  // Fallback: insert before the general_ai case
  const generalAiCase = `case 'general_ai':`;
  if (s.includes(generalAiCase) && !s.includes("case 'create_event':")) {
    const newCases = `case 'create_event':
    case 'diary':
      await handleCreateEvent(sock, person, text);
      break;
    case 'set_reminder':
      await handleSetReminder(sock, person, text);
      break;
    ` + generalAiCase;
    s = s.replace(generalAiCase, newCases);
    changes++;
    console.log('+ Inserted create_event/set_reminder cases before general_ai');
  } else {
    console.warn('! Could not find diary case or general_ai case — switch not updated');
    console.warn('  Add manually: case "create_event" → handleCreateEvent, case "set_reminder" → handleSetReminder');
  }
}

// ── 4. Add fs require if not present ─────────────────────────────────────────
if (!s.includes("require('fs')") && !s.includes('require("fs")')) {
  s = s.replace("'use strict';", "'use strict';\nconst fs = require('fs');");
  changes++;
  console.log('+ Added fs require');
}

fs.writeFileSync(p, s);
console.log(`\nDone! ${changes} change(s) applied.`);
console.log('\nNext steps:');
console.log('1. Add to whatsapp-server .env:');
console.log('     MS_CLIENT_ID=<your azure app client id>');
console.log('     MS_TOKEN_PATH=/Users/lowndes/Code/morning-briefing/ms_token.json');
console.log('2. If calendar event creation returns 403, re-authorise with Calendars.ReadWrite scope');
console.log('3. Restart: node index.js');
console.log('\nTest with:');
console.log('  "add dentist appointment friday 3pm"');
console.log('  "remind me to call the school at 4pm"');
