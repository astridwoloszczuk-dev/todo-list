const SUPABASE_URL  = 'https://mezayharkjyvnnhvdlww.supabase.co';
const SUPABASE_ANON = 'sb_publishable_bw3Kcni9Yc88BWLp6G93Gg_HIGbqOKF';

const MEMBERS = ['Astrid', 'Niko', 'Max', 'Alex', 'Vicky'];
const COLORS  = { Astrid: '#d97706', Niko: '#dc2626', Max: '#16a34a', Alex: '#2563eb', Vicky: '#db2777' };

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

let currentUser = localStorage.getItem('bday_user') || null;
let birthdays   = [];
let bdayAcks    = new Set();

// ── DOM ───────────────────────────────────────────────────────────────────────
const bdayListEl  = document.getElementById('bday-list');
const nameIn      = document.getElementById('name-input');
const dayIn       = document.getElementById('day-input');
const monthIn     = document.getElementById('month-input');
const notesIn     = document.getElementById('notes-input');
const addBtn      = document.getElementById('add-btn');
const remindEl    = document.getElementById('remind-pills');
const userBadge   = document.getElementById('user-badge');
const userModal   = document.getElementById('user-modal');
const userNameEl  = document.getElementById('user-name-input');
const userSaveBtn = document.getElementById('user-save-btn');
const modalNames  = document.getElementById('modal-names');

// ── Init ──────────────────────────────────────────────────────────────────────

// Day dropdown
for (let d = 1; d <= 31; d++) {
  const opt = document.createElement('option');
  opt.value = String(d).padStart(2, '0');
  opt.textContent = d;
  dayIn.appendChild(opt);
}

// Remind pills
let remindSelected = new Set([currentUser].filter(Boolean));
MEMBERS.forEach(name => {
  const pill = document.createElement('button');
  pill.className = 'remind-pill' + (remindSelected.has(name) ? ' on' : '');
  pill.style.background = COLORS[name];
  pill.textContent = name;
  pill.addEventListener('click', () => {
    remindSelected.has(name) ? remindSelected.delete(name) : remindSelected.add(name);
    pill.classList.toggle('on', remindSelected.has(name));
  });
  remindEl.appendChild(pill);
});

// User modal name buttons
MEMBERS.forEach(name => {
  const btn = document.createElement('button');
  btn.className = 'modal-name-btn';
  btn.textContent = name;
  btn.addEventListener('click', () => { userNameEl.value = name; userSaveBtn.click(); });
  modalNames.appendChild(btn);
});

// ── User ──────────────────────────────────────────────────────────────────────
function showUserModal() { userModal.classList.remove('hidden'); userNameEl.focus(); }
function saveUser() {
  const val = userNameEl.value.trim();
  if (!val) return;
  currentUser = val;
  localStorage.setItem('bday_user', val);
  userModal.classList.add('hidden');
  userBadge.textContent = val;
  remindSelected.add(val);
  document.querySelectorAll('.remind-pill').forEach(p => {
    p.classList.toggle('on', remindSelected.has(p.textContent));
  });
}
userSaveBtn.addEventListener('click', saveUser);
userNameEl.addEventListener('keydown', e => e.key === 'Enter' && saveUser());
userBadge.addEventListener('click', () => { userNameEl.value = currentUser || ''; showUserModal(); });

if (currentUser) userBadge.textContent = currentUser;

// ── Date helpers ──────────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function bdayNextDate(mmdd) {
  const [m, d] = mmdd.split('-').map(Number);
  const today = new Date(); today.setHours(0,0,0,0);
  const thisYear = new Date(today.getFullYear(), m - 1, d);
  return thisYear >= today ? thisYear : new Date(today.getFullYear() + 1, m - 1, d);
}

function bdayDaysUntil(mmdd) {
  const today = new Date(); today.setHours(0,0,0,0);
  const next = bdayNextDate(mmdd); next.setHours(0,0,0,0);
  return Math.round((next - today) / 86400000);
}

function formatBdayDate(mmdd) {
  const [m, d] = mmdd.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Load & Render ─────────────────────────────────────────────────────────────
async function load() {
  const todayISO = new Date().toISOString().slice(0, 10);
  const [bRes, aRes] = await Promise.all([
    db.from('birthdays').select('*').order('birth_date'),
    db.from('birthday_acks').select('birthday_id')
      .eq('ack_date', todayISO)
      .eq('acked_by', currentUser || 'unknown'),
  ]);
  birthdays = bRes.data || [];
  bdayAcks  = new Set((aRes.data || []).map(r => r.birthday_id));
  render();
}

function render() {
  bdayListEl.innerHTML = '';

  if (!birthdays.length) {
    bdayListEl.innerHTML = '<div class="bday-empty">No birthdays added yet.</div>';
    return;
  }

  const sorted = [...birthdays].sort((a, b) => bdayDaysUntil(a.birth_date) - bdayDaysUntil(b.birth_date));

  sorted.forEach(b => {
    const days      = bdayDaysUntil(b.birth_date);
    const isToday   = days === 0;
    const isTmrw    = days === 1;
    const acked     = bdayAcks.has(b.id);

    const countdownClass = isToday ? 'today' : days <= 7 ? 'soon' : 'normal';
    const countdownText  = isToday ? '🎂 TODAY' : isTmrw ? 'Tomorrow' : `In ${days} days`;
    const cardClass      = isToday ? 'today' : isTmrw ? 'tomorrow' : '';

    const card = document.createElement('div');
    card.className = `bday-card ${cardClass}`;
    card.innerHTML = `
      <div class="bday-info">
        <div class="bday-name">${escapeHtml(b.name)}</div>
        <div class="bday-meta">${formatBdayDate(b.birth_date)}${b.notes ? ' · ' + escapeHtml(b.notes) : ''}</div>
      </div>
      <span class="bday-countdown ${countdownClass}">${countdownText}</span>
      ${(isToday || isTmrw) ? `<button class="bday-ack-btn${acked ? ' acked' : ''}" data-id="${b.id}">${acked ? 'Done ✓' : 'Done'}</button>` : ''}
      <button class="bday-del-btn" data-id="${b.id}" aria-label="Delete">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    bdayListEl.appendChild(card);
  });

  bdayListEl.querySelectorAll('.bday-ack-btn:not(.acked)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const todayISO = new Date().toISOString().slice(0, 10);
      const by = currentUser || 'unknown';
      await db.from('birthday_acks').upsert(
        { birthday_id: Number(btn.dataset.id), ack_date: todayISO, acked_by: by },
        { onConflict: 'birthday_id,ack_date,acked_by' }
      );
      btn.textContent = 'Done ✓';
      btn.classList.add('acked');
    });
  });

  bdayListEl.querySelectorAll('.bday-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await db.from('birthdays').delete().eq('id', btn.dataset.id);
      birthdays = birthdays.filter(b => b.id !== Number(btn.dataset.id));
      render();
    });
  });
}

// ── Add ───────────────────────────────────────────────────────────────────────
addBtn.addEventListener('click', async () => {
  if (!currentUser) { showUserModal(); return; }
  const name  = nameIn.value.trim();
  const month = monthIn.value;
  const day   = dayIn.value;
  if (!name || !month || !day) { nameIn.focus(); return; }

  const { data, error } = await db
    .from('birthdays')
    .insert({ name, birth_date: `${month}-${day}`, notes: notesIn.value.trim() || null, created_by: currentUser })
    .select()
    .single();

  if (error || !data) return;

  if (remindSelected.size) {
    const rows = [...remindSelected].map(p => ({ birthday_id: data.id, person_name: p }));
    await db.from('birthday_reminders').insert(rows);
  }

  nameIn.value = ''; dayIn.value = ''; monthIn.value = ''; notesIn.value = '';
  birthdays.push(data);
  render();
});

nameIn.addEventListener('keydown', e => e.key === 'Enter' && monthIn.focus());

// ── Realtime ──────────────────────────────────────────────────────────────────
db.channel('birthdays-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'birthdays' }, load)
  .subscribe();

// ── Boot ──────────────────────────────────────────────────────────────────────
if (!currentUser) showUserModal();
load();

// ── Service worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
