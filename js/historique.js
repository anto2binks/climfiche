// FrigoFiche — historique « Mes fiches » : chaque PDF généré (Cerfa ou bon) est gardé sur le téléphone.
// Base IndexedDB séparée : « fiches » (infos pour la liste) et « pdfs » (le fichier lui-même, lu à la demande).
// Rien n'est envoyé à un serveur. Les mises à jour de l'appli n'y touchent pas.

const BASE = 'frigofiche-historique';
const FICHES = 'fiches';
const PDFS = 'pdfs';

function ouvrir() {
  return new Promise((ok, ko) => {
    if (!('indexedDB' in globalThis)) return ko(new Error('Historique indisponible dans ce navigateur'));
    const req = indexedDB.open(BASE, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FICHES)) db.createObjectStore(FICHES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PDFS)) db.createObjectStore(PDFS);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
}

async function transaction(magasins, mode, action) {
  const db = await ouvrir();
  try {
    return await new Promise((ok, ko) => {
      const tx = db.transaction(magasins, mode);
      let requete = null;
      Promise.resolve(action(tx, (r) => { requete = r; })).catch(ko);
      tx.oncomplete = () => ok(requete ? requete.result : undefined);
      tx.onerror = () => ko(tx.error);
      tx.onabort = () => ko(tx.error || new Error('Enregistrement annulé (mémoire pleine ?)'));
    });
  } finally { db.close(); }
}

export const nouvelId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Ajoute (ou remplace, même id) une fiche dans l'historique.
 * @param {{id, type:'cerfa'|'bon', numero, client, adresse, detail, date, nomFichier}} infos
 * @param {Uint8Array|ArrayBuffer} octets le PDF
 */
export async function ajouterFiche(infos, octets) {
  const tampon = octets instanceof ArrayBuffer ? octets : octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength);
  const fiche = { ...infos, taille: tampon.byteLength, creeLe: new Date().toISOString() };
  await transaction([FICHES, PDFS], 'readwrite', (tx) => {
    tx.objectStore(FICHES).put(fiche);
    tx.objectStore(PDFS).put(tampon, fiche.id);
  });
  return fiche;
}

/** Toutes les fiches (sans les PDF), les plus récentes en premier. */
export async function listerFiches() {
  const liste = await transaction(FICHES, 'readonly', (tx, res) => res(tx.objectStore(FICHES).getAll()));
  return (liste || []).sort((a, b) => (b.creeLe || '').localeCompare(a.creeLe || ''));
}

/** Le PDF d'une fiche, sous forme de File prêt à partager. */
export async function lirePdf(fiche) {
  const tampon = await transaction(PDFS, 'readonly', (tx, res) => res(tx.objectStore(PDFS).get(fiche.id)));
  if (!tampon) throw new Error('PDF introuvable sur ce téléphone');
  return new File([tampon], fiche.nomFichier || 'fiche.pdf', { type: 'application/pdf' });
}

export async function supprimerFiche(id) {
  await transaction([FICHES, PDFS], 'readwrite', (tx) => {
    tx.objectStore(FICHES).delete(id);
    tx.objectStore(PDFS).delete(id);
  });
}

const sansAccents = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Filtre par type ('tout', 'cerfa', 'bon') et par texte (client, numéro, adresse, détail, date). */
export function filtrerFiches(liste, type, saisie) {
  const q = sansAccents(saisie).trim();
  return liste.filter((f) => (type === 'tout' || f.type === type)
    && (!q || [f.client, f.numero, f.adresse, f.detail, f.date].some((x) => sansAccents(x).includes(q))));
}

/** 1 234 567 → « 1,2 Mo » */
export function texteTaille(octets) {
  if (!(octets > 0)) return '0 Ko';
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}
