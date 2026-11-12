import assert from 'node:assert/strict';
import { dureeJour, repartition, paie, calculSemaine, calculMois, lundiDe, formatDuree } from '../js/calcul.js';

assert.equal(dureeJour({ debut: '08:00', fin: '17:00', pause: 60 }), 480);
assert.equal(dureeJour({ debut: '22:00', fin: '06:00', pause: 30 }), 450); // nuit
assert.equal(dureeJour({ debut: '08:00', fin: '' }), 0);

assert.deepEqual(repartition(35 * 60), { total: 2100, normales: 2100, hs25: 0, hs50: 0 });
assert.deepEqual(repartition(40 * 60), { total: 2400, normales: 2100, hs25: 300, hs50: 0 });
assert.deepEqual(repartition(46 * 60), { total: 2760, normales: 2100, hs25: 480, hs50: 180 });

const p = paie(repartition(46 * 60), 12);
assert.equal(Math.round(p.total * 100) / 100, 35 * 12 + 8 * 15 + 3 * 18); // 420 + 120 + 54

assert.equal(lundiDe('2026-11-12'), '2026-11-09');
assert.equal(lundiDe('2026-11-15'), '2026-11-09');
assert.equal(lundiDe('2026-11-16'), '2026-11-16');

// Semaine de 5 × 9 h = 45 h -> 35 + 8 + 2
const jours = {};
for (const d of ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']) jours[d] = { debut: '07:00', fin: '17:00', pause: 60 };
const s = calculSemaine(jours, '2026-11-09', 12);
assert.equal(s.total, 45 * 60); assert.equal(s.hs25, 8 * 60); assert.equal(s.hs50, 2 * 60);

// Novembre 2026 : 1er = dimanche -> semaines finissant les 1, 8, 15, 22, 29 nov.
const m = calculMois(jours, 2026, 11, 12);
assert.equal(m.semaines.length, 5);
assert.equal(m.semaines[0].lundi, '2026-10-26');
assert.equal(m.hs25, 480); assert.equal(m.hs50, 120); assert.equal(m.calendaire, 45 * 60);
// Octobre 2026 : la semaine du 26 oct. n'y est pas (elle finit le 1er nov.)
assert.equal(calculMois(jours, 2026, 10, 12).semaines.at(-1).dimanche, '2026-10-25');

assert.equal(formatDuree(450), '7 h 30');
console.log('Tous les tests passent ✔');
