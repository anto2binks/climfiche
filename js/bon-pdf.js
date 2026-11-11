// FrigoFiche — génération du PDF « Bon d'intervention » (A4, pdf-lib, côté appareil).
// Bandeau de couleur, cartes arrondies, pagination automatique : aucun texte ne déborde.
import { placerSignature } from './cerfa.js';
import { texteDuree, euros } from './bon.js';

const A4 = [595.28, 841.89];
const M = 36;                       // marges gauche / droite
const BAS = 54;                     // zone réservée au pied de page
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

  const NOIR = rgb(0.11, 0.13, 0.17);
  const GRIS = rgb(0.4, 0.43, 0.48);
  const TRAIT = rgb(0.84, 0.87, 0.91);
  const FOND = rgb(0.96, 0.97, 0.985);
  const BLANC = rgb(1, 1, 1);
  const ACCENT = rgb(11 / 255, 79 / 255, 138 / 255);
  const ACCENT_FONCE = rgb(7 / 255, 52 / 255, 94 / 255);
  const ACCENT_CLAIR = rgb(0.9, 0.94, 0.985);
  const SUR_ACCENT = rgb(0.8, 0.88, 0.96);
  const JAUNE = rgb(1, 0.973, 0.878);
  const JAUNE_BORD = rgb(0.91, 0.73, 0.25);

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
  const largeur = (t, police, taille) => police.widthOfTextAtSize(propre(t), taille);

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

  // ---------- Dessin ----------
  let page, y;
  const pages = [];
  function ecrire(t, x, yy, police = normal, taille = 10, couleur = NOIR) {
    page.drawText(propre(t), { x, y: yy, size: taille, font: police, color: couleur });
  }
  function ecrireDroite(t, xDroite, yy, police, taille, couleur) {
    ecrire(t, xDroite - largeur(t, police, taille), yy, police, taille, couleur);
  }
  /** Rectangle aux coins arrondis ; (x, haut) = coin supérieur gauche. */
  function rond(x, haut, w, h, r, { color, borderColor, borderWidth } = {}) {
    r = Math.min(r, w / 2, h / 2);
    const chemin = `M${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${h - r} Q${w} ${h} ${w - r} ${h} H${r} Q0 ${h} 0 ${h - r} V${r} Q0 0 ${r} 0 Z`;
    page.drawSvgPath(chemin, { x, y: haut, color, borderColor, borderWidth: borderColor ? (borderWidth ?? 0.8) : 0 });
  }
  function filet(yy, couleur = TRAIT, epaisseur = 0.8, x1 = M, x2 = A4[0] - M) {
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: epaisseur, color: couleur });
  }

  function nouvellePage() {
    page = pdf.addPage(A4);
    pages.push(page);
    y = A4[1];
    if (pages.length > 1) {
      page.drawRectangle({ x: 0, y: A4[1] - 34, width: A4[0], height: 34, color: ACCENT });
      ecrire("BON D'INTERVENTION", M, A4[1] - 22, gras, 11, BLANC);
      ecrireDroite(`N° ${b.numero}  ·  suite`, A4[0] - M, A4[1] - 22, normal, 10, SUR_ACCENT);
      y = A4[1] - 34 - 18;
    }
  }
  /** Passe à la page suivante si `h` points ne tiennent plus. */
  function besoin(h) { if (y - h < BAS) { nouvellePage(); return true; } return false; }

  /** Titre de section, gardé sur la même page qu'au moins `suite` points de contenu. */
  function titre(t, suite = 30) {
    besoin(40 + suite);
    y -= 16;
    rond(M, y, 4, 15, 2, { color: ACCENT });
    ecrire(t, M + 12, y - 12, gras, 12.5, ACCENT_FONCE);
    y -= 22;
    filet(y, TRAIT, 0.8);
    y -= 10;
  }
  /** Paragraphe paginé ligne par ligne. */
  function paragraphe(texte, { police = normal, taille = 10.5, couleur = NOIR, x = M, max = L } = {}) {
    const lh = taille * 1.45;
    for (const ligne of couper(texte, police, taille, max)) {
      besoin(lh);
      if (ligne) ecrire(ligne, x, y - taille, police, taille, couleur);
      y -= lh;
    }
  }

  async function image(donnees) {
    if (!donnees) return null;
    const estPng = typeof donnees === 'string'
      ? donnees.startsWith('data:image/png')
      : donnees[0] === 0x89 && donnees[1] === 0x50;
    return estPng ? pdf.embedPng(donnees) : pdf.embedJpg(donnees);
  }

  nouvellePage();

  // ---------- Bandeau d'en-tête ----------
  const s = b.societe || {};
  const logo = await image(s.logo).catch(() => null);
  const HAUT = A4[1];
  const P = 24; // marge intérieure du bandeau
  const largeurDroite = 200;
  // Mesure du bloc société pour la hauteur du bandeau
  let xSoc = M, wLogo = 0, hLogo = 0;
  if (logo) {
    const k = Math.min(104 / logo.width, 60 / logo.height);
    wLogo = logo.width * k; hLogo = logo.height * k;
    xSoc = M + wLogo + 16 + 14;
  }
  const maxSoc = A4[0] - M - largeurDroite - 12 - xSoc;
  const lignesNom = couper(s.raisonSociale || '', gras, 16, maxSoc);
  const lignesCoord = couper([s.adresse, s.siret && `SIRET ${s.siret}`].filter(Boolean).join('\n'), normal, 9.5, maxSoc);
  const hSoc = lignesNom.length * 19 + 4 + lignesCoord.length * 12.5;
  const hBandeau = Math.max(hSoc, logo ? hLogo + 16 : 0, 70) + 2 * P;

  page.drawRectangle({ x: 0, y: HAUT - hBandeau, width: A4[0], height: hBandeau, color: ACCENT });
  page.drawRectangle({ x: 0, y: HAUT - hBandeau - 4, width: A4[0], height: 4, color: ACCENT_FONCE });
  if (logo) {
    const hCadre = hLogo + 16;
    const haut = HAUT - P - Math.max(0, (Math.max(hSoc, hCadre, 70) - hCadre) / 2);
    rond(M, haut, wLogo + 16, hCadre, 8, { color: BLANC });
    page.drawImage(logo, { x: M + 8, y: haut - 8 - hLogo, width: wLogo, height: hLogo });
  }
  let ys = HAUT - P - Math.max(0, (Math.max(hSoc, logo ? hLogo + 16 : 0, 70) - hSoc) / 2);
  for (const l of lignesNom) { ecrire(l, xSoc, ys - 15, gras, 16, BLANC); ys -= 19; }
  ys -= 4;
  for (const l of lignesCoord) { ecrire(l, xSoc, ys - 9.5, normal, 9.5, SUR_ACCENT); ys -= 12.5; }

  const xD = A4[0] - M;
  const yT = HAUT - P - Math.max(0, (hBandeau - 2 * P - 70) / 2);
  ecrireDroite("BON D'INTERVENTION", xD, yT - 17, gras, 19, BLANC);
  const txtNum = `N° ${b.numero}`;
  const wNum = largeur(txtNum, gras, 11.5) + 22;
  rond(xD - wNum, yT - 27, wNum, 22, 11, { color: BLANC });
  ecrire(txtNum, xD - wNum + 11, yT - 42.5, gras, 11.5, ACCENT);
  ecrireDroite(`Le ${b.date}`, xD, yT - 64, normal, 10.5, SUR_ACCENT);
  y = HAUT - hBandeau - 4 - 20;

  // ---------- Cartes « Client » et « Intervention » ----------
  const lc = (L - GOUTTIERE) / 2;
  const cl = b.client || {};
  const t = b.temps || {};
  const horaires = t.arrivee || t.depart ? `${t.arrivee || '?'} à ${t.depart || '?'}` : '';
  const carteClient = [
    ['', cl.nom || '—', gras, 12, NOIR],
    ['', cl.adresse, normal, 10, NOIR],
    ['Sur place', cl.contact, normal, 10, NOIR],
  ];
  const carteInter = [
    ['Technicien', [b.technicien?.nom, b.technicien?.qualite].filter(Boolean).join(', '), normal, 10, NOIR],
    ['Horaires', horaires, normal, 10, NOIR],
    ['Durée', t.dureeMin >= 0 ? texteDuree(t.dureeMin) : '', gras, 11, ACCENT_FONCE],
    ['Déplacement', b.deplacement, normal, 10, NOIR],
  ];
  const ETIQ = 64;
  const mesurer = (lignes) => lignes.filter(([, v]) => v).map(([lib, v, police, taille, couleur]) => {
    const max = lc - 28 - (lib ? ETIQ : 0);
    const l = couper(v, police, taille, max);
    return { lib, l, police, taille, couleur, h: l.length * taille * 1.38 + 3 };
  });
  const mC = mesurer(carteClient), mI = mesurer(carteInter);
  const hCarte = Math.max(...[mC, mI].map((m) => m.reduce((a, c) => a + c.h, 0))) + 44;
  besoin(hCarte);
  for (const [i, [nom, mes]] of [['CLIENT', mC], ['INTERVENTION', mI]].entries()) {
    const x = M + i * (lc + GOUTTIERE);
    rond(x, y, lc, hCarte, 10, { color: FOND, borderColor: TRAIT });
    rond(x + 14, y - 12, largeur(nom, gras, 8.5) + 16, 16, 8, { color: ACCENT_CLAIR });
    ecrire(nom, x + 22, y - 23.5, gras, 8.5, ACCENT);
    let yy = y - 38;
    for (const c of mes) {
      if (c.lib) ecrire(c.lib, x + 14, yy - c.taille, normal, 9, GRIS);
      c.l.forEach((l, k) => ecrire(l, x + 14 + (c.lib ? ETIQ : 0), yy - c.taille - k * c.taille * 1.38, c.police, c.taille, c.couleur));
      yy -= c.h;
    }
  }
  y -= hCarte;

  // ---------- Nature de l'opération (pastilles) ----------
  const natures = (b.natures || []).filter(Boolean);
  if (natures.length || b.natureDetail) {
    titre("Nature de l'opération", 24);
    if (natures.length) {
      let x = M;
      const HP = 22;
      besoin(HP + 6);
      for (const n of natures) {
        const w = largeur(n, gras, 10) + 24;
        if (x + w > A4[0] - M) { x = M; y -= HP + 6; besoin(HP + 6); }
        rond(x, y, w, HP, 11, { color: ACCENT_CLAIR, borderColor: SUR_ACCENT, borderWidth: 0.6 });
        ecrire(n, x + 12, y - 15, gras, 10, ACCENT_FONCE);
        x += w + 7;
      }
      y -= HP + 8;
    }
    if (b.natureDetail) paragraphe(b.natureDetail, { couleur: NOIR });
  }

  // ---------- Description ----------
  titre('Travaux réalisés');
  paragraphe(b.description || '—');

  // ---------- Pièces ----------
  const pieces = (b.pieces || []).filter((p) => p.designation);
  if (pieces.length) {
    titre('Pièces remplacées', 52);
    const prix = !!b.afficherPrix;
    const cols = prix
      ? [['Désignation', L - 100 - 38 - 74 - 80], ['Référence', 100], ['Qté', 38, 'd'], ['Prix unit.', 74, 'd'], ['Montant', 80, 'd']]
      : [['Désignation', L - 150 - 54], ['Référence', 150], ['Qté', 54, 'd']];
    const T = 9.8, LH = T * 1.35, PAD = 7;
    const entete = () => {
      rond(M, y, L, 22, 6, { color: ACCENT });
      let x = M;
      for (const [nom, w, al] of cols) {
        if (al === 'd') ecrireDroite(nom, x + w - PAD, y - 15, gras, 9.2, BLANC); else ecrire(nom, x + PAD, y - 15, gras, 9.2, BLANC);
        x += w;
      }
      y -= 24;
    };
    entete();
    let total = 0, totalConnu = false;
    pieces.forEach((p, n) => {
      const pu = typeof p.prixUnitaire === 'number' && Number.isFinite(p.prixUnitaire) ? p.prixUnitaire : null;
      const montant = pu !== null ? pu * (p.quantite || 0) : null;
      if (montant !== null) { total += montant; totalConnu = true; }
      const cellules = [p.designation, p.reference || '—', String(p.quantite ?? '').replace('.', ','), pu !== null ? euros(pu) : '—', montant !== null ? euros(montant) : '—'];
      const lignes = cols.map(([, w], i) => couper(cellules[i], i === 0 ? gras : normal, T, w - 2 * PAD));
      const h = Math.max(...lignes.map((l) => l.length)) * LH + 2 * PAD - 2;
      if (besoin(h)) entete();
      if (n % 2) page.drawRectangle({ x: M, y: y - h, width: L, height: h, color: FOND });
      let x = M;
      cols.forEach(([, w, al], i) => {
        lignes[i].forEach((l, k) => {
          const yy = y - PAD - T + 1 - k * LH;
          const police = i === 0 ? gras : normal;
          if (al === 'd') ecrireDroite(l, x + w - PAD, yy, police, T, NOIR); else ecrire(l, x + PAD, yy, police, T, NOIR);
        });
        x += w;
      });
      y -= h;
      filet(y, TRAIT, 0.6);
    });
    if (prix && totalConnu) {
      besoin(34);
      y -= 8;
      const txt = `Total pièces : ${euros(total)}`;
      const w = largeur(txt, gras, 11) + 26;
      rond(A4[0] - M - w, y, w, 24, 12, { color: ACCENT });
      ecrire(txt, A4[0] - M - w + 13, y - 16, gras, 11, BLANC);
      y -= 28;
    }
  }

  // ---------- Observations (encadré) ----------
  if (b.observations) {
    const T = 10.5, LH = T * 1.45;
    const lignes = couper(b.observations, normal, T, L - 36);
    const hEncadre = lignes.length * LH + 22;
    titre('Observations et suite à donner', Math.min(hEncadre, 120));
    if (hEncadre <= A4[1] - BAS - 80) {
      besoin(hEncadre);
      rond(M, y, L, hEncadre, 10, { color: JAUNE, borderColor: JAUNE_BORD, borderWidth: 0.8 });
      page.drawRectangle({ x: M, y: y - hEncadre + 8, width: 4, height: hEncadre - 16, color: JAUNE_BORD });
      lignes.forEach((l, k) => { if (l) ecrire(l, M + 18, y - 11 - T - k * LH + 2, normal, T, NOIR); });
      y -= hEncadre;
    } else {
      paragraphe(b.observations);
    }
  }

  // ---------- Photos (2 par ligne) ----------
  const photos = [];
  for (const ph of (b.photos || []).slice(0, 4)) {
    try { photos.push(await image(ph)); } catch { /* photo illisible ignorée */ }
  }
  if (photos.length) {
    const lp = (L - GOUTTIERE) / 2, hMax = 200;
    const tailles = photos.map((im) => { const k = Math.min((lp - 12) / im.width, hMax / im.height); return [im.width * k, im.height * k]; });
    for (let i = 0; i < photos.length; i += 2) {
      const hRang = Math.max(tailles[i][1], tailles[i + 1]?.[1] || 0) + 12;
      if (i === 0) titre(`Photos (${photos.length})`, hRang + 10); else besoin(hRang + 10);
      for (let j = 0; j < 2 && i + j < photos.length; j++) {
        const [w, h] = tailles[i + j];
        const x = M + j * (lp + GOUTTIERE);
        rond(x, y, lp, hRang, 10, { color: FOND, borderColor: TRAIT });
        page.drawImage(photos[i + j], { x: x + (lp - w) / 2, y: y - 6 - h - (hRang - 12 - h) / 2, width: w, height: h });
      }
      y -= hRang + 10;
    }
  }

  // ---------- Signatures ----------
  const hCase = 78;
  const hSig = hCase + 58;
  titre('Signatures', hSig);
  const ls = (L - GOUTTIERE) / 2;
  const signataires = [
    ['LE TECHNICIEN', [b.technicien?.nom, b.technicien?.qualite].filter(Boolean).join(', '), b.signatureTechnicien],
    ['LE CLIENT', [b.signataireClient, b.qualiteClient].filter(Boolean).join(', '), b.signatureClient],
  ];
  for (const [i, [qui, nom, sig]] of signataires.entries()) {
    const x = M + i * (ls + GOUTTIERE);
    rond(x, y, ls, hSig, 10, { color: FOND, borderColor: TRAIT });
    ecrire(qui, x + 14, y - 20, gras, 8.5, ACCENT);
    ecrire(couper(nom || '—', gras, 10.5, ls - 28)[0] || '', x + 14, y - 35, gras, 10.5, NOIR);
    ecrireDroite(`Le ${b.date}`, x + ls - 14, y - 20, normal, 8.5, GRIS);
    const haut = y - 46;
    rond(x + 10, haut, ls - 20, hCase, 7, { color: BLANC, borderColor: TRAIT, borderWidth: 0.6 });
    const caseSig = [x + 10, haut - hCase, x + ls - 10, haut];
    if (sig) await placerSignature(PDFLib, pdf, page, sig, caseSig, { epaisseur: 1.4, marge: 7 });
    else ecrire('Non signé', x + ls / 2 - largeur('Non signé', normal, 9.5) / 2, haut - hCase / 2 - 4, normal, 9.5, GRIS);
  }
  y -= hSig;

  // ---------- Pied de page ----------
  pages.forEach((p, i) => {
    page = p;
    filet(BAS - 16, TRAIT, 0.6);
    const pied = [s.raisonSociale, s.siret && `SIRET ${s.siret}`].filter(Boolean).join('  ·  ');
    ecrire(pied, M, BAS - 30, normal, 8, GRIS);
    ecrireDroite(`Bon N° ${b.numero}  ·  Page ${i + 1} / ${pages.length}`, A4[0] - M, BAS - 30, normal, 8, GRIS);
  });

  pdf.setTitle(`Bon d'intervention ${b.numero}`);
  pdf.setCreator('FrigoFiche');
  return pdf.save();
}
