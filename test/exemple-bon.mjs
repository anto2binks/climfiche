// Génère exemple/bon-exemple.pdf : description longue, 3 pièces, 2 photos, logo.
// Usage : npm install && node test/exemple-bon.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import * as PDFLib from 'pdf-lib';
import { genererBon } from '../js/bon-pdf.js';

const racine = new URL('..', import.meta.url);
const lire = (p) => readFileSync(new URL(p, racine));

const description = `Intervention suite à l'appel du client : la climatisation de la salle de réunion ne refroidit plus depuis lundi, avec un message d'erreur E7 sur la télécommande.

Constat à l'arrivée : unité intérieure en fonctionnement, ventilateur de l'unité extérieure à l'arrêt. Code défaut E7 confirmé (défaut moteur du ventilateur extérieur). Pressions relevées à l'arrêt : 14,2 bar, cohérentes avec la température extérieure de 18 °C.

Travaux réalisés :
- Mise hors tension et consignation de l'installation.
- Contrôle du moteur de ventilateur extérieur : bobinage coupé, roulements bruyants. Remplacement du moteur et de son condensateur de démarrage.
- Nettoyage complet de la batterie de l'unité extérieure (encrassement important par les feuilles et le pollen) et du bac à condensats.
- Remplacement du filtre de l'unité intérieure, nettoyage de la turbine et désinfection de l'évaporateur.
- Contrôle du serrage des raccords frigorifiques et test d'étanchéité au détecteur électronique : aucune fuite détectée.
- Remise en service et essais pendant 45 minutes : température de soufflage 11 °C pour une reprise à 24 °C, intensité absorbée normale (6,8 A), plus de code défaut.

Le client a été informé du fonctionnement et des précautions d'usage (nettoyage des filtres tous les mois en période d'utilisation intensive). L'installation est opérationnelle à mon départ.`;

const bon = {
  numero: 'BI-2026-0001',
  date: '11/11/2026',
  societe: {
    raisonSociale: 'Zema Clim',
    adresse: '8 rue des Artisans\n69007 Lyon',
    siret: '39402511800032',
    logo: lire('test/logo.png'),
  },
  technicien: { nom: 'Karim Dahmani', qualite: 'Technicien frigoriste' },
  client: { nom: 'Fitness Park Lyon Gerland', adresse: '60 avenue Tony Garnier\n69007 Lyon', contact: 'M. Laurent (responsable du site)' },
  equipement: { type: 'Split mural', marque: 'Daikin', modele: 'FTXM50R / RXM50R', serie: 'J012345' },
  natures: ['Dépannage', 'Remplacement de pièce', 'Entretien'],
  natureDetail: 'Ventilateur extérieur hors service (code E7)',
  description,
  pieces: [
    { designation: 'Moteur de ventilateur unité extérieure', reference: 'DAI-1C10011', quantite: 1, prixUnitaire: 186.5 },
    { designation: 'Condensateur de démarrage 2,5 µF 450 V', reference: 'CAP-25-450', quantite: 1, prixUnitaire: 14.9 },
    { designation: 'Filtre purificateur photocatalytique', reference: 'KAF970A46', quantite: 2, prixUnitaire: 27.0 },
  ],
  afficherPrix: true,
  temps: { arrivee: '08:30', depart: '11:15', dureeMin: 165 },
  deplacement: '18 km aller-retour',
  observations: "Prévoir le remplacement de la télécommande (écran partiellement illisible). Recommandation : contrat d'entretien semestriel compte tenu de l'encrassement constaté.",
  photos: [lire('test/photo-1.jpg'), lire('test/photo-2.jpg')],
  signatureTechnicien: JSON.parse(lire('test/signature-technicien.json')),
  signatureClient: JSON.parse(lire('test/signature-client.json')),
  signataireClient: 'M. Laurent',
  qualiteClient: 'Responsable du site',
};

writeFileSync(new URL('exemple/bon-exemple.pdf', racine), await genererBon(PDFLib, bon));
console.log('OK → exemple/bon-exemple.pdf');
