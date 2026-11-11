// Génère exemple/fiche-exemple.pdf avec des données fictives.
// Usage : npm i --no-save pdf-lib@1.17.1 && node test/exemple.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import * as PDFLib from 'pdf-lib';
import { remplirCerfa, calcTeq, signatureDetenteurObligatoire } from '../js/cerfa.js';

const racine = new URL('..', import.meta.url);
const lire = (p) => readFileSync(new URL(p, racine));

const cas = {
  ficheNo: '2026-0042',
  raisonSociale: 'Clim Services Provence SARL',
  adresseOperateur: '12 avenue du Mistral\n13100 Aix-en-Provence',
  siret: '123 456 789 00012',
  attestation: 'AC-13-2024-0815',
  technicien: 'Julien Martin',
  qualiteTechnicien: 'Technicien frigoriste',
  detenteur: 'Boulangerie Dupont',
  adresse: '5 rue des Lilas\n13090 Aix-en-Provence',
  reference: 'Daikin RZAG100NV1',
  serie: 'E004512',
  fluide: 'R-410A',
  charge: 4.2,
  natures: ['controle', 'mise_en_service', 'modification'],
  controlePeriodique: true,
  detection: false,
  dateControle: '2026-11-10',
  detecteurId: 'Testo 316-3 n° 61234567',
  qteChargee: 0.8,
  qteRecyclee: 0.3,
  qteRecuperee: 0.5,
  fuite: true,
  fuites: [
    { localisation: 'Raccord flare liaison gaz, unité intérieure', reparation: 'realisee' },
    { localisation: 'Vanne de service ligne liquide', reparation: 'realisee' },
    { localisation: 'Brasure du détendeur, unité extérieure', reparation: 'afaire' },
  ],
  observations: 'Resserrage des raccords et contrôle à la mousse. Brasure du détendeur à reprendre.',
  date: '11/11/2026',
  signatureTechnicien: JSON.parse(lire('test/signature-technicien.json')),
  signatureClient: JSON.parse(lire('test/signature-client.json')),
  signataireClient: 'Marie Dupont',
  qualiteClient: 'Gérante',
};

console.log('t éq. CO2 :', calcTeq(cas.fluide, cas.charge).toFixed(2),
  '— signature détenteur obligatoire :', signatureDetenteurObligatoire(cas.fluide, cas.charge));
const octets = await remplirCerfa(PDFLib, lire('cerfa-15497-04.pdf'), cas);
writeFileSync(new URL('exemple/fiche-exemple.pdf', racine), octets);
console.log('OK → exemple/fiche-exemple.pdf');

// Sous les seuils (R-32, 1,2 kg = 0,81 t éq. CO2) : aucune case en [7], puis réglage activé.
const petit = { ...cas, fluide: 'R-32', charge: 1.2, natures: ['controle'], fuite: false, fuites: [] };
for (const premiereCase7 of [false, true]) {
  const o = await remplirCerfa(PDFLib, lire('cerfa-15497-04.pdf'), { ...petit, premiereCase7 });
  const nom = `exemple/sous-seuil-${premiereCase7 ? 'reglage-active' : 'defaut'}.pdf`;
  if (process.env.SOUS_SEUIL) { writeFileSync(new URL(nom, racine), o); console.log('OK →', nom); }
}
