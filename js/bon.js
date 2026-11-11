// FrigoFiche — bon d'intervention : listes de choix, calculs, numérotation et clients enregistrés.
import { lireDurable, ecrireDurable } from './stockage.js';

export const TYPES_EQUIPEMENT = [
  'Split mural', 'Multi-split', 'Cassette', 'Gainable', 'Console',
  'Pompe à chaleur air/eau', 'Pompe à chaleur air/air', 'Chambre froide', 'Groupe froid', 'Autre',
];
export const NATURES_BON = {
  depannage: 'Dépannage',
  entretien: 'Entretien',
  installation: 'Installation',
  remplacement: 'Remplacement de pièce',
  mise_en_route: 'Mise en route',
  autre: 'Autre',
};
export const MARQUES = [
  'Daikin', 'Mitsubishi Electric', 'Atlantic', 'Toshiba', 'Panasonic', 'LG', 'Samsung', 'Hitachi',
  'Fujitsu', 'Carrier', 'Airwell', 'Gree', 'Midea', 'Hisense', 'De Dietrich', 'Viessmann', 'Bosch',
];

// ---------- Temps ----------
/** "08:30" → 510 (minutes), ou NaN */
export const minutesDe = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
/** Durée entre arrivée et départ, en minutes (passage de minuit pris en compte). */
export function dureeEntre(arrivee, depart) {
  const a = minutesDe(arrivee), d = minutesDe(depart);
  if (Number.isNaN(a) || Number.isNaN(d)) return NaN;
  return (d - a + 1440) % 1440;
}
/** 165 → "2 h 45" ; 45 → "45 min" */
export function texteDuree(min) {
  if (!(min >= 0)) return '';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

// ---------- Montants ----------
export function euros(n) {
  if (!(typeof n === 'number' && Number.isFinite(n))) return '';
  const [e, c] = Math.abs(n).toFixed(2).split('.');
  const groupes = e.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '-' : ''}${groupes},${c} €`;
}

// ---------- Numérotation BI-AAAA-NNNN (propre à l'appareil) ----------
const CLE_COMPTEUR = 'frigofiche.bon.compteur';
export async function prochainNumeroBon(date = new Date()) {
  const annee = date.getFullYear();
  const c = await lireDurable(CLE_COMPTEUR);
  const n = c && c.annee === annee ? c.n + 1 : 1;
  return `BI-${annee}-${String(n).padStart(4, '0')}`;
}
/** Enregistre le numéro utilisé : le suivant sera n + 1 (jamais de retour en arrière). */
export async function memoriserNumeroBon(numero) {
  const m = /^BI-(\d{4})-(\d+)$/.exec(numero || '');
  if (!m) return;
  const annee = Number(m[1]), n = Number(m[2]);
  const c = await lireDurable(CLE_COMPTEUR);
  if (c && c.annee === annee && c.n >= n) return;
  await ecrireDurable(CLE_COMPTEUR, { annee, n });
}

// ---------- Clients enregistrés ----------
const CLE_CLIENTS = 'frigofiche.clients';
const cleClient = (nom) => (nom || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export async function lireClients() {
  const l = await lireDurable(CLE_CLIENTS);
  return Array.isArray(l) ? l : [];
}
/** Ajoute ou met à jour un client (même nom = même client). Les plus récents en premier. */
export async function enregistrerClient(c) {
  if (!c?.nom?.trim()) return;
  const liste = (await lireClients()).filter((x) => cleClient(x.nom) !== cleClient(c.nom));
  liste.unshift({ nom: c.nom.trim(), adresse: (c.adresse || '').trim(), contact: (c.contact || '').trim(), utiliseLe: new Date().toISOString() });
  await ecrireDurable(CLE_CLIENTS, liste.slice(0, 300));
}
export async function supprimerClient(nom) {
  const liste = (await lireClients()).filter((x) => cleClient(x.nom) !== cleClient(nom));
  await ecrireDurable(CLE_CLIENTS, liste);
}
/** Clients dont le nom (ou l'adresse) contient la saisie, sans tenir compte des accents. */
export function filtrerClients(liste, saisie, max = 5) {
  const q = cleClient(saisie);
  if (!q) return liste.slice(0, max);
  return liste.filter((c) => cleClient(c.nom).includes(q) || cleClient(c.adresse).includes(q)).slice(0, max);
}
