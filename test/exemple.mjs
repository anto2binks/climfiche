// Génère exemple/fiche-exemple.pdf avec des données fictives.
// Usage : npm i --no-save pdf-lib@1.17.1 && node test/exemple.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import * as PDFLib from 'pdf-lib';
import { remplirCerfa, calcTeq, signatureDetenteurObligatoire } from '../js/cerfa.js';

const racine = new URL('..', import.meta.url);
const lire = (p) => readFileSync(new URL(p, racine));

const cas = {
  ficheNo: '2026-0042',
  raisonSociale: 'Clim Services Provence SARL\n12 avenue du Mistral, 13100 Aix-en-Provence',
  siret: '123 456 789 00012',
  attestation: 'AC-13-2024-0815',
  technicien: 'Julien Martin',
  detenteur: 'Boulangerie Dupont',
  adresse: '5 rue des Lilas\n13090 Aix-en-Provence',
  reference: 'Daikin RZAG100NV1',
  serie: 'E004512',
  fluide: 'R-410A',
  charge: 4.2,
  nature: 'maintenance',
  detection: false,
  qteChargee: 0.8,
  qteRecyclee: 0.3,
  qteRecuperee: 0.5,
  fuite: true,
  fuiteLocalisation: 'Raccord flare liaison gaz, unité intérieure',
  fuiteReparation: 'realisee',
  observations: 'Resserrage du raccord et contrôle à la mousse : pas de nouvelle fuite.',
  date: '11/11/2026',
  signatureTechnicien: lire('test/signature-technicien.png'),
  signatureClient: lire('test/signature-client.png'),
  signataireClient: 'Marie Dupont',
  qualiteClient: 'Gérante',
};

console.log('t éq. CO2 :', calcTeq(cas.fluide, cas.charge).toFixed(2),
  '— signature détenteur obligatoire :', signatureDetenteurObligatoire(cas.fluide, cas.charge));
const octets = await remplirCerfa(PDFLib, lire('cerfa-15497-04.pdf'), cas);
writeFileSync(new URL('exemple/fiche-exemple.pdf', racine), octets);
console.log('OK → exemple/fiche-exemple.pdf');
