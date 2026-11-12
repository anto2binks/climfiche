// MesHeures — interface. Les données restent sur le téléphone (localStorage).
import {
  dureeJour, enMinutes, calculSemaine, calculMois, lundiDe, ajouterJours, depuisISO, versISO,
  formatDuree, formatDecimal, formatEuros, SEUIL_35, SEUIL_43,
} from './calcul.js';

const CLE = 'mesheures-v1';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ---------- Données ----------
function charger() {
  try {
    const d = JSON.parse(localStorage.getItem(CLE));
    if (d && typeof d === 'object') return { taux: Number(d.taux) || 0, jours: d.jours || {} };
  } catch { /* données illisibles : on repart de zéro */ }
  return { taux: 0, jours: {} };
}
let donnees = charger();
function sauver() {
  try { localStorage.setItem(CLE, JSON.stringify(donnees)); } catch { toast('⚠️ Impossible d\'enregistrer sur ce téléphone'); }
}

// ---------- État de l'écran ----------
const aujourdhui = () => versISO(new Date());
const etat = { onglet: 'jour', jour: aujourdhui(), lundi: lundiDe(aujourdhui()), annee: new Date().getFullYear(), mois: new Date().getMonth() + 1 };

const fmtJourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtJourCourt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtMois = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const maj = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const echap = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let minuteurToast;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---------- Onglets ----------
function allerA(onglet) {
  etat.onglet = onglet;
  $$('.ecran').forEach((e) => { e.hidden = e.dataset.ecran !== onglet; });
  $$('.onglets button').forEach((b) => b.classList.toggle('actif', b.dataset.onglet === onglet));
  afficher();
  window.scrollTo(0, 0);
}
$$('.onglets button').forEach((b) => b.addEventListener('click', () => allerA(b.dataset.onglet)));

function afficher() {
  $('#entete-taux').textContent = donnees.taux ? `${formatEuros(donnees.taux)} / h` : '';
  if (etat.onglet === 'jour') afficherJour();
  if (etat.onglet === 'semaine') afficherSemaine();
  if (etat.onglet === 'mois') afficherMois();
  if (etat.onglet === 'reglages') afficherReglages();
}

// ---------- Jour ----------
function afficherJour() {
  const j = donnees.jours[etat.jour] || {};
  $('#jour-titre').textContent = maj(fmtJourLong.format(depuisISO(etat.jour)));
  $('#jour-date').value = etat.jour;
  $('#btn-aujourdhui').hidden = etat.jour === aujourdhui();
  if (document.activeElement !== $('#debut')) $('#debut').value = j.debut || '';
  if (document.activeElement !== $('#fin')) $('#fin').value = j.fin || '';
  if (document.activeElement !== $('#pause')) $('#pause').value = j.pause ? j.pause : '';
  majResultatJour();
}

function majResultatJour() {
  const j = donnees.jours[etat.jour];
  const m = dureeJour(j);
  $('#jour-total').textContent = formatDuree(m);
  $('#jour-decimal').textContent = `${formatDecimal(m)} h`;
  const d = enMinutes(j?.debut); const f = enMinutes(j?.fin);
  $('#aide-nuit').hidden = !(d !== null && f !== null && f <= d);
  $$('#pastilles-pause button').forEach((b) => b.classList.toggle('actif', Number(b.dataset.pause) === (Number(j?.pause) || 0) && !!(j?.debut || j?.fin)));
  $('#btn-effacer-jour').hidden = !j;

  // Résumé de la semaine en cours
  const s = calculSemaine(donnees.jours, lundiDe(etat.jour), donnees.taux);
  $('#jour-semaine').innerHTML = `
    <div class="petit-titre"><span>Semaine du ${fmtDate.format(depuisISO(s.lundi))}</span><span>${formatDuree(s.total)}</span></div>
    ${jauge(s.total)}
    <p class="aide">${s.hs25 || s.hs50
      ? `Heures sup : <strong>${formatDuree(s.hs25)}</strong> à 25 %${s.hs50 ? `, <strong>${formatDuree(s.hs50)}</strong> à 50 %` : ''}`
      : s.total ? `Encore ${formatDuree(SEUIL_35 - s.total)} avant les heures sup.` : 'Aucune heure cette semaine.'} — voir le détail ›</p>`;
}

function modifierJour(champ, valeur) {
  const j = { ...(donnees.jours[etat.jour] || {}) };
  j[champ] = valeur;
  if (!j.debut && !j.fin && !Number(j.pause)) delete donnees.jours[etat.jour];
  else donnees.jours[etat.jour] = j;
  sauver();
  majResultatJour();
}

$('#debut').addEventListener('input', (e) => modifierJour('debut', e.target.value));
$('#fin').addEventListener('input', (e) => modifierJour('fin', e.target.value));
$('#pause').addEventListener('input', (e) => modifierJour('pause', Math.max(0, parseInt(e.target.value, 10) || 0)));
$$('#pastilles-pause button').forEach((b) => b.addEventListener('click', () => {
  $('#pause').value = b.dataset.pause === '0' ? '' : b.dataset.pause;
  modifierJour('pause', Number(b.dataset.pause));
}));
$$('[data-maintenant]').forEach((b) => b.addEventListener('click', () => {
  const n = new Date();
  const v = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  $(`#${b.dataset.maintenant}`).value = v;
  modifierJour(b.dataset.maintenant, v);
  toast(`${b.dataset.maintenant === 'debut' ? 'Début' : 'Fin'} : ${v}`);
}));
$('#jour-date').addEventListener('change', (e) => { if (e.target.value) { etat.jour = e.target.value; afficherJour(); } });
$('#btn-aujourdhui').addEventListener('click', () => { etat.jour = aujourdhui(); afficherJour(); });
$('#btn-effacer-jour').addEventListener('click', () => {
  if (!confirm('Effacer les horaires de cette journée ?')) return;
  delete donnees.jours[etat.jour]; sauver(); afficherJour();
});
const ouvrirSemaineDuJour = () => { etat.lundi = lundiDe(etat.jour); allerA('semaine'); };
$('#jour-semaine').addEventListener('click', ouvrirSemaineDuJour);
$('#jour-semaine').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrirSemaineDuJour(); } });

// ---------- Navigation ‹ › ----------
$$('[data-nav]').forEach((b) => b.addEventListener('click', () => {
  const pas = Number(b.dataset.pas);
  if (b.dataset.nav === 'jour') { etat.jour = ajouterJours(etat.jour, pas); afficherJour(); }
  if (b.dataset.nav === 'semaine') { etat.lundi = ajouterJours(etat.lundi, 7 * pas); afficherSemaine(); }
  if (b.dataset.nav === 'mois') {
    const d = new Date(etat.annee, etat.mois - 1 + pas, 1);
    etat.annee = d.getFullYear(); etat.mois = d.getMonth() + 1; afficherMois();
  }
}));

// ---------- Blocs communs ----------
function jauge(total) {
  const max = Math.max(total, 48 * 60);
  const n = Math.min(total, SEUIL_35); const a = Math.min(Math.max(total - SEUIL_35, 0), SEUIL_43 - SEUIL_35); const b = Math.max(total - SEUIL_43, 0);
  const pc = (v) => `${(v / max) * 100}%`;
  return `<div class="jauge" aria-hidden="true"><i class="n" style="width:${pc(n)}"></i><i class="a" style="width:${pc(a)}"></i><i class="b" style="width:${pc(b)}"></i></div>
    <div class="jauge-legende"><span style="left:${pc(SEUIL_35)}">35 h</span><span style="left:${pc(SEUIL_43)}">43 h</span></div>`;
}

function alerteTaux() {
  return donnees.taux ? '' : `<div class="alerte-taux">Indique ton <strong>taux horaire</strong> pour voir le salaire et les majorations.
    <button type="button" class="bouton" data-aller="reglages">Saisir mon taux horaire</button></div>`;
}

function bilan(titre, r) {
  const ligne = (cls, libelle, duree, montant, detail = '') => `<div class="r ${cls}"><dt>${libelle}</dt><dd>${duree}</dd>${montant !== null && donnees.taux ? `<dd class="calc">${montant}</dd>` : ''}${detail}</div>`;
  const t = donnees.taux;
  return `<section class="bilan"><h2>${titre}</h2><dl>
    ${ligne('', 'Total travaillé', `${formatDuree(r.total)}`, null, `<dd class="calc">${formatDecimal(r.total)} h en décimal</dd>`)}
    ${ligne('', 'Heures normales', formatDuree(r.normales), `${formatDecimal(r.normales)} h × ${formatEuros(t)} = ${formatEuros(r.paie.normales)}`)}
    ${ligne('hs25', 'Heures sup 25\u00a0%', formatDuree(r.hs25), `${formatDecimal(r.hs25)} h × ${formatEuros(t * 1.25)} = ${formatEuros(r.paie.maj25)}`)}
    ${ligne('hs50', 'Heures sup 50\u00a0%', formatDuree(r.hs50), `${formatDecimal(r.hs50)} h × ${formatEuros(t * 1.5)} = ${formatEuros(r.paie.maj50)}`)}
    ${t ? ligne('', 'Dont majorations', formatEuros((r.hs25 / 60) * t * 0.25 + (r.hs50 / 60) * t * 0.5), null) : ''}
    ${t ? ligne('total', 'Salaire brut estimé', formatEuros(r.paie.total), null) : ''}
  </dl></section>`;
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-aller]');
  if (a) allerA(a.dataset.aller);
});

// ---------- Semaine ----------
function afficherSemaine() {
  const s = calculSemaine(donnees.jours, etat.lundi, donnees.taux);
  $('#semaine-titre').textContent = `${fmtDate.format(depuisISO(s.lundi))} → ${fmtDate.format(depuisISO(s.dimanche))}`;
  const auj = aujourdhui();
  $('#semaine-jours').innerHTML = s.detail.map(({ date, saisie, minutes }) => {
    const h = saisie && (saisie.debut || saisie.fin)
      ? `${saisie.debut || '--:--'} → ${saisie.fin || '--:--'}${Number(saisie.pause) ? ` · pause ${saisie.pause} min` : ''}`
      : 'Pas de saisie';
    return `<li><button type="button" data-jour="${date}" class="${minutes ? '' : 'vide'} ${date === auj ? 'aujourdhui' : ''}">
      <span class="nom">${maj(fmtJourCourt.format(depuisISO(date)))}</span>
      <span class="horaires">${echap(h)}</span>
      <span class="duree">${minutes ? formatDuree(minutes) : '—'}</span></button></li>`;
  }).join('');
  $('#semaine-bilan').innerHTML = `<div class="carte">${jauge(s.total)}</div>${alerteTaux()}${bilan('Bilan de la semaine', s)}`;
}
$('#semaine-jours').addEventListener('click', (e) => {
  const b = e.target.closest('[data-jour]');
  if (b) { etat.jour = b.dataset.jour; allerA('jour'); }
});

// ---------- Mois ----------
function afficherMois() {
  const m = calculMois(donnees.jours, etat.annee, etat.mois, donnees.taux);
  $('#mois-titre').textContent = maj(fmtMois.format(new Date(etat.annee, etat.mois - 1, 1)));
  const semaines = m.semaines.map((s) => `<li><button type="button" data-lundi="${s.lundi}">
      <div class="haut"><span>${fmtDate.format(depuisISO(s.lundi))} → ${fmtDate.format(depuisISO(s.dimanche))}</span><span>${formatDuree(s.total)}</span></div>
      <div class="bas">${s.hs25 ? `<span class="tag a">+${formatDuree(s.hs25)} à 25 %</span>` : ''}${s.hs50 ? `<span class="tag b">+${formatDuree(s.hs50)} à 50 %</span>` : ''}${!s.hs25 && !s.hs50 ? '<span>Pas d\'heures sup</span>' : ''}${donnees.taux && s.total ? `<span>${formatEuros(s.paie.total)}</span>` : ''}</div>
    </button></li>`).join('');
  $('#mois-contenu').innerHTML = `
    <div class="carte">
      <div class="petit-titre"><strong>Heures du 1er au ${depuisISO(m.dernier).getDate()} : ${formatDuree(m.calendaire)}</strong></div>
      <p class="aide">${m.joursTravailles} jour${m.joursTravailles > 1 ? 's' : ''} travaillé${m.joursTravailles > 1 ? 's' : ''} · ${formatDecimal(m.calendaire)} h</p>
    </div>
    ${alerteTaux()}
    ${bilan('Bilan du mois (semaines rattachées)', m)}
    <h2>Détail par semaine</h2>
    <ul class="liste-semaines">${semaines}</ul>
    ${m.periode ? `<p class="aide">Les heures sup se calculent à la semaine (lundi → dimanche). Le bilan couvre les semaines qui se terminent dans le mois, du ${fmtDate.format(depuisISO(m.periode.du))} au ${fmtDate.format(depuisISO(m.periode.au))}</p>` : ''}`;
}
$('#mois-contenu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lundi]');
  if (b) { etat.lundi = b.dataset.lundi; allerA('semaine'); }
});

// ---------- Réglages ----------
function afficherReglages() {
  if (document.activeElement !== $('#taux')) $('#taux').value = donnees.taux || '';
}
$('#taux').addEventListener('input', (e) => {
  const v = parseFloat(String(e.target.value).replace(',', '.'));
  donnees.taux = Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
  sauver();
  $('#entete-taux').textContent = donnees.taux ? `${formatEuros(donnees.taux)} / h` : '';
});

$('#btn-exporter').addEventListener('click', async () => {
  const contenu = JSON.stringify({ application: 'MesHeures', version: 1, exporteLe: new Date().toISOString(), ...donnees }, null, 2);
  const nom = `mesheures-${aujourdhui()}.json`;
  const fichier = new File([contenu], nom, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [fichier] })) { await navigator.share({ files: [fichier], title: 'Mes horaires' }); return; }
  } catch (err) { if (err.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(fichier); a.download = nom; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#btn-importer').addEventListener('click', () => $('#fichier-import').click());
$('#fichier-import').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || typeof d.jours !== 'object') throw new Error('format');
    const nb = Object.keys(d.jours).length;
    if (!confirm(`Importer ${nb} journée${nb > 1 ? 's' : ''} ? Les journées déjà saisies aux mêmes dates seront remplacées.`)) return;
    donnees.jours = { ...donnees.jours, ...d.jours };
    if (Number(d.taux) > 0) donnees.taux = Number(d.taux);
    sauver(); afficher(); toast('✅ Horaires importés');
  } catch { toast('❌ Fichier non reconnu'); }
});
$('#btn-tout-effacer').addEventListener('click', () => {
  if (!confirm('Effacer TOUS les horaires et le taux horaire ? Pense à exporter avant.')) return;
  donnees = { taux: 0, jours: {} }; sauver(); afficher(); toast('Tout est effacé');
});

// Données modifiées dans un autre onglet
window.addEventListener('storage', (e) => { if (e.key === CLE) { donnees = charger(); afficher(); } });
// Retour sur l'application le lendemain : on se replace sur aujourd'hui
let dernierJour = aujourdhui();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && aujourdhui() !== dernierJour) {
    dernierJour = aujourdhui(); etat.jour = dernierJour; afficher();
  }
});

// Premier lancement : pas de taux → on propose les réglages
allerA(donnees.taux || Object.keys(donnees.jours).length ? 'jour' : 'reglages');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
