// AI diagnosis. Supports Anthropic Claude and Google Gemini with the user's own API key
// (stored only on the phone). Returns a structured diagnosis object.
import { vehicleLabel } from './kb.js';

export const PROVIDERS = {
  claude: {
    label: 'Claude (Anthropic)',
    models: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  gemini: {
    label: 'Gemini (Google)',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
};

const SYSTEM = `You are an ASE master-certified automotive technician with decades of experience across all brands.
The user describes a problem, symptom, warning light or trouble code for a SPECIFIC vehicle. Diagnose it for that exact
year, make, model, submodel/trim and engine — use your knowledge of that platform's known failure patterns,
technical service bulletins, recalls and common fixes. Rank causes from most to least likely FOR THIS VEHICLE.
Be practical: cheapest/easiest checks first. Give realistic US repair cost ranges (parts + labor at an independent shop, and DIY parts cost).
Flag anything safety-critical (brakes, steering, fuel leaks, overheating, airbags) clearly.
Reply in the SAME LANGUAGE the user wrote the problem in (for example Spanish if they wrote in Spanish).
Respond with ONLY a JSON object, no markdown fences, using exactly this shape:
{
  "summary": "2-3 sentence plain-language explanation of what is most likely going on",
  "urgency": "Low" | "Medium" | "High",
  "safeToDrive": "short answer about whether it is safe to keep driving",
  "codes": [{"code": "P0301", "meaning": "what it means on this vehicle"}],
  "causes": [{
    "name": "cause",
    "likelihood": "High" | "Medium" | "Low",
    "why": "why this fits the symptoms and this vehicle",
    "check": "how to confirm it (tools, what to look/listen for)",
    "fix": "how it is repaired",
    "difficulty": "Easy" | "Moderate" | "Hard" | "Pro",
    "cost": "e.g. DIY $40-$80 / Shop $150-$250"
  }],
  "diagnosticSteps": ["ordered step-by-step plan"],
  "knownIssues": ["known problems, TSBs or recalls for this exact vehicle that relate to the complaint"],
  "partsNeeded": ["likely parts for the top cause, with typical part names"],
  "followUpQuestions": ["questions whose answers would narrow it down"]
}
Give 3-6 causes. Keep each field concise.`;

function buildPrompt({ vehicle, problem, codes, recalls, complaints, topComponents, offline, live }) {
  const v = vehicle || {};
  const lines = [];
  lines.push(`VEHICLE: ${vehicleLabel(v) || 'not specified'}`);
  const extra = [v.engine && `Engine: ${v.engine}`, v.transmission && `Transmission: ${v.transmission}`, v.drive && `Drive: ${v.drive}`, v.mileage && `Mileage: ${v.mileage}`, v.vin && `VIN: ${v.vin}`].filter(Boolean);
  if (extra.length) lines.push(extra.join(' | '));
  lines.push('', `PROBLEM (user's words): ${problem}`);
  if (codes?.length) {
    lines.push('', 'TROUBLE CODES (generic meanings from local database):');
    codes.forEach((c) => lines.push(`- ${c.code}: ${c.description}`));
  }
  if (recalls?.length) {
    lines.push('', 'NHTSA RECALLS for this year/make/model that may relate:');
    recalls.forEach((r) => lines.push(`- ${r.id} [${r.component}]: ${trim(r.summary, 300)}`));
  }
  if (complaints?.length) {
    lines.push('', 'Similar NHTSA OWNER COMPLAINTS for this year/make/model:');
    complaints.forEach((c) => lines.push(`- [${c.components}] ${trim(c.summary, 280)}`));
  }
  if (topComponents?.length) {
    lines.push('', `Most-complained components for this model: ${topComponents.map((t) => `${t.component} (${t.count})`).join(', ')}`);
  }
  if (live?.length) {
    lines.push('', 'LIVE SENSOR SNAPSHOT from the user\'s OBD-II scanner (use it – e.g. fuel trims, coolant temp, voltage):');
    lines.push(live.map((x) => `${x.name}: ${x.value} ${x.unit}`).join(' | '));
  }
  if (offline?.causes?.length) {
    lines.push('', `Generic rule-based guesses (verify, may not apply): ${offline.causes.slice(0, 5).map((c) => c.name).join('; ')}`);
  }
  return lines.join('\n');
}

const trim = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));

async function post(url, headers, body, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch { j = null; }
    if (!r.ok) {
      const msg = j?.error?.message || text.slice(0, 200) || `HTTP ${r.status}`;
      if (r.status === 401 || r.status === 403) throw new Error(`API key rejected: ${msg}`);
      throw new Error(msg);
    }
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The AI took too long to answer. Try again.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function callModel(settings, system, messages, maxTokens) {
  const { provider, apiKey } = settings;
  const model = settings.model || PROVIDERS[provider].models[0];
  if (!apiKey) throw new Error('No API key set. Open Settings to add one.');

  if (provider === 'gemini') {
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: m.content.map((p) => (p.type === 'image' ? { inline_data: { mime_type: p.mime, data: p.data } } : { text: p.text })),
    }));
    const j = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { 'x-goog-api-key': apiKey },
      { systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 } },
    );
    return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  }

  const j = await post(
    'https://api.anthropic.com/v1/messages',
    { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    {
      model,
      max_tokens: maxTokens,
      system,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content.map((p) => (p.type === 'image' ? { type: 'image', source: { type: 'base64', media_type: p.mime, data: p.data } } : { type: 'text', text: p.text })),
      })),
    },
  );
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

export function parseJson(text) {
  let s = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

/** Full diagnosis. photo = {mime, data(base64)} optional. */
export async function aiDiagnose(settings, ctx, photo) {
  const content = [{ type: 'text', text: buildPrompt(ctx) }];
  if (photo) {
    content.unshift({ type: 'image', mime: photo.mime, data: photo.data });
    content.push({ type: 'text', text: 'A photo from the user is attached (dashboard, part, leak, etc.). Use it in the diagnosis.' });
  }
  const text = await callModel(settings, SYSTEM, [{ role: 'user', content }], 4000);
  let out;
  try {
    out = parseJson(text);
  } catch {
    out = { summary: text.trim(), causes: [], diagnosticSteps: [], knownIssues: [], followUpQuestions: [] };
  }
  out.source = 'ai';
  out.model = settings.model;
  return normalizeResult(out);
}

/** Follow-up question about an existing diagnosis. Returns plain text. */
export async function aiFollowUp(settings, entry, thread, question) {
  const sys = `You are an ASE master-certified technician helping a car owner. Vehicle: ${vehicleLabel(entry.vehicle)}.
Original problem: ${entry.problem}
Your earlier diagnosis (JSON): ${JSON.stringify({ summary: entry.result.summary, causes: entry.result.causes?.map((c) => c.name) })}
Answer follow-up questions practically and concisely (under 200 words), specific to this vehicle. Use short paragraphs or "- " bullet lines, no markdown headings.
Reply in the same language as the question.`;
  const messages = [];
  for (const t of thread) {
    messages.push({ role: 'user', content: [{ type: 'text', text: t.q }] });
    messages.push({ role: 'assistant', content: [{ type: 'text', text: t.a }] });
  }
  messages.push({ role: 'user', content: [{ type: 'text', text: question }] });
  return (await callModel(settings, sys, messages, 1200)).trim();
}

export async function testKey(settings) {
  await callModel(settings, 'Reply with the single word OK.', [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }], 10);
}

function arr(x) {
  return Array.isArray(x) ? x : x ? [x] : [];
}

export function normalizeResult(r) {
  return {
    ...r,
    summary: String(r.summary || ''),
    urgency: ['Low', 'Medium', 'High'].includes(r.urgency) ? r.urgency : r.urgency || 'Medium',
    codes: arr(r.codes),
    causes: arr(r.causes).map((c) => (typeof c === 'string' ? { name: c } : c)),
    diagnosticSteps: arr(r.diagnosticSteps).map(String),
    knownIssues: arr(r.knownIssues).map(String),
    partsNeeded: arr(r.partsNeeded).map(String),
    followUpQuestions: arr(r.followUpQuestions).map(String),
  };
}
