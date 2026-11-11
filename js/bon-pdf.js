// FrigoFiche — génération du PDF « Bon d'intervention » (A4, pdf-lib, côté appareil).
// Mise en page sobre, pagination automatique : aucun texte ne déborde.
import { placerSignature } from './cerfa.js';
import { texteDuree, euros } from './bon.js';

const A4 = [595.28, 841.89];
const M = 40;                       // marges gauche / droite / haut
const BAS = 52;                     // zone réservée au pied de page
const L = A4[0] - 2 * M;            // largeur utile
const GOUTTIERE = 14;

// Remplacements des caractères absents des polices standard du PDF (WinAnsi).
const REMPLACEMENTS = {
  ' ': ' ', ' ': ' ', ' ': ' ', '\t': '    ', '≥': '>=', '≤': '<=', '→': '->', '←': '<-',
  '₂': '2', '³': '3', '✓': 'v', '✔': 'v', '•': '•', ' ': '\n', ' ': '\n',
};

/**
 * @param {object} PDFLib  pdf-lib
 * @param {object} b  données du bon (voir test/exemple-bon.mjs)
 * @returns {Promise<Uint8Array>}
 */
export async function genererBon(PDFLib, b) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);

  const NOIR = rgb(0.1, 0.1, 0.12);
  const GRIS = rgb(0.38, 0.4, 0.44);
  const TRAIT = rgb(0.78, 0.8, 0.83);
  const FOND = rgb(0.94, 0.95, 0.97);
  const ACCENT = rgb(11 / 255, 79 / 255, 138 / 255);

  // ---------- Texte ----------
  const encodable = new Map();
  const propre = (t) => [...String(t ?? '').replace(/\r\n?/g, '\n')].map((ch) => {
    if (ch === '\n') return ch;
    if (REMPLACEMENTS[ch] !== undefined) return REMPLACEMENTS[ch];
    if (!encodable.has(ch)) {
      try { normal.widthOfTextAtSize(ch, 10); encodable.set(ch, true); } catch { encodable.set(ch, false); }
    }
    return encodable.get(ch) ? ch : '?';
  }).join('');
  const largeur = (t, police, taille) => police.widthOfTextAtSize(t, taille);

  /** Coupe un texte en lignes tenant dans `max` points (paragraphes et mots trop longs gérés). */
  function couper(texte, police, taille, max) {
    const lignes = [];
    for (const para of propre(texte).split('\n')) {
      if (!para.trim()) { lignes.push(''); continue; }
      let ligne = '';
      for (const mot of para.split(/ +/)) {
        const essai = ligne ? `${ligne} ${mot}` : mot;
        if (largeur(essai, police, taille) <= max) { ligne = essai; continue; }
        if (ligne) lignes.push(ligne);
        // mot plus long que la ligne : coupé caractère par caractère
        let reste = mot;
        while (largeur(reste, police, taille) > max) {
          let i = reste.length - 1;
          while (i > 1 && largeur(reste.slice(0, i), police, taille) > max) i--;
          lignes.push(reste.slice(0, i));
          reste = reste.slice(i);
        }
        ligne = reste;
      }
      lignes.push(ligne);
    }
    while (lignes.length && lignes[lignes.length - 1] === '') lignes.pop();
    return lignes;
  }

  // ---------- Pages ----------
  let page, y;
  const pages = [];
  function nouvellePage() {
    page = pdf.addPage(A4);
    pages.push(page);
    y = A4[1] - M;
    if (pages.length > 1) {
      ecrire(`Bon d'intervention ${b.numero} (suite)`, M, y - 9, gras, 9, GRIS);
      y -= 24;
    }
  }
  /** Passe à la page suivante si `h` points ne tiennent plus. */
  function besoin(h) { if (y - h < BAS) { nouvellePage(); return true; } return false; }
  function ecrire(t, x, yy, police = normal, taille = 10, couleur = NOIR) {
    page.drawText(propre(t), { x, y: yy, size: taille, font: police, color: couleur });
  }
  function ecrireDroite(t, xDroite, yy, police, taille, couleur) {
    ecrire(t, xDroite - largeur(propre(t), police, taille), yy, police, taille, couleur);
  }
  function filet(yy, couleur = TRAIT, epaisseur = 0.8) {
    page.drawLine({ start: { x: M, y: yy }, end: { x: A4[0] - M, y: yy }, thickness: epaisseur, color: couleur });
  }
  /** Titre de section, gardé sur la même page qu'au moins `suite` points de contenu. */
  function titre(t, suite = 30) {
    besoin(33 + suite);
    y -= 8;
    ecrire(t.toUpperCase(), M, y - 10, gras, 10, ACCENT);
    y -= 15;
    filet(y, ACCENT, 0.9);
    y -= 10;
  }
  /** Paragraphe paginé ligne par ligne. */
  function paragraphe(texte, { police = normal, taille = 10, couleur = NOIR, x = M, max = L } = {}) {
    const lh = taille * 1.38;
    for (const ligne of couper(texte, police, taille, max)) {
      besoin(lh);
      if (ligne) ecrire(ligne, x, y - taille, police, taille, couleur);
      y -= lh;
    }
  }
  /** Lignes « Libellé : valeur » (valeur en retrait sous le libellé si elle passe à la ligne). */
  function mesurerChamps(champs, max, taille = 9.5) {
    const lh = taille * 1.38;
    return champs.filter(([, v]) => v).map(([lib, v, fort]) => {
      const lab = lib ? `${lib} : ` : '';
      const wl = lab ? largeur(propre(lab), normal, taille) : 0;
      const lignes = couper(v, fort ? gras : normal, taille, max - wl);
      return { lab, wl, lignes, fort, h: lignes.length * lh };
    });
  }
  function dessinerChamps(mesures, x, yy, taille = 9.5) {
    const lh = taille * 1.38;
    for (const c of mesures) {
      if (c.lab) ecrire(c.lab, x, yy - taille, normal, taille, GRIS);
      c.lignes.forEach((l, i) => ecrire(l, x + c.wl, yy - taille - i * lh, c.fort ? gras : normal, taille, NOIR));
      yy -= c.h;
    }
    return yy;
  }

  async function image(donnees) {
    if (!donnees) return null;
    const estPng = typeof donnees === 'string'
      ? donnees.startsWith('data:image/png')
      : donnees[0] === 0x89 && donnees[1] === 0x50;
    return estPng ? pdf.embedPng(donnees) : pdf.embedJpg(donnees);
  }

  nouvellePage();

  // ---------- En-tête ----------
  const s = b.societe || {};
  let xSoc = M;
  let basGauche = y;
  const logo = await image(s.logo).catch(() => null);
  if (logo) {
    const k = Math.min(120 / logo.width, 60 / logo.height);
    const w = logo.width * k, h = logo.height * k;
    page.drawImage(logo, { x: M, y: y - h, width: w, height: h });
    xSoc = M + w + 12;
    basGauche = y - h;
  }
  const largeurDroite = 190;
  const maxSoc = A4[0] - M - largeurDroite - 10 - xSoc;
  let ys = y;
  for (const l of couper(s.raisonSociale, gras, 13, maxSoc)) { ecrire(l, xSoc, ys - 13, gras, 13); ys -= 16; }
  ys -= 2;
  const coord = [s.adresse, s.siret && `SIRET : ${s.siret}`].filter(Boolean).join('\n');
  for (const l of couper(coord, normal, 9, maxSoc)) { ecrire(l, xSoc, ys - 9, normal, 9, GRIS); ys -= 12; }
  basGauche = Math.min(basGauche, ys);

  const xD = A4[0] - M;
  ecrireDroite("BON D'INTERVENTION", xD, y - 15, gras, 15, ACCENT);
  ecrireDroite(`N° ${b.numero}`, xD, y - 33, gras, 11, NOIR);
  ecrireDroite(`Date : ${b.date}`, xD, y - 48, normal, 10, NOIR);
  y = Math.min(basGauche, y - 56) - 12;
  filet(y, NOIR, 1.2);
  y -= 6;

  // ---------- Client et équipement (deux colonnes) ----------
  const lc = (L - GOUTTIERE) / 2;
  const cl = b.client || {}, eq = b.equipement || {};
  const mClient = mesurerChamps([['', cl.nom, true], ['Adresse', cl.adresse], ['Sur place', cl.contact]], lc - 20);
  const mEquip = mesurerChamps([['Type', eq.type, true], ['Marque', eq.marque], ['Modèle', eq.modele], ['N° de série', eq.serie]], lc - 20);
  const hBloc = Math.max(...[mClient, mEquip].map((m) => m.reduce((t, c) => t + c.h, 0))) + 40;
  besoin(hBloc + 10);
  y -= 8;
  for (const [i, [nom, mes]] of [['Client', mClient], ['Équipement', mEquip]].entries()) {
    const x = M + i * (lc + GOUTTIERE);
    page.drawRectangle({ x, y: y - hBloc, width: lc, height: hBloc, borderColor: TRAIT, borderWidth: 0.8, color: FOND });
    ecrire(nom.toUpperCase(), x + 10, y - 17, gras, 9.5, ACCENT);
    dessinerChamps(mes, x + 10, y - 26);
  }
  y -= hBloc + 4;

  // ---------- Nature de l'opération ----------
  titre("Nature de l'opération", 16);
  paragraphe((b.natures || []).join(' · '), { police: gras });
  if (b.natureDetail) paragraphe(`Précisions : ${b.natureDetail}`);

  // ---------- Description ----------
  titre('Description des travaux réalisés');
  paragraphe(b.description || '—');

  // ---------- Pièces ----------
  const pieces = (b.pieces || []).filter((p) => p.designation);
  titre('Pièces remplacées', pieces.length ? 46 : 16);
  if (!pieces.length) {
    paragraphe('Aucune pièce remplacée.', { couleur: GRIS });
  } else {
    const prix = !!b.afficherPrix;
    const cols = prix
      ? [['Désignation', L - 100 - 36 - 72 - 76], ['Référence', 100], ['Qté', 36, 'd'], ['Prix unit.', 72, 'd'], ['Montant', 76, 'd']]
      : [['Désignation', L - 150 - 50], ['Référence', 150], ['Qté', 50, 'd']];
    const T = 9.2, LH = T * 1.35, PAD = 5;
    const entete = () => {
      page.drawRectangle({ x: M, y: y - 18, width: L, height: 18, color: FOND, borderColor: TRAIT, borderWidth: 0.6 });
      let x = M;
      for (const [nom, w, al] of cols) {
        if (al === 'd') ecrireDroite(nom, x + w - PAD, y - 12.5, gras, 8.8, NOIR); else ecrire(nom, x + PAD, y - 12.5, gras, 8.8, NOIR);
        x += w;
      }
      y -= 18;
    };
    entete();
    let total = 0, totalConnu = false;
    for (const p of pieces) {
      const pu = typeof p.prixUnitaire === 'number' && Number.isFinite(p.prixUnitaire) ? p.prixUnitaire : null;
      const montant = pu !== null ? pu * (p.quantite || 0) : null;
      if (montant !== null) { total += montant; totalConnu = true; }
      const cellules = [p.designation, p.reference || '—', String(p.quantite ?? ''), pu !== null ? euros(pu) : '—', montant !== null ? euros(montant) : '—'];
      const lignes = cols.map(([, w], i) => couper(cellules[i], normal, T, w - 2 * PAD));
      const h = Math.max(...lignes.map((l) => l.length)) * LH + 2 * PAD - 2;
      if (besoin(h)) entete();
      let x = M;
      cols.forEach(([, w, al], i) => {
        lignes[i].forEach((l, k) => {
          const yy = y - PAD - T + 1 - k * LH;
          if (al === 'd') ecrireDroite(l, x + w - PAD, yy, normal, T, NOIR); else ecrire(l, x + PAD, yy, normal, T, NOIR);
        });
        x += w;
      });
      y -= h;
      filet(y, TRAIT, 0.6);
    }
    if (prix && totalConnu) {
      besoin(22);
      y -= 15;
      ecrireDroite(`Total pièces : ${euros(total)}`, A4[0] - M - PAD, y, gras, 10, NOIR);
      y -= 6;
    }
  }

  // ---------- Temps passé ----------
  titre('Temps passé', 16);
  const t = b.temps || {};
  const morceaux = [];
  if (t.arrivee) morceaux.push(`Arrivée : ${t.arrivee}`);
  if (t.depart) morceaux.push(`Départ : ${t.depart}`);
  if (t.dureeMin >= 0) morceaux.push(`Durée : ${texteDuree(t.dureeMin)}`);
  paragraphe(morceaux.join('  ·  ') || '—', { police: gras });
  if (b.deplacement) paragraphe(`Déplacement : ${b.deplacement}`);

  // ---------- Observations ----------
  if (b.observations) {
    titre('Observations et suite à donner');
    paragraphe(b.observations);
  }

  // ---------- Photos (2 par ligne) ----------
  const photos = [];
  for (const ph of (b.photos || []).slice(0, 4)) {
    try { photos.push(await image(ph)); } catch { /* photo illisible ignorée */ }
  }
  if (photos.length) {
    const lp = (L - GOUTTIERE) / 2, hMax = 210;
    const tailles = photos.map((im) => { const k = Math.min(lp / im.width, hMax / im.height); return [im.width * k, im.height * k]; });
    for (let i = 0; i < photos.length; i += 2) {
      const hRang = Math.max(tailles[i][1], tailles[i + 1]?.[1] || 0);
      if (i === 0) titre(`Photos (${photos.length})`, hRang + 10); else besoin(hRang + 10);
      for (let j = 0; j < 2 && i + j < photos.length; j++) {
        const [w, h] = tailles[i + j];
        const x = M + j * (lp + GOUTTIERE) + (lp - w) / 2;
        page.drawImage(photos[i + j], { x, y: y - 4 - h, width: w, height: h });
        page.drawRectangle({ x, y: y - 4 - h, width: w, height: h, borderColor: TRAIT, borderWidth: 0.6 });
      }
      y -= hRang + 12;
    }
  }

  // ---------- Signatures ----------
  const hCase = 62;
  titre('Signatures', 34 + hCase);
  const ls = (L - GOUTTIERE) / 2;
  const signataires = [
    ['Le technicien', [b.technicien?.nom, b.technicien?.qualite].filter(Boolean).join(', '), b.signatureTechnicien],
    ['Le client', [b.signataireClient, b.qualiteClient].filter(Boolean).join(', '), b.signatureClient],
  ];
  for (const [i, [qui, nom, sig]] of signataires.entries()) {
    const x = M + i * (ls + GOUTTIERE);
    ecrire(qui, x, y - 10, gras, 9.5, NOIR);
    ecrire(couper(nom || '', normal, 9, ls)[0] || '', x, y - 23, normal, 9, NOIR);
    ecrire(`Le ${b.date}`, x, y - 35, normal, 9, GRIS);
    const caseSig = [x, y - 42 - hCase, x + ls, y - 42];
    page.drawRectangle({ x, y: caseSig[1], width: ls, height: hCase, borderColor: TRAIT, borderWidth: 0.8 });
    if (sig) await placerSignature(PDFLib, pdf, page, sig, caseSig, { epaisseur: 1.3, marge: 5 });
    else ecrire('Non signé', x + 8, caseSig[1] + hCase / 2 - 4, normal, 9, GRIS);
  }
  y -= 42 + hCase;

  // ---------- Pied de page ----------
  pages.forEach((p, i) => {
    page = p;
    filet(BAS - 14, TRAIT, 0.6);
    ecrire(`Bon d'intervention ${b.numero} — ${s.raisonSociale || ''}`, M, BAS - 27, normal, 8, GRIS);
    ecrireDroite(`Page ${i + 1} / ${pages.length}`, A4[0] - M, BAS - 27, normal, 8, GRIS);
  });

  pdf.setTitle(`Bon d'intervention ${b.numero}`);
  pdf.setCreator('FrigoFiche');
  return pdf.save();
}
