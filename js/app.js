// FrigoFiche — application (tout reste sur le téléphone, aucun envoi serveur).
import {
  FLUIDES, NATURES, calcTeq, signatureDetenteurObligatoire, frequenceControle, fr, remplirCerfa,
  sansManipulation, avecControle,
} from './cerfa.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const champ = (nom) => document.querySelector(`[name="${nom}"]`);

const CLE_OPERATEUR = 'frigofiche.operateur';
const CLE_COMPTEUR = 'frigofiche.compteur';
const CHAMPS_OPERATEUR = ['raisonSociale', 'adresseOperateur', 'siret', 'attestation', 'technicien', 'qualiteTechnicien'];
// Mémorisés aussi, mais pas obligatoires pour sauter l'écran 1.
const CHAMPS_MEMORISES = [...CHAMPS_OPERATEUR, 'detecteurId'];
const CLE_REGLAGES = 'frigofiche.reglages';
const TITRES = ['Opérateur', 'Client et machine', 'Fluide', 'Contrôle et manipulation', 'Signatures', 'Vérification', 'Fiche prête'];
const NB_ETAPES = 5;

let etape = 1;
let pdfGenere = null; // { file, url }

// ---------- Stockage local (protégé : navigation privée, stockage bloqué…) ----------
const stock = {
  lire(cle) { try { return JSON.parse(localStorage.getItem(cle)); } catch { return null; } },
  ecrire(cle, v) { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* ignoré */ } },
};

// ---------- Utilitaires ----------
const nombre = (v) => {
  if (v === undefined || v === null) return NaN;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  return s === '' ? NaN : Number(s);
};
const radio = (nom) => document.querySelector(`[name="${nom}"]:checked`)?.value ?? '';
const coches = (nom) => $$(`[name="${nom}"]:checked`).map((el) => el.value);
const aujourdhui = () => new Date().toLocaleDateString('fr-FR');
const aujourdhuiISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dateFr = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '');

function prochainNumero() {
  const annee = new Date().getFullYear();
  const c = stock.lire(CLE_COMPTEUR);
  const n = c && c.annee === annee ? c.n + 1 : 1;
  return `${annee}-${String(n).padStart(4, '0')}`;
}
function memoriserNumero(numero) {
  const m = /^(\d{4})-(\d+)$/.exec(numero.trim());
  if (m) stock.ecrire(CLE_COMPTEUR, { annee: Number(m[1]), n: Number(m[2]) });
}

// ---------- Choix (fluides, natures) ----------
function creerOptions(conteneur, nom, valeurs, type = 'radio') {
  conteneur.innerHTML = '';
  for (const [valeur, libelle] of valeurs) {
    const l = document.createElement('label');
    l.className = 'option';
    l.innerHTML = `<input type="${type}" name="${nom}" value="${valeur}"><span></span>`;
    l.querySelector('span').textContent = libelle;
    conteneur.append(l);
  }
}
creerOptions($('#choix-fluide'), 'fluide', Object.keys(FLUIDES).map((f) => [f, f]));
creerOptions($('#choix-nature'), 'nature', Object.entries(NATURES), 'checkbox');

// ---------- Pavé de signature ----------
class PaveSignature {
  constructor(canvas) {
    this.canvas = canvas;
    this.traits = [];
    this.trait = null;
    canvas.addEventListener('pointerdown', (e) => this.debut(e));
    canvas.addEventListener('pointermove', (e) => this.deplacer(e));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => canvas.addEventListener(t, () => { this.trait = null; }));
    new ResizeObserver(() => this.redimensionner()).observe(canvas);
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  debut(e) {
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.trait = [this.point(e)];
    this.traits.push(this.trait);
    this.dessiner();
  }
  deplacer(e) {
    if (!this.trait) return;
    e.preventDefault();
    const evts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evts) this.trait.push(this.point(ev));
    this.dessiner();
  }
  redimensionner() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.dessiner();
  }
  static tracer(ctx, traits, echelle, dx = 0, dy = 0) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0a2a6b'; ctx.fillStyle = '#0a2a6b';
    ctx.lineWidth = 3 * echelle;
    for (const t of traits) {
      ctx.beginPath();
      if (t.length === 1) { ctx.arc((t[0][0] - dx) * echelle, (t[0][1] - dy) * echelle, 1.6 * echelle, 0, 7); ctx.fill(); continue; }
      t.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x - dx) * echelle, (y - dy) * echelle));
      ctx.stroke();
    }
  }
  dessiner() {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    PaveSignature.tracer(ctx, this.traits, window.devicePixelRatio || 1);
  }
  get vide() { return this.traits.length === 0; }
  effacer() { this.traits = []; this.dessiner(); }
  /** PNG transparent recadré sur l'encre (pour remplir la case du PDF). */
  png() {
    if (this.vide) return null;
    const pts = this.traits.flat();
    const marge = 3;
    const x0 = Math.min(...pts.map((p) => p[0])) - marge, y0 = Math.min(...pts.map((p) => p[1])) - marge;
    const x1 = Math.max(...pts.map((p) => p[0])) + marge, y1 = Math.max(...pts.map((p) => p[1])) + marge;
    const echelle = 3;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil((x1 - x0) * echelle));
    c.height = Math.max(1, Math.ceil((y1 - y0) * echelle));
    PaveSignature.tracer(c.getContext('2d'), this.traits, echelle, x0, y0);
    return c.toDataURL('image/png');
  }
}
const pads = { 'sig-tech': new PaveSignature($('#sig-tech')), 'sig-client': new PaveSignature($('#sig-client')) };
$$('[data-effacer]').forEach((b) => b.addEventListener('click', () => pads[b.dataset.effacer].effacer()));

// ---------- Données ----------
function donnees() {
  const v = (n) => champ(n).value.trim();
  const natures = coches('nature');
  const sansQte = sansManipulation(natures);
  return {
    raisonSociale: v('raisonSociale'), adresseOperateur: v('adresseOperateur'), siret: v('siret'),
    attestation: v('attestation'), technicien: v('technicien'), qualiteTechnicien: v('qualiteTechnicien'),
    detenteur: v('detenteur'), adresse: v('adresse'), reference: v('reference'), serie: v('serie'), ficheNo: v('ficheNo'),
    fluide: radio('fluide'), charge: nombre(v('charge')), natures,
    controlePeriodique: radio('controlePeriodique') !== 'non',
    detection: radio('detection') === '' ? null : radio('detection') === 'oui',
    dateControle: v('dateControle'), detecteurId: v('detecteurId'),
    qteChargee: sansQte ? null : (nombre(v('qteChargee')) || 0),
    qteRecyclee: sansQte ? null : (nombre(v('qteRecyclee')) || 0),
    qteRecuperee: sansQte ? null : (nombre(v('qteRecuperee')) || 0),
    fuite: radio('fuite') === '' ? null : radio('fuite') === 'oui',
    fuites: [1, 2, 3]
      .filter((n) => !$(`[data-fuite="${n}"]`).hidden)
      .map((n) => ({ localisation: v(`fuiteLoc${n}`), reparation: radio(`fuiteRep${n}`) }))
      .filter((x) => x.localisation || x.reparation),
    premiereCase7: champ('premiereCase7').checked,
    observations: v('observations'),
    signataireClient: v('signataireClient'), qualiteClient: v('qualiteClient'),
    date: aujourdhui(),
  };
}

// ---------- Mises à jour dynamiques ----------
function majFluide() {
  const d = donnees();
  const encart = $('#encart-teq');
  const f = FLUIDES[d.fluide];
  if (!f || !(d.charge > 0)) { encart.hidden = true; return; }
  const teq = calcTeq(d.fluide, d.charge);
  const freq = d.detection === null ? null : frequenceControle(d.fluide, d.charge, d.detection);
  encart.hidden = false;
  encart.innerHTML = '';
  const gros = document.createElement('span');
  gros.className = 'gros';
  gros.textContent = `${fr(teq)} t éq. CO₂`;
  const info = document.createElement('span');
  info.textContent = `${d.fluide} (${f.type}, PRP ${fr(f.prp, f.prp < 1 ? 1 : 0)}) × ${fr(d.charge)} kg`
    + (f.type === 'HCFC' ? ' — HCFC : tonnage non reporté sur la fiche' : '')
    + (freq ? ` — contrôle d'étanchéité tous les ${freq}` : '');
  encart.append(gros, info);
}
function majNature() {
  const natures = coches('nature');
  const controle = avecControle(natures);
  const seul = sansManipulation(natures);
  $('#bloc-periodique').hidden = !controle;
  $('#bloc-controle').hidden = !controle;
  $('#bloc-quantites').hidden = seul;
  $('#info-controle').hidden = !seul;
  if (controle && !champ('dateControle').value) champ('dateControle').value = aujourdhuiISO();
}
function majFuite() {
  $('#bloc-fuite').hidden = radio('fuite') !== 'oui';
  const visibles = [1, 2, 3].filter((n) => !$(`[data-fuite="${n}"]`).hidden).length;
  $('#btn-ajout-fuite').hidden = visibles >= 3;
}
$('#btn-ajout-fuite').addEventListener('click', () => {
  const suivante = [1, 2, 3].find((n) => $(`[data-fuite="${n}"]`).hidden);
  if (suivante) {
    $(`[data-fuite="${suivante}"]`).hidden = false;
    champ(`fuiteLoc${suivante}`).focus();
  }
  majFuite();
});
function majSignatures() {
  const d = donnees();
  champ('technicienSig').value = d.technicien;
  champ('qualiteTechnicienSig').value = d.qualiteTechnicien;
  const oblig = signatureDetenteurObligatoire(d.fluide, d.charge);
  $('#mention-client').innerHTML = oblig
    ? '<span class="badge oblig">obligatoire</span>'
    : '<span class="badge facult">facultative</span> <small>(moins de 3 kg HCFC / 5 t éq. CO₂)</small>';
  if (!champ('signataireClient').value) champ('signataireClient').value = d.detenteur;
}
function memoriser() {
  stock.ecrire(CLE_OPERATEUR, Object.fromEntries(CHAMPS_MEMORISES.map((c) => [c, champ(c).value])));
}

document.addEventListener('change', (e) => {
  const n = e.target.name;
  if (['fluide', 'detection'].includes(n)) majFluide();
  if (n === 'nature') majNature();
  if (n === 'premiereCase7') stock.ecrire(CLE_REGLAGES, { premiereCase7: e.target.checked });
  if (n === 'fuite') majFuite();
  e.target.closest('.invalide')?.classList.remove('invalide');
  if (!$('.invalide')) $('#erreur').hidden = true;
});
document.addEventListener('input', (e) => {
  const n = e.target.name;
  if (n === 'charge') majFluide();
  e.target.classList.remove('invalide');
  if (!$('.invalide')) $('#erreur').hidden = true;
  // Nom et qualité du technicien saisis à l'écran 5 : recopiés dans les champs de l'écran 1.
  if (e.target.dataset.miroir) champ(e.target.dataset.miroir).value = e.target.value;
  if (CHAMPS_MEMORISES.includes(n) || e.target.dataset.miroir) memoriser();
});

// ---------- Validation ----------
function valider(n) {
  const d = donnees();
  const fautes = []; // [élément, message]
  const requis = (nom, msg) => { if (!champ(nom).value.trim()) fautes.push([champ(nom), msg]); };
  const choix = (nom, msg) => { if (!radio(nom)) fautes.push([champ(nom).closest('fieldset'), msg]); };
  if (n === 1) {
    requis('raisonSociale', 'Indiquez la raison sociale.');
    requis('adresseOperateur', "Indiquez l'adresse de l'opérateur.");
    if (d.siret.replace(/\s/g, '').length !== 14 || /\D/.test(d.siret.replace(/\s/g, ''))) fautes.push([champ('siret'), 'Le SIRET doit comporter 14 chiffres.']);
    requis('attestation', "Indiquez le n° d'attestation de capacité.");
    requis('technicien', 'Indiquez le nom du technicien.');
    requis('qualiteTechnicien', 'Indiquez la qualité du technicien.');
  }
  if (n === 2) {
    requis('detenteur', 'Indiquez le nom du détenteur.');
    requis('adresse', "Indiquez l'adresse de l'équipement.");
    requis('reference', 'Indiquez la référence de la machine.');
    requis('ficheNo', 'Indiquez le n° de fiche.');
  }
  if (n === 3) {
    choix('fluide', 'Choisissez le fluide.');
    if (!(d.charge > 0)) fautes.push([champ('charge'), 'Indiquez la charge totale (kg), ex. 2,5.']);
    choix('nature', "Cochez au moins une nature d'intervention.");
    choix('detection', 'Indiquez si un système de détection de fuites est présent.');
  }
  if (n === 4) {
    if (avecControle(d.natures)) {
      requis('dateControle', 'Indiquez la date du contrôle.');
      requis('detecteurId', "Indiquez l'identification du détecteur manuel de fuite.");
    }
    if (!sansManipulation(d.natures)) {
      for (const nom of ['qteChargee', 'qteRecyclee', 'qteRecuperee']) {
        const x = nombre(champ(nom).value);
        if (champ(nom).value.trim() && (Number.isNaN(x) || x < 0)) fautes.push([champ(nom), 'Quantité invalide (ex. 0,5).']);
      }
      if (d.qteRecyclee > d.qteChargee) fautes.push([champ('qteRecyclee'), 'Le fluide recyclé ne peut pas dépasser la quantité chargée.']);
    }
    choix('fuite', 'Indiquez si une fuite a été constatée.');
    if (d.fuite) {
      [1, 2, 3].filter((k) => !$(`[data-fuite="${k}"]`).hidden).forEach((k) => {
        const loc = champ(`fuiteLoc${k}`).value.trim();
        const rep = radio(`fuiteRep${k}`);
        if (k === 1 && !loc) fautes.push([champ('fuiteLoc1'), 'Indiquez la localisation de la fuite.']);
        if (loc && !rep) fautes.push([champ(`fuiteRep${k}`).closest('fieldset'), `Réparation de la fuite n° ${k} : réalisée ou à faire ?`]);
      });
    }
  }
  if (n === 5) {
    requis('technicienSig', 'Indiquez le nom du technicien.');
    requis('qualiteTechnicienSig', 'Indiquez la qualité du technicien.');
    if (pads['sig-tech'].vide) fautes.push([$('#sig-tech'), 'La signature du technicien est requise.']);
    if (!pads['sig-client'].vide || signatureDetenteurObligatoire(d.fluide, d.charge)) {
      requis('signataireClient', 'Indiquez le nom du signataire client.');
      requis('qualiteClient', 'Indiquez la qualité du signataire client.');
    }
    if (signatureDetenteurObligatoire(d.fluide, d.charge) && pads['sig-client'].vide) {
      fautes.push([$('#sig-client'), 'La signature du client est obligatoire pour cette charge.']);
    }
  }
  $$('.invalide').forEach((el) => el.classList.remove('invalide'));
  const err = $('#erreur');
  if (!fautes.length) { err.hidden = true; return true; }
  fautes.forEach(([el]) => el?.classList.add('invalide'));
  err.textContent = fautes.map((f) => f[1]).join(' ');
  err.hidden = false;
  fautes[0][0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return false;
}

// ---------- Récapitulatif ----------
function recap() {
  const d = donnees();
  const f = FLUIDES[d.fluide];
  const sigT = pads['sig-tech'].png(), sigC = pads['sig-client'].png();
  const blocs = [
    [1, 'Opérateur', [['Raison sociale', d.raisonSociale], ['Adresse', d.adresseOperateur], ['SIRET', d.siret], ['Attestation de capacité', d.attestation],
      ['Case [7] sous les seuils', d.premiereCase7 ? 'Première case cochée' : 'Aucune case']]],
    [2, 'Client et machine', [['N° de fiche', d.ficheNo], ['Détenteur', d.detenteur], ['Adresse', d.adresse], ['Référence', d.reference], ['N° de série', d.serie || '—']]],
    [3, 'Fluide', [['Fluide', `${d.fluide} (${f.type})`], ['Charge totale', `${fr(d.charge)} kg`],
      ['Tonnage', f.type === 'HCFC' ? '— (HCFC)' : `${fr(calcTeq(d.fluide, d.charge))} t éq. CO₂`],
      ['Intervention', d.natures.map((n) => NATURES[n] + (n === 'controle' ? (d.controlePeriodique ? ' périodique' : ' non périodique') : '')).join('\n')],
      ['Détection permanente', d.detection ? 'Oui' : 'Non']]],
    [4, 'Contrôle et manipulation', [
      ...(avecControle(d.natures) ? [['Date du contrôle', dateFr(d.dateControle)], ['Détecteur manuel', d.detecteurId]] : []),
      ...(sansManipulation(d.natures) ? [['Quantités', 'Sans objet (contrôle d\'étanchéité seul)']] : [
        ['Quantité chargée', `${fr(d.qteChargee)} kg`], ['dont recyclé', `${fr(d.qteRecyclee)} kg`],
        ['dont vierge (calculé)', `${fr(Math.max(0, d.qteChargee - d.qteRecyclee))} kg`], ['Quantité récupérée', `${fr(d.qteRecuperee)} kg`]]),
      ['Fuite constatée', d.fuite ? 'Oui' : 'Non'],
      ...(d.fuite ? d.fuites.map((x, i) => [`Fuite n° ${i + 1}`, `${x.localisation || '—'} — ${{ realisee: 'réparée', afaire: 'réparation à faire' }[x.reparation] || '?'}`]) : []),
      ['Observations', d.observations || '—']]],
    [5, 'Signatures', [['Date', d.date],
      ['Technicien', `${d.technicien} — ${d.qualiteTechnicien}`], ['Signature technicien', sigT],
      ['Signataire client', [d.signataireClient, d.qualiteClient].filter(Boolean).join(' — ') || '—'], ['Signature client', sigC ? sigC : 'Non signée']]],
  ];
  const racine = $('#recap');
  racine.innerHTML = '';
  for (const [n, titre, lignes] of blocs) {
    const bloc = document.createElement('div');
    bloc.className = 'recap-bloc';
    const h = document.createElement('h3');
    h.textContent = titre;
    const mod = document.createElement('button');
    mod.type = 'button'; mod.className = 'lien'; mod.textContent = 'Modifier';
    mod.addEventListener('click', () => allerA(n));
    h.append(mod);
    const dl = document.createElement('dl');
    for (const [k, val] of lignes) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd');
      if (typeof val === 'string' && val.startsWith('data:image')) {
        const img = new Image(); img.src = val; img.alt = `Signature ${k}`; dd.append(img);
      } else dd.textContent = val ?? '';
      dl.append(dt, dd);
    }
    bloc.append(h, dl);
    racine.append(bloc);
  }
}

// ---------- Génération du PDF ----------
let modeleCache = null;
async function modele() {
  if (!modeleCache) {
    const r = await fetch('cerfa-15497-04.pdf');
    if (!r.ok) throw new Error('Formulaire Cerfa introuvable');
    modeleCache = await r.arrayBuffer();
  }
  return modeleCache.slice(0);
}

function nomFichier(d) {
  const propre = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `Fiche-intervention_${propre(d.ficheNo)}_${propre(d.detenteur).slice(0, 40)}.pdf`;
}

async function generer() {
  const bouton = $('#btn-suivant');
  bouton.disabled = true; bouton.textContent = 'Génération…';
  try {
    const d = donnees();
    d.signatureTechnicien = pads['sig-tech'].png();
    d.signatureClient = pads['sig-client'].png();
    const octets = await remplirCerfa(window.PDFLib, await modele(), d);
    const nom = nomFichier(d);
    const file = new File([octets], nom, { type: 'application/pdf' });
    if (pdfGenere) URL.revokeObjectURL(pdfGenere.url);
    pdfGenere = { file, url: URL.createObjectURL(file), d };
    memoriserNumero(d.ficheNo);
    $('#nom-fichier').textContent = nom;
    allerA(7);
  } catch (e) {
    console.error(e);
    $('#erreur').textContent = `Impossible de générer le PDF : ${e.message}`;
    $('#erreur').hidden = false;
  } finally {
    bouton.disabled = false;
  }
}

function telecharger() {
  const a = document.createElement('a');
  a.href = pdfGenere.url; a.download = pdfGenere.file.name;
  document.body.append(a); a.click(); a.remove();
}

$('#btn-partager').addEventListener('click', async () => {
  const { file, d } = pdfGenere;
  const partage = { files: [file], title: file.name, text: `Fiche d'intervention n° ${d.ficheNo} — ${d.detenteur} (${d.date})` };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share(partage); } catch (e) { if (e.name !== 'AbortError') telecharger(); }
  } else {
    telecharger();
  }
});
$('#btn-telecharger').addEventListener('click', telecharger);
$('#btn-voir').addEventListener('click', () => window.open(pdfGenere.url, '_blank'));
$('#btn-nouvelle').addEventListener('click', nouvelleFiche);

// ---------- Navigation ----------
function allerA(n) {
  etape = n;
  $$('.ecran').forEach((s) => { s.hidden = Number(s.dataset.etape) !== n; });
  $('#erreur').hidden = true;
  const pct = Math.min(n, 6) / 6 * 100;
  $('#barre-remplie').style.width = `${pct}%`;
  $('#etape-texte').textContent = n <= NB_ETAPES ? `Étape ${n} sur ${NB_ETAPES} — ${TITRES[n - 1]}` : TITRES[n - 1];
  const nav = $('#navigation');
  nav.hidden = n === 7;
  $('#btn-retour').style.visibility = n === 1 ? 'hidden' : 'visible';
  $('#btn-suivant').textContent = n === 6 ? '📄 Générer le PDF' : 'Suivant →';
  if (n === 3) { majFluide(); majNature(); }
  if (n === 4) { majNature(); majFuite(); }
  if (n === 5) majSignatures();
  if (n === 6) recap();
  window.scrollTo({ top: 0 });
}
$('#btn-suivant').addEventListener('click', () => {
  if (etape === 6) return generer();
  if (valider(etape)) allerA(etape + 1);
});
$('#btn-retour').addEventListener('click', () => allerA(Math.max(1, etape - 1)));

function nouvelleFiche() {
  $$('main input, main textarea').forEach((el) => {
    if (CHAMPS_MEMORISES.includes(el.name) || el.name === 'premiereCase7' || el.dataset.miroir) return;
    if (el.type === 'radio' || el.type === 'checkbox') el.checked = el.name === 'controlePeriodique' && el.value === 'oui';
    else el.value = '';
  });
  Object.values(pads).forEach((p) => p.effacer());
  [2, 3].forEach((n) => { $(`[data-fuite="${n}"]`).hidden = true; });
  champ('ficheNo').value = prochainNumero();
  const operateurOk = CHAMPS_OPERATEUR.every((c) => champ(c).value.trim());
  allerA(operateurOk ? 2 : 1);
}

// ---------- Démarrage ----------
const op = stock.lire(CLE_OPERATEUR);
if (op) CHAMPS_MEMORISES.forEach((c) => { if (op[c]) champ(c).value = op[c]; });
champ('premiereCase7').checked = !!stock.lire(CLE_REGLAGES)?.premiereCase7;
champ('ficheNo').value = prochainNumero();
allerA(op && CHAMPS_OPERATEUR.every((c) => op[c]) ? 2 : 1);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
