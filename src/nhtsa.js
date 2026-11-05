// NHTSA safety recalls and owner complaints for a specific year/make/model (free, no key).
const API = 'https://api.nhtsa.gov';

async function get(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const q = (v) => `make=${encodeURIComponent(v.make)}&model=${encodeURIComponent(v.model)}&modelYear=${v.year}`;

export async function getRecalls(v) {
  const j = await get(`${API}/recalls/recallsByVehicle?${q(v)}`);
  return (j.results || j.Results || []).map((r) => ({
    id: r.NHTSACampaignNumber,
    date: r.ReportReceivedDate,
    component: r.Component,
    summary: r.Summary,
    consequence: r.Consequence,
    remedy: r.Remedy,
  }));
}

export async function getComplaints(v) {
  const j = await get(`${API}/complaints/complaintsByVehicle?${q(v)}`);
  return (j.results || j.Results || []).map((c) => ({
    components: c.components || '',
    summary: c.summary || '',
    date: c.dateOfIncident || c.dateComplaintFiled || '',
    crash: c.crash,
    fire: c.fire,
  }));
}

const STOP = new Set('the a an and or but my car is it was when i to of in on at for with not no has have had this that from be very after while just like get gets got el la los las de del y o que mi carro es se en con por para al un una lo le me no'.split(' '));

function words(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
}

/** Picks the recalls/complaints that best match the user's description. */
export function rankRelevant(items, problem, getText, limit) {
  const want = new Set(words(problem));
  if (!want.size) return [];
  return items
    .map((it) => {
      const w = words(getText(it));
      let score = 0;
      for (const x of new Set(w)) if (want.has(x)) score++;
      return { it, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.it);
}

/** Groups complaints by component so we can show "most reported problems" for this model. */
export function topComponents(complaints, n = 6) {
  const counts = new Map();
  for (const c of complaints) {
    for (const comp of String(c.components).split(',').map((s) => s.trim()).filter(Boolean)) {
      counts.set(comp, (counts.get(comp) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([component, count]) => ({ component, count }));
}
