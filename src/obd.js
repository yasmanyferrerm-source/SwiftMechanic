// Offline OBD-II trouble code lookup.
// Covers the generic (SAE) codes people run into most, plus pattern rules
// for whole families (misfires, O2 sensors, etc.). Manufacturer-specific codes
// (P1xxx, B1xxx...) get a structural explanation and are left to the AI.

const SYSTEMS = { P: 'Powertrain (engine / transmission)', B: 'Body', C: 'Chassis (brakes, steering, suspension)', U: 'Network / communication' };

const SUBSYSTEMS = {
  '0': 'Fuel/air metering & auxiliary emission controls',
  '1': 'Fuel and air metering',
  '2': 'Fuel and air metering (injector circuit)',
  '3': 'Ignition system or misfire',
  '4': 'Auxiliary emission controls (EGR, EVAP, catalyst, air pump)',
  '5': 'Vehicle speed, idle control and auxiliary inputs',
  '6': 'Computer (ECM/PCM) and output circuits',
  '7': 'Transmission',
  '8': 'Transmission',
  '9': 'Transmission',
  A: 'Hybrid propulsion',
  B: 'Hybrid propulsion',
  C: 'Hybrid propulsion',
};

// code: [description, severity 1-3, common causes]
const CODES = {
  P0010: ['Intake camshaft position actuator circuit (Bank 1)', 2, ['VVT/oil control solenoid', 'Wiring/connector', 'Low or dirty oil']],
  P0011: ['Intake camshaft timing over-advanced (Bank 1)', 2, ['Low/dirty oil or wrong viscosity', 'VVT solenoid stuck', 'Cam phaser', 'Timing chain stretch']],
  P0012: ['Intake camshaft timing over-retarded (Bank 1)', 2, ['Low/dirty oil', 'VVT solenoid', 'Cam phaser', 'Timing chain stretch']],
  P0014: ['Exhaust camshaft timing over-advanced (Bank 1)', 2, ['Low/dirty oil', 'Exhaust VVT solenoid', 'Timing chain']],
  P0016: ['Crankshaft/camshaft position correlation (Bank 1 Sensor A)', 3, ['Stretched timing chain/belt jumped a tooth', 'Cam or crank sensor', 'VVT solenoid', 'Low oil']],
  P0017: ['Crankshaft/camshaft position correlation (Bank 1 Sensor B)', 3, ['Timing chain stretch', 'Exhaust cam sensor', 'VVT solenoid']],
  P0018: ['Crankshaft/camshaft position correlation (Bank 2 Sensor A)', 3, ['Timing chain stretch', 'Cam sensor', 'VVT solenoid']],
  P0030: ['O2 sensor heater control circuit (Bank 1 Sensor 1)', 1, ['Upstream O2 sensor heater', 'Blown fuse', 'Wiring']],
  P0036: ['O2 sensor heater control circuit (Bank 1 Sensor 2)', 1, ['Downstream O2 sensor heater', 'Fuse', 'Wiring']],
  P0068: ['MAP/MAF – throttle position correlation', 2, ['Vacuum leak', 'Dirty throttle body', 'MAF sensor']],
  P0087: ['Fuel rail/system pressure too low', 3, ['Weak fuel pump', 'Clogged fuel filter', 'Fuel pressure regulator', 'High-pressure pump (direct injection)']],
  P0088: ['Fuel rail/system pressure too high', 2, ['Fuel pressure regulator', 'Rail pressure sensor', 'Return line blocked']],
  P0100: ['Mass air flow (MAF) circuit malfunction', 2, ['MAF sensor', 'Wiring/connector', 'Air leak after MAF']],
  P0101: ['MAF sensor range/performance', 2, ['Dirty MAF sensor', 'Vacuum/intake leak', 'Clogged air filter']],
  P0102: ['MAF sensor circuit low input', 2, ['MAF sensor', 'Unplugged/corroded connector', 'Wiring short']],
  P0103: ['MAF sensor circuit high input', 2, ['MAF sensor', 'Wiring']],
  P0106: ['MAP sensor range/performance', 2, ['MAP sensor', 'Vacuum hose', 'Vacuum leak']],
  P0107: ['MAP sensor circuit low input', 2, ['MAP sensor', 'Wiring']],
  P0108: ['MAP sensor circuit high input', 2, ['MAP sensor', 'Vacuum hose disconnected']],
  P0110: ['Intake air temperature sensor circuit', 1, ['IAT sensor', 'Wiring']],
  P0113: ['Intake air temperature sensor high input', 1, ['IAT sensor unplugged', 'Sensor failed', 'Wiring open']],
  P0115: ['Engine coolant temperature sensor circuit', 2, ['ECT sensor', 'Wiring']],
  P0116: ['Coolant temperature sensor range/performance', 2, ['Thermostat stuck open', 'ECT sensor']],
  P0117: ['Coolant temperature sensor low input', 2, ['ECT sensor', 'Wiring short']],
  P0118: ['Coolant temperature sensor high input', 2, ['ECT sensor', 'Open wiring', 'Low coolant']],
  P0120: ['Throttle position sensor circuit', 2, ['TPS', 'Throttle body', 'Wiring']],
  P0121: ['Throttle position sensor range/performance', 2, ['TPS', 'Dirty throttle body']],
  P0122: ['Throttle position sensor low input', 2, ['TPS', 'Wiring']],
  P0123: ['Throttle position sensor high input', 2, ['TPS', 'Wiring']],
  P0125: ['Insufficient coolant temperature for closed-loop fuel control', 1, ['Thermostat stuck open', 'Low coolant', 'ECT sensor']],
  P0128: ['Coolant temperature below thermostat regulating temperature', 1, ['Thermostat stuck open', 'ECT sensor', 'Cooling fan running constantly']],
  P0130: ['O2 sensor circuit (Bank 1 Sensor 1)', 1, ['Upstream O2 sensor', 'Exhaust leak', 'Wiring']],
  P0131: ['O2 sensor low voltage (Bank 1 Sensor 1)', 1, ['O2 sensor', 'Exhaust leak before sensor', 'Lean condition']],
  P0133: ['O2 sensor slow response (Bank 1 Sensor 1)', 1, ['Aging O2 sensor', 'Exhaust leak', 'Vacuum leak']],
  P0134: ['O2 sensor no activity (Bank 1 Sensor 1)', 1, ['O2 sensor', 'Heater circuit', 'Wiring']],
  P0135: ['O2 sensor heater circuit (Bank 1 Sensor 1)', 1, ['O2 sensor heater', 'Fuse', 'Wiring']],
  P0136: ['O2 sensor circuit (Bank 1 Sensor 2)', 1, ['Downstream O2 sensor', 'Wiring', 'Exhaust leak']],
  P0137: ['O2 sensor low voltage (Bank 1 Sensor 2)', 1, ['Downstream O2 sensor', 'Exhaust leak']],
  P0138: ['O2 sensor high voltage (Bank 1 Sensor 2)', 1, ['Downstream O2 sensor', 'Rich condition']],
  P0140: ['O2 sensor no activity (Bank 1 Sensor 2)', 1, ['Downstream O2 sensor', 'Wiring']],
  P0141: ['O2 sensor heater circuit (Bank 1 Sensor 2)', 1, ['Downstream O2 sensor heater', 'Fuse', 'Wiring']],
  P0151: ['O2 sensor low voltage (Bank 2 Sensor 1)', 1, ['O2 sensor', 'Exhaust leak', 'Lean condition']],
  P0155: ['O2 sensor heater circuit (Bank 2 Sensor 1)', 1, ['O2 sensor heater', 'Fuse', 'Wiring']],
  P0161: ['O2 sensor heater circuit (Bank 2 Sensor 2)', 1, ['O2 sensor heater', 'Wiring']],
  P0171: ['System too lean (Bank 1)', 2, ['Vacuum leak (hoses, intake gasket, PCV)', 'Dirty MAF sensor', 'Weak fuel pump / clogged filter', 'Clogged injectors', 'Exhaust leak before O2 sensor']],
  P0172: ['System too rich (Bank 1)', 2, ['Leaking injector', 'High fuel pressure', 'Dirty/faulty MAF', 'Faulty O2 sensor', 'Clogged air filter']],
  P0174: ['System too lean (Bank 2)', 2, ['Vacuum leak', 'Dirty MAF', 'Low fuel pressure', 'Intake gasket']],
  P0175: ['System too rich (Bank 2)', 2, ['Leaking injector', 'Fuel pressure regulator', 'MAF sensor']],
  P0191: ['Fuel rail pressure sensor range/performance', 2, ['Fuel rail pressure sensor', 'Fuel pump', 'Wiring']],
  P0200: ['Injector circuit malfunction', 2, ['Injector', 'Wiring', 'Injector driver in ECM']],
  P0217: ['Engine overheat condition', 3, ['Low coolant / leak', 'Thermostat stuck closed', 'Water pump', 'Cooling fan', 'Head gasket']],
  P0218: ['Transmission fluid overtemperature', 3, ['Low/burnt ATF', 'Transmission cooler blocked', 'Heavy towing']],
  P0220: ['Throttle position sensor B circuit', 2, ['Electronic throttle body', 'Wiring']],
  P0234: ['Turbo/supercharger overboost', 2, ['Wastegate stuck', 'Boost control solenoid', 'Boost sensor']],
  P0299: ['Turbo/supercharger underboost', 2, ['Boost leak (intercooler hoses)', 'Wastegate', 'Turbocharger wear', 'Boost control solenoid']],
  P0300: ['Random/multiple cylinder misfire detected', 3, ['Worn spark plugs', 'Ignition coils', 'Vacuum leak', 'Low fuel pressure', 'Clogged injectors', 'Low compression']],
  P0320: ['Ignition/distributor engine speed input circuit', 3, ['Crankshaft position sensor', 'Wiring', 'Reluctor ring']],
  P0325: ['Knock sensor 1 circuit (Bank 1)', 1, ['Knock sensor', 'Wiring under intake', 'Connector']],
  P0327: ['Knock sensor 1 low input (Bank 1)', 1, ['Knock sensor', 'Wiring']],
  P0332: ['Knock sensor 2 low input (Bank 2)', 1, ['Knock sensor', 'Wiring']],
  P0335: ['Crankshaft position sensor A circuit', 3, ['Crankshaft position sensor', 'Wiring/connector', 'Damaged reluctor ring']],
  P0336: ['Crankshaft position sensor A range/performance', 3, ['Crank sensor', 'Reluctor ring', 'Wiring interference']],
  P0340: ['Camshaft position sensor A circuit (Bank 1)', 2, ['Camshaft position sensor', 'Wiring', 'Timing issue']],
  P0341: ['Camshaft position sensor A range/performance (Bank 1)', 2, ['Cam sensor', 'Timing chain/belt', 'Wiring']],
  P0345: ['Camshaft position sensor A circuit (Bank 2)', 2, ['Cam sensor', 'Wiring']],
  P0351: ['Ignition coil A primary/secondary circuit', 2, ['Ignition coil #1', 'Wiring', 'Connector']],
  P0400: ['EGR flow malfunction', 1, ['Clogged EGR passages', 'EGR valve', 'EGR solenoid']],
  P0401: ['EGR flow insufficient', 1, ['Carbon-clogged EGR passages', 'EGR valve', 'DPFE/EGR sensor', 'Vacuum line']],
  P0402: ['EGR flow excessive', 2, ['EGR valve stuck open', 'EGR solenoid']],
  P0403: ['EGR circuit malfunction', 1, ['EGR solenoid', 'Wiring']],
  P0411: ['Secondary air injection incorrect flow', 1, ['Air pump', 'Check valve', 'Air switching valve']],
  P0420: ['Catalyst efficiency below threshold (Bank 1)', 1, ['Worn catalytic converter', 'Downstream O2 sensor', 'Exhaust leak', 'Engine misfire/oil burning damaging cat']],
  P0430: ['Catalyst efficiency below threshold (Bank 2)', 1, ['Worn catalytic converter', 'O2 sensor', 'Exhaust leak']],
  P0440: ['Evaporative emission (EVAP) system malfunction', 1, ['Gas cap', 'Purge valve', 'Vent valve', 'EVAP hose leak']],
  P0441: ['EVAP incorrect purge flow', 1, ['Purge solenoid', 'Vacuum hose', 'Charcoal canister']],
  P0442: ['EVAP small leak detected', 1, ['Loose/worn gas cap', 'Cracked EVAP hose', 'Purge or vent valve', 'Filler neck']],
  P0443: ['EVAP purge control valve circuit', 1, ['Purge solenoid', 'Wiring']],
  P0446: ['EVAP vent control circuit', 1, ['Vent solenoid', 'Clogged canister/vent filter', 'Wiring']],
  P0449: ['EVAP vent valve/solenoid circuit', 1, ['Vent solenoid', 'Wiring']],
  P0451: ['EVAP pressure sensor range/performance', 1, ['Fuel tank pressure sensor', 'Wiring']],
  P0455: ['EVAP large leak detected', 1, ['Missing/loose gas cap', 'Disconnected EVAP hose', 'Purge valve stuck open', 'Canister']],
  P0456: ['EVAP very small leak detected', 1, ['Gas cap seal', 'Small hose crack', 'Purge/vent valve']],
  P0457: ['EVAP leak detected (fuel cap loose/off)', 1, ['Gas cap loose or missing', 'Filler neck seal']],
  P0480: ['Cooling fan 1 control circuit', 2, ['Fan relay', 'Fan motor', 'Wiring', 'Fuse']],
  P0496: ['EVAP high purge flow', 1, ['Purge valve stuck open']],
  P0500: ['Vehicle speed sensor malfunction', 2, ['Speed sensor', 'Wiring', 'ABS wheel sensor (some models)']],
  P0505: ['Idle air control system malfunction', 2, ['Dirty throttle body / IAC valve', 'Vacuum leak', 'IAC motor']],
  P0506: ['Idle RPM lower than expected', 1, ['Dirty throttle body', 'IAC valve', 'Vacuum leak']],
  P0507: ['Idle RPM higher than expected', 1, ['Vacuum leak', 'Dirty throttle body / IAC', 'PCV valve']],
  P0520: ['Oil pressure sensor/switch circuit', 2, ['Oil pressure switch (common leak point)', 'Wiring', 'Actual low oil pressure – check oil level']],
  P0521: ['Oil pressure sensor range/performance', 3, ['Low oil level', 'Wrong viscosity', 'Oil pressure sensor', 'Worn oil pump']],
  P0562: ['System voltage low', 2, ['Weak battery', 'Failing alternator', 'Loose/corroded battery cables', 'Bad ground']],
  P0563: ['System voltage high', 2, ['Alternator voltage regulator', 'Wiring']],
  P0571: ['Brake switch A circuit', 1, ['Brake light switch', 'Wiring']],
  P0600: ['Serial communication link malfunction', 2, ['ECM', 'Wiring', 'Low voltage']],
  P0601: ['ECM internal memory checksum error', 3, ['Engine computer (ECM) failure or bad flash']],
  P0606: ['ECM/PCM processor fault', 3, ['ECM/PCM', 'Low voltage', 'Bad ground']],
  P0700: ['Transmission control system malfunction', 2, ['Transmission control module has its own code – scan the TCM', 'Low/old fluid', 'Solenoid']],
  P0705: ['Transmission range sensor circuit (PRNDL)', 2, ['Range/neutral safety switch', 'Shift cable adjustment', 'Wiring']],
  P0715: ['Input/turbine speed sensor circuit', 2, ['Input speed sensor', 'Wiring', 'Low fluid']],
  P0720: ['Output speed sensor circuit', 2, ['Output speed sensor', 'Wiring']],
  P0730: ['Incorrect gear ratio', 3, ['Low/burnt fluid', 'Slipping clutches', 'Shift solenoid', 'Valve body']],
  P0740: ['Torque converter clutch circuit', 2, ['TCC solenoid', 'Low fluid', 'Wiring']],
  P0741: ['Torque converter clutch stuck off / performance', 2, ['TCC solenoid', 'Worn torque converter', 'Old fluid']],
  P0750: ['Shift solenoid A malfunction', 2, ['Shift solenoid A', 'Wiring', 'Low fluid']],
  P0755: ['Shift solenoid B malfunction', 2, ['Shift solenoid B', 'Wiring']],
  P0760: ['Shift solenoid C malfunction', 2, ['Shift solenoid C', 'Wiring']],
  P0841: ['Transmission fluid pressure sensor/switch A range', 2, ['Pressure switch', 'Low fluid', 'Valve body']],
  P0868: ['Transmission fluid pressure low', 3, ['Low fluid', 'Clogged filter', 'Pump wear']],
  P2096: ['Post-catalyst fuel trim too lean (Bank 1)', 1, ['Exhaust leak', 'Downstream O2 sensor', 'Vacuum leak']],
  P2097: ['Post-catalyst fuel trim too rich (Bank 1)', 1, ['Catalytic converter', 'O2 sensor', 'Rich running']],
  P2101: ['Throttle actuator control motor circuit range', 3, ['Electronic throttle body', 'Wiring', 'Dirty throttle body']],
  P2111: ['Throttle actuator stuck open', 3, ['Electronic throttle body', 'Carbon build-up']],
  P2135: ['Throttle/pedal position sensor A/B voltage correlation', 3, ['Throttle body', 'Accelerator pedal sensor', 'Wiring']],
  P2187: ['System too lean at idle (Bank 1)', 2, ['Vacuum leak', 'PCV valve/hose', 'Intake gasket', 'Fuel pressure']],
  P2195: ['O2 sensor signal stuck lean (Bank 1 Sensor 1)', 1, ['O2/air-fuel sensor', 'Vacuum leak', 'Exhaust leak']],
  P2196: ['O2 sensor signal stuck rich (Bank 1 Sensor 1)', 1, ['O2/air-fuel sensor', 'Leaking injector']],
  P2270: ['O2 sensor signal stuck lean (Bank 1 Sensor 2)', 1, ['Downstream O2 sensor', 'Exhaust leak']],
  P2610: ['ECM/PCM internal engine-off timer performance', 1, ['ECM software – check for updates', 'Battery voltage']],
  P0A80: ['Replace hybrid battery pack', 3, ['Weak hybrid battery modules', 'Battery cooling fan clogged']],
  U0100: ['Lost communication with ECM/PCM', 3, ['Low battery voltage', 'CAN wiring/connector', 'ECM power/ground', 'Failed ECM']],
  U0101: ['Lost communication with TCM', 3, ['TCM power/ground', 'CAN wiring', 'TCM']],
  U0121: ['Lost communication with ABS module', 2, ['ABS module', 'CAN wiring', 'Fuse']],
  U0140: ['Lost communication with body control module', 2, ['BCM', 'CAN wiring', 'Low voltage']],
  U0155: ['Lost communication with instrument cluster', 2, ['Cluster', 'CAN wiring', 'Fuse']],
  C0035: ['Left front wheel speed sensor circuit', 2, ['Wheel speed sensor', 'Damaged wire near wheel', 'Tone ring']],
  C0040: ['Right front wheel speed sensor circuit', 2, ['Wheel speed sensor', 'Wiring', 'Tone ring']],
  C0045: ['Left rear wheel speed sensor circuit', 2, ['Wheel speed sensor', 'Wiring', 'Tone ring']],
  C0050: ['Right rear wheel speed sensor circuit', 2, ['Wheel speed sensor', 'Wiring', 'Tone ring']],
  C0265: ['ABS motor relay circuit', 2, ['ABS module/relay', 'Fuse', 'Wiring']],
  B0001: ['Driver frontal airbag stage 1 deployment control', 3, ['Clock spring', 'Airbag module', 'Connector – have a pro inspect (airbag safety)']],
  B0100: ['Driver frontal airbag circuit', 3, ['Clock spring', 'Connector', 'Airbag module']],
};

// Families resolved by pattern
function patternLookup(code) {
  let m;
  if ((m = code.match(/^P030([1-9])$/)) || (m = code.match(/^P031([0-2])$/))) {
    const cyl = code.startsWith('P031') ? 10 + Number(m[1]) : Number(m[1]);
    return [`Cylinder ${cyl} misfire detected`, 3, [`Spark plug cyl ${cyl}`, `Ignition coil cyl ${cyl} (swap with another cylinder to test)`, `Fuel injector cyl ${cyl}`, 'Vacuum leak near that cylinder', 'Low compression (valve / head gasket)']];
  }
  if ((m = code.match(/^P035([1-9])$/)) || (m = code.match(/^P036([0-2])$/))) {
    const coil = 'ABCDEFGHIJKL'[(code.startsWith('P036') ? 9 : 0) + Number(m[1]) - 1];
    return [`Ignition coil ${coil} primary/secondary circuit`, 2, [`Ignition coil ${coil}`, 'Coil connector/wiring', 'Spark plug']];
  }
  if ((m = code.match(/^P020([1-9])$/)) || (m = code.match(/^P021([0-2])$/))) {
    const cyl = code.startsWith('P021') ? 10 + Number(m[1]) : Number(m[1]);
    return [`Injector circuit – cylinder ${cyl}`, 2, [`Fuel injector cyl ${cyl}`, 'Injector connector/wiring', 'ECM injector driver']];
  }
  if (/^P01(3[0-9]|4[0-7]|5[0-9]|6[0-7])$/.test(code)) {
    const n = Number(code.slice(2));
    const bank = n < 150 ? 1 : 2;
    const sensor = Math.floor((n - (bank === 1 ? 130 : 150)) / 6) + 1;
    return [`Oxygen sensor circuit (Bank ${bank} Sensor ${sensor})`, 1, ['Oxygen sensor', 'Heater fuse', 'Wiring', 'Exhaust leak']];
  }
  return null;
}

export const CODE_RE = /\b([PBCU][0-3][0-9A-F]{3})\b/gi;

export function extractCodes(text) {
  const out = new Set();
  for (const m of String(text).toUpperCase().matchAll(CODE_RE)) out.add(m[1]);
  return [...out];
}

export function lookupCode(raw) {
  const code = String(raw).trim().toUpperCase();
  if (!/^[PBCU][0-3][0-9A-F]{3}$/.test(code)) return null;
  const hit = CODES[code] || patternLookup(code);
  const generic = code[1] === '0' || code[1] === '2' || (code[1] === '3' && code[0] === 'P' && code[2] >= '4');
  const info = {
    code,
    system: SYSTEMS[code[0]],
    generic,
    subsystem: code[0] === 'P' ? SUBSYSTEMS[code[2]] || '' : '',
    known: !!hit,
  };
  if (hit) {
    info.description = hit[0];
    info.severity = hit[1];
    info.causes = hit[2];
  } else {
    info.description = generic
      ? `Generic ${SYSTEMS[code[0]].toLowerCase()} code${info.subsystem ? ' – ' + info.subsystem.toLowerCase() : ''}`
      : `Manufacturer-specific ${SYSTEMS[code[0]].toLowerCase()} code – meaning depends on the brand`;
    info.severity = code[0] === 'U' ? 2 : 2;
    info.causes = [];
  }
  return info;
}

export const SEVERITY_LABEL = { 1: 'Low – fix soon', 2: 'Medium – fix promptly', 3: 'High – stop driving / fix now' };
