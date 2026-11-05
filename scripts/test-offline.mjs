// Quick self-test for the offline analyzer, code lookup and the OBD reply parser.
import assert from 'node:assert/strict';
import { offlineAnalyze } from '../src/kb.js';
import { lookupCode, extractCodes } from '../src/obd.js';
import { parseDtcReply, decodeDtc } from '../src/obdlink.js';

const v = { year: '2012', make: 'Honda', model: 'Civic', trim: 'LX' };

assert.deepEqual(extractCodes('got p0301 and P0420, also p0171'), ['P0301', 'P0420', 'P0171']);
assert.equal(lookupCode('P0304').description, 'Cylinder 4 misfire detected');
assert.equal(lookupCode('P0141').description, 'O2 sensor heater circuit (Bank 1 Sensor 2)');
assert.match(lookupCode('P0157').description, /Bank 2 Sensor 2/);
assert.match(lookupCode('P1456').description, /Manufacturer-specific/);
assert.equal(lookupCode('X1234'), null);

let r = offlineAnalyze('Engine overheating and steam from the hood', v);
assert.equal(r.urgency, 'High');
assert.ok(r.causes[0].name.includes('coolant'));

r = offlineAnalyze('El carro se calienta mucho y bota vapor', v);
assert.ok(r.causes.some((c) => /coolant/i.test(c.name)), 'spanish overheat');

r = offlineAnalyze('my car wont start, just clicking', v);
assert.ok(r.causes[0].name.includes('battery'));

r = offlineAnalyze('P0420 check engine light', v);
assert.equal(r.codes[0].code, 'P0420');

r = offlineAnalyze('black smoke', v); // must not match "hum"
assert.ok(!r.causes.some((c) => /bearing/i.test(c.name)));

// OBD parser
assert.equal(decodeDtc(0x01, 0x33), 'P0133');
assert.equal(decodeDtc(0xC1, 0x00), 'U0100');
assert.equal(decodeDtc(0x41, 0x23), 'C0123');
assert.deepEqual(parseDtcReply('43 02 03 01 04 20', 3, true), ['P0301', 'P0420']);
assert.deepEqual(parseDtcReply('430201330420\n4300', 3, true), ['P0133', 'P0420']);
assert.deepEqual(parseDtcReply('00A\n0:430401330420\n1:03000171000000', 3, true), ['P0133', 'P0420', 'P0300', 'P0171']);
assert.deepEqual(parseDtcReply('43 01 33 00 00 00 00', 3, false), ['P0133']);
assert.deepEqual(parseDtcReply('NO DATA', 3, true), []);
assert.deepEqual(parseDtcReply('SEARCHING...\n4700', 7, true), []);

console.log('All offline tests passed');
