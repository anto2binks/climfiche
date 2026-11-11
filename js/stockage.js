// FrigoFiche — stockage durable sur l'appareil : localStorage (principal) + IndexedDB (copie de secours).
// Rien n'est envoyé à un serveur. Les mises à jour de l'appli (service worker) ne touchent jamais ces données.

const BASE = 'frigofiche';
const MAGASIN = 'donnees';

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

/** Lit une valeur : localStorage d'abord, sinon la copie IndexedDB (recopiée dans localStorage). */
export async function lireDurable(cle) {
  try {
    const brut = localStorage.getItem(cle);
    if (brut) return JSON.parse(brut);
  } catch { /* on tente la copie de secours */ }
  try {
    const v = await idb('readonly', (s) => s.get(cle));
    if (v !== undefined && v !== null) {
      try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* ignoré */ }
      return v;
    }
  } catch { /* aucune copie */ }
  return null;
}

/** Écrit une valeur aux deux endroits ; échoue seulement si aucun des deux n'a fonctionné. */
export async function ecrireDurable(cle, valeur) {
  let ok = false;
  try { localStorage.setItem(cle, JSON.stringify(valeur)); ok = true; } catch { /* plein ou bloqué */ }
  try { await idb('readwrite', (s) => s.put(valeur, cle)); ok = true; } catch { /* ignoré */ }
  if (!ok) throw new Error("Impossible d'enregistrer sur cet appareil (navigation privée ?)");
  return valeur;
}

export async function effacerDurable(cle) {
  try { localStorage.removeItem(cle); } catch { /* ignoré */ }
  try { await idb('readwrite', (s) => s.delete(cle)); } catch { /* ignoré */ }
}
