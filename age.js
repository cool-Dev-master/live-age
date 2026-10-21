/* =============================================
   LIVE AGE — age.js
   Pure vanilla JS | localStorage persistence
   ============================================= */
'use strict';

// ---- Storage ----
const STORAGE_KEY  = 'liveage_persons';
const SETTINGS_KEY = 'liveage_settings';

function loadPersons()  { try { return JSON.parse(localStorage.getItem(STORAGE_KEY))  || []; } catch { return []; } }
function savePersons(p) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } }
function saveSettings(s){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
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
   Accounts for birth time when provided.

   Years/months/weeks/days use calendar-date arithmetic.
   Hours/minutes/seconds measure elapsed time since the
   last "birth-time tick" of the current day, so if you
   were born at 14:30 the seconds count from 14:30 today.
   If birth time hasn't arrived yet today, it rolls back
   one calendar day so the count is still continuous.
------------------------------------------------------- */
function calculateAge(dobString, birthTimeStr) {
  const now = new Date();

  // Parse birth time (HH:MM or HH:MM:SS) — default 00:00:00
  const [bh, bm, bs] = birthTimeStr
    ? birthTimeStr.split(':').map(Number)
    : [0, 0, 0];

  // Seconds from midnight for "now" and "birth time"
  const nowSecs   = now.getHours()   * 3600 + now.getMinutes()   * 60 + now.getSeconds();
  const birthSecs = bh * 3600 + bm * 60 + (bs || 0);

  // ---- Calendar part (date-only) ----
  const dob = new Date(dobString + 'T00:00:00');
  let years  = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth()    - dob.getMonth();
  let days   = now.getDate()     - dob.getDate();

  // If birth time hasn't been reached yet today, we haven't completed this day
  if (nowSecs < birthSecs) days--;

  if (days < 0)   { months--; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (months < 0) { years--; months += 12; }

  const weeks         = Math.floor(days / 7);
  const remainingDays = days % 7;

  // ---- Time part: seconds elapsed since birth-time today ----
  let timeSecs = nowSecs - birthSecs;
  if (timeSecs < 0) timeSecs += 86400; // wrap around midnight

  const hours   = Math.floor(timeSecs / 3600);
  const minutes = Math.floor((timeSecs % 3600) / 60);
  const seconds = timeSecs % 60;

  return { years, months, weeks, days: remainingDays, hours, minutes, seconds };
}

function pad2(n) { return String(n).padStart(2,'0'); }

function formatDob(dobString, birthTimeStr) {
  const date = new Date(dobString + 'T00:00:00')
    .toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' });
  if (birthTimeStr) {
    const [h, m] = birthTimeStr.split(':').map(Number);
    const t = new Date(); t.setHours(h, m, 0);
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

// ---- State ----
let persons  = loadPersons();
let settings = loadSettings();
let tickerInterval = null;
let editingId = null;

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
  if (!has) { cardsGrid.innerHTML = ''; return; }

  const existingIds = new Set([...cardsGrid.querySelectorAll('.age-card')].map(el=>el.dataset.id));
  const newIds = new Set(persons.map(p=>p.id));
  cardsGrid.querySelectorAll('.age-card').forEach(el=>{ if(!newIds.has(el.dataset.id)) el.remove(); });
  persons.forEach(p=>{ if(!existingIds.has(p.id)) cardsGrid.appendChild(createCard(p)); });
  persons.forEach(p=>{ const c=cardsGrid.querySelector(`[data-id="${p.id}"]`); if(c) cardsGrid.appendChild(c); });
}

// ---- Create Card ----
function createCard(person) {
  const card = document.createElement('article');
  card.className = 'age-card';
  card.dataset.id = person.id;
  const initial = person.name.charAt(0).toUpperCase();

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
    </div>
  `;

  card.querySelector('.btn-edit').addEventListener('click',   () => openModal(person));
  card.querySelector('.btn-delete').addEventListener('click', () => deletePerson(person.id));
  return card;
}

// ---- Tick ----
function tick() {
  // Global clock
  const now = new Date();
  if (globalTime) {
    globalTime.textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  }
  // Per-card breakdowns
  persons.forEach(person => {
    const age = calculateAge(person.dob, person.birthTime || null);
    const set = (attr, val) => { const el=document.querySelector(`[${attr}="${person.id}"]`); if(el) el.textContent=val; };
    set('data-year',    age.years);
    set('data-months',  pad2(age.months));
    set('data-weeks',   pad2(age.weeks));
    set('data-days',    pad2(age.days));
    set('data-hours',   pad2(age.hours));
    set('data-minutes', pad2(age.minutes));
    set('data-secs',    pad2(age.seconds));
  });
}

function startTicker() {
  if (tickerInterval) clearInterval(tickerInterval);
  tick();
  tickerInterval = setInterval(tick, 1000);
}

// ---- CRUD ----
function addPerson(name, dob, birthTime) {
  const person = { id: generateId(), name: name.trim(), dob, birthTime: birthTime || null };
  persons.push(person); savePersons(persons); render(); startTicker();
}

function editPerson(id, name, dob, birthTime) {
  persons = persons.map(p => p.id===id ? {...p, name:name.trim(), dob, birthTime: birthTime||null} : p);
  savePersons(persons);
  const oldCard = cardsGrid.querySelector(`[data-id="${id}"]`);
  if (oldCard) {
    oldCard.replaceWith(createCard(persons.find(p=>p.id===id)));
    persons.forEach(p=>{ const c=cardsGrid.querySelector(`[data-id="${p.id}"]`); if(c) cardsGrid.appendChild(c); });
  }
}

function deletePerson(id) {
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
  modalOverlay.classList.add('open');
  setTimeout(()=>inputName.focus(), 120);
}
function closeModal() { modalOverlay.classList.remove('open'); editingId=null; }

// ---- Settings Popover ----
function openSettingsPopover()  { settingsPopover.classList.add('open'); settingsPopover.setAttribute('aria-hidden','false'); }
function closeSettingsPopover() { settingsPopover.classList.remove('open'); settingsPopover.setAttribute('aria-hidden','true'); }

// ---- Event Listeners ----
document.getElementById('btnAdd').addEventListener('click', ()=>openModal());
document.getElementById('btnCta').addEventListener('click', ()=>openModal());
document.getElementById('btnClose').addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e=>{ if(e.target===modalOverlay) closeModal(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(); closeSettingsPopover(); } });

inputDob.addEventListener('input', ()=>{
  if (datePreview) datePreview.textContent = formatDatePreview(inputDob.value);
});

addForm.addEventListener('submit', e=>{
  e.preventDefault(); formError.textContent='';
  const name      = inputName.value.trim();
  const dob       = inputDob.value;
  const birthTime = inputTime.value || null; // "HH:MM" or null

  if (!name) { formError.textContent='Please enter a name.'; inputName.focus(); return; }
  if (!dob)  { formError.textContent='Please select a date of birth.'; inputDob.focus(); return; }
  if (new Date(dob+'T00:00:00') > new Date()) {
    formError.textContent='Date of birth cannot be in the future.'; inputDob.focus(); return;
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

// ---- Utils ----
function escapeHtml(str) {
  const el=document.createElement('div'); el.appendChild(document.createTextNode(str)); return el.innerHTML;
}

// ---- Init ----
applySettings();
render();
startTicker();
