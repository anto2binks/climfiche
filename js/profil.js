// FrigoFiche — profil du technicien, stocké uniquement sur l'appareil.
// Enregistrement : localStorage (principal) + IndexedDB (copie de secours).
// Aucune donnée n'est envoyée à un serveur.

const CLE = 'frigofiche.profil';
const BASE = 'frigofiche';
const MAGASIN = 'donnees';
export const VERSION_PROFIL = 1;
export const QUALITE_DEFAUT = 'Technicien frigoriste';

// ---------- IndexedDB (secours) ----------
function ouvrirBase() {
  return new Promise((ok, ko) => {
    if (!('indexedDB' in globalThis)) return ko(new Error('IndexedDB indisponible'));
    const req = indexedDB.open(BASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(MAGASIN);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
  });
}
async function idb(mode, action) {
  const db = await ouvrirBase();
  try {
    return await new Promise((ok, ko) => {
      const tx = db.transaction(MAGASIN, mode);
      const req = action(tx.objectStore(MAGASIN));
      tx.oncomplete = () => ok(req?.result);
      tx.onerror = () => ko(tx.error);
    });
  } finally { db.close(); }
}

// ---------- Profil ----------
/** Complète un profil lu (ancienne version, import…) sans jamais perdre de donnée. */
export function normaliser(p) {
  if (!p || typeof p !== 'object') return null;
  const t = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    ...p, // conserve d'éventuels champs ajoutés par une version future
    version: VERSION_PROFIL,
    raisonSociale: t(p.raisonSociale),
    adresse: t(p.adresse),
    siret: t(p.siret),
    attestation: t(p.attestation),
    nom: t(p.nom),
    prenom: t(p.prenom),
    qualite: t(p.qualite) || QUALITE_DEFAUT,
    email: t(p.email),
    detecteurId: t(p.detecteurId),
    reglages: { premiereCase7: !!p.reglages?.premiereCase7 },
    verrou: p.verrou && p.verrou.empreinte ? p.verrou : null,
  };
}

export async function chargerProfil() {
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) return normaliser(JSON.parse(brut));
  } catch { /* on tente la copie de secours */ }
  try {
    const p = await idb('readonly', (s) => s.get(CLE));
    if (p) {
      try { localStorage.setItem(CLE, JSON.stringify(p)); } catch { /* ignoré */ }
      return normaliser(p);
    }
  } catch { /* aucune copie */ }
  return null;
}

export async function enregistrerProfil(p) {
  const profil = { ...normaliser(p), modifieLe: new Date().toISOString() };
  let ok = false;
  try { localStorage.setItem(CLE, JSON.stringify(profil)); ok = true; } catch { /* stockage plein ou bloqué */ }
  try { await idb('readwrite', (s) => s.put(profil, CLE)); ok = true; } catch { /* ignoré */ }
  if (!ok) throw new Error("Impossible d'enregistrer sur cet appareil (navigation privée ?)");
  return profil;
}

export async function effacerProfil() {
  try { localStorage.removeItem(CLE); } catch { /* ignoré */ }
  try { await idb('readwrite', (s) => s.delete(CLE)); } catch { /* ignoré */ }
}

/** Demande au navigateur de ne pas effacer les données de l'appli en cas de manque de place. */
export async function demanderStockagePersistant() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}

// ---------- Vérifications ----------
export const chiffres = (s) => String(s || '').replace(/\s/g, '');
export const siretValide = (s) => /^\d{14}$/.test(chiffres(s));
export const emailValide = (s) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const nomComplet = (p) => [p.prenom, p.nom].filter(Boolean).join(' ');

// ---------- Code de verrouillage : seule une empreinte est stockée ----------
const ITERATIONS = 150000;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const deHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

export const codeDisponible = () => !!globalThis.crypto?.subtle;

async function deriver(code, sel, iterations) {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations }, cle, 256);
  return hex(bits);
}

/** Calcule l'empreinte d'un code à 4 chiffres (PBKDF2-SHA-256 salé). Le code n'est jamais stocké. */
export async function creerVerrou(code) {
  if (!/^\d{4}$/.test(code)) throw new Error('Le code doit comporter 4 chiffres.');
  const sel = crypto.getRandomValues(new Uint8Array(16));
  return { algo: 'PBKDF2-SHA-256', iterations: ITERATIONS, sel: hex(sel), empreinte: await deriver(code, sel, ITERATIONS) };
}

export async function verifierCode(code, verrou) {
  if (!verrou) return true;
  const calc = await deriver(code, deHex(verrou.sel), verrou.iterations || ITERATIONS);
  // comparaison à temps constant
  let diff = calc.length ^ verrou.empreinte.length;
  for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ (verrou.empreinte.charCodeAt(i) || 0);
  return diff === 0;
}

// ---------- Export / import ----------
/** Fichier de sauvegarde (le code de verrouillage n'est pas exporté). */
export function fichierExport(p) {
  const { verrou, modifieLe, ...donnees } = normaliser(p);
  const contenu = {
    application: 'FrigoFiche',
    type: 'profil',
    version: VERSION_PROFIL,
    exporteLe: new Date().toISOString(),
    profil: donnees,
  };
  const date = new Date().toISOString().slice(0, 10);
  return new File([JSON.stringify(contenu, null, 2)], `frigofiche-profil-${date}.json`, { type: 'application/json' });
}

/** Lit un fichier de sauvegarde ; renvoie le profil ou lève une erreur explicite. */
export function lireImport(texte) {
  let j;
  try { j = JSON.parse(texte); } catch { throw new Error("Ce fichier n'est pas une sauvegarde FrigoFiche."); }
  if (j?.application !== 'FrigoFiche' || j?.type !== 'profil' || !j.profil) {
    throw new Error("Ce fichier n'est pas une sauvegarde de profil FrigoFiche.");
  }
  const p = normaliser({ ...j.profil, verrou: null });
  if (!p.raisonSociale || !siretValide(p.siret)) throw new Error('Sauvegarde incomplète ou SIRET invalide.');
  return p;
}
