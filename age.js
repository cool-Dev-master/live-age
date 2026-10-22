/* =============================================
   LIVE AGE — age.js
   Pure vanilla JS | localStorage persistence
   ============================================= */
'use strict';

// ---- Storage ----
const STORAGE_KEY  = 'liveage_persons';
const SETTINGS_KEY = 'liveage_settings';

function loadPersons() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY));
    // Keep only well-formed entries so bad data can never break the page
    return Array.isArray(list)
      ? list.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.dob))
      : [];
  } catch { return []; }
}
function savePersons(p)  { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* storage full or blocked */ } }
function loadSettings()  { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } }
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
function generateId()   { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ---- Color Utilities ----
function hexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max-min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0))/6; break;
      case g: h = ((b-r)/d + 2)/6; break;
      case b: h = ((r-g)/d + 4)/6; break;
    }
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1-l);
  const f = n => { const k=(n+h/30)%12; return Math.round(255*(l-a*Math.max(Math.min(k-3,9-k,1),-1))).toString(16).padStart(2,'0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
function applyTheme(hex) {
  const [h, s, l] = hexToHsl(hex);
  const accentDark  = hslToHex(h, Math.min(s+5,100), Math.max(l-14, 15));
  const accentLight = hslToHex(h, Math.min(s+5,100), Math.min(l+8,  78));
  document.documentElement.style.setProperty('--accent',      accentDark);
  document.documentElement.style.setProperty('--accent-2',    accentLight);
  document.documentElement.style.setProperty('--accent-glow', `hsla(${h},${s}%,${l}%,0.35)`);
  const swatch = document.getElementById('colorSwatch');
  if (swatch) swatch.style.background = `linear-gradient(135deg, ${accentDark}, ${accentLight})`;
}

/* -------------------------------------------------------
   AGE CALCULATION
   Uses the exact birth moment (date + optional time).

   1. Find the number of whole months lived, then anchor on
      that date. Anchor days are clamped to the end of short
      months (born Jan 31 -> Feb 28/29), so no negative days.
   2. Everything left over is plain elapsed time since the
      anchor: days, hours, minutes, seconds.
------------------------------------------------------- */
function parseBirth(dobString, birthTimeStr) {
  const [y, mo, d] = dobString.split('-').map(Number);
  const [h, mi, s] = birthTimeStr ? birthTimeStr.split(':').map(Number) : [0, 0, 0];
  return new Date(y, mo - 1, d, h || 0, mi || 0, s || 0);
}

// Birth moment shifted forward by `n` months, clamped to the last day of the month
function addMonths(birth, n) {
  const total = birth.getMonth() + n;
  const y = birth.getFullYear() + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(birth.getDate(), lastDay),
                  birth.getHours(), birth.getMinutes(), birth.getSeconds());
}

function calculateAge(dobString, birthTimeStr, now = new Date()) {
  const birth = parseBirth(dobString, birthTimeStr);

  let totalMonths = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (addMonths(birth, totalMonths) > now) totalMonths--;
  totalMonths = Math.max(totalMonths, 0);

  const anchor = addMonths(birth, totalMonths);
  let rem = Math.max(Math.floor((now - anchor) / 1000), 0);

  const days = Math.floor(rem / 86400); rem %= 86400;
  const hours   = Math.floor(rem / 3600);
  const minutes = Math.floor((rem % 3600) / 60);
  const seconds = rem % 60;

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    weeks: Math.floor(days / 7),
    days: days % 7,
    hours, minutes, seconds
  };
}

function calculateCumulativeUnits(dobString, birthTimeStr, now = new Date()) {
  const birth = parseBirth(dobString, birthTimeStr);
  const diffMs = Math.max(0, now - birth);
  const totalSeconds = Math.floor(diffMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);
  const totalWeeks = Math.floor(totalDays / 7);

  let totalMonths = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (addMonths(birth, totalMonths) > now) totalMonths--;
  totalMonths = Math.max(0, totalMonths);

  const totalYears = Math.floor(totalMonths / 12);

  return {
    totalYears,
    totalMonths,
    totalWeeks,
    totalDays,
    totalHours,
    totalMinutes,
    totalSeconds
  };
}

/* Next birthday feature (disabled)
// Whole days until the next birthday (0 = today)
function daysToNextBirthday(dobString, now = new Date()) {
  const [, mo, d] = dobString.split('-').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const build = y => new Date(y, mo - 1, Math.min(d, new Date(y, mo, 0).getDate())); // Feb 29 -> Feb 28
  let next = build(today.getFullYear());
  if (next < today) next = build(today.getFullYear() + 1);
  return Math.round((next - today) / 86400000);
}
*/

function pad2(n) { return String(n).padStart(2,'0'); }

function formatDob(dobString, birthTimeStr) {
  const date = new Date(dobString + 'T00:00:00')
    .toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' });
  if (birthTimeStr) {
    const [h, m] = birthTimeStr.split(':').map(Number);
    const t = new Date(); t.setHours(h, m, 0, 0);
    const time = t.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true });
    return `${date} at ${time}`;
  }
  return date;
}

function formatDatePreview(dobString) {
  if (!dobString) return '';
  return new Date(dobString + 'T00:00:00')
    .toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

// ---- DOM References ----
const emptyState       = document.getElementById('emptyState');
const cardsGrid        = document.getElementById('cardsGrid');
const modalOverlay     = document.getElementById('modalOverlay');
const addForm          = document.getElementById('addForm');
const inputName        = document.getElementById('inputName');
const inputDob         = document.getElementById('inputDob');
const inputTime        = document.getElementById('inputTime');
const formError        = document.getElementById('formError');
const modalTitle       = document.getElementById('modalTitle');
const btnSubmitEl      = document.getElementById('btnSubmit');
const datePreview      = document.getElementById('datePreview');
const globalTime       = document.getElementById('globalTime');
const btnSettings      = document.getElementById('btnSettings');
const settingsPopover  = document.getElementById('settingsPopover');
const toggleEdit       = document.getElementById('toggleEdit');
const themeColorPicker = document.getElementById('themeColorPicker');
const btnExport        = document.getElementById('btnExport');
const btnImport        = document.getElementById('btnImport');
const importFile       = document.getElementById('importFile');
const ioStatus         = document.getElementById('ioStatus');

// Detail Modal DOM References
const detailModalOverlay  = document.getElementById('detailModalOverlay');
const btnCloseDetailModal = document.getElementById('btnCloseDetailModal');
const detailAvatar        = document.getElementById('detailAvatar');
const detailPersonName    = document.getElementById('detailPersonName');
const detailDobText       = document.getElementById('detailDobText');
const detYears            = document.getElementById('detYears');
const detMonths           = document.getElementById('detMonths');
const detWeeks            = document.getElementById('detWeeks');
const detDays             = document.getElementById('detDays');
const detHours            = document.getElementById('detHours');
const detMinutes          = document.getElementById('detMinutes');
const detSeconds          = document.getElementById('detSeconds');
const totYears            = document.getElementById('totYears');
const totMonths           = document.getElementById('totMonths');
const totWeeks            = document.getElementById('totWeeks');
const totDays             = document.getElementById('totDays');
const totHours            = document.getElementById('totHours');
const totMinutes          = document.getElementById('totMinutes');
const totSeconds          = document.getElementById('totSeconds');

// Encrypted Data Modal & Settings DOM References
const encStatus           = document.getElementById('encStatus');
const btnUnlockEnc        = document.getElementById('btnUnlockEnc');
const btnLockData         = document.getElementById('btnLockData');
const encModalOverlay     = document.getElementById('encModalOverlay');
const btnCloseEncModal    = document.getElementById('btnCloseEncModal');
const encForm             = document.getElementById('encForm');
const inputPassphrase     = document.getElementById('inputPassphrase');
const btnTogglePw         = document.getElementById('btnTogglePw');
const eyeIcon             = document.getElementById('eyeIcon');
const encConflictWrap     = document.getElementById('encConflictWrap');
const encFormError        = document.getElementById('encFormError');
const encFormSuccess      = document.getElementById('encFormSuccess');
const btnEncSubmit        = document.getElementById('btnEncSubmit');
const btnEncSubmitText    = document.getElementById('btnEncSubmitText');

// ---- State ----
let persons  = loadPersons();
let settings = loadSettings();
let tickerInterval = null; // holds a setTimeout id
let editingId = null;
let lastFocused = null;
let activeDetailPerson = null;
const cardRefs = new Map(); // person.id -> cached DOM nodes

// ---- Apply Saved Settings ----
function applySettings() {
  toggleEdit.checked = !!settings.editEnabled;
  document.body.classList.toggle('edit-enabled', !!settings.editEnabled);
  const color = settings.themeColor || '#a855f7';
  themeColorPicker.value = color;
  applyTheme(color);
}

// ---- Render ----
function render() {
  const has = persons.length > 0;
  emptyState.classList.toggle('hidden', has);
  cardsGrid.classList.toggle('hidden', !has);
  updateEncStatus();
  if (!has) { cardsGrid.innerHTML = ''; cardRefs.clear(); return; }

  const existingIds = new Set([...cardsGrid.querySelectorAll('.age-card')].map(el=>el.dataset.id));
  const newIds = new Set(persons.map(p=>p.id));
  cardsGrid.querySelectorAll('.age-card').forEach(el=>{ if(!newIds.has(el.dataset.id)) { cardRefs.delete(el.dataset.id); el.remove(); } });
  persons.forEach(p=>{ if(!existingIds.has(p.id)) cardsGrid.appendChild(createCard(p)); });
  persons.forEach(p=>{ const c=cardsGrid.querySelector(`[data-id="${p.id}"]`); if(c) cardsGrid.appendChild(c); });
}

// ---- Create Card ----
function createCard(person) {
  const card = document.createElement('article');
  card.className = 'age-card';
  card.dataset.id = person.id;
  const initial = escapeHtml(([...person.name][0] || '?').toUpperCase());

  card.innerHTML = `
    <div class="card-name-row">
      <div class="card-avatar">${initial}</div>
      <span class="card-name">${escapeHtml(person.name)}</span>
      <div class="card-actions">
        <button class="btn-edit" data-id="${person.id}" title="Edit" aria-label="Edit ${escapeHtml(person.name)}">
          <svg viewBox="0 0 20 20" fill="none" width="13" height="13">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" fill="currentColor"/>
          </svg>
        </button>
        <button class="btn-delete" data-id="${person.id}" title="Remove" aria-label="Remove ${escapeHtml(person.name)}">&#x2715;</button>
      </div>
    </div>

    <div class="card-year-wrap">
      <div class="card-year" data-year="${person.id}">--</div>
      <div class="card-year-label">years old</div>
    </div>

    <div class="card-divider"></div>

    <div class="card-breakdown">
      <div class="breakdown-item">
        <span class="breakdown-value" data-months="${person.id}">--</span>
        <span class="breakdown-label">Months</span>
      </div>
      <div class="breakdown-item">
        <span class="breakdown-value" data-weeks="${person.id}">--</span>
        <span class="breakdown-label">Weeks</span>
      </div>
      <div class="breakdown-item">
        <span class="breakdown-value" data-days="${person.id}">--</span>
        <span class="breakdown-label">Days</span>
      </div>
      <div class="breakdown-item">
        <span class="breakdown-value" data-hours="${person.id}">--</span>
        <span class="breakdown-label">Hours</span>
      </div>
      <div class="breakdown-item">
        <span class="breakdown-value" data-minutes="${person.id}">--</span>
        <span class="breakdown-label">Minutes</span>
      </div>
      <div class="breakdown-item">
        <span class="breakdown-value" data-secs="${person.id}">--</span>
        <span class="breakdown-label">Seconds</span>
      </div>
    </div>

    <div class="card-footer">
      <div class="card-dob">
        Born <span>${formatDob(person.dob, person.birthTime)}</span>
      </div>
      <!-- Next birthday (disabled)
      <div class="card-next" data-next="${person.id}"></div>
      -->
    </div>
  `;

  card.querySelector('.btn-edit').addEventListener('click',   (e) => { e.stopPropagation(); openModal(person); });
  card.querySelector('.btn-delete').addEventListener('click', (e) => { e.stopPropagation(); deletePerson(person.id); });

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-actions')) return;
    if (!settings.editEnabled) {
      openDetailModal(person);
    }
  });

  return card;
}

// ---- Tick ----
function getRefs(id) {
  let refs = cardRefs.get(id);
  if (!refs || !refs.year.isConnected) {
    const card = cardsGrid.querySelector(`[data-id="${id}"]`);
    if (!card) return null;
    const q = attr => card.querySelector(`[${attr}]`);
    refs = {
      year: q('data-year'), months: q('data-months'), weeks: q('data-weeks'), days: q('data-days'),
      hours: q('data-hours'), minutes: q('data-minutes'), secs: q('data-secs')/*, next: q('data-next')*/
    };
    cardRefs.set(id, refs);
  }
  return refs;
}

function setText(el, val) { if (el && el.textContent !== String(val)) el.textContent = val; }

function tick() {
  const now = new Date();
  if (globalTime) {
    setText(globalTime, `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`);
  }
  persons.forEach(person => {
    const refs = getRefs(person.id);
    if (!refs) return;
    const age = calculateAge(person.dob, person.birthTime || null, now);
    setText(refs.year,    age.years);
    setText(refs.months,  pad2(age.months));
    setText(refs.weeks,   pad2(age.weeks));
    setText(refs.days,    pad2(age.days));
    setText(refs.hours,   pad2(age.hours));
    setText(refs.minutes, pad2(age.minutes));
    setText(refs.secs,    pad2(age.seconds));
    // Next birthday (disabled)
    // const left = daysToNextBirthday(person.dob, now);
    // setText(refs.next, left === 0 ? '\u{1F382} Birthday today!' : `Next birthday in ${left} day${left === 1 ? '' : 's'}`);
  });

  if (activeDetailPerson) {
    updateDetailModal(activeDetailPerson, now);
  }
}

// Align ticks to the real second boundary so the clock never drifts or skips
function startTicker() {
  clearTimeout(tickerInterval);
  const loop = () => {
    tick();
    tickerInterval = setTimeout(loop, 1000 - (Date.now() % 1000) + 5);
  };
  loop();
}

// Catch up immediately when the tab becomes visible again
document.addEventListener('visibilitychange', () => { if (!document.hidden) startTicker(); });

// Keep several open tabs in sync
window.addEventListener('storage', e => {
  if (e.key === STORAGE_KEY)  { persons = loadPersons(); render(); startTicker(); }
  if (e.key === SETTINGS_KEY) { settings = loadSettings(); applySettings(); }
});

// ---- CRUD ----
function addPerson(name, dob, birthTime) {
  const person = { id: generateId(), name: name.trim(), dob, birthTime: birthTime || null };
  persons.push(person); savePersons(persons); render(); startTicker();
}

function editPerson(id, name, dob, birthTime) {
  persons = persons.map(p => p.id===id ? {...p, name:name.trim(), dob, birthTime: birthTime||null} : p);
  savePersons(persons);
  cardRefs.delete(id);
  const oldCard = cardsGrid.querySelector(`[data-id="${id}"]`);
  if (oldCard) {
    oldCard.replaceWith(createCard(persons.find(p=>p.id===id)));
    persons.forEach(p=>{ const c=cardsGrid.querySelector(`[data-id="${p.id}"]`); if(c) cardsGrid.appendChild(c); });
  }
  tick();
}

function deletePerson(id) {
  const p = persons.find(x => x.id === id);
  if (p && !confirm(`Remove ${p.name}?`)) return;
  persons = persons.filter(p=>p.id!==id); savePersons(persons); render();
  startTicker(); // keep global clock running
}

// ---- Modal ----
function openModal(person=null) {
  addForm.reset(); formError.textContent='';
  if (datePreview) datePreview.textContent = '';

  if (person) {
    editingId=person.id;
    modalTitle.textContent='Edit Person';
    btnSubmitEl.querySelector('span').textContent='Save Changes';
    inputName.value = person.name;
    inputDob.value  = person.dob;
    inputTime.value = person.birthTime || '';
    if (datePreview) datePreview.textContent = formatDatePreview(person.dob);
  } else {
    editingId=null;
    modalTitle.textContent='New Person';
    btnSubmitEl.querySelector('span').textContent='Start Tracking';
  }
  lastFocused = document.activeElement;
  inputDob.max = todayStr();
  modalOverlay.classList.add('open');
  setTimeout(()=>inputName.focus(), 120);
}
function closeModal() {
  modalOverlay.classList.remove('open'); editingId=null;
  if (lastFocused && lastFocused.focus) lastFocused.focus(); // return focus to what opened it
}

// ---- Person Detail Modal ----
function updateDetailModal(person, now = new Date()) {
  const age = calculateAge(person.dob, person.birthTime || null, now);
  const cum = calculateCumulativeUnits(person.dob, person.birthTime || null, now);

  setText(detYears,   age.years);
  setText(detMonths,  pad2(age.months));
  setText(detWeeks,   pad2(age.weeks));
  setText(detDays,    pad2(age.days));
  setText(detHours,   pad2(age.hours));
  setText(detMinutes, pad2(age.minutes));
  setText(detSeconds, pad2(age.seconds));

  setText(totYears,   `${cum.totalYears.toLocaleString()} years`);
  setText(totMonths,  `${cum.totalMonths.toLocaleString()} months`);
  setText(totWeeks,   `${cum.totalWeeks.toLocaleString()} weeks`);
  setText(totDays,    `${cum.totalDays.toLocaleString()} days`);
  setText(totHours,   `${cum.totalHours.toLocaleString()} hours`);
  setText(totMinutes, `${cum.totalMinutes.toLocaleString()} minutes`);
  setText(totSeconds, `${cum.totalSeconds.toLocaleString()} seconds`);
}

function openDetailModal(person) {
  activeDetailPerson = person;
  detailAvatar.textContent = (person.name[0] || '?').toUpperCase();
  detailPersonName.textContent = person.name;
  detailDobText.textContent = `Born ${formatDob(person.dob, person.birthTime)}`;
  updateDetailModal(person, new Date());
  lastFocused = document.activeElement;
  detailModalOverlay.classList.add('open');
}

function closeDetailModal() {
  detailModalOverlay.classList.remove('open');
  activeDetailPerson = null;
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

// ---- Encrypted Data Management (script.enc) ----
function setEncStatus(msg) { if (encStatus) encStatus.textContent = msg; }

function updateEncStatus() {
  if (btnLockData) {
    btnLockData.style.display = persons.length > 0 ? 'inline-block' : 'none';
  }
}

function openEncModal() {
  encForm.reset();
  encFormError.textContent = '';
  encFormSuccess.textContent = '';
  inputPassphrase.type = 'password';
  if (eyeIcon) {
    eyeIcon.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  encConflictWrap.classList.toggle('hidden', persons.length === 0);
  lastFocused = document.activeElement;
  encModalOverlay.classList.add('open');
  setTimeout(() => inputPassphrase.focus(), 120);
}

function closeEncModal() {
  encModalOverlay.classList.remove('open');
  encForm.reset();
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

function validatePersonRecord(p) {
  if (!p || typeof p !== 'object') return null;
  const name = typeof p.name === 'string' ? stripCommas(p.name).trim().slice(0, 40) : '';
  const dob = typeof p.dob === 'string' ? p.dob.trim() : '';
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;

  const [y, mo, d] = dob.split('-').map(Number);
  const check = new Date(y, mo - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== d) return null;

  let birthTime = null;
  if (p.birthTime && typeof p.birthTime === 'string') {
    const tm = p.birthTime.trim();
    if (/^\d{2}:\d{2}$/.test(tm)) {
      const [h, m] = tm.split(':').map(Number);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        birthTime = `${pad2(h)}:${pad2(m)}`;
      }
    }
  }

  if (parseBirth(dob, birthTime) > new Date()) return null; // No future births
  return { id: p.id || generateId(), name, dob, birthTime };
}

let toastTimeout = null;
function showToast(message, isError = false) {
  const toast = document.getElementById('toastNotification');
  if (!toast) return;
  toast.textContent = message;
  toast.style.borderColor = isError ? 'var(--danger)' : 'var(--accent-2)';
  toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

async function handleEncryptedImport(passphrase, mode = 'merge', isAutoSetup = false) {
  encFormError.textContent = '';
  encFormSuccess.textContent = '';
  btnEncSubmit.disabled = true;
  btnEncSubmitText.textContent = 'Decrypting...';

  try {
    const encUrl = new URL('script.enc', window.location.href.split('#')[0].split('?')[0]).href;
    let response;
    try {
      response = await fetch(encUrl, { cache: 'no-store' });
    } catch {
      throw new Error('Network error: Could not fetch script.enc');
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('File "script.enc" not found. Please ensure script.enc is placed in root.');
      }
      throw new Error(`Failed to load script.enc (HTTP ${response.status})`);
    }

    const encryptedData = await response.text();
    if (!window.CryptoUtils) {
      throw new Error('Crypto engine is not loaded.');
    }

    const decryptedStr = await window.CryptoUtils.decryptData(encryptedData, passphrase);

    let rawList = [];
    try {
      rawList = JSON.parse(decryptedStr);
    } catch {
      const lines = decryptedStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      rawList = lines.map(parseImportLine).filter(Boolean);
    }

    if (!Array.isArray(rawList) || rawList.length === 0) {
      throw new Error('No valid person records found in decrypted dataset.');
    }

    const key = p => `${p.name.toLowerCase()}|${p.dob}|${p.birthTime || ''}`;
    let added = 0;
    let skipped = 0;

    if (mode === 'replace') {
      const valid = [];
      const seen = new Set();
      for (const item of rawList) {
        const p = validatePersonRecord(item);
        if (p && !seen.has(key(p))) {
          seen.add(key(p));
          valid.push(p);
          added++;
        } else {
          skipped++;
        }
      }
      persons = valid;
    } else {
      const seen = new Set(persons.map(key));
      for (const item of rawList) {
        const p = validatePersonRecord(item);
        if (p && !seen.has(key(p))) {
          seen.add(key(p));
          persons.push(p);
          added++;
        } else {
          skipped++;
        }
      }
    }

    savePersons(persons);
    render();
    startTicker();

    const successMsg = added > 0
      ? `Imported ${added} record${added === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}.`
      : `Records already up to date (${skipped} existing).`;

    encFormSuccess.textContent = successMsg;
    setEncStatus(`Imported ${added} records`);
    showToast(`✓ ${successMsg}`);

    closeEncModal();
    btnEncSubmit.disabled = false;
    btnEncSubmitText.textContent = 'Decrypt & Import';

  } catch (err) {
    if (isAutoSetup) {
      openEncModal();
      inputPassphrase.value = passphrase;
    }
    encFormError.textContent = err.message || 'Decryption failed.';
    showToast(err.message || 'Decryption failed.', true);
    btnEncSubmit.disabled = false;
    btnEncSubmitText.textContent = 'Decrypt & Import';
    inputPassphrase.focus();
  }
}

function handleSetupUrl() {
  let pass = '';

  // 1. Check Hash (#key=... or #setup=...)
  const hash = window.location.hash || '';
  const hashMatch = hash.match(/^#(?:setup|key)=(.*)$/i);
  if (hashMatch && hashMatch[1]) {
    pass = decodeURIComponent(hashMatch[1]).trim();
  }

  // 2. Check Query Parameters (?key=... or ?setup=...)
  if (!pass) {
    const params = new URLSearchParams(window.location.search);
    const qPass = params.get('key') || params.get('setup');
    if (qPass) {
      pass = qPass.trim();
    }
  }

  if (!pass) return;

  // Immediately remove credential from visible URL and browser history
  history.replaceState(null, '', window.location.pathname);

  // Trigger automated import
  handleEncryptedImport(pass, persons.length > 0 ? 'merge' : 'replace', true);
}

window.addEventListener('hashchange', handleSetupUrl);


function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth()+1)}-${pad2(n.getDate())}`;
}

// Trap Tab focus inside open modals
[modalOverlay, encModalOverlay, detailModalOverlay].forEach(overlay => {
  if (!overlay) return;
  overlay.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const items = [...overlay.querySelectorAll('button, input, select, textarea')].filter(el => !el.disabled);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
});

// ---- Settings Popover ----
function openSettingsPopover()  { settingsPopover.classList.add('open'); settingsPopover.setAttribute('aria-hidden','false'); btnSettings.setAttribute('aria-expanded','true'); }
function closeSettingsPopover() { settingsPopover.classList.remove('open'); settingsPopover.setAttribute('aria-hidden','true'); btnSettings.setAttribute('aria-expanded','false'); }

// ---- Event Listeners ----
document.getElementById('btnAdd').addEventListener('click', ()=>openModal());
document.getElementById('btnCta').addEventListener('click', ()=>openModal());
document.getElementById('btnClose').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e=>{ if(e.target===modalOverlay) closeModal(); });

// Encrypted Modal listeners
btnUnlockEnc.addEventListener('click', () => {
  closeSettingsPopover();
  openEncModal();
});

btnLockData.addEventListener('click', () => {
  if (!persons.length) return;
  if (!confirm('Lock and clear all local records from this browser? This cannot be undone unless you re-import.')) return;
  persons = [];
  savePersons(persons);
  render();
  setEncStatus('Local records cleared');
  setIoStatus('Local records cleared');
});

btnCloseEncModal.addEventListener('click', closeEncModal);
encModalOverlay.addEventListener('click', e => { if (e.target === encModalOverlay) closeEncModal(); });

btnTogglePw.addEventListener('click', () => {
  const isPw = inputPassphrase.type === 'password';
  inputPassphrase.type = isPw ? 'text' : 'password';
  eyeIcon.innerHTML = isPw
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
});

encForm.addEventListener('submit', e => {
  e.preventDefault();
  const pass = inputPassphrase.value;
  if (!pass) {
    encFormError.textContent = 'Please enter a passphrase.';
    inputPassphrase.focus();
    return;
  }
  const mode = encConflictWrap.classList.contains('hidden')
    ? 'merge'
    : (encForm.querySelector('input[name="encImportMode"]:checked')?.value || 'merge');
  handleEncryptedImport(pass, mode);
});

// Detail Modal listeners
btnCloseDetailModal.addEventListener('click', closeDetailModal);
detailModalOverlay.addEventListener('click', e => { if (e.target === detailModalOverlay) closeDetailModal(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeEncModal();
    closeDetailModal();
    closeSettingsPopover();
  }
});

inputDob.addEventListener('input', ()=>{
  if (datePreview) datePreview.textContent = formatDatePreview(inputDob.value);
});

addForm.addEventListener('submit', e=>{
  e.preventDefault(); formError.textContent='';
  const name      = stripCommas(inputName.value).trim();
  const dob       = inputDob.value;
  const birthTime = inputTime.value || null; // "HH:MM" or null

  if (!name) { formError.textContent='Please enter a name.'; inputName.focus(); return; }
  if (!dob)  { formError.textContent='Please select a date of birth.'; inputDob.focus(); return; }
  if (parseBirth(dob, birthTime) > new Date()) {
    formError.textContent='Birth date and time cannot be in the future.'; inputDob.focus(); return;
  }
  editingId ? editPerson(editingId, name, dob, birthTime) : addPerson(name, dob, birthTime);
  closeModal();
});

btnSettings.addEventListener('click', e=>{
  e.stopPropagation();
  settingsPopover.classList.contains('open') ? closeSettingsPopover() : openSettingsPopover();
});
document.addEventListener('click', e=>{
  if (!document.getElementById('settingsWrap').contains(e.target)) closeSettingsPopover();
});

toggleEdit.addEventListener('change', ()=>{
  document.body.classList.toggle('edit-enabled', toggleEdit.checked);
  settings.editEnabled = toggleEdit.checked; saveSettings(settings);
});

themeColorPicker.addEventListener('input', ()=>{
  applyTheme(themeColorPicker.value);
  settings.themeColor = themeColorPicker.value; saveSettings(settings);
});


// ---- Import / Export (.txt, one person per line) ----
// Line format:  name,mm-dd-yyyy,hh-mm-AM   e.g.  Alice,01-31-1995,02-30-PM
// Birth time is optional, leave it empty:  Bob,02-29-2000,
const stripCommas = str => str.replace(/,/g, '');

function toExportLine(p) {
  const [y, mo, d] = p.dob.split('-');
  let time = '';
  if (p.birthTime) {
    const [h, m] = p.birthTime.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    time = `${pad2(h % 12 || 12)}-${pad2(m)}-${ap}`;
  }
  return `${stripCommas(p.name)},${mo}-${d}-${y},${time}`;
}

// Returns a person object, or null if the line is not valid
function parseImportLine(line) {
  const parts = line.split(',').map(x => x.trim());
  if (parts.length < 2) return null;
  const name = parts[0];
  const dm = parts[1].match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!name || !dm) return null;
  const mo = +dm[1], d = +dm[2], y = +dm[3];
  const check = new Date(y, mo - 1, d);
  if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== d) return null;
  const dob = `${y}-${pad2(mo)}-${pad2(d)}`;

  let birthTime = null;
  if (parts[2]) {
    const tm = parts[2].match(/^(\d{1,2})-(\d{2})-(AM|PM)$/i);
    if (!tm) return null;
    let h = +tm[1]; const m = +tm[2], ap = tm[3].toUpperCase();
    if (h < 1 || h > 12 || m > 59) return null;
    if (ap === 'AM' && h === 12) h = 0;
    if (ap === 'PM' && h !== 12) h += 12;
    birthTime = `${pad2(h)}:${pad2(m)}`;
  }
  if (parseBirth(dob, birthTime) > new Date()) return null; // no future births
  return { id: generateId(), name: name.slice(0, 40), dob, birthTime };
}

function setIoStatus(msg) { if (ioStatus) ioStatus.textContent = msg; }

btnExport.addEventListener('click', () => {
  if (!persons.length) { setIoStatus('Nothing to export yet'); return; }
  const text = persons.map(toExportLine).join('\n') + '\n';
  const url  = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'live-age-data.txt';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setIoStatus(`Exported ${persons.length} ${persons.length === 1 ? 'person' : 'people'}`);
});

btnImport.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', () => {
  const file = importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const lines = String(reader.result).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const key = p => `${p.name.toLowerCase()}|${p.dob}|${p.birthTime || ''}`;
    const seen = new Set(persons.map(key));
    let added = 0, skipped = 0;
    lines.forEach(line => {
      const p = parseImportLine(line);
      if (!p) { skipped++; return; }
      if (seen.has(key(p))) { skipped++; return; }   // already saved
      seen.add(key(p)); persons.push(p); added++;
    });
    if (added) { savePersons(persons); render(); startTicker(); }
    setIoStatus(`Imported ${added}${skipped ? `, skipped ${skipped}` : ''}`);
    importFile.value = ''; // allow re-importing the same file
  };
  reader.onerror = () => setIoStatus('Could not read file');
  reader.readAsText(file);
});

// Strip commas as the user types or pastes into the name box (commas are the file separator)
inputName.addEventListener('input', () => {
  if (inputName.value.includes(',')) {
    const pos = inputName.selectionStart - (inputName.value.slice(0, inputName.selectionStart).match(/,/g) || []).length;
    inputName.value = stripCommas(inputName.value);
    inputName.setSelectionRange(pos, pos);
  }
});

// ---- Utils ----
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// ---- Init ----
applySettings();
render();
startTicker();
handleSetupUrl();
