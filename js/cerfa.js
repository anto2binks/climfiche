// FrigoFiche — règles métier et remplissage du Cerfa 15497*04.
// Module partagé entre l'application (navigateur) et le script de test (Node).

export const FLUIDES = {
  'R-410A':   { type: 'HFC',  prp: 2088 },
  'R-32':     { type: 'HFC',  prp: 675 },
  'R-134a':   { type: 'HFC',  prp: 1430 },
  'R-407C':   { type: 'HFC',  prp: 1774 },
  'R-404A':   { type: 'HFC',  prp: 3922 },
  'R-1234yf': { type: 'HFO',  prp: 0.5 },
  'R-22':     { type: 'HCFC', prp: 1810 },
};

export const NATURES = {
  mise_en_service: 'Mise en service',
  maintenance: 'Maintenance',
  controle: "Contrôle d'étanchéité",
  reparation: 'Réparation',
  assemblage: 'Assemblage',
  modification: 'Modification',
  demantelement: 'Démantèlement',
};

/** Natures sélectionnées (tableau ; accepte aussi l'ancienne forme « nature » unique). */
export function naturesDe(d) {
  if (Array.isArray(d.natures)) return d.natures;
  return d.nature ? [d.nature] : [];
}

/** Vrai si l'intervention est uniquement un contrôle d'étanchéité (aucun fluide manipulé). */
export function sansManipulation(natures) {
  return natures.length > 0 && natures.every((n) => n === 'controle');
}

/** Vrai si un contrôle d'étanchéité fait partie de l'intervention. */
export function avecControle(natures) {
  return natures.includes('controle');
}

// Zones de signature [x1, y1, x2, y2] en points PDF : partie droite des cases
// « Date et signature » (Opérateur [127,45,337,63], Détenteur [345,44,554,63]),
// la date étant écrite à gauche. Les deux zones ont la même taille (157 × 18 pt).
export const CASE_SIGNATURE_OPERATEUR = [180, 45, 337, 63];
export const CASE_SIGNATURE_DETENTEUR = [397, 44.5, 554, 62.5];
const SIGNATURE_EPAISSEUR = 0.9; // pt, identique pour les deux signatures
const SIGNATURE_MARGE = 1.5;     // pt, autour du tracé
const SIGNATURE_COULEUR = [10 / 255, 42 / 255, 107 / 255];

/** Rectangle englobant le tracé (coordonnées du canevas). */
export function cadreTrace(traits) {
  const pts = traits.flat();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x0, y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

/**
 * Dessine une signature dans une case du PDF.
 * sig = { traits: [[[x, y], …], …] } (tracé du canevas) ; une image PNG reste acceptée.
 */
export async function placerSignature(PDFLib, pdf, page, sig, [x1, y1, x2, y2], options = {}) {
  if (!sig) return;
  const EP = options.epaisseur ?? SIGNATURE_EPAISSEUR;
  const MARGE = options.marge ?? SIGNATURE_MARGE;
  const { rgb, LineCapStyle, LineJoinStyle, pushGraphicsState, popGraphicsState, setLineJoin } = PDFLib;
  const bw = x2 - x1, bh = y2 - y1;

  if (!sig.traits) { // image PNG : ajustée et centrée dans la case
    const img = await pdf.embedPng(sig);
    const k = Math.min((bw - 2 * MARGE) / img.width, (bh - 2 * MARGE) / img.height);
    const w = img.width * k, h = img.height * k;
    page.drawImage(img, { x: x1 + (bw - w) / 2, y: y1 + (bh - h) / 2, width: w, height: h });
    return;
  }

  const traits = sig.traits.filter((t) => t.length);
  if (!traits.length) return;
  // 1. Recadrage sur le tracé
  const { x0, y0, w, h } = cadreTrace(traits);
  // 2. Échelle pour remplir la case (marge + demi-épaisseur du trait de chaque côté)
  const iw = bw - 2 * MARGE - EP;
  const ih = bh - 2 * MARGE - EP;
  const s = Math.min(iw / Math.max(w, 1), ih / Math.max(h, 1));
  const dw = w * s, dh = h * s;
  // 3. Chemin vectoriel, origine au coin haut-gauche du tracé
  const f = (n) => Number(n.toFixed(2));
  const chemin = traits.map((t) => (t.length === 1
    ? `M${f(t[0][0] - x0)} ${f(t[0][1] - y0)} l0.01 0`
    : t.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x - x0)} ${f(y - y0)}`).join(' '))).join(' ');
  // 4. Centré dans la case ; l'épaisseur est divisée par l'échelle pour rester fixe dans le PDF
  page.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round));
  page.drawSvgPath(chemin, {
    x: x1 + (bw - dw) / 2,
    y: y1 + (bh + dh) / 2,
    scale: s,
    borderColor: rgb(...SIGNATURE_COULEUR),
    borderWidth: EP / s,
    borderLineCap: LineCapStyle.Round,
  });
  page.pushOperators(popGraphicsState());
}

/** Charge en tonnes équivalent CO2. */
export function calcTeq(fluide, chargeKg) {
  const f = FLUIDES[fluide];
  if (!f || !(chargeKg > 0)) return 0;
  return (chargeKg * f.prp) / 1000;
}

/** Signature du détenteur obligatoire ? (< 3 kg HCFC ou < 5 t éq. CO2 : facultative) */
export function signatureDetenteurObligatoire(fluide, chargeKg) {
  const f = FLUIDES[fluide];
  if (!f) return true;
  if (f.type === 'HCFC') return chargeKg >= 3;
  return calcTeq(fluide, chargeKg) >= 5;
}

/** Seuil de quantité (cadre [7]) : 0 = sous le seuil, 1, 2 ou 3 = colonne. */
export function seuilQuantite(fluide, chargeKg) {
  const f = FLUIDES[fluide];
  if (!f) return 0;
  const v = f.type === 'HFC' ? calcTeq(fluide, chargeKg) : chargeKg;
  const bornes = { HCFC: [2, 30, 300], HFC: [5, 50, 500], HFO: [1, 10, 100] }[f.type];
  if (v >= bornes[2]) return 3;
  if (v >= bornes[1]) return 2;
  if (v >= bornes[0]) return 1;
  return 0;
}

/** Fréquence minimale du contrôle périodique, en texte (ou null). */
export function frequenceControle(fluide, chargeKg, detection) {
  const col = seuilQuantite(fluide, chargeKg);
  if (!col) return null;
  const type = FLUIDES[fluide].type;
  if (detection && type !== 'HCFC') return ['24 mois', '12 mois', '6 mois'][col - 1];
  if (!detection) return ['12 mois', '6 mois', '3 mois'][col - 1];
  return null;
}

/** Nombre au format français : 2,5 → "2,50" */
export function fr(n, dec = 2) {
  if (n === null || n === undefined || n === '' || Number.isNaN(n)) return '';
  return Number(n).toLocaleString('fr-FR', {
    minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: false,
  });
}

/**
 * Remplit le Cerfa officiel.
 * @param {object} PDFLib  la bibliothèque pdf-lib (window.PDFLib ou import Node)
 * @param {Uint8Array|ArrayBuffer} modele  octets du PDF officiel vierge
 * @param {object} d  données du questionnaire
 * @returns {Promise<Uint8Array>}
 */
export async function remplirCerfa(PDFLib, modele, d) {
  const { PDFDocument, StandardFonts } = PDFLib;
  const pdf = await PDFDocument.load(modele);
  const form = pdf.getForm();
  const police = await pdf.embedFont(StandardFonts.Helvetica);

  const texte = (nom, valeur, taille) => {
    if (valeur === undefined || valeur === null || valeur === '') return;
    const champ = form.getTextField(nom);
    if (taille) champ.setFontSize(taille);
    champ.setText(String(valeur));
  };
  const cocher = (nom) => form.getCheckBox(nom).check();

  const f = FLUIDES[d.fluide];
  const natures = naturesDe(d);
  const controle = sansManipulation(natures);
  const teq = calcTeq(d.fluide, d.charge);

  // En-tête
  texte('Fiche_no', d.ficheNo, 9);
  const lignesOp = [d.raisonSociale, d.adresseOperateur, d.siret && `SIRET : ${d.siret}`]
    .filter(Boolean).join('\n');
  texte('Operateur', lignesOp, lignesOp.split('\n').length > 4 ? 6.5 : 8);
  texte('Attestation_no', d.attestation, 8);
  texte('Detenteur', [d.detenteur, d.adresse].filter(Boolean).join('\n'), 8);

  // [3] Équipement
  texte('Equipement_ID', [d.reference && `Réf. : ${d.reference}`, d.serie && `N° de série : ${d.serie}`]
    .filter(Boolean).join('\n'), 8);
  texte('Equipement_Fluide', d.fluide.replace(/^R-/, ''), 7);       // « R- » déjà imprimé
  texte('Equipement_Charge', fr(d.charge), 7);
  if (f.type !== 'HCFC') texte('Equipement_teqCO2', fr(teq), 7);

  // [4] Nature de l'intervention
  const casesNature = {
    assemblage: 'Case_Assemblage',
    mise_en_service: 'Case_MiseService',
    modification: 'Case_Modif',
    maintenance: 'Case_Maintenance',
    controle: d.controlePeriodique === false ? 'Case_CtrlNonPerio' : 'Case_CtrlPerio',
    demantelement: 'Case_Demantel',
    reparation: 'Case_Autre',
  };
  for (const n of natures) if (casesNature[n]) cocher(casesNature[n]);
  if (natures.includes('reparation')) texte('Autre', 'Réparation', 6);

  // [5] Détecteur manuel de fuite et date du contrôle (si contrôle d'étanchéité)
  if (avecControle(natures)) {
    texte('Detecteur_ID', d.detecteurId, 8);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.dateControle || '');
    if (m) {
      texte('Controle_Jour', m[3], 7);
      texte('Controle_Mois', m[2], 7);
      texte('Controle_Annee', m[1], 7);
    }
  }

  // [6] Système permanent de détection de fuites (boutons radio OUI = 1, NON = 2)
  form.getRadioGroup('Bouton_Oui').select(d.detection ? '1' : '2');

  // [7] Quantité de fluide / [8]-[9] fréquence du contrôle
  // Sous les seuils : aucune case, sauf si le réglage « Cocher la première case de [7] » est activé.
  const col = seuilQuantite(d.fluide, d.charge);
  const prefixe = { HCFC: 'Case_HCFC_', HFC: 'Case_HFC_', HFO: 'Case_HFO_' }[f.type];
  const suffixes = { HCFC: ['2', '30', '300'], HFC: ['5', '50', '500'], HFO: ['1', '10', '100'] }[f.type];
  if (!col && d.premiereCase7) cocher(prefixe + suffixes[0]);
  if (col) {
    cocher(prefixe + suffixes[col - 1]);
    if (!d.detection) cocher(['Case_Sans_12m', 'Case_Sans_6m', 'Case_Sans_3m'][col - 1]);
    else if (f.type !== 'HCFC') cocher(['Case_Avec_24m', 'Case_Avec_12m', 'Case_Avec_6m'][col - 1]);
  }

  // [10] Fuites constatées
  cocher(d.fuite ? 'Case_Fuite_Oui' : 'Case_Fuite_Non');
  if (d.fuite) {
    const fuites = (d.fuites || []).filter((x) => x && (x.localisation || x.reparation)).slice(0, 3);
    fuites.forEach((x, i) => {
      const n = i + 1;
      texte(`Fuite_Loca_${n}`, x.localisation, 8);
      if (x.reparation === 'realisee') cocher(`Case_Rep_Fuite${n}_realisee`);
      if (x.reparation === 'afaire') cocher(`Case_Rep_Fuite${n}_AFaire`);
    });
  }

  // [11] Manipulation du fluide (rien pour un simple contrôle d'étanchéité)
  if (!controle) {
    const chargee = d.qteChargee || 0;
    const recyclee = d.qteRecyclee || 0;
    texte('11_Quantite', fr(chargee), 7);
    texte('11_QA', fr(Math.max(0, chargee - recyclee)), 7);    // A - fluide vierge
    texte('11_QB', fr(recyclee), 7);                            // B - fluide recyclé
    texte('11_QC', fr(0), 7);                                   // C - fluide régénéré
    texte('11_QDE', fr(d.qteRecuperee || 0), 7);                // récupéré total
  }

  // [14] Observations
  texte('14_Observations', d.observations, 8);

  // Signatures
  texte('Sign_Operateur_Nom', d.technicien, 8);
  texte('Sign_Operateur_Qualite', d.qualiteTechnicien, 8);
  texte('Sign_Operateur_Date', d.date, 8);
  texte('Sign_Detenteur_Nom', d.signataireClient, 8);
  texte('Sign_Detenteur_Qualite', d.qualiteClient, 8);
  if (d.signatureClient) texte('Sign_Detenteur_Date', d.date, 8);

  // Certains flux d'apparence du modèle n'indiquent pas /Subtype /Form :
  // on le complète pour que l'aplatissement soit lu correctement par tous les lecteurs.
  const { PDFName, PDFStream } = PDFLib;
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFStream && obj.dict.has(PDFName.of('BBox')) && !obj.dict.has(PDFName.of('Subtype'))) {
      obj.dict.set(PDFName.of('Type'), PDFName.of('XObject'));
      obj.dict.set(PDFName.of('Subtype'), PDFName.of('Form'));
    }
  }

  // Apparences puis aplatissement : le PDF s'affiche partout à l'identique.
  form.updateFieldAppearances(police);
  form.flatten();

  // Retire de la page les références d'annotations devenues orphelines après l'aplatissement.
  const page = pdf.getPages()[0];
  const annots = page.node.Annots();
  if (annots) {
    const restantes = annots.asArray().filter((ref) => pdf.context.lookup(ref));
    if (restantes.length) page.node.set(PDFName.of('Annots'), pdf.context.obj(restantes));
    else page.node.delete(PDFName.of('Annots'));
  }

  // Signatures, à droite de la date, dans la case « Date et signature ».
  // Le tracé est recadré sur l'encre (aucune marge vide), agrandi pour remplir la case
  // en gardant ses proportions, centré, avec une petite marge. Il est dessiné en vectoriel
  // avec une épaisseur fixe : les deux signatures ont donc exactement le même trait.
  await placerSignature(PDFLib, pdf, page, d.signatureTechnicien, CASE_SIGNATURE_OPERATEUR);
  await placerSignature(PDFLib, pdf, page, d.signatureClient, CASE_SIGNATURE_DETENTEUR);

  pdf.setTitle(`Fiche d'intervention ${d.ficheNo || ''}`.trim());
  pdf.setCreator('FrigoFiche');
  return pdf.save({ useObjectStreams: false });
}
