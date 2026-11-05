// Tiny persistence layer (localStorage survives app restarts in the Android WebView).
const KEY = 'swiftmechanic.v1';

const DEFAULTS = {
  vehicles: [],
  currentVehicleId: null,
  history: [],
  settings: { provider: 'claude', model: 'claude-sonnet-5-5', apiKey: '', useNhtsa: true },
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    // storage full – drop oldest history and retry once
    state.history = state.history.slice(0, 30);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { console.warn('save failed', e); }
  }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function currentVehicle() {
  return state.vehicles.find((v) => v.id === state.currentVehicleId) || state.vehicles[0] || null;
}
