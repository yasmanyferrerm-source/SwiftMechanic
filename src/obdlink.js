// Bluetooth LE OBD-II scanner support (ELM327-compatible adapters such as
// Vgate iCar Pro BLE, Veepeak OBDCheck BLE, OBDLink CX, LELink, vLinker BLE).
// Reads stored / pending / permanent trouble codes, clears codes, reads VIN and a live-data snapshot.
import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';

// Known UART-style service/characteristic layouts used by BLE ELM327 adapters
const KNOWN = [
  { service: '0000fff0-0000-1000-8000-00805f9b34fb', notify: '0000fff1-0000-1000-8000-00805f9b34fb', write: '0000fff2-0000-1000-8000-00805f9b34fb' },
  { service: '0000ffe0-0000-1000-8000-00805f9b34fb', notify: '0000ffe1-0000-1000-8000-00805f9b34fb', write: '0000ffe1-0000-1000-8000-00805f9b34fb' },
  { service: '000018f0-0000-1000-8000-00805f9b34fb', notify: '00002af0-0000-1000-8000-00805f9b34fb', write: '00002af1-0000-1000-8000-00805f9b34fb' },
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', notify: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', write: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
];

let link = null; // { deviceId, name, service, write, notify, withResponse, protocol }
let rx = '';
let waiter = null;
let initialized = false;
const listeners = new Set();

export const isConnected = () => !!link;
export const deviceName = () => link?.name || '';
export function onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach((f) => f(!!link));

function onData(dv) {
  for (let i = 0; i < dv.byteLength; i++) rx += String.fromCharCode(dv.getUint8(i));
  if (rx.includes('>') && waiter) {
    const out = rx.slice(0, rx.indexOf('>'));
    rx = rx.slice(rx.indexOf('>') + 1);
    const w = waiter; waiter = null; w.resolve(out);
  }
}

/** Sends one command and resolves with the raw text before the ">" prompt. */
export async function send(cmd, timeout = 6000) {
  if (!link) throw new Error('Scanner not connected');
  rx = '';
  const p = new Promise((resolve, reject) => {
    waiter = { resolve, reject };
    setTimeout(() => { if (waiter) { waiter = null; reject(new Error(`No reply to ${cmd}`)); } }, timeout);
  });
  const bytes = numbersToDataView([...`${cmd}\r`].map((c) => c.charCodeAt(0)));
  if (link.withResponse) await BleClient.write(link.deviceId, link.service, link.write, bytes);
  else await BleClient.writeWithoutResponse(link.deviceId, link.service, link.write, bytes);
  const out = await p;
  return out.replace(/\r/g, '\n').split('\n').map((s) => s.trim()).filter((s) => s && s !== cmd).join('\n');
}

export async function connect() {
  if (!initialized) {
    await BleClient.initialize({ androidNeverForLocation: true });
    initialized = true;
  }
  const device = await BleClient.requestDevice({ optionalServices: KNOWN.map((k) => k.service) });
  await BleClient.connect(device.deviceId, () => { link = null; emit(); });

  const services = await BleClient.getServices(device.deviceId);
  let pick = null;
  for (const k of KNOWN) {
    const s = services.find((x) => x.uuid.toLowerCase() === k.service);
    if (s && s.characteristics.some((c) => c.uuid.toLowerCase() === k.write)) {
      const wc = s.characteristics.find((c) => c.uuid.toLowerCase() === k.write);
      pick = { service: k.service, write: k.write, notify: k.notify, withResponse: !wc.properties?.writeWithoutResponse };
      break;
    }
  }
  if (!pick) {
    // Generic fallback: first service with a writable + a notifying characteristic
    for (const s of services) {
      const w = s.characteristics.find((c) => c.properties?.write || c.properties?.writeWithoutResponse);
      const n = s.characteristics.find((c) => c.properties?.notify || c.properties?.indicate);
      if (w && n && !s.uuid.startsWith('00001800') && !s.uuid.startsWith('00001801')) {
        pick = { service: s.uuid, write: w.uuid, notify: n.uuid, withResponse: !w.properties?.writeWithoutResponse };
        break;
      }
    }
  }
  if (!pick) {
    await BleClient.disconnect(device.deviceId).catch(() => {});
    throw new Error('This device is not a recognized OBD-II BLE adapter.');
  }
  link = { deviceId: device.deviceId, name: device.name || 'OBD-II adapter', ...pick };
  await BleClient.startNotifications(link.deviceId, link.service, link.notify, onData);

  // ELM327 setup
  try {
    await send('ATZ', 8000);
  } catch { /* some clones don't answer ATZ quickly */ }
  for (const c of ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0']) await send(c).catch(() => {});
  const probe = await send('0100', 15000).catch(() => '');
  if (/UNABLE|ERROR|NO DATA|CAN ERROR/i.test(probe) || !probe) {
    emit();
    throw new Error('Adapter connected, but the car did not answer. Turn the ignition ON (or start the engine) and try again.');
  }
  link.protocol = (await send('ATDPN').catch(() => '')).replace(/[^0-9A-C]/gi, '').slice(-1).toUpperCase();
  emit();
  return link.name;
}

export async function disconnect() {
  if (!link) return;
  const id = link.deviceId;
  link = null;
  await BleClient.disconnect(id).catch(() => {});
  emit();
}

const isCan = () => /^[6-9A-C]$/.test(link?.protocol || '6');

/** Splits an ELM reply into per-ECU messages and returns the data bytes of each. */
export function parseMessages(text, modeResp) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const msgs = [];
  let cur = null;
  for (const raw of lines) {
    if (/SEARCHING|BUS INIT|STOPPED/i.test(raw)) continue;
    if (/^[0-9A-F]{3}$/i.test(raw)) { cur = []; msgs.push(cur); continue; } // ISO-TP length line
    const m = raw.match(/^([0-9A-F]):\s*(.*)$/i);
    const hex = (m ? m[2] : raw).replace(/[^0-9A-F]/gi, '');
    if (!hex) continue;
    if (m && cur && m[1] !== '0') { cur.push(...bytes(hex)); continue; }
    if (m && m[1] === '0' && cur && cur.length === 0) { cur.push(...bytes(hex)); continue; }
    cur = bytes(hex); msgs.push(cur);
  }
  return msgs.filter((b) => b[0] === modeResp);
}
const bytes = (hex) => (hex.match(/../g) || []).map((x) => parseInt(x, 16));

export function decodeDtc(b1, b2) {
  if (!b1 && !b2) return null;
  const letter = 'PCBU'[b1 >> 6];
  return `${letter}${(b1 >> 4) & 3}${(b1 & 0xf).toString(16).toUpperCase()}${b2.toString(16).toUpperCase().padStart(2, '0')}`;
}

export function parseDtcReply(text, mode, can = true) {
  const resp = 0x40 + mode;
  const out = new Set();
  for (const msg of parseMessages(text, resp)) {
    let data = msg.slice(1);
    if (can) data = data.slice(1); // CAN replies include a DTC count byte
    for (let i = 0; i + 1 < data.length; i += 2) {
      const c = decodeDtc(data[i], data[i + 1]);
      if (c) out.add(c);
    }
  }
  return [...out];
}

/** Reads stored, pending and permanent codes plus MIL status. */
export async function readCodes() {
  const can = isCan();
  const stored = parseDtcReply(await send('03', 10000).catch(() => ''), 3, can);
  const pending = parseDtcReply(await send('07', 10000).catch(() => ''), 7, can);
  const permanent = can ? parseDtcReply(await send('0A', 10000).catch(() => ''), 0x0a, can) : [];
  let mil = null; let count = null;
  const st = parseMessages(await send('0101').catch(() => ''), 0x41).find((m) => m[1] === 0x01);
  if (st) { mil = !!(st[2] & 0x80); count = st[2] & 0x7f; }
  return { stored, pending, permanent, mil, count };
}

export async function clearCodes() {
  const r = await send('04', 10000);
  if (!/44|OK/i.test(r)) throw new Error('The car did not confirm the clear. Make sure the engine is OFF with ignition ON.');
}

export async function readVin() {
  const r = await send('0902', 10000).catch(() => '');
  const ascii = (r.match(/[0-9A-F]{2}/gi) || []).map((x) => String.fromCharCode(parseInt(x, 16))).join('');
  const m = ascii.replace(/[^A-HJ-NPR-Z0-9]/g, '').match(/[A-HJ-NPR-Z0-9]{17}$/);
  return m ? m[0] : '';
}

const PIDS = [
  ['0104', 'Engine load', '%', (a) => (a * 100) / 255],
  ['0105', 'Coolant temp', '°F', (a) => (a - 40) * 9 / 5 + 32],
  ['0106', 'Short fuel trim B1', '%', (a) => (a - 128) * 100 / 128],
  ['0107', 'Long fuel trim B1', '%', (a) => (a - 128) * 100 / 128],
  ['0108', 'Short fuel trim B2', '%', (a) => (a - 128) * 100 / 128],
  ['0109', 'Long fuel trim B2', '%', (a) => (a - 128) * 100 / 128],
  ['010B', 'Intake pressure', 'kPa', (a) => a],
  ['010C', 'RPM', 'rpm', (a, b) => (a * 256 + b) / 4],
  ['010D', 'Speed', 'mph', (a) => a * 0.621371],
  ['010F', 'Intake air temp', '°F', (a) => (a - 40) * 9 / 5 + 32],
  ['0110', 'MAF air flow', 'g/s', (a, b) => (a * 256 + b) / 100],
  ['0111', 'Throttle', '%', (a) => (a * 100) / 255],
  ['012F', 'Fuel level', '%', (a) => (a * 100) / 255],
  ['0142', 'Module voltage', 'V', (a, b) => (a * 256 + b) / 1000],
];

/** One-time snapshot of the main live sensors (skips anything the car doesn't support). */
export async function readLive() {
  const out = [];
  for (const [pid, name, unit, f] of PIDS) {
    const r = await send(pid, 4000).catch(() => '');
    const msg = parseMessages(r, 0x41).find((m) => m[1] === parseInt(pid.slice(2), 16));
    if (msg && msg.length >= 3) out.push({ pid, name, unit, value: Math.round(f(msg[2], msg[3] || 0) * 10) / 10 });
  }
  const v = await send('ATRV', 3000).catch(() => '');
  const volts = parseFloat(v);
  if (!Number.isNaN(volts)) out.push({ pid: 'ATRV', name: 'Battery voltage', unit: 'V', value: volts });
  return out;
}
