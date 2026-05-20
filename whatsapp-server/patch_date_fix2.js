'use strict';
// Run on James: node ~/Code/todo-list/whatsapp-server/patch_date_fix2.js
// Fixes wrong-day bug by having JavaScript resolve day references instead of Qwen.
// Qwen now only extracts the day NAME ("next tuesday") — JS computes the actual date.

const fs = require('fs');
const p = '/Users/lowndes/Code/whatsapp-server/index.js';
let s = fs.readFileSync(p, 'utf8');

// ── 1. Add resolveDayRef helper ───────────────────────────────────────────────

const resolverFn = `
// Resolve a plain-English day reference to YYYY-MM-DD (Vienna time).
// Handles: today, tomorrow, monday–sunday, next monday–sunday, this monday–sunday, YYYY-MM-DD.
function resolveDayRef(ref) {
  const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  ref = (ref || '').toLowerCase().trim();

  const isoDate = d => {
    const y = d.getFullYear();
    const mo = String(d.getMonth()+1).padStart(2,'0');
    const dy = String(d.getDate()).padStart(2,'0');
    return y+'-'+mo+'-'+dy;
  };

  // Already YYYY-MM-DD
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(ref)) return ref;

  // Get current date/time in Vienna
  const nowVienna = new Date(new Date().toLocaleString('en-US', { timeZone: CALENDAR_TZ }));
  const todayIdx  = nowVienna.getDay(); // 0=Sun

  if (ref === 'today')    return isoDate(nowVienna);
  if (ref === 'tomorrow') { const d = new Date(nowVienna); d.setDate(d.getDate()+1); return isoDate(d); }

  const nextM = ref.match(/^next\\s+(\\w+)$/);
  const thisM = ref.match(/^this\\s+(\\w+)$/);

  let targetDay = -1, forceNextWeek = false;
  if (nextM && DAYS.includes(nextM[1])) { targetDay = DAYS.indexOf(nextM[1]); forceNextWeek = true; }
  else if (thisM && DAYS.includes(thisM[1])) { targetDay = DAYS.indexOf(thisM[1]); }
  else if (DAYS.includes(ref)) { targetDay = DAYS.indexOf(ref); }

  if (targetDay === -1) return null;

  let diff = targetDay - todayIdx;
  if (forceNextWeek) diff = diff > 0 ? diff + 7 : diff + 14;
  else if (diff <= 0) diff += 7;

  const result = new Date(nowVienna);
  result.setDate(result.getDate() + diff);
  return isoDate(result);
}

`;

if (!s.includes('function resolveDayRef(')) {
  s = s.replace('async function parseEventRequest(', resolverFn + 'async function parseEventRequest(');
  console.log('+ Added resolveDayRef helper');
} else {
  console.log('~ resolveDayRef already present');
}

// ── 2. Replace parseEventRequest ──────────────────────────────────────────────
// Match from the function start to the closing }  (we look for a unique anchor inside)

const newParseEvent = `async function parseEventRequest(text) {
  const nowStr = new Date().toLocaleString('en-GB', { timeZone: CALENDAR_TZ,
    weekday:'long', day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const prompt = \`You are a calendar assistant. Extract the event details from this request.

Today is \${nowStr}.

Request: \${text}

Return ONLY a valid JSON object with these exact fields:
{"title":"event title","day_ref":"<see below>","start_time":"HH:MM","end_time":"HH:MM","location":null}

For day_ref use one of:
- "today" or "tomorrow"
- bare day name for THIS week: "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
- "next monday", "next tuesday", etc. for NEXT week
- A specific date as YYYY-MM-DD if one is stated explicitly

time format: HH:MM in 24h. If no end time given, leave end_time as null.\`;

  const raw     = await callQwen([{ role: 'user', content: prompt }], QWEN_CHAT_MODEL);
  const cleaned = raw.replace(/\`\`\`json\\n?/g, '').replace(/\`\`\`/g, '').trim();
  const parsed  = JSON.parse(cleaned);

  // Resolve day to actual date in JavaScript — do not trust Qwen for date arithmetic
  parsed.date = resolveDayRef(parsed.day_ref);
  if (!parsed.date) throw new Error(\`Could not resolve day reference: \${parsed.day_ref}\`);

  if (!parsed.end_time) parsed.end_time = addOneHour(parsed.start_time);

  return parsed;
}`;

// Find and replace the entire old parseEventRequest function.
// We match from the function signature to the closing } by finding a unique string inside it.
const fnStart = 'async function parseEventRequest(text) {';
const fnEnd   = '\n}\n';

const startIdx = s.indexOf(fnStart);
if (startIdx === -1) {
  console.error('✗ Could not find parseEventRequest — aborting');
  process.exit(1);
}

// Find the closing } of the function (first \n}\n after fnStart)
let endIdx = s.indexOf(fnEnd, startIdx);
if (endIdx === -1) {
  console.error('✗ Could not find end of parseEventRequest — aborting');
  process.exit(1);
}
endIdx += fnEnd.length;

s = s.slice(0, startIdx) + newParseEvent + '\n' + s.slice(endIdx);
console.log('+ Replaced parseEventRequest with JS-resolved date version');

fs.writeFileSync(p, s);
console.log('\n✓ Done. Restart whatsapp-server:');
console.log('  launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.james.whatsapp-server.plist');
console.log('  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.james.whatsapp-server.plist');
