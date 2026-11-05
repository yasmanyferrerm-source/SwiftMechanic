import { App as CapApp } from '@capacitor/app';
import { state, save, uid, currentVehicle } from './store.js';
import { offlineAnalyze, vehicleLabel } from './kb.js';
import { extractCodes, lookupCode, SEVERITY_LABEL } from './obd.js';
import { POPULAR_MAKES, years, getModels, getSubmodels, getEngineOptions, decodeVin } from './vehicles.js';
import { getRecalls, getComplaints, rankRelevant, topComponents } from './nhtsa.js';
import { PROVIDERS, aiDiagnose, aiFollowUp, testKey } from './ai.js';
import * as obd from './obdlink.js';

const $view = document.getElementById('view');
const $title = document.getElementById('title');
const $back = document.getElementById('backBtn');
const $tabbar = document.getElementById('tabbar');

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), ms);
}
function openExternal(url) {
  window.open(url, '_blank');
}
const fmtDate = (ts) => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// ---------- navigation ----------
let tab = 'diagnose';
const stack = []; // sub-screens: functions that render
function setTitle(t) { $title.textContent = t; }

function go(newTab) {
  tab = newTab;
  stack.length = 0;
  for (const b of $tabbar.querySelectorAll('button')) b.classList.toggle('active', b.dataset.tab === tab);
  render();
}
function push(screen) {
  stack.push(screen);
  render();
}
function back() {
  if (stack.length) { stack.pop(); render(); return true; }
  if (tab !== 'diagnose') { go('diagnose'); return true; }
  return false;
}
$back.onclick = back;
$tabbar.onclick = (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); };
CapApp.addListener?.('backButton', () => { if (!back()) CapApp.exitApp(); });

function render() {
  $view.innerHTML = '';
  $view.scrollTop = 0;
  window.scrollTo(0, 0);
  $back.hidden = stack.length === 0;
  const screen = stack[stack.length - 1] || SCREENS[tab];
  screen();
}

// ---------- Diagnose ----------
let draft = { problem: '', photo: null, live: null };

function vehicleCard(v, opts = {}) {
  if (!v) {
    return h(`<button class="card vehicle-card empty"><div class="vc-icon">🚗</div><div><b>Add your vehicle</b><div class="muted">Year, make, model and submodel – or scan a VIN</div></div></button>`);
  }
  return h(`<button class="card vehicle-card"><div class="vc-icon">🚗</div><div class="vc-body">
    <div class="vc-name">${esc(v.nickname || `${v.year} ${v.make} ${v.model}`)}</div>
    <div class="muted">${esc([v.nickname && `${v.year} ${v.make} ${v.model}`, v.trim, v.engine].filter(Boolean).join(' · ') || 'Tap to add submodel / engine')}</div>
    ${v.mileage ? `<div class="muted small">${esc(Number(v.mileage).toLocaleString())} mi</div>` : ''}
  </div>${opts.chevron === false ? '' : '<div class="chev">›</div>'}</button>`);
}

const QUICK = [
  ['Check engine light', 'Check engine light came on. '],
  ["Won't start", "Car won't start. When I turn the key it "],
  ['Overheating', 'Engine temperature goes high / overheating when '],
  ['Strange noise', 'I hear a noise that sounds like '],
  ['Brakes', 'Brakes are '],
  ['Leak', 'There is a leak under the car, the fluid color is '],
  ['Shaking', 'The car shakes / vibrates when '],
  ['A/C', 'A/C is blowing warm air. '],
];


const SCREENS = {
  diagnose() {
    setTitle('SwiftMechanic');
    const v = currentVehicle();
    const wrap = h(`<div class="screen"></div>`);
    const vc = vehicleCard(v);
    vc.onclick = () => (state.vehicles.length > 1 ? push(pickVehicleScreen) : push(() => vehicleEditor(v)));
    wrap.append(h(`<div class="label">Vehicle</div>`), vc);

    const hasKey = !!state.settings.apiKey;
    const form = h(`<div>
      <div class="label">What's going on?</div>
      <div class="card pad">
        <textarea id="problem" rows="6" placeholder="Describe the problem or type the error code. e.g. &quot;Check engine light, code P0301, shakes at idle when the AC is on, started after rain&quot;  —  Puedes escribir en español."></textarea>
        <div class="chips" id="quick"></div>
        <button class="btn ghost small scan-btn" id="scanBtn">🔌 Read codes from OBD-II scanner</button>
        <div id="liveNote"></div>
        <div class="row gap">
          <label class="btn ghost small" id="photoBtn">📷 Add photo<input type="file" accept="image/*" hidden id="photoIn"></label>
          <div id="photoPrev" class="photo-prev"></div>
        </div>
      </div>
      <button class="btn primary big" id="go">Analyze problem</button>
      ${hasKey ? '' : '<p class="muted small center">Works offline with the built-in guide. Add a free AI key in <a href="#" id="toSettings">Settings</a> for brand/model-specific diagnosis.</p>'}
    </div>`);
    wrap.append(form);
    $view.append(wrap);

    const ta = form.querySelector('#problem');
    ta.value = draft.problem;
    ta.oninput = () => (draft.problem = ta.value);
    const quick = form.querySelector('#quick');
    for (const [label, text] of QUICK) {
      const c = h(`<button class="chip">${esc(label)}</button>`);
      c.onclick = () => { ta.value = (ta.value ? ta.value.trim() + ' ' : '') + text; draft.problem = ta.value; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); };
      quick.append(c);
    }
    const prev = form.querySelector('#photoPrev');
    const showPhoto = () => {
      prev.innerHTML = '';
      if (draft.photo) {
        const img = h(`<div class="thumb"><img src="data:${draft.photo.mime};base64,${draft.photo.data}"><button aria-label="Remove">×</button></div>`);
        img.querySelector('button').onclick = () => { draft.photo = null; showPhoto(); };
        prev.append(img);
      }
    };
    showPhoto();
    form.querySelector('#photoIn').onchange = async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try { draft.photo = await shrinkImage(f); showPhoto(); } catch { toast('Could not read that photo'); }
    };
    form.querySelector('#scanBtn').onclick = () => push(scannerScreen);
    if (draft.live?.length) form.querySelector('#liveNote').append(h(`<div class="muted small">📈 Live sensor snapshot attached (${draft.live.length} readings) <a href="#" id="dropLive">remove</a></div>`));
    form.querySelector('#dropLive')?.addEventListener('click', (e) => { e.preventDefault(); draft.live = null; render(); });
    form.querySelector('#toSettings')?.addEventListener('click', (e) => { e.preventDefault(); go('settings'); });
    form.querySelector('#go').onclick = () => {
      const problem = ta.value.trim();
      if (problem.length < 3) { toast('Describe the problem first'); ta.focus(); return; }
      if (!v) { toast('Add your vehicle first so results match your car'); push(() => vehicleEditor(null, true)); return; }
      runDiagnosis(v, problem, draft.photo, draft.live);
    };
  },

  garage() {
    setTitle('My Garage');
    const wrap = h(`<div class="screen"></div>`);
    if (!state.vehicles.length) wrap.append(h(`<div class="empty-state">No vehicles yet.<br>Add one to get answers for your exact car.</div>`));
    for (const v of state.vehicles) {
      const c = vehicleCard(v);
      if (v.id === currentVehicle()?.id) c.classList.add('selected');
      c.onclick = () => push(() => vehicleEditor(v));
      wrap.append(c);
    }
    const add = h(`<button class="btn primary big">+ Add vehicle</button>`);
    add.onclick = () => push(() => vehicleEditor(null));
    wrap.append(add);
    $view.append(wrap);
  },

  codes() {
    setTitle('Trouble Codes');
    const wrap = h(`<div class="screen">
      <button class="card vehicle-card" id="toScanner"><div class="vc-icon">🔌</div><div class="vc-body"><div class="vc-name">OBD-II scanner</div><div class="muted">${obd.isConnected() ? 'Connected: ' + esc(obd.deviceName()) : 'Read & clear codes and live data from a Bluetooth adapter'}</div></div><div class="chev">›</div></button>
      <div class="label">Look up a code</div>
      <div class="card pad">
        <div class="row gap"><input id="code" placeholder="P0420" maxlength="5" autocapitalize="characters" class="grow mono"><button class="btn primary" id="look">Look up</button></div>
        <p class="muted small">Works offline. Enter the code from your OBD-II scanner (P, B, C or U + 4 characters).</p>
      </div>
      <div id="codeOut"></div>
    </div>`);
    $view.append(wrap);
    wrap.querySelector('#toScanner').onclick = () => push(scannerScreen);
    const inp = wrap.querySelector('#code');
    const out = wrap.querySelector('#codeOut');
    const look = () => {
      const info = lookupCode(inp.value);
      out.innerHTML = '';
      if (!info) { out.append(h(`<div class="card pad muted">That doesn't look like an OBD-II code (example: P0301).</div>`)); return; }
      const card = h(`<div class="card pad">
        <div class="row between"><span class="code-pill">${info.code}</span><span class="badge sev${info.severity}">${esc(SEVERITY_LABEL[info.severity])}</span></div>
        <h3>${esc(info.description)}</h3>
        <div class="muted small">${esc(info.system)}${info.subsystem ? ' · ' + esc(info.subsystem) : ''} · ${info.generic ? 'Generic code (same on all brands)' : 'Manufacturer-specific code'}</div>
        ${info.causes.length ? `<div class="label">Common causes</div><ul>${info.causes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        <button class="btn primary" id="diag">Diagnose for ${esc(currentVehicle() ? `${currentVehicle().year} ${currentVehicle().make} ${currentVehicle().model}` : 'my car')}</button>
      </div>`);
      card.querySelector('#diag').onclick = () => { draft.problem = `Code ${info.code}. `; go('diagnose'); document.getElementById('problem')?.focus(); };
      out.append(card);
    };
    wrap.querySelector('#look').onclick = look;
    inp.onkeydown = (e) => { if (e.key === 'Enter') look(); };
  },

  history() {
    setTitle('History');
    const wrap = h(`<div class="screen"></div>`);
    if (!state.history.length) wrap.append(h(`<div class="empty-state">Your diagnoses will show up here.</div>`));
    for (const e of state.history) {
      const c = h(`<button class="card hist"><div class="row between"><b>${esc(vehicleShort(e.vehicle))}</b><span class="badge u-${esc(e.result.urgency)}">${esc(e.result.urgency)}</span></div>
        <div class="clamp">${esc(e.problem)}</div><div class="muted small">${fmtDate(e.ts)} · ${e.result.source === 'ai' ? 'AI analysis' : 'Offline guide'}</div></button>`);
      c.onclick = () => push(() => resultScreen(e));
      wrap.append(c);
    }
    if (state.history.length) {
      const clr = h(`<button class="btn ghost danger">Clear history</button>`);
      clr.onclick = () => { if (confirmBox('Delete all saved diagnoses?')) { state.history = []; save(); render(); } };
      wrap.append(clr);
    }
    $view.append(wrap);
  },

  settings() {
    setTitle('Settings');
    const s = state.settings;
    const wrap = h(`<div class="screen">
      <div class="label">AI diagnosis</div>
      <div class="card pad">
        <p class="small muted">SwiftMechanic uses your own AI key, saved only on this phone. Without a key the app still works using its built-in offline guide.</p>
        <label class="field">Provider<select id="prov">${Object.entries(PROVIDERS).map(([k, p]) => `<option value="${k}" ${k === s.provider ? 'selected' : ''}>${p.label}</option>`).join('')}</select></label>
        <label class="field">Model<input id="model" list="models" value="${esc(s.model)}"><datalist id="models"></datalist></label>
        <label class="field">API key<input id="key" type="password" autocomplete="off" value="${esc(s.apiKey)}" placeholder="Paste your key"></label>
        <div class="row gap"><button class="btn primary" id="saveKey">Save</button><button class="btn ghost" id="test">Test key</button><button class="btn ghost" id="getKey">Get a key</button></div>
      </div>
      <div class="label">Vehicle data</div>
      <div class="card pad">
        <label class="switch"><input type="checkbox" id="nhtsa" ${s.useNhtsa ? 'checked' : ''}><span>Check NHTSA recalls and owner complaints for my vehicle</span></label>
      </div>
      <div class="label">About</div>
      <div class="card pad small">
        <b>SwiftMechanic</b> v${esc(import.meta.env.VITE_APP_VERSION || '1.0.0')} by yasmanyfmSoft<br>
        <span class="muted">Results are suggestions to help you understand the problem – not a replacement for an in-person inspection by a qualified mechanic. Always put safety first.</span><br><br>
        <a href="#" id="privacy">Privacy policy</a>
      </div>
    </div>`);
    $view.append(wrap);
    const prov = wrap.querySelector('#prov');
    const model = wrap.querySelector('#model');
    const fillModels = () => { wrap.querySelector('#models').innerHTML = PROVIDERS[prov.value].models.map((m) => `<option value="${m}">`).join(''); };
    fillModels();
    prov.onchange = () => { fillModels(); model.value = PROVIDERS[prov.value].models[0]; };
    const read = () => ({ ...s, provider: prov.value, model: model.value.trim() || PROVIDERS[prov.value].models[0], apiKey: wrap.querySelector('#key').value.trim() });
    wrap.querySelector('#saveKey').onclick = () => { Object.assign(state.settings, read()); save(); toast('Saved'); };
    wrap.querySelector('#getKey').onclick = () => openExternal(PROVIDERS[prov.value].keyUrl);
    wrap.querySelector('#test').onclick = async (e) => {
      const b = e.target; b.disabled = true; b.textContent = 'Testing…';
      try { await testKey(read()); Object.assign(state.settings, read()); save(); toast('✅ Key works and is saved'); } catch (err) { toast('❌ ' + err.message, 5000); }
      b.disabled = false; b.textContent = 'Test key';
    };
    wrap.querySelector('#nhtsa').onchange = (e) => { state.settings.useNhtsa = e.target.checked; save(); };
    wrap.querySelector('#privacy').onclick = (e) => { e.preventDefault(); push(privacyScreen); };
  },
};

function vehicleShort(v) {
  return v ? `${v.year} ${v.make} ${v.model}${v.trim ? ' ' + v.trim : ''}` : 'Vehicle';
}

function confirmBox(msg) { return window.confirm(msg); }

// ---------- vehicle picker / editor ----------
function pickVehicleScreen() {
  setTitle('Choose vehicle');
  const wrap = h(`<div class="screen"></div>`);
  for (const v of state.vehicles) {
    const c = vehicleCard(v, { chevron: false });
    if (v.id === currentVehicle()?.id) c.classList.add('selected');
    c.onclick = () => { state.currentVehicleId = v.id; save(); back(); };
    wrap.append(c);
  }
  const add = h(`<button class="btn ghost big">+ Add another vehicle</button>`);
  add.onclick = () => push(() => vehicleEditor(null, true));
  wrap.append(add);
  $view.append(wrap);
}

function vehicleEditor(existing, fromDiagnose = false, prefillVin = '') {
  setTitle(existing ? 'Edit vehicle' : 'Add vehicle');
  const v = existing ? { ...existing } : { year: String(new Date().getFullYear() - 5), make: '', model: '', submodel: '', trim: '', engine: '', mileage: '', nickname: '' };
  const wrap = h(`<div class="screen">
    <div class="card pad">
      <div class="label tight">Fastest: decode your VIN</div>
      <div class="row gap"><input id="vin" class="grow mono" maxlength="17" placeholder="17-character VIN" autocapitalize="characters" value="${esc(v.vin || '')}"><button class="btn" id="decode">Decode</button></div>
      <p class="muted small">VIN is on the driver-side dashboard (seen through the windshield), door jamb sticker, registration or insurance card.</p>
    </div>
    <div class="label">Or choose manually</div>
    <div class="card pad">
      <label class="field">Year<select id="year">${years().map((y) => `<option ${y === String(v.year) ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
      <label class="field">Make<select id="make"><option value="">Select make…</option>${POPULAR_MAKES.map((m) => `<option ${m === v.make ? 'selected' : ''}>${m}</option>`).join('')}<option value="__other">Other…</option></select></label>
      <input id="makeOther" placeholder="Type the make" hidden>
      <label class="field">Model<select id="model"><option value="">Select year and make first</option></select></label>
      <input id="modelOther" placeholder="Type the model" hidden>
      <label class="field" id="subWrap" hidden>Submodel<select id="submodel"></select></label>
      <label class="field" id="engWrap" hidden>Engine / transmission<select id="engineSel"></select></label>
      <label class="field">Trim (optional)<input id="trim" placeholder="e.g. LX, SE, XLT, Limited" value="${esc(v.trim)}"></label>
      <label class="field">Engine (optional)<input id="engine" placeholder="e.g. 2.4L 4-cyl" value="${esc(v.engine)}"></label>
      <label class="field">Mileage (optional)<input id="mileage" inputmode="numeric" placeholder="e.g. 128000" value="${esc(v.mileage)}"></label>
      <label class="field">Nickname (optional)<input id="nickname" placeholder="e.g. Work truck" value="${esc(v.nickname)}"></label>
    </div>
    <button class="btn primary big" id="save">Save vehicle</button>
    ${existing ? '<button class="btn ghost danger" id="del">Remove vehicle</button>' : ''}
  </div>`);
  $view.append(wrap);
  const $ = (id) => wrap.querySelector('#' + id);

  const makeVal = () => ($('make').value === '__other' ? $('makeOther').value.trim() : $('make').value);
  const modelVal = () => ($('model').value === '__other' || $('model').hidden ? $('modelOther').value.trim() : $('model').value);

  if (v.make && !POPULAR_MAKES.includes(v.make)) { $('make').value = '__other'; $('makeOther').hidden = false; $('makeOther').value = v.make; }

  async function loadModels(selected) {
    const make = makeVal(); const year = $('year').value;
    const sel = $('model');
    $('subWrap').hidden = true; $('engWrap').hidden = true;
    if (!make) { sel.innerHTML = '<option value="">Select make first</option>'; return; }
    sel.innerHTML = '<option value="">Loading models…</option>';
    try {
      const models = await getModels(make, year);
      if (!models.length) throw new Error('none');
      sel.innerHTML = `<option value="">Select model…</option>${models.map((m) => `<option ${m === selected ? 'selected' : ''}>${esc(m)}</option>`).join('')}<option value="__other">Other / not listed…</option>`;
      sel.hidden = false;
      if (selected && !models.includes(selected)) { sel.value = '__other'; $('modelOther').hidden = false; $('modelOther').value = selected; } else $('modelOther').hidden = true;
      if (selected && models.includes(selected)) loadSubmodels(v.submodel);
    } catch {
      sel.innerHTML = '<option value="__other">Type it below (offline)</option>';
      sel.value = '__other';
      $('modelOther').hidden = false;
      if (selected) $('modelOther').value = selected;
    }
  }
  async function loadSubmodels(selected) {
    const make = makeVal(); const model = modelVal(); const year = $('year').value;
    $('subWrap').hidden = true; $('engWrap').hidden = true;
    if (!make || !model) return;
    const subs = await getSubmodels(year, make, model);
    if (!subs.length) return;
    $('submodel').innerHTML = subs.map((s) => `<option ${s === selected ? 'selected' : ''}>${esc(s)}</option>`).join('');
    $('subWrap').hidden = false;
    loadEngines();
  }
  async function loadEngines() {
    const opts = await getEngineOptions($('year').value, makeVal(), $('submodel').value);
    if (!opts.length) { $('engWrap').hidden = true; return; }
    $('engineSel').innerHTML = `<option value="">Select…</option>${opts.map((o) => `<option ${o === v.engine ? 'selected' : ''}>${esc(o)}</option>`).join('')}`;
    $('engWrap').hidden = false;
  }

  $('year').onchange = () => loadModels(modelVal());
  $('make').onchange = () => { $('makeOther').hidden = $('make').value !== '__other'; loadModels(); };
  $('makeOther').onchange = () => loadModels();
  $('model').onchange = () => { $('modelOther').hidden = $('model').value !== '__other'; if ($('model').value !== '__other') loadSubmodels(); };
  $('submodel').onchange = loadEngines;
  $('engineSel').onchange = () => { if ($('engineSel').value) $('engine').value = $('engineSel').value; };
  if (v.make) loadModels(v.model);
  if (prefillVin) { $('vin').value = prefillVin; setTimeout(() => $('decode').click(), 0); }

  $('decode').onclick = async (e) => {
    const b = e.target; b.disabled = true; b.textContent = '…';
    try {
      const d = await decodeVin($('vin').value);
      Object.assign(v, d);
      $('year').value = d.year;
      if (POPULAR_MAKES.includes(d.make)) { $('make').value = d.make; $('makeOther').hidden = true; } else { $('make').value = '__other'; $('makeOther').hidden = false; $('makeOther').value = d.make; }
      $('trim').value = d.trim; $('engine').value = d.engine;
      await loadModels(d.model);
      toast(`Found: ${d.year} ${d.make} ${d.model} ${d.trim}`);
    } catch (err) { toast(err.message.includes('VIN') ? err.message : 'Could not decode VIN (no internet?)', 4000); }
    b.disabled = false; b.textContent = 'Decode';
  };

  $('save').onclick = () => {
    const out = {
      ...v,
      id: v.id || uid(),
      year: $('year').value,
      make: makeVal(),
      model: modelVal(),
      submodel: $('subWrap').hidden ? '' : $('submodel').value,
      trim: $('trim').value.trim(),
      engine: $('engine').value.trim(),
      mileage: $('mileage').value.replace(/[^0-9]/g, ''),
      nickname: $('nickname').value.trim(),
      vin: $('vin').value.trim().toUpperCase() || v.vin || '',
    };
    if (!out.make || !out.model) { toast('Choose at least year, make and model'); return; }
    const i = state.vehicles.findIndex((x) => x.id === out.id);
    if (i >= 0) state.vehicles[i] = out; else state.vehicles.push(out);
    state.currentVehicleId = out.id;
    save();
    toast('Vehicle saved');
    if (fromDiagnose) go('diagnose'); else back();
  };
  $('del')?.addEventListener('click', () => {
    if (!confirmBox('Remove this vehicle?')) return;
    state.vehicles = state.vehicles.filter((x) => x.id !== v.id);
    if (state.currentVehicleId === v.id) state.currentVehicleId = state.vehicles[0]?.id || null;
    save(); back();
  });
}

// ---------- diagnosis ----------
async function runDiagnosis(vehicle, problem, photo, live) {
  const steps = ['Reading your description', 'Checking trouble codes', state.settings.useNhtsa ? 'Checking recalls & owner complaints' : null, state.settings.apiKey ? 'Analyzing for your exact vehicle' : 'Matching the offline guide'].filter(Boolean);
  push(() => loadingScreen(steps));
  const mark = (i) => document.querySelectorAll('.steps li').forEach((li, j) => { li.classList.toggle('done', j < i); li.classList.toggle('now', j === i); });

  const v = { ...vehicle, model: vehicle.model, submodelName: vehicle.submodel };
  mark(1);
  const codes = extractCodes(problem).map(lookupCode).filter(Boolean);
  const offline = offlineAnalyze(problem, v);

  let recalls = []; let allRecalls = []; let complaints = []; let top = [];
  if (state.settings.useNhtsa) {
    mark(2);
    const [r, c] = await Promise.allSettled([getRecalls(v), getComplaints(v)]);
    if (r.status === 'fulfilled') { allRecalls = r.value; recalls = rankRelevant(allRecalls, problem, (x) => `${x.component} ${x.summary}`, 5); }
    if (c.status === 'fulfilled') { complaints = rankRelevant(c.value, problem, (x) => `${x.components} ${x.summary}`, 8); top = topComponents(c.value); }
  }
  mark(steps.length - 1);

  let result;
  let aiError = null;
  if (state.settings.apiKey) {
    try {
      result = await aiDiagnose(state.settings, { vehicle: v, problem, codes, recalls, complaints, topComponents: top, offline, live }, photo);
    } catch (e) {
      aiError = e.message;
    }
  }
  if (!result) result = offline;
  result.recalls = recalls.length ? recalls : allRecalls.slice(0, 3);
  result.recallCount = allRecalls.length;
  result.topComponents = top;
  if (aiError) result.aiError = aiError;

  const entry = { id: uid(), ts: Date.now(), vehicle: { ...vehicle }, problem, hadPhoto: !!photo, live: live || null, result, thread: [] };
  state.history.unshift(entry);
  state.history = state.history.slice(0, 100);
  save();
  draft = { problem: '', photo: null, live: null };
  stack.pop();
  push(() => resultScreen(entry));
}

function loadingScreen(steps) {
  setTitle('Analyzing…');
  $view.append(h(`<div class="screen center-col"><div class="spinner"></div><ul class="steps">${steps.map((s, i) => `<li class="${i === 0 ? 'now' : ''}">${esc(s)}</li>`).join('')}</ul></div>`));
}

const LIK = { High: 3, Medium: 2, Low: 1 };

function resultScreen(entry) {
  setTitle('Diagnosis');
  const r = entry.result;
  const wrap = h(`<div class="screen result"></div>`);
  wrap.append(h(`<div class="muted small">${esc(vehicleLabel(entry.vehicle))}${entry.vehicle.mileage ? ` · ${Number(entry.vehicle.mileage).toLocaleString()} mi` : ''}</div>`));
  wrap.append(h(`<div class="card pad quote">“${esc(entry.problem)}”</div>`));

  if (r.aiError) wrap.append(h(`<div class="card pad warn">AI analysis failed (${esc(r.aiError)}). Showing the offline guide instead.</div>`));

  wrap.append(h(`<div class="card pad">
    <div class="row between"><span class="badge u-${esc(r.urgency)}">Urgency: ${esc(r.urgency)}</span><span class="muted small">${r.source === 'ai' ? '🤖 AI analysis' : '📘 Offline guide'}</span></div>
    ${r.safeToDrive ? `<div class="safe"><b>Safe to drive?</b> ${esc(r.safeToDrive)}</div>` : ''}
    <p>${esc(r.summary)}</p>
  </div>`));

  if (entry.live?.length) {
    wrap.append(h(`<details class="card cause"><summary><span class="grow">📈 Live sensor snapshot</span></summary><div class="cause-body">${liveTable(entry.live)}</div></details>`));
  }
  if (r.codes?.length) {
    wrap.append(h(`<div><div class="label">Codes</div><div class="card pad">${r.codes.map((c) => `<div class="code-row"><span class="code-pill">${esc(c.code)}</span> ${esc(c.meaning)}</div>`).join('')}</div></div>`));
  }

  if (r.causes?.length) {
    wrap.append(h(`<div class="label">Possible causes & solutions</div>`));
    const causes = [...r.causes].sort((a, b) => (LIK[b.likelihood] || 0) - (LIK[a.likelihood] || 0));
    causes.forEach((c, i) => {
      const card = h(`<details class="card cause" ${i === 0 ? 'open' : ''}>
        <summary><span class="num">${i + 1}</span><span class="grow">${esc(c.name)}</span>${c.likelihood ? `<span class="lk lk-${esc(c.likelihood)}">${esc(c.likelihood)}</span>` : ''}</summary>
        <div class="cause-body">
          ${c.why ? `<p class="muted">${esc(c.why)}</p>` : ''}
          ${c.check ? `<div><b>How to check:</b> ${esc(c.check)}</div>` : ''}
          ${c.fix ? `<div><b>Fix:</b> ${esc(c.fix)}</div>` : ''}
          <div class="meta">${c.difficulty ? `<span>🔧 ${esc(c.difficulty)}</span>` : ''}${c.cost ? `<span>💲 ${esc(c.cost)}</span>` : ''}</div>
          <div class="row gap wrap"><button class="btn ghost small yt">▶ Repair videos</button><button class="btn ghost small parts">🛒 Find parts</button></div>
        </div></details>`);
      const q = `${entry.vehicle.year} ${entry.vehicle.make} ${entry.vehicle.model} ${c.name}`;
      card.querySelector('.yt').onclick = () => openExternal(`https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' repair')}`);
      card.querySelector('.parts').onclick = () => openExternal(`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q.replace(/\(.*?\)/g, ''))}`);
      wrap.append(card);
    });
  }

  const list = (title, items) => items?.length && wrap.append(h(`<div><div class="label">${title}</div><div class="card pad"><ol class="list">${items.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div></div>`));
  list('Step-by-step diagnosis', r.diagnosticSteps);
  list('Known issues for this vehicle', r.knownIssues);
  list('Parts you may need', r.partsNeeded);

  if (r.recalls?.length) {
    wrap.append(h(`<div><div class="label">NHTSA recalls (${r.recallCount} total for this model)</div>${r.recalls.map((x) => `<details class="card cause"><summary><span class="grow">${esc(x.component)}</span><span class="muted small">${esc(x.id)}</span></summary><div class="cause-body"><p>${esc(x.summary)}</p>${x.remedy ? `<p><b>Remedy:</b> ${esc(x.remedy)}</p>` : ''}<p class="muted small">Recall repairs are free at the dealer.</p></div></details>`).join('')}</div>`));
  }
  if (r.topComponents?.length) {
    wrap.append(h(`<div><div class="label">Most reported problems for this model (NHTSA)</div><div class="card pad">${r.topComponents.map((t) => `<div class="bar-row"><span>${esc(t.component)}</span><span class="muted">${t.count}</span></div>`).join('')}</div></div>`));
  }

  // follow-up
  const fu = h(`<div><div class="label">Ask a follow-up</div><div class="card pad">
    <div id="thread"></div>
    <div class="chips" id="sugg"></div>
    <div class="row gap"><input id="fq" class="grow" placeholder="${state.settings.apiKey ? 'e.g. Can I replace it myself?' : 'Add an AI key in Settings to ask follow-ups'}"><button class="btn primary" id="ask">Ask</button></div>
  </div></div>`);
  wrap.append(fu);
  const thread = fu.querySelector('#thread');
  const drawThread = () => { thread.innerHTML = entry.thread.map((t) => `<div class="q">${esc(t.q)}</div><div class="a">${fmtAnswer(t.a)}</div>`).join(''); };
  drawThread();
  for (const s of (r.followUpQuestions || []).slice(0, 4)) {
    const c = h(`<button class="chip">${esc(s)}</button>`);
    c.onclick = () => { fu.querySelector('#fq').value = s; fu.querySelector('#fq').focus(); };
    fu.querySelector('#sugg').append(c);
  }
  fu.querySelector('#ask').onclick = async (e) => {
    const q = fu.querySelector('#fq').value.trim();
    if (!q) return;
    if (!state.settings.apiKey) { go('settings'); return; }
    const b = e.target; b.disabled = true; b.textContent = '…';
    try {
      const a = await aiFollowUp(state.settings, entry, entry.thread, q);
      entry.thread.push({ q, a });
      save(); drawThread(); fu.querySelector('#fq').value = '';
    } catch (err) { toast(err.message, 4000); }
    b.disabled = false; b.textContent = 'Ask';
  };

  const again = h(`<button class="btn ghost big">New diagnosis</button>`);
  again.onclick = () => go('diagnose');
  wrap.append(again);
  wrap.append(h(`<p class="muted small center">Suggestions only — have a qualified mechanic confirm before major repairs. If brakes, steering or overheating are involved, don't drive the vehicle.</p>`));
  $view.append(wrap);
}

function fmtAnswer(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^\s*[-•]\s+/gm, '• ').replace(/\n/g, '<br>');
}

function liveTable(live) {
  return `<div class="live-grid">${live.map((x) => `<div><span class="muted small">${esc(x.name)}</span><b>${esc(x.value)} ${esc(x.unit)}</b></div>`).join('')}</div>`;
}

let scan = { codes: null, live: null, vin: '' };

function scannerScreen() {
  setTitle('OBD-II scanner');
  const connected = obd.isConnected();
  const wrap = h(`<div class="screen">
    <div class="card pad">
      <div class="row between"><b>${connected ? '🟢 ' + esc(obd.deviceName()) : '⚪ Not connected'}</b>
      <button class="btn ${connected ? 'ghost' : 'primary'} small" id="conn">${connected ? 'Disconnect' : 'Connect'}</button></div>
      ${connected ? '' : `<ol class="list small muted">
        <li>Plug a <b>Bluetooth LE</b> ELM327 adapter into the OBD-II port (under the dash, driver side).</li>
        <li>Turn the ignition ON or start the engine.</li>
        <li>Tap Connect and pick the adapter (names like OBDII, IOS-Vlink, Veepeak, OBDLink, vLinker).</li>
      </ol><p class="small muted">Works with BLE adapters such as Vgate iCar Pro BLE, Veepeak OBDCheck BLE, OBDLink CX, vLinker MC+/FS (BLE). Older "Bluetooth Classic" and Wi-Fi adapters are not supported.</p>`}
    </div>
    <div class="grid2" ${connected ? '' : 'hidden'}>
      <button class="btn primary" id="read">Read codes</button>
      <button class="btn" id="live">Live data</button>
      <button class="btn" id="vin">Read VIN</button>
      <button class="btn ghost danger" id="clear">Clear codes</button>
    </div>
    <div id="out"></div>
  </div>`);
  $view.append(wrap);
  const out = wrap.querySelector('#out');
  const busy = async (btn, label, fn) => {
    const t = btn.textContent; btn.disabled = true; btn.textContent = label;
    try { await fn(); } catch (e) { toast(e.message || String(e), 5000); }
    btn.disabled = false; btn.textContent = t;
  };
  const drawOut = () => {
    out.innerHTML = '';
    if (scan.codes) {
      const c = scan.codes;
      const all = [...c.stored.map((x) => [x, 'Stored']), ...c.pending.filter((x) => !c.stored.includes(x)).map((x) => [x, 'Pending']), ...c.permanent.filter((x) => !c.stored.includes(x) && !c.pending.includes(x)).map((x) => [x, 'Permanent'])];
      const card = h(`<div class="card pad">
        <div class="row between"><b>Trouble codes</b>${c.mil != null ? `<span class="badge ${c.mil ? 'u-High' : 'u-Low'}">Check engine light ${c.mil ? 'ON' : 'OFF'}</span>` : ''}</div>
        ${all.length ? all.map(([code, kind]) => { const i = lookupCode(code); return `<div class="code-row"><span class="code-pill">${code}</span> <span class="muted small">${kind}</span><div>${esc(i?.description || '')}</div></div>`; }).join('') : '<p class="muted">No codes stored. 👍 If you still have a problem, describe the symptoms instead.</p>'}
        ${all.length ? '<button class="btn primary" id="diagCodes">Diagnose these codes for my car</button>' : ''}
      </div>`);
      card.querySelector('#diagCodes')?.addEventListener('click', () => {
        draft.problem = `Scanner codes: ${all.map(([x, k]) => `${x}${k !== 'Stored' ? ` (${k.toLowerCase()})` : ''}`).join(', ')}. ` + (draft.problem || '');
        if (scan.live) draft.live = scan.live;
        go('diagnose');
      });
      out.append(card);
    }
    if (scan.live) {
      const card = h(`<div class="card pad"><b>Live data snapshot</b>${liveTable(scan.live)}<button class="btn ghost small" id="att">Attach to next diagnosis</button></div>`);
      card.querySelector('#att').onclick = () => { draft.live = scan.live; toast('Attached – it will be included in the analysis'); };
      out.append(card);
    }
    if (scan.vin) {
      const card = h(`<div class="card pad"><b>VIN</b><div class="mono">${esc(scan.vin)}</div><button class="btn ghost small" id="useVin">Add / update vehicle with this VIN</button></div>`);
      card.querySelector('#useVin').onclick = () => push(() => vehicleEditor(null, true, scan.vin));
      out.append(card);
    }
  };
  drawOut();
  wrap.querySelector('#conn').onclick = (e) => busy(e.target, connected ? '…' : 'Connecting…', async () => {
    if (connected) { await obd.disconnect(); scan = { codes: null, live: null, vin: '' }; render(); return; }
    try { await obd.connect(); toast('Connected'); } finally { render(); }
  });
  wrap.querySelector('#read').onclick = (e) => busy(e.target, 'Reading…', async () => { scan.codes = await obd.readCodes(); drawOut(); });
  wrap.querySelector('#live').onclick = (e) => busy(e.target, 'Reading…', async () => { scan.live = await obd.readLive(); if (!scan.live.length) toast('The car did not return live data'); drawOut(); });
  wrap.querySelector('#vin').onclick = (e) => busy(e.target, 'Reading…', async () => { scan.vin = await obd.readVin(); if (!scan.vin) toast('This car does not report its VIN over OBD'); drawOut(); });
  wrap.querySelector('#clear').onclick = (e) => {
    if (!confirmBox('Clear all trouble codes and turn off the check engine light?\n\nOnly do this after the repair. Readiness monitors will reset (your car may not pass an emissions test until you drive it for a few days).')) return;
    busy(e.target, 'Clearing…', async () => { await obd.clearCodes(); toast('Codes cleared'); scan.codes = await obd.readCodes().catch(() => null); drawOut(); });
  };
}

function privacyScreen() {
  setTitle('Privacy policy');
  $view.append(h(`<div class="screen"><div class="card pad small privacy">
    <p><b>SwiftMechanic does not collect, store or sell your data on any server.</b></p>
    <p>Your vehicles, problem descriptions, photos, diagnosis history and API key are stored only on your device.</p>
    <p>When you run a diagnosis, the app sends the vehicle's year/make/model to the U.S. NHTSA public API to look up recalls and complaints, and (only if you added an API key) sends your description, vehicle details and any photo you attach to the AI provider you chose (Anthropic or Google) to generate the answer. Those providers process it under their own privacy policies.</p>
    <p>VIN decoding uses the free NHTSA vPIC service. Model lists use NHTSA and fueleconomy.gov.</p>
    <p>Uninstalling the app deletes all stored data. Contact: yasmanyferrerm@gmail.com</p>
  </div></div>`));
}

// ---------- image ----------
function shrinkImage(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.82).split(',')[1] });
    };
    img.onerror = reject;
    img.src = url;
  });
}

render();
