'use strict';
// Run on James: node ~/Code/todo-list/whatsapp-server/patch_date_fix3.js
// Fixes: "next tuesday" on a Wednesday resolved to 2 weeks out instead of 1.
// Root cause: diff-based arithmetic for "next X" adds 14 when target day < today.
// Fix: for "next X", find next Monday then offset to target day within that week.

const fs = require('fs');
const p = '/Users/lowndes/Code/whatsapp-server/index.js';
let s = fs.readFileSync(p, 'utf8');

const oldResolver = `// Resolve a plain-English day reference to YYYY-MM-DD (Vienna time).
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
}`;

const newResolver = `// Resolve a plain-English day reference to YYYY-MM-DD (Vienna time).
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

  let result;
  if (forceNextWeek) {
    // "next tuesday" = the Tuesday of next calendar week (Mon–Sun).
    // Find next Monday, then step to the target weekday within that week.
    // DAYS: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
    const daysToNextMonday = ((1 - todayIdx + 7) % 7) || 7;
    result = new Date(nowVienna);
    result.setDate(nowVienna.getDate() + daysToNextMonday);
    // Offset from Monday: Mon=0, Tue=1, ..., Sat=5, Sun=6
    const offsetFromMonday = targetDay === 0 ? 6 : targetDay - 1;
    result.setDate(result.getDate() + offsetFromMonday);
  } else {
    // "this tuesday" or bare "tuesday" = nearest future occurrence
    let diff = targetDay - todayIdx;
    if (diff <= 0) diff += 7;
    result = new Date(nowVienna);
    result.setDate(nowVienna.getDate() + diff);
  }

  return isoDate(result);
}`;

if (s.includes(oldResolver)) {
  s = s.replace(oldResolver, newResolver);
  fs.writeFileSync(p, s);
  console.log('✓ resolveDayRef fixed — "next tuesday" now correctly means Tuesday of next calendar week');
  console.log('\nRestart whatsapp-server:');
  console.log('  launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.james.whatsapp-server.plist');
  console.log('  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.james.whatsapp-server.plist');
} else {
  console.error('✗ Could not find resolveDayRef to replace — check if patch_date_fix2 was applied first');
}
