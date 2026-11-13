// FrigoFiche — application (tout reste sur le téléphone, aucun envoi serveur).
import {
  FLUIDES, NATURES, calcTeq, signatureDetenteurObligatoire, frequenceControle, fr, remplirCerfa,
  sansManipulation, avecControle,
} from './cerfa.js';
import {
  chargerProfil, enregistrerProfil, effacerProfil, demanderStockagePersistant,
  siretValide, emailValide, chiffres, nomComplet, QUALITE_DEFAUT,
  codeDisponible, creerVerrou, verifierCode, fichierExport, lireImport,
} from './profil.js';
import { PaveSignature } from './signature.js';
import { initBon } from './bon-ui.js';
import { ajouterFiche, nouvelId } from './historique.js';
import { initHistorique } from './historique-ui.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const champ = (nom) => document.querySelector(`[name="${nom}"]`);

// Anciennes clés (versions précédentes) : lues pour préremplir le profil, jamais effacées.
const CLE_OPERATEUR = 'frigofiche.operateur';
const CLE_REGLAGES = 'frigofiche.reglages';
const CLE_COMPTEUR = 'frigofiche.compteur';
const CHAMPS_OPERATEUR = ['raisonSociale', 'adresseOperateur', 'siret', 'attestation', 'technicien', 'qualiteTechnicien'];
const CHAMPS_PROFIL = ['raisonSociale', 'adresse', 'siret', 'attestation', 'prenom', 'nom', 'qualite', 'email'];
const VERSION_APP = '1.8.2 (13/11/2026)';
const RE_VERROUILLAGE_MS = 5 * 60 * 1000; // re-verrouille après 5 min en arrière-plan
const TITRES = ['Opérateur', 'Client et machine', 'Fluide', 'Contrôle et manipulation', 'Signatures', 'Vérification', 'Fiche prête'];
const NB_ETAPES = 5;

let etape = 'accueil';
let pdfGenere = null; // { file, url }
let profil = null;
let ficheEnCours = null; // dernière étape atteinte de la fiche en cours
let idHistorique = null; // identifiant de la fiche en cours dans « Mes fiches »

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
    premiereCase7: !!profil?.reglages?.premiereCase7,
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
// Le détecteur manuel est en général toujours le même : il est mémorisé dans le profil.
let minuterieDetecteur;
function memoriserDetecteur(valeur) {
  clearTimeout(minuterieDetecteur);
  minuterieDetecteur = setTimeout(() => {
    if (profil && profil.detecteurId !== valeur.trim()) {
      profil.detecteurId = valeur.trim();
      enregistrerProfil(profil).then((p) => { profil = p; }).catch(() => {});
    }
  }, 600);
}

document.addEventListener('change', (e) => {
  const n = e.target.name;
  if (['fluide', 'detection'].includes(n)) majFluide();
  if (n === 'nature') majNature();
  if (n === 'premiereCase7' && profil) {
    profil.reglages = { ...profil.reglages, premiereCase7: e.target.checked };
    enregistrerProfil(profil).then((p) => { profil = p; }).catch((err) => montrerMessageProfil(err.message, true));
  }
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
  if (n === 'detecteurId') memoriserDetecteur(e.target.value);
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
    d.signatureTechnicien = pads['sig-tech'].trace();
    d.signatureClient = pads['sig-client'].trace();
    const octets = await remplirCerfa(window.PDFLib, await modele(), d);
    const nom = nomFichier(d);
    const file = new File([octets], nom, { type: 'application/pdf' });
    if (pdfGenere) URL.revokeObjectURL(pdfGenere.url);
    pdfGenere = { file, url: URL.createObjectURL(file), d };
    memoriserNumero(d.ficheNo);
    ficheEnCours = null;
    idHistorique = idHistorique || nouvelId();
    await ajouterFiche({
      id: idHistorique, type: 'cerfa', numero: d.ficheNo, client: d.detenteur, adresse: d.adresse, date: d.date,
      detail: [d.fluide, d.natures.map((n) => NATURES[n]).join(', ')].filter(Boolean).join(' — '), nomFichier: nom,
    }, octets).catch((e) => console.warn('Historique non enregistré', e));
    $('#nom-fichier').textContent = nom;
    $('#bloc-email').hidden = !profil?.email;
    $('#email-destinataire').textContent = profil?.email || '';
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
$('#btn-copier-email').addEventListener('click', async (e) => {
  try { await navigator.clipboard.writeText(profil.email); e.target.textContent = '✅ Adresse copiée'; } catch {
    e.target.textContent = profil.email;
  }
  setTimeout(() => { e.target.textContent = "📋 Copier l'adresse"; }, 2500);
});

// ---------- Navigation ----------
// Écrans : 'verrou', 'accueil', 'profil', puis les étapes 1 à 7 de la fiche.
// Onglets : « Fiche Cerfa » (accueil + étapes 1 à 7), « Bon d'intervention » (écrans bon-*), « Mes fiches », « Mon profil ».
const ongletDe = (n) => (['profil', 'historique'].includes(n) ? n : bon.estEcran(n) ? 'bon' : n === 'verrou' ? null : 'cerfa');
const ACCUEIL_ONGLET = { cerfa: 'accueil', bon: 'bon-accueil', historique: 'historique', profil: 'profil' };
const dernierEcran = { ...ACCUEIL_ONGLET };
function majOnglets(n) {
  const onglet = ongletDe(n);
  const visibles = !!profil && n !== 'verrou';
  $('#onglets').hidden = !visibles;
  document.body.classList.toggle('avec-onglets', visibles);
  if (onglet) dernierEcran[onglet] = n;
  $$('#onglets [data-onglet]').forEach((b) => {
    const actif = b.dataset.onglet === onglet;
    b.classList.toggle('actif', actif);
    b.setAttribute('aria-current', actif ? 'page' : 'false');
  });
  $('#mention-cerfa').textContent = { bon: "Bon d'intervention", historique: 'Mes fiches', profil: 'Mon profil' }[onglet] || 'Cerfa 15497*04';
}
$$('#onglets [data-onglet]').forEach((b) => b.addEventListener('click', () => {
  const o = b.dataset.onglet;
  // Un second appui sur l'onglet déjà ouvert ramène à son écran d'accueil.
  allerA(ongletDe(etape) === o ? ACCUEIL_ONGLET[o] : dernierEcran[o]);
}));

function allerA(n) {
  etape = n;
  const fiche = typeof n === 'number';
  const ecranBon = bon.estEcran(n);
  $$('.ecran').forEach((s) => { s.hidden = (s.dataset.etape ? Number(s.dataset.etape) : s.dataset.ecran) !== n; });
  $('#erreur').hidden = true;
  $('#progression').hidden = !fiche;
  $('#btn-accueil').hidden = true; // remplacé par la barre d'onglets
  majOnglets(n);
  const nav = $('#navigation');
  nav.hidden = !fiche || n === 7;
  document.body.classList.toggle('sans-navigation', nav.hidden);
  if (ecranBon) {
    bon.surAffichage(n).then((r) => {
      if (etape !== n) return;
      nav.hidden = !r.nav;
      document.body.classList.toggle('sans-navigation', nav.hidden);
      $('#progression').hidden = !r.nav;
      if (r.nav) {
        $('#etape-texte').textContent = r.progression;
        $('#barre-remplie').style.width = `${r.pct}%`;
        $('#btn-suivant').textContent = r.suivant;
        $('#btn-retour').textContent = r.retour;
      }
    });
  }
  if (fiche) {
    if (n <= 6) ficheEnCours = n;
    // L'opérateur vient du profil : la fiche commence à « Client et machine » (étape 1 sur 4).
    const affichage = n === 1 ? 'Opérateur (cette fiche uniquement)'
      : n <= NB_ETAPES ? `Étape ${n - 1} sur ${NB_ETAPES - 1} — ${TITRES[n - 1]}` : TITRES[n - 1];
    $('#barre-remplie').style.width = `${Math.min(Math.max(n - 1, 0.3), 5) / 5 * 100}%`;
    $('#etape-texte').textContent = affichage;
    $('#btn-suivant').textContent = n === 6 ? '📄 Générer le PDF' : 'Suivant →';
    $('#btn-retour').textContent = n === 2 ? '🏠 Accueil' : '← Retour';
  }
  if (n === 3) { majFluide(); majNature(); }
  if (n === 4) { majNature(); majFuite(); }
  if (n === 5) majSignatures();
  if (n === 6) recap();
  if (n === 'accueil') majAccueil();
  if (n === 'profil') majProfil();
  if (n === 'historique') historique.afficher();
  window.scrollTo({ top: 0 });
}
$('#btn-suivant').addEventListener('click', (e) => {
  if (bon.estEcran(etape)) return bon.suivant(etape, e.currentTarget);
  if (etape === 6) return generer();
  if (valider(etape)) allerA(etape + 1);
});
$('#btn-retour').addEventListener('click', () => {
  if (bon.estEcran(etape)) return bon.retour(etape);
  allerA(etape === 2 ? 'accueil' : Math.max(1, etape - 1));
});
$('#btn-accueil').addEventListener('click', () => allerA('accueil'));

/** Remplit la rubrique [1] et le signataire opérateur avec le profil. */
function preremplirOperateur() {
  if (!profil) return;
  champ('raisonSociale').value = profil.raisonSociale;
  champ('adresseOperateur').value = profil.adresse;
  champ('siret').value = profil.siret;
  champ('attestation').value = profil.attestation;
  champ('technicien').value = nomComplet(profil);
  champ('qualiteTechnicien').value = profil.qualite;
  champ('detecteurId').value = profil.detecteurId || '';
}

function nouvelleFiche() {
  $$('#app [data-etape] input, #app [data-etape] textarea').forEach((el) => {
    if (el.type === 'radio' || el.type === 'checkbox') el.checked = el.name === 'controlePeriodique' && el.value === 'oui';
    else el.value = '';
  });
  Object.values(pads).forEach((p) => p.effacer());
  [2, 3].forEach((n) => { $(`[data-fuite="${n}"]`).hidden = true; });
  idHistorique = null;
  preremplirOperateur();
  champ('ficheNo').value = prochainNumero();
  allerA(2);
}

// ---------- Accueil ----------
function majAccueil() {
  $('#bonjour').textContent = `Bonjour ${profil?.prenom || ''} 👋`.replace('  ', ' ');
  $('#accueil-societe').textContent = profil ? `${profil.raisonSociale} — ${profil.qualite}` : '';
  $('#btn-reprendre').hidden = !ficheEnCours;
}
$('#btn-nouvelle-fiche').addEventListener('click', nouvelleFiche);
$('#btn-reprendre').addEventListener('click', () => allerA(ficheEnCours || 2));
$('#btn-mon-profil').addEventListener('click', () => allerA('profil'));

// ---------- Profil ----------
const champProfil = (c) => champ(`p_${c}`);
function montrerMessageProfil(texte, erreur = false, cible = '#message-profil') {
  const m = $(cible);
  m.textContent = texte;
  m.classList.toggle('erreur', erreur);
  m.hidden = false;
  clearTimeout(m.t);
  m.t = setTimeout(() => { m.hidden = true; }, 5000);
}
function remplirFormulaireProfil(p) {
  CHAMPS_PROFIL.forEach((c) => { champProfil(c).value = p?.[c] || ''; });
  if (!champProfil('qualite').value) champProfil('qualite').value = QUALITE_DEFAUT;
}
/** Première ouverture : reprend les infos saisies avec une ancienne version de l'appli. */
function profilDepuisAnciennesDonnees() {
  const op = stock.lire(CLE_OPERATEUR);
  if (!op) return null;
  return {
    raisonSociale: op.raisonSociale, adresse: op.adresseOperateur, siret: op.siret, attestation: op.attestation,
    nom: op.technicien, prenom: '', qualite: op.qualiteTechnicien, detecteurId: op.detecteurId,
    reglages: { premiereCase7: !!stock.lire(CLE_REGLAGES)?.premiereCase7 },
  };
}
function majProfil() {
  const creation = !profil;
  $('#version-app').textContent = `FrigoFiche version ${VERSION_APP}`;
  $('#profil-titre').textContent = creation ? 'Crée ton profil' : 'Mon profil';
  $('#profil-intro').textContent = creation
    ? "Ces informations rempliront automatiquement chaque fiche. Tu ne les saisis qu'une fois."
    : 'Modifie tes informations puis enregistre. Elles servent pour toutes les nouvelles fiches.';
  $('#btn-enregistrer-profil').textContent = creation ? '✅ Créer mon profil' : '✅ Enregistrer les modifications';
  $('#btn-import-creation').hidden = !creation;
  $('#profil-options').hidden = creation;
  $('#erreur-profil').hidden = true;
  $$('#form-profil .invalide').forEach((el) => el.classList.remove('invalide'));
  remplirFormulaireProfil(profil || profilDepuisAnciennesDonnees());
  if (!creation) {
    champ('premiereCase7').checked = !!profil.reglages?.premiereCase7;
    majLogo();
    majEtatCode();
  }
}
$('#form-profil').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = Object.fromEntries(CHAMPS_PROFIL.map((c) => [c, champProfil(c).value.trim()]));
  const fautes = [];
  const exiger = (c, msg) => { if (!v[c]) fautes.push([c, msg]); };
  exiger('raisonSociale', 'Indique la raison sociale.');
  exiger('adresse', "Indique l'adresse de la société.");
  if (!siretValide(v.siret)) fautes.push(['siret', `Le SIRET doit comporter exactement 14 chiffres (${chiffres(v.siret).replace(/\D/g, '').length} saisis).`]);
  exiger('attestation', "Indique le n° d'attestation de capacité.");
  exiger('prenom', 'Indique ton prénom.');
  exiger('nom', 'Indique ton nom.');
  exiger('qualite', 'Indique ta qualité.');
  if (!emailValide(v.email)) fautes.push(['email', "L'adresse e-mail n'est pas valide."]);
  $$('#form-profil .invalide').forEach((el) => el.classList.remove('invalide'));
  const err = $('#erreur-profil');
  if (fautes.length) {
    fautes.forEach(([c]) => champProfil(c).classList.add('invalide'));
    err.textContent = fautes.map((f) => f[1]).join(' ');
    err.hidden = false;
    champProfil(fautes[0][0]).focus();
    return;
  }
  err.hidden = true;
  const creation = !profil;
  const base = profil || profilDepuisAnciennesDonnees() || {};
  try {
    profil = await enregistrerProfil({ ...base, ...v, siret: chiffres(v.siret) });
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false; return;
  }
  demanderStockagePersistant();
  if (creation) allerA('accueil');
  else montrerMessageProfil('✅ Profil enregistré.', false, '#message-enregistre');
});

// Code de verrouillage
function majEtatCode() {
  const actif = !!profil?.verrou;
  $('#etat-code').textContent = !codeDisponible()
    ? "Le code n'est pas disponible dans ce navigateur."
    : actif ? '✅ Code activé : il sera demandé à chaque ouverture.' : 'Aucun code défini.';
  $('#btn-definir-code').hidden = !codeDisponible();
  $('#btn-definir-code').textContent = actif ? '🔁 Changer le code' : '🔒 Définir un code';
  $('#btn-supprimer-code').hidden = !actif;
  $('#bloc-definir-code').hidden = true;
}
$('#btn-definir-code').addEventListener('click', () => {
  $('#bloc-definir-code').hidden = false;
  $('#btn-definir-code').hidden = true;
  champ('nouveauCode').value = ''; champ('confirmeCode').value = '';
  champ('nouveauCode').focus();
});
$('#btn-valider-code').addEventListener('click', async () => {
  const a = champ('nouveauCode').value, b = champ('confirmeCode').value;
  if (!/^\d{4}$/.test(a)) return montrerMessageProfil('Le code doit comporter exactement 4 chiffres.', true, '#message-code');
  if (a !== b) return montrerMessageProfil('Les deux codes ne correspondent pas.', true, '#message-code');
  try {
    profil = await enregistrerProfil({ ...profil, verrou: await creerVerrou(a) });
    champ('nouveauCode').value = ''; champ('confirmeCode').value = '';
    majEtatCode();
    montrerMessageProfil('🔒 Code activé.', false, '#message-code');
  } catch (ex) { montrerMessageProfil(ex.message, true, '#message-code'); }
});
$('#btn-supprimer-code').addEventListener('click', async () => {
  if (!confirm('Supprimer le code de verrouillage ?')) return;
  profil = await enregistrerProfil({ ...profil, verrou: null });
  majEtatCode();
  montrerMessageProfil('🔓 Code supprimé.', false, '#message-code');
});

// Sauvegarde et restauration
$('#btn-exporter').addEventListener('click', async () => {
  const file = fichierExport(profil);
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Sauvegarde FrigoFiche' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  montrerMessageProfil(`📤 Fichier « ${file.name} » enregistré.`);
});
const ouvrirImport = () => { $('#fichier-import').value = ''; $('#fichier-import').click(); };
$('#btn-importer').addEventListener('click', ouvrirImport);
$('#btn-import-creation').addEventListener('click', ouvrirImport);
$('#fichier-import').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const importe = lireImport(await f.text());
    if (profil && !confirm(`Remplacer ton profil actuel par celui de la sauvegarde (${importe.raisonSociale}, ${nomComplet(importe)}) ?`)) return;
    const creation = !profil;
    // Le code de verrouillage de cet appareil est conservé (il n'est jamais exporté).
    profil = await enregistrerProfil({ ...importe, verrou: profil?.verrou || null });
    demanderStockagePersistant();
    if (creation) allerA('accueil');
    else { majProfil(); montrerMessageProfil('📥 Profil importé.'); }
  } catch (ex) {
    if (profil) montrerMessageProfil(ex.message, true);
    else { $('#erreur-profil').textContent = ex.message; $('#erreur-profil').hidden = false; }
  }
});

// ---------- Écran de verrouillage ----------
let saisieCode = '';
let echecs = 0;
let bloqueJusqua = 0;
function majPoints() {
  $$('#points-code span').forEach((p, i) => p.classList.toggle('plein', i < saisieCode.length));
}
async function toucheCode(t) {
  if (Date.now() < bloqueJusqua) return;
  if (t === 'effacer') saisieCode = saisieCode.slice(0, -1);
  else if (saisieCode.length < 4) saisieCode += t;
  majPoints();
  if (saisieCode.length < 4) return;
  const ok = await verifierCode(saisieCode, profil.verrou);
  saisieCode = '';
  if (ok) {
    echecs = 0;
    $('#erreur-code').textContent = '';
    majPoints();
    allerA(apresDeverrouillage || 'accueil');
    apresDeverrouillage = null;
    return;
  }
  echecs++;
  const points = $('#points-code');
  points.classList.remove('secoue'); void points.offsetWidth; points.classList.add('secoue');
  majPoints();
  if (echecs >= 5) {
    bloqueJusqua = Date.now() + 30000;
    $('#erreur-code').textContent = 'Trop d’essais. Réessaie dans 30 secondes.';
    setTimeout(() => { $('#erreur-code').textContent = ''; echecs = 0; }, 30000);
  } else {
    $('#erreur-code').textContent = 'Code incorrect.';
  }
}
$('#clavier-code').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) toucheCode(b.dataset.touche || b.textContent.trim());
});
document.addEventListener('keydown', (e) => {
  if (etape !== 'verrou') return;
  if (/^\d$/.test(e.key)) toucheCode(e.key);
  if (e.key === 'Backspace') toucheCode('effacer');
});
$('#btn-code-oublie').addEventListener('click', () => { $('#aide-code-oublie').hidden = false; });
$('#btn-reinitialiser').addEventListener('click', async () => {
  if (!confirm('Effacer ton profil de ce téléphone ? Tu devras le recréer ou importer ta sauvegarde.')) return;
  await effacerProfil();
  profil = null;
  $('#aide-code-oublie').hidden = true;
  allerA('profil');
});

let apresDeverrouillage = null;
let cacheLe = 0;
function verrouiller() {
  apresDeverrouillage = etape === 'verrou' ? apresDeverrouillage : etape;
  saisieCode = '';
  majPoints();
  allerA('verrou');
}
// Re-verrouillage quand l'appli revient après plusieurs minutes en arrière-plan.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cacheLe = Date.now(); return; }
  if (profil?.verrou && cacheLe && Date.now() - cacheLe > RE_VERROUILLAGE_MS && etape !== 'verrou') verrouiller();
});

// ---------- Bon d'intervention ----------
function telechargerFichier(file, url) {
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = file.name;
  document.body.append(lien);
  lien.click();
  lien.remove();
}
async function partagerOuTelecharger(file, texte, url) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name, text: texte }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  telechargerFichier(file, url);
}
const bon = initBon({
  allerA: (e) => allerA(e),
  profil: () => profil,
  nomComplet,
  partagerOuTelecharger,
  telecharger: telechargerFichier,
});
const historique = initHistorique({ partagerOuTelecharger, telecharger: telechargerFichier });

// ---------- Logo de la société (Mon profil) ----------
async function reduireLogo(fichier, max = 500) {
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png'); // PNG : garde la transparence
  } finally { URL.revokeObjectURL(url); }
}
function majLogo() {
  const logo = profil?.logo;
  $('#apercu-logo').hidden = !logo;
  if (logo) $('#img-logo').src = logo;
  $('#btn-supprimer-logo').hidden = !logo;
  $('#btn-choisir-logo').textContent = logo ? '🖼️ Changer de logo' : '🖼️ Choisir un logo';
}
$('#btn-choisir-logo').addEventListener('click', () => { $('#fichier-logo').value = ''; $('#fichier-logo').click(); });
$('#fichier-logo').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    profil = await enregistrerProfil({ ...profil, logo: await reduireLogo(f) });
    majLogo();
    montrerMessageProfil('✅ Logo enregistré.', false, '#message-logo');
  } catch (ex) { montrerMessageProfil(`Logo non enregistré : ${ex.message}`, true, '#message-logo'); }
});
$('#btn-supprimer-logo').addEventListener('click', async () => {
  profil = await enregistrerProfil({ ...profil, logo: '' });
  majLogo();
  montrerMessageProfil('Logo supprimé.', false, '#message-logo');
});

// ---------- Démarrage ----------
async function demarrer() {
  profil = await chargerProfil();
  if (!profil) return allerA('profil');
  if (profil.verrou) { apresDeverrouillage = 'accueil'; return allerA('verrou'); }
  allerA('accueil');
}
demarrer();

// ---------- Mises à jour de l'application ----------
// Le service worker revérifie les fichiers à chaque ouverture. Quand une nouvelle version
// est installée, l'appli se recharge (ou propose de le faire si une fiche est en cours).
// Le profil n'est jamais touché par une mise à jour.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const avaitControleur = !!navigator.serviceWorker.controller;
  let rechargement = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!avaitControleur || rechargement) return;
    const ficheOuverte = (typeof etape === 'number' && etape < 7)
      || (bon.estEcran(etape) && !['bon-accueil', 'bon-pret'].includes(etape));
    if (!ficheOuverte) { rechargement = true; location.reload(); return; }
    $('#bandeau-maj').hidden = false;
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // L'appli installée est souvent « réveillée » sans être rechargée : on vérifie à chaque retour.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
}
$('#btn-maj').addEventListener('click', () => location.reload());
