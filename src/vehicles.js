// Vehicle data: years, makes, models (NHTSA vPIC – free, no key),
// submodel/engine options (fueleconomy.gov – free, no key) and VIN decoding.
// On Android, CapacitorHttp routes fetch() natively, so no CORS issues.

const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles';
const FUEL = 'https://www.fueleconomy.gov/ws/rest/vehicle/menu';

export const POPULAR_MAKES = [
  'Acura', 'Alfa Romeo', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler', 'Dodge', 'Fiat', 'Ford',
  'Genesis', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Jaguar', 'Jeep', 'Kia', 'Land Rover', 'Lexus', 'Lincoln',
  'Mazda', 'Mercedes-Benz', 'Mercury', 'Mini', 'Mitsubishi', 'Nissan', 'Pontiac', 'Porsche', 'Ram', 'Rivian',
  'Saturn', 'Scion', 'Subaru', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
];

export function years() {
  const now = new Date().getFullYear() + 1;
  const out = [];
  for (let y = now; y >= 1981; y--) out.push(String(y));
  return out;
}

const cache = new Map();
async function getJson(url, headers = {}) {
  if (cache.has(url)) return cache.get(url);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    cache.set(url, j);
    return j;
  } finally {
    clearTimeout(t);
  }
}

/** Model names for a make/year. */
export async function getModels(make, year) {
  const j = await getJson(`${VPIC}/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`);
  const names = [...new Set((j.Results || []).map((r) => r.Model_Name.trim()))];
  return names.sort((a, b) => a.localeCompare(b));
}

function asArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

/**
 * Submodels (e.g. "Civic", "Civic HF", "Civic Hybrid") and engine/transmission options
 * from fueleconomy.gov. Returns [] when the vehicle isn't in their database.
 */
export async function getSubmodels(year, make, model) {
  try {
    const j = await getJson(`${FUEL}/model?year=${year}&make=${encodeURIComponent(make)}`);
    const items = asArray(j.menuItem).map((m) => m.value || m.text);
    const base = model.toLowerCase().replace(/[^a-z0-9]/g, '');
    return items.filter((n) => n.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(base));
  } catch {
    return [];
  }
}

export async function getEngineOptions(year, make, fuelModel) {
  try {
    const j = await getJson(`${FUEL}/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(fuelModel)}`);
    return asArray(j.menuItem).map((m) => m.text);
  } catch {
    return [];
  }
}

/** Decode a 17-character VIN. */
export async function decodeVin(vin) {
  const clean = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(clean)) throw new Error('A VIN has 17 letters/numbers (no I, O or Q).');
  const j = await getJson(`${VPIC}/DecodeVinValues/${clean}?format=json`);
  const r = (j.Results || [])[0] || {};
  if (!r.Make) throw new Error('VIN not found. Check it and try again.');
  const engine = [
    r.DisplacementL && `${Number(r.DisplacementL).toFixed(1)}L`,
    r.EngineCylinders && `${r.EngineCylinders}-cyl`,
    r.EngineConfiguration && r.EngineConfiguration.replace('-Shaped', ''),
    r.Turbo === 'Yes' && 'Turbo',
    r.FuelTypePrimary && r.FuelTypePrimary !== 'Gasoline' && r.FuelTypePrimary,
    r.EngineModel,
  ].filter(Boolean).join(' ');
  return {
    vin: clean,
    year: r.ModelYear,
    make: titleCase(r.Make),
    model: r.Model,
    trim: [r.Trim, r.Series].filter(Boolean).join(' ').trim(),
    engine,
    drive: r.DriveType || '',
    transmission: [r.TransmissionStyle, r.TransmissionSpeeds && `${r.TransmissionSpeeds}-speed`].filter(Boolean).join(' '),
    body: r.BodyClass || '',
  };
}

function titleCase(s) {
  return String(s).toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/^Bmw$|^Gmc$|^Ram$/i, (m) => m.toUpperCase());
}
