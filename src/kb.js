// Offline symptom knowledge base. Used when there is no AI key or no internet,
// and as extra context for the AI. Keywords include English and Spanish.
import { extractCodes, lookupCode } from './obd.js';

// Each cause: [name, likelihood weight 1-5, difficulty 'Easy'|'Moderate'|'Hard'|'Pro', cost range USD, check]
export const SYMPTOMS = [
  {
    id: 'no_crank', title: 'Engine will not crank / just clicks', urgency: 2,
    kw: ['no crank', "won't crank", 'wont crank', 'click', 'clicking', 'nothing happens when i turn', 'dead battery', 'no arranca', 'no prende', 'hace clic', 'bateria muerta', 'batería'],
    causes: [
      ['Weak or dead battery', 5, 'Easy', '$0–$250', 'Test battery voltage: 12.6 V resting is good; under 12.2 V is low. Try a jump start.'],
      ['Corroded or loose battery terminals', 4, 'Easy', '$0–$20', 'Look for white/green crust; clean with baking soda and water, tighten clamps.'],
      ['Failed starter motor or solenoid', 3, 'Moderate', '$150–$600', 'One loud click with good battery = starter. Tap the starter lightly while someone turns the key.'],
      ['Bad ignition switch or neutral safety switch', 2, 'Moderate', '$50–$300', 'Try starting in Neutral instead of Park.'],
      ['Bad ground strap / main fuse', 2, 'Moderate', '$20–$100', 'Inspect engine-to-body ground strap and main fuse box.'],
    ],
  },
  {
    id: 'crank_no_start', title: 'Engine cranks but does not start', urgency: 2,
    kw: ['cranks but', 'crank but', 'turns over but', "won't start", 'wont start', 'no start', 'gira pero no', 'da marcha pero no', 'no enciende'],
    causes: [
      ['No fuel pressure (fuel pump / relay / fuse)', 4, 'Moderate', '$20–$800', 'Turn key to ON and listen for a 2-second hum from the tank. Check the fuel pump fuse and relay.'],
      ['No spark (crank sensor, ignition coil, ignition module)', 4, 'Moderate', '$30–$300', 'Check if the tachometer moves while cranking – no movement often means a bad crank sensor.'],
      ['Out of gas or bad fuel gauge', 2, 'Easy', '$0–$20', 'Add a gallon of fuel and retry.'],
      ['Anti-theft / immobilizer not recognizing key', 2, 'Easy', '$0–$250', 'Look for a flashing security light; try the spare key.'],
      ['Timing belt/chain broken or jumped', 2, 'Pro', '$400–$2,000', 'Cranking sounds unusually fast/even. A shop can confirm with a compression test.'],
    ],
  },
  {
    id: 'overheat', title: 'Engine overheating', urgency: 3,
    kw: ['overheat', 'over heat', 'temperature gauge high', 'temp gauge', 'running hot', 'steam', 'coolant', 'sobrecalent', 'se calienta', 'calentando', 'temperatura alta', 'anticongelante', 'refrigerante', 'vapor'],
    causes: [
      ['Low coolant from a leak (hose, radiator, water pump)', 5, 'Easy', '$10–$600', 'With the engine COLD, check the reservoir and radiator level. Look for drips and dried crust.'],
      ['Thermostat stuck closed', 3, 'Moderate', '$20–$250', 'Upper radiator hose stays cool while engine is hot = thermostat.'],
      ['Radiator cooling fan not working', 3, 'Moderate', '$50–$500', 'Let it idle with AC on – fan should run. Check fan fuse/relay.'],
      ['Failing water pump', 2, 'Hard', '$250–$900', 'Look for coolant weeping from the weep hole or a wobbly pulley.'],
      ['Clogged radiator', 2, 'Moderate', '$200–$800', 'Cold spots on the radiator surface when hot.'],
      ['Blown head gasket', 2, 'Pro', '$1,000–$3,000', 'White sweet-smelling exhaust smoke, milky oil, or bubbles in the coolant.'],
    ],
  },
  {
    id: 'misfire', title: 'Rough idle / misfire / shaking', urgency: 2,
    kw: ['misfire', 'rough idle', 'shaking', 'shakes', 'stumble', 'hesitat', 'sputter', 'jerks', 'vibrates at idle', 'flashing check engine', 'tiembla', 'falla', 'ralenti', 'jalonea', 'tironea', 'cascabelea'],
    causes: [
      ['Worn spark plugs', 4, 'Easy', '$20–$150', 'Check plug mileage; worn plugs have rounded electrodes or a large gap.'],
      ['Failing ignition coil', 4, 'Easy', '$40–$200', 'Swap the suspected coil with another cylinder and see if the misfire follows it.'],
      ['Vacuum leak', 3, 'Moderate', '$5–$200', 'Listen for hissing at idle; spray soapy water on hoses and watch for bubbles/idle change.'],
      ['Clogged or leaking fuel injector', 2, 'Moderate', '$50–$400', 'Try a quality injector cleaner; a mechanic can do a balance test.'],
      ['Dirty throttle body / idle control', 2, 'Easy', '$10–$30', 'Clean the throttle body with throttle-body cleaner.'],
      ['Worn engine mounts (vibration felt in cabin)', 2, 'Moderate', '$100–$500', 'Watch the engine rock when shifting from Park to Drive with brakes held.'],
    ],
  },
  {
    id: 'check_engine', title: 'Check engine light on', urgency: 1,
    kw: ['check engine', ' cel ', 'engine light', 'service engine', 'luz del motor', 'luz de check', 'testigo'],
    causes: [
      ['Loose or worn gas cap (EVAP leak)', 3, 'Easy', '$0–$25', 'Tighten until it clicks; the light may take a few days to turn off.'],
      ['Oxygen sensor', 3, 'Easy', '$50–$300', 'Read the code – P013x–P016x point to O2 sensors.'],
      ['Catalytic converter efficiency', 2, 'Pro', '$400–$2,500', 'Code P0420/P0430. Fix any misfires first.'],
      ['Ignition coil or spark plug', 2, 'Easy', '$20–$200', 'Codes P0300–P0312.'],
      ['Mass air flow sensor dirty', 2, 'Easy', '$10–$250', 'Clean with MAF cleaner only.'],
    ],
  },
  {
    id: 'brakes_noise', title: 'Brakes squeal, grind or pulsate', urgency: 3,
    kw: ['brake', 'squeal', 'grind', 'grinding', 'pulsat', 'freno', 'frenos', 'chillan', 'chirrian', 'rechinan'],
    causes: [
      ['Brake pads worn to the wear indicator', 5, 'Moderate', '$100–$300 per axle', 'Look through the wheel: under 3 mm of pad material needs replacing.'],
      ['Pads worn to metal, rotor damage (grinding)', 3, 'Moderate', '$250–$600 per axle', 'Grinding = metal on metal. Stop driving and replace pads and rotors.'],
      ['Warped / uneven rotors (pulsating pedal)', 3, 'Moderate', '$200–$500 per axle', 'Steering wheel shakes when braking from highway speed.'],
      ['Sticking caliper', 2, 'Moderate', '$150–$400', 'One wheel much hotter than the others after driving; car pulls to one side.'],
    ],
  },
  {
    id: 'brakes_soft', title: 'Soft or sinking brake pedal', urgency: 3,
    kw: ['soft brake', 'spongy', 'pedal goes to the floor', 'pedal sinks', 'pedal suave', 'pedal se va al fondo', 'pedal esponjoso'],
    causes: [
      ['Brake fluid leak (lines, caliper, wheel cylinder)', 4, 'Moderate', '$100–$500', 'Check the fluid reservoir level and look for wet spots inside the wheels.'],
      ['Air in brake lines', 3, 'Moderate', '$80–$150', 'Needs a brake bleed.'],
      ['Failing master cylinder', 3, 'Moderate', '$200–$500', 'Pedal slowly sinks while held at a stop with no visible leak.'],
    ],
  },
  {
    id: 'transmission', title: 'Transmission slipping or shifting hard', urgency: 2,
    kw: ['slipping', 'slip', 'hard shift', 'shifts hard', 'delayed engagement', 'transmission', 'gear', 'rpm flare', 'no shift', 'transmision', 'transmisión', 'patina', 'cambios', 'no cambia', 'golpea al cambiar'],
    causes: [
      ['Low or burnt transmission fluid', 4, 'Easy', '$20–$250', 'Check ATF level/colour if your car has a dipstick – should be red/pink, not brown or burnt-smelling.'],
      ['Faulty shift solenoid', 3, 'Moderate', '$150–$600', 'Often sets codes P0750–P0770.'],
      ['Transmission needs a software update/relearn', 2, 'Pro', '$100–$200', 'Common on many newer automatics – ask the dealer about TSBs.'],
      ['Worn clutches / internal wear', 2, 'Pro', '$1,800–$4,500', 'RPM flares between gears that get worse over time.'],
      ['Worn clutch (manual transmission)', 2, 'Hard', '$800–$1,800', 'RPM rises without speed increasing in a high gear.'],
    ],
  },
  {
    id: 'battery_charging', title: 'Battery light / dim lights / charging problem', urgency: 2,
    kw: ['battery light', 'alternator', 'dim lights', 'charging', 'dies while driving', 'luz de bateria', 'alternador', 'se apaga manejando'],
    causes: [
      ['Failing alternator', 4, 'Moderate', '$250–$700', 'Engine running voltage should be 13.8–14.7 V. Below 13 V = not charging.'],
      ['Loose/worn serpentine belt', 3, 'Easy', '$25–$150', 'Look for cracks, glazing, or squealing.'],
      ['Corroded battery cables or bad ground', 2, 'Easy', '$0–$50', 'Clean terminals and check ground straps.'],
      ['Weak battery', 2, 'Easy', '$120–$250', 'Have it load-tested free at most parts stores.'],
    ],
  },
  {
    id: 'ac', title: 'A/C blows warm air', urgency: 1,
    kw: [' ac ', 'a/c', 'air conditioning', 'blows warm', 'blows hot', 'not cold', 'aire acondicionado', 'no enfria', 'no enfría', 'aire caliente'],
    causes: [
      ['Low refrigerant from a leak', 5, 'Moderate', '$150–$400', 'Have the system leak-tested; look for oily residue on lines/fittings.'],
      ['A/C compressor clutch not engaging', 3, 'Moderate', '$50–$1,200', 'With A/C on, the compressor front plate should spin. Check A/C fuse/relay.'],
      ['Condenser fan not running', 2, 'Moderate', '$100–$450', 'Cold on highway but warm at idle = fan.'],
      ['Blend door actuator', 2, 'Moderate', '$100–$350', 'Clicking behind the dash; temperature doesn\'t change.'],
    ],
  },
  {
    id: 'noise_suspension', title: 'Clunk / knocking over bumps', urgency: 2,
    kw: ['clunk', 'knock over bumps', 'rattle', 'bumps', 'suspension', 'sway bar', 'ruido al pasar', 'baches', 'golpeteo', 'suspension', 'suspensión'],
    causes: [
      ['Worn sway bar end links / bushings', 4, 'Easy', '$40–$200', 'Grab the link and shake it – any play means it\'s worn.'],
      ['Worn struts/shocks or strut mounts', 3, 'Moderate', '$300–$900', 'Push down hard on each corner – more than 1–2 bounces means worn shocks.'],
      ['Worn ball joints or tie rod ends', 3, 'Moderate', '$150–$500', 'Jack up the wheel and rock it top-to-bottom and side-to-side.'],
      ['Worn control arm bushings', 2, 'Moderate', '$200–$600', 'Visible cracks or torn rubber.'],
    ],
  },
  {
    id: 'wheel_noise', title: 'Humming / growling that changes with speed', urgency: 2,
    kw: ['humming', ' hum ', 'growl', 'roaring', 'wheel bearing', 'louder with speed', 'zumbido', 'ruido con la velocidad', 'balero', 'rodamiento'],
    causes: [
      ['Worn wheel bearing', 4, 'Moderate', '$150–$500 per wheel', 'Noise changes when you swerve gently left/right on the road.'],
      ['Uneven tire wear (cupping)', 3, 'Easy', '$0–$600', 'Run your hand over the tread for scalloped spots; rotate/align.'],
      ['CV joint (clicking on turns)', 2, 'Moderate', '$150–$500', 'Clicking during tight turns; torn CV boot with grease thrown.'],
    ],
  },
  {
    id: 'pulls', title: 'Car pulls to one side / steering wheel shakes', urgency: 2,
    kw: ['pulls to', 'pulling', 'steering wheel shakes', 'vibration at highway', 'alignment', 'se va de lado', 'jala', 'vibra el volante', 'alineacion'],
    causes: [
      ['Wheel alignment out of spec', 4, 'Pro', '$80–$150', 'Uneven tire wear on inner/outer edge.'],
      ['Unbalanced tires (shake at 55–70 mph)', 4, 'Pro', '$40–$80', 'Have tires balanced.'],
      ['Uneven tire pressure', 3, 'Easy', '$0', 'Set pressures to the door-jamb sticker.'],
      ['Sticking brake caliper', 2, 'Moderate', '$150–$400', 'One wheel is hot after driving.'],
    ],
  },
  {
    id: 'smoke', title: 'Smoke from exhaust', urgency: 2,
    kw: ['smoke', 'blue smoke', 'white smoke', 'black smoke', 'humo', 'humo blanco', 'humo azul', 'humo negro'],
    causes: [
      ['Blue smoke: engine burning oil (valve seals, piston rings, PCV, turbo seals)', 3, 'Pro', '$100–$3,000', 'Check how fast the oil level drops between changes.'],
      ['White thick sweet-smelling smoke: coolant burning (head gasket)', 3, 'Pro', '$1,000–$3,000', 'Coolant level dropping with no external leak.'],
      ['Black smoke: running rich (MAF, O2, leaking injector, clogged air filter)', 3, 'Moderate', '$20–$500', 'Check the air filter first, then scan for codes.'],
      ['Thin white vapor on cold mornings is normal condensation', 2, 'Easy', '$0', 'Goes away once the engine warms up.'],
    ],
  },
  {
    id: 'leak', title: 'Fluid leak under the car', urgency: 2,
    kw: ['leak', 'puddle', 'dripping', 'drip', 'gotea', 'goteo', 'charco', 'fuga', 'pierde aceite'],
    causes: [
      ['Engine oil (brown/black) – valve cover gasket, oil pan, drain plug', 4, 'Moderate', '$20–$500', 'Check the oil dipstick level and look at the leak colour.'],
      ['Coolant (green/orange/pink, sweet smell)', 3, 'Moderate', '$20–$600', 'Check hoses, radiator and water pump.'],
      ['Transmission fluid (red, oily)', 2, 'Moderate', '$100–$400', 'Pan gasket or cooler lines.'],
      ['A/C condensation (clear water near the passenger footwell)', 3, 'Easy', '$0', 'Normal when the A/C is used.'],
      ['Brake fluid (clear/yellow, slippery) – urgent', 2, 'Moderate', '$100–$500', 'Check the brake fluid reservoir. Do not drive if low.'],
    ],
  },
  {
    id: 'stalls', title: 'Engine stalls or dies', urgency: 3,
    kw: [' stall', ' dies', 'shuts off', 'cuts off', 'se apaga', 'se muere', 'se para'],
    causes: [
      ['Dirty throttle body / idle air control', 3, 'Easy', '$10–$150', 'Stalls at stops but starts again right away.'],
      ['Failing crankshaft position sensor (worse when hot)', 3, 'Moderate', '$50–$250', 'Dies when warm, restarts after cooling down.'],
      ['Weak fuel pump or clogged filter', 3, 'Moderate', '$150–$800', 'Dies under load or uphill.'],
      ['Vacuum leak', 2, 'Moderate', '$5–$200', 'High or surging idle with hissing.'],
      ['Alternator not charging', 2, 'Moderate', '$250–$700', 'Battery light on before it dies.'],
    ],
  },
  {
    id: 'power_loss', title: 'Loss of power / poor acceleration', urgency: 2,
    kw: ['no power', 'loss of power', 'sluggish', 'slow acceleration', 'limp mode', 'no tiene fuerza', 'perdio fuerza', 'sin potencia', 'modo emergencia'],
    causes: [
      ['Clogged catalytic converter', 2, 'Pro', '$500–$2,500', 'Rotten-egg smell, glowing cat, power drops at higher RPM.'],
      ['Dirty MAF sensor / clogged air filter', 3, 'Easy', '$10–$250', 'Replace filter, clean MAF.'],
      ['Weak fuel pump / clogged fuel filter', 3, 'Moderate', '$100–$800', 'Worse uphill or at highway speed.'],
      ['Limp mode from a transmission or throttle fault', 3, 'Moderate', '$0–$800', 'Scan for codes – limp mode always stores one.'],
      ['Turbo boost leak (turbo engines)', 2, 'Moderate', '$30–$400', 'Hissing under acceleration; check intercooler hoses.'],
    ],
  },
  {
    id: 'oil_light', title: 'Oil pressure light / low oil', urgency: 3,
    kw: ['oil light', 'oil pressure', 'low oil', 'burning oil', 'luz de aceite', 'presion de aceite', 'presión de aceite', 'gasta aceite'],
    causes: [
      ['Oil level low', 5, 'Easy', '$10–$40', 'Stop the engine and check the dipstick right away. Driving with no oil destroys the engine.'],
      ['Faulty oil pressure switch/sensor', 3, 'Easy', '$20–$120', 'Light flickers at idle but oil level is full; a shop can test real oil pressure.'],
      ['Worn oil pump or clogged pickup', 2, 'Pro', '$500–$1,500', 'Low pressure confirmed with a mechanical gauge.'],
    ],
  },
  {
    id: 'smell', title: 'Strange smell', urgency: 2,
    kw: ['smell', 'burning smell', 'rotten egg', 'gas smell', 'sweet smell', 'olor', 'huele', 'olor a quemado', 'olor a gasolina'],
    causes: [
      ['Rotten egg: catalytic converter / rich running', 3, 'Moderate', '$50–$2,000', 'Check for misfire or rich codes.'],
      ['Sweet syrup: coolant leak (heater core if inside cabin)', 3, 'Moderate', '$50–$1,000', 'Foggy windshield with A/C off = heater core.'],
      ['Burning oil: oil leaking onto exhaust', 3, 'Moderate', '$50–$400', 'Valve cover gasket is the usual suspect.'],
      ['Raw gasoline: fuel leak – fire risk', 3, 'Moderate', '$50–$500', 'Do not drive if you see fuel dripping. Check injector O-rings, fuel lines.'],
      ['Burning rubber/plastic: slipping belt or electrical short', 2, 'Moderate', '$20–$300', 'Check belts and look for melted wiring.'],
    ],
  },
  {
    id: 'electrical', title: 'Electrical: windows, lights, radio not working', urgency: 1,
    kw: ['window', 'power window', 'headlight', ' radio ', 'fuse', ' lock', 'ventana', 'vidrio', 'luces', 'fusible', 'seguros'],
    causes: [
      ['Blown fuse', 4, 'Easy', '$1–$10', 'Check the fuse panel diagram on the lid or in the owner\'s manual.'],
      ['Failed switch or motor/regulator', 3, 'Moderate', '$50–$350', 'Listen for the motor when pressing the switch.'],
      ['Broken wire in door hinge harness', 2, 'Moderate', '$20–$200', 'Works intermittently when you open/close the door.'],
      ['Burned-out bulb', 3, 'Easy', '$5–$60', 'Swap bulbs side to side to test.'],
    ],
  },
];

const URGENCY_LABEL = { 1: 'Low', 2: 'Medium', 3: 'High' };
const W = { 1: 'Low', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'High' };

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9/ ]+/g, ' ').replace(/ {2,}/g, ' ');
}

/** Rule-based analysis. Returns the same shape the AI returns. */
export function offlineAnalyze(problem, vehicle) {
  const text = ' ' + normalize(problem) + ' ';
  const codes = extractCodes(problem).map(lookupCode).filter(Boolean);

  const scored = SYMPTOMS.map((s) => {
    let score = 0;
    for (const k of s.kw) if (text.includes(normalize(k))) score += k.length > 6 ? 2 : 1;
    return { s, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

  const causes = [];
  let urgency = 1;

  for (const c of codes) {
    urgency = Math.max(urgency, c.severity || 1);
    (c.causes.length ? c.causes : ['Needs a brand-specific lookup (try AI analysis)']).forEach((name, i) => {
      causes.push({
        name: `${name}`,
        likelihood: i === 0 ? 'High' : i < 3 ? 'Medium' : 'Low',
        why: `${c.code}: ${c.description}`,
        check: '',
        fix: '',
        difficulty: '',
        cost: '',
      });
    });
  }

  for (const { s } of scored.slice(0, 2)) {
    urgency = Math.max(urgency, s.urgency);
    for (const [name, w, difficulty, cost, check] of s.causes) {
      causes.push({ name, likelihood: W[w], why: s.title, check, fix: '', difficulty, cost });
    }
  }

  const v = vehicleLabel(vehicle);
  return {
    source: 'offline',
    summary: causes.length
      ? `Offline analysis for ${v || 'your vehicle'}: ${[...codes.map((c) => c.code), ...scored.slice(0, 2).map((x) => x.s.title.toLowerCase())].join(', ')}. Add an AI key in Settings for a brand/model-specific diagnosis.`
      : 'The offline guide could not match this description. Try adding more detail (when it happens, sounds, lights on the dash, any codes) or add an AI key in Settings for a full analysis.',
    urgency: URGENCY_LABEL[urgency],
    safeToDrive: urgency >= 3 ? 'No – get it checked before driving further.' : urgency === 2 ? 'Short trips only, with care.' : 'Yes, but have it looked at soon.',
    codes: codes.map((c) => ({ code: c.code, meaning: c.description })),
    causes: dedupe(causes).slice(0, 8),
    diagnosticSteps: scored.length || codes.length
      ? ['Scan for trouble codes with an OBD-II reader (free at most parts stores).', 'Start with the cheapest, most likely cause in the list and work down.', 'Note when the problem happens: cold/hot, idle/highway, turning, braking.']
      : [],
    knownIssues: [],
    followUpQuestions: [],
  };
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((c) => (seen.has(c.name) ? false : seen.add(c.name)));
}

export function vehicleLabel(v) {
  if (!v) return '';
  return [v.year, v.make, v.model, v.trim, v.engine && `(${v.engine})`].filter(Boolean).join(' ');
}
