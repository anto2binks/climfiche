// MesHeures — calculs purs (aucun accès à l'écran ni au stockage), testables avec Node.
// Toutes les durées sont en minutes entières.

export const SEUIL_35 = 35 * 60; // au-delà : heures supplémentaires à 25 %
export const SEUIL_43 = 43 * 60; // au-delà : heures supplémentaires à 50 %

/** "08:30" -> 510 ; null si vide ou invalide. */
export function enMinutes(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Durée travaillée d'une journée.
 * Une fin plus tôt que le début = fin le lendemain (travail de nuit).
 * La pause (en minutes) est retirée. Renvoie 0 si la journée est incomplète.
 */
export function dureeJour(jour) {
  if (!jour) return 0;
  const d = enMinutes(jour.debut);
  const f = enMinutes(jour.fin);
  if (d === null || f === null) return 0;
  let duree = f - d;
  if (duree <= 0) duree += 24 * 60;
  duree -= Math.max(0, Number(jour.pause) || 0);
  return Math.max(0, duree);
}

/** Répartit le total d'une semaine : normales (≤ 35 h), 25 % (36e à 43e h), 50 % (au-delà de 43 h). */
export function repartition(totalMinutes) {
  const t = Math.max(0, totalMinutes);
  return {
    total: t,
    normales: Math.min(t, SEUIL_35),
    hs25: Math.min(Math.max(t - SEUIL_35, 0), SEUIL_43 - SEUIL_35),
    hs50: Math.max(t - SEUIL_43, 0),
  };
}

/** Rémunération brute estimée d'une répartition, pour un taux horaire brut. */
export function paie(rep, taux) {
  const t = Number(taux) || 0;
  const normales = (rep.normales / 60) * t;
  const maj25 = (rep.hs25 / 60) * t * 1.25;
  const maj50 = (rep.hs50 / 60) * t * 1.5;
  return { normales, maj25, maj50, total: normales + maj25 + maj50 };
}

// ---------- Dates (en heure locale, format "AAAA-MM-JJ") ----------

export function versISO(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function depuisISO(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j, 12); // midi : évite les surprises du changement d'heure
}

export function ajouterJours(iso, n) {
  const d = depuisISO(iso);
  d.setDate(d.getDate() + n);
  return versISO(d);
}

/** Lundi de la semaine qui contient cette date. */
export function lundiDe(iso) {
  const d = depuisISO(iso);
  const decalage = (d.getDay() + 6) % 7; // lundi = 0 … dimanche = 6
  d.setDate(d.getDate() - decalage);
  return versISO(d);
}

/** Les 7 dates (lundi → dimanche) de la semaine qui commence au lundi donné. */
export function joursSemaine(lundi) {
  return Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
}

/** Tout le calcul d'une semaine. `jours` = { "AAAA-MM-JJ": { debut, fin, pause } }. */
export function calculSemaine(jours, lundi, taux) {
  const detail = joursSemaine(lundi).map((date) => ({ date, saisie: jours[date] || null, minutes: dureeJour(jours[date]) }));
  const rep = repartition(detail.reduce((s, j) => s + j.minutes, 0));
  return { lundi, dimanche: ajouterJours(lundi, 6), detail, ...rep, paie: paie(rep, taux) };
}

/**
 * Tout le calcul d'un mois (mois de 1 à 12).
 * Les heures supplémentaires se comptent à la semaine (lundi → dimanche).
 * Une semaine à cheval sur deux mois est rattachée au mois où elle se termine (son dimanche),
 * comme sur la plupart des fiches de paie : elle n'est jamais comptée deux fois.
 */
export function calculMois(jours, annee, mois, taux) {
  const premier = versISO(new Date(annee, mois - 1, 1, 12));
  const dernier = versISO(new Date(annee, mois, 0, 12));

  // Semaines dont le dimanche tombe dans le mois.
  const semaines = [];
  let lundi = lundiDe(premier);
  if (ajouterJours(lundi, 6) < premier) lundi = ajouterJours(lundi, 7);
  while (ajouterJours(lundi, 6) <= dernier) {
    semaines.push(calculSemaine(jours, lundi, taux));
    lundi = ajouterJours(lundi, 7);
  }

  const somme = (cle) => semaines.reduce((s, w) => s + w[cle], 0);
  const rep = { total: somme('total'), normales: somme('normales'), hs25: somme('hs25'), hs50: somme('hs50') };

  // Heures réellement travaillées du 1er au dernier jour du mois (vue calendrier).
  let calendaire = 0;
  let joursTravailles = 0;
  for (let d = premier; d <= dernier; d = ajouterJours(d, 1)) {
    const m = dureeJour(jours[d]);
    calendaire += m;
    if (m > 0) joursTravailles += 1;
  }

  return {
    annee, mois, premier, dernier, semaines, calendaire, joursTravailles,
    ...rep, paie: paie(rep, taux),
    periode: semaines.length ? { du: semaines[0].lundi, au: semaines[semaines.length - 1].dimanche } : null,
  };
}

// ---------- Affichage ----------

/** 450 -> "7 h 30" ; 0 -> "0 h". */
export function formatDuree(min) {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

/** 450 -> "7,50" (heures décimales, comme sur une fiche de paie). */
export function formatDecimal(min) {
  return (min / 60).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatEuros(v) {
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}
