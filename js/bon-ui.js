// FrigoFiche — écrans du « Bon d'intervention ». Indépendant de la fiche Cerfa.
import {
  TYPES_EQUIPEMENT, NATURES_BON, MARQUES, dureeEntre, texteDuree, euros,
  prochainNumeroBon, memoriserNumeroBon, lireClients, enregistrerClient, supprimerClient, filtrerClients,
} from './bon.js';
import { genererBon } from './bon-pdf.js';
import { ajouterFiche, nouvelId } from './historique.js';
import { PaveSignature } from './signature.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const champ = (nom) => document.querySelector(`[name="${nom}"]`);
const val = (nom) => champ(nom).value.trim();
const radio = (nom) => document.querySelector(`[name="${nom}"]:checked`)?.value ?? '';
const coches = (nom) => $$(`[name="${nom}"]:checked`).map((el) => el.value);
const nombre = (v) => { const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.'); return s === '' ? NaN : Number(s); };

export const ETAPES_BON = 9;
const TITRES = ['Client', 'Équipement', "Nature de l'opération", 'Travaux réalisés', 'Pièces remplacées', 'Temps passé', 'Observations', 'Photos', 'Signatures'];
const MAX_PHOTOS = 4;

/**
 * @param {object} ctx { allerA(ecran), profil(), nomComplet(p), partagerOuTelecharger(file, texte), telecharger(file, url) }
 */
export function initBon(ctx) {
  let numero = '';
  let date = '';
  let pieces = [];
  let photos = [];          // dataURL JPEG réduites
  let clients = [];
  let enCours = null;       // dernier écran atteint du bon en cours
  let genere = null;        // { file, url, b }
  let numeroMemorise = false;
  let idHistorique = null;  // identifiant du bon en cours dans « Mes fiches »

  // ---------- Choix ----------
  const creer = (conteneur, nom, valeurs, type) => {
    conteneur.innerHTML = '';
    for (const [v, lib] of valeurs) {
      const l = document.createElement('label');
      l.className = 'option';
      l.innerHTML = `<input type="${type}" name="${nom}"><span></span>`;
      l.querySelector('input').value = v;
      l.querySelector('span').textContent = lib;
      conteneur.append(l);
    }
  };
  creer($('#choix-type-equipement'), 'b_type', TYPES_EQUIPEMENT.map((t) => [t, t]), 'radio');
  creer($('#choix-nature-bon'), 'b_nature', Object.entries(NATURES_BON), 'checkbox');
  $('#liste-marques').innerHTML = MARQUES.map((m) => `<option value="${m}">`).join('');

  const pads = { tech: new PaveSignature($('#sig-bon-tech')), client: new PaveSignature($('#sig-bon-client')) };
  $$('[data-effacer-bon]').forEach((b) => b.addEventListener('click', () => pads[b.dataset.effacerBon].effacer()));

  // ---------- Clients enregistrés ----------
  async function majSuggestions() {
    const zone = $('#suggestions-clients');
    const saisie = val('b_client');
    const liste = filtrerClients(clients, saisie).filter((c) => c.nom.toLowerCase() !== saisie.toLowerCase());
    zone.innerHTML = '';
    if (!liste.length) return;
    const titre = document.createElement('p');
    titre.className = 'aide petit';
    titre.textContent = saisie ? 'Clients déjà enregistrés :' : 'Derniers clients :';
    zone.append(titre);
    for (const c of liste) {
      const ligne = document.createElement('div');
      ligne.className = 'suggestion';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bouton suggestion-choix';
      b.innerHTML = '<strong></strong><small></small>';
      b.querySelector('strong').textContent = c.nom;
      b.querySelector('small').textContent = c.adresse.replace(/\n/g, ', ');
      b.addEventListener('click', () => {
        champ('b_client').value = c.nom;
        champ('b_adresse').value = c.adresse;
        champ('b_contact').value = c.contact || '';
        zone.innerHTML = '';
        effacerErreurs();
      });
      const sup = document.createElement('button');
      sup.type = 'button';
      sup.className = 'suggestion-supprimer';
      sup.setAttribute('aria-label', `Oublier ${c.nom}`);
      sup.textContent = '✕';
      sup.addEventListener('click', async () => {
        if (!confirm(`Retirer « ${c.nom} » des clients enregistrés ?`)) return;
        await supprimerClient(c.nom);
        clients = await lireClients();
        majSuggestions();
      });
      ligne.append(b, sup);
      zone.append(ligne);
    }
  }
  champ('b_client').addEventListener('input', majSuggestions);

  // ---------- Équipement / nature ----------
  document.addEventListener('change', (e) => {
    if (e.target.name === 'b_type') $('#bloc-type-autre').hidden = e.target.value !== 'Autre';
    if (e.target.name === 'b_nature') $('#mention-preciser').textContent = coches('b_nature').includes('autre') ? 'obligatoire pour « Autre »' : 'facultatif';
    if (e.target.name === 'b_modeTemps') majTemps();
    if (e.target.name === 'b_afficherPrix') rendrePieces();
  });

  // ---------- Pièces ----------
  const nouvellePiece = () => ({ designation: '', reference: '', quantite: '1', prix: '' });
  function rendrePieces() {
    const zone = $('#liste-pieces');
    const prix = champ('b_afficherPrix').checked;
    zone.innerHTML = '';
    pieces.forEach((p, i) => {
      const bloc = document.createElement('div');
      bloc.className = 'piece';
      bloc.innerHTML = `
        <div class="piece-entete"><strong>Pièce ${i + 1}</strong>
          <button type="button" class="lien" data-suppr="${i}">Supprimer</button></div>
        <label>Désignation<input data-i="${i}" data-c="designation" autocapitalize="sentences"></label>
        <label>Référence <span class="facultatif">facultatif</span><input data-i="${i}" data-c="reference" autocapitalize="characters"></label>
        <div class="duo-champs">
          <label>Quantité<input data-i="${i}" data-c="quantite" inputmode="decimal"></label>
          <label>Prix unitaire <span class="facultatif">€, facultatif</span><input data-i="${i}" data-c="prix" inputmode="decimal"></label>
        </div>`;
      for (const inp of $$('input', bloc)) inp.value = p[inp.dataset.c];
      zone.append(bloc);
    });
    majTotal(prix);
  }
  function majTotal(prix = champ('b_afficherPrix').checked) {
    const montants = pieces.map((p) => nombre(p.prix) * (nombre(p.quantite) || 0)).filter(Number.isFinite);
    $('#total-pieces').textContent = prix && montants.length
      ? `Total pièces : ${euros(montants.reduce((a, b) => a + b, 0))}`
      : (!prix && pieces.some((p) => p.prix) ? 'Les prix saisis ne seront pas affichés sur le bon.' : '');
  }
  $('#liste-pieces').addEventListener('input', (e) => {
    const { i, c } = e.target.dataset;
    if (i === undefined) return;
    pieces[Number(i)][c] = e.target.value;
    e.target.classList.remove('invalide');
    majTotal();
  });
  $('#liste-pieces').addEventListener('click', (e) => {
    const i = e.target.dataset.suppr;
    if (i === undefined) return;
    pieces.splice(Number(i), 1);
    rendrePieces();
  });
  $('#btn-ajout-piece').addEventListener('click', () => {
    pieces.push(nouvellePiece());
    rendrePieces();
    $$('#liste-pieces [data-c="designation"]').at(-1)?.focus();
  });

  // ---------- Temps ----------
  function dureeMinutes() {
    if (radio('b_modeTemps') === 'duree') {
      const h = nombre(val('b_dureeH')) || 0, m = nombre(val('b_dureeM')) || 0;
      return val('b_dureeH') || val('b_dureeM') ? h * 60 + m : NaN;
    }
    return dureeEntre(val('b_arrivee'), val('b_depart'));
  }
  function majTemps() {
    const heures = radio('b_modeTemps') !== 'duree';
    $('#bloc-heures').hidden = !heures;
    $('#bloc-duree').hidden = heures;
    const d = dureeMinutes();
    const p = $('#duree-calculee');
    p.hidden = !(d >= 0) || (heures && !(val('b_arrivee') && val('b_depart')));
    p.textContent = `⏱️ Durée : ${texteDuree(d)}`;
  }
  ['b_arrivee', 'b_depart', 'b_dureeH', 'b_dureeM'].forEach((n) => champ(n).addEventListener('input', majTemps));

  // ---------- Photos ----------
  async function reduire(fichier, max = 1600, qualite = 0.8) {
    const url = URL.createObjectURL(fichier);
    try {
      const img = new Image();
      img.src = url;
      await img.decode(); // l'orientation EXIF est appliquée par le navigateur
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', qualite);
    } finally { URL.revokeObjectURL(url); }
  }
  function rendrePhotos() {
    const g = $('#grille-photos');
    g.innerHTML = '';
    photos.forEach((p, i) => {
      const f = document.createElement('figure');
      f.innerHTML = `<img alt="Photo ${i + 1}"><button type="button" class="photo-suppr" aria-label="Retirer la photo ${i + 1}">✕</button>`;
      f.querySelector('img').src = p;
      f.querySelector('button').addEventListener('click', () => { photos.splice(i, 1); rendrePhotos(); });
      g.append(f);
    });
    $('#btn-ajout-photo').hidden = photos.length >= MAX_PHOTOS;
    $('#compteur-photos').textContent = `${photos.length} / ${MAX_PHOTOS} photo${photos.length > 1 ? 's' : ''}`;
  }
  $('#btn-ajout-photo').addEventListener('click', () => { $('#fichier-photo').value = ''; $('#fichier-photo').click(); });
  $('#fichier-photo').addEventListener('change', async (e) => {
    const fichiers = [...(e.target.files || [])].slice(0, MAX_PHOTOS - photos.length);
    $('#compteur-photos').textContent = 'Réduction des photos…';
    for (const f of fichiers) {
      try { photos.push(await reduire(f)); } catch { alert(`Photo illisible : ${f.name}`); }
    }
    rendrePhotos();
  });

  // ---------- Validation ----------
  function effacerErreurs() {
    $$('.invalide').forEach((el) => el.classList.remove('invalide'));
    $('#erreur').hidden = true;
  }
  function signaler(fautes) {
    effacerErreurs();
    if (!fautes.length) return true;
    fautes.forEach(([el]) => el?.classList.add('invalide'));
    $('#erreur').textContent = fautes.map((f) => f[1]).join(' ');
    $('#erreur').hidden = false;
    fautes[0][0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  function valider(n) {
    const f = [];
    const requis = (nom, msg) => { if (!val(nom)) f.push([champ(nom), msg]); };
    if (n === 1) { requis('b_client', 'Indique le nom du client.'); requis('b_adresse', "Indique l'adresse d'intervention."); }
    if (n === 2) {
      if (!radio('b_type')) f.push([champ('b_type').closest('fieldset'), "Choisis le type d'équipement."]);
      if (radio('b_type') === 'Autre') requis('b_typeAutre', "Précise le type d'équipement.");
      requis('b_marque', 'Indique la marque.');
      requis('b_modele', 'Indique le modèle.');
    }
    if (n === 3) {
      if (!coches('b_nature').length) f.push([champ('b_nature').closest('fieldset'), "Choisis au moins une nature d'opération."]);
      if (coches('b_nature').includes('autre')) requis('b_natureDetail', 'Précise la nature « Autre ».');
    }
    if (n === 4) requis('b_description', 'Décris les travaux réalisés.');
    if (n === 5) {
      pieces.forEach((p, i) => {
        const vide = !p.designation.trim() && !p.reference.trim() && !p.prix.trim();
        if (vide) return;
        const inp = (c) => $(`#liste-pieces [data-i="${i}"][data-c="${c}"]`);
        if (!p.designation.trim()) f.push([inp('designation'), `Pièce ${i + 1} : indique la désignation.`]);
        if (!(nombre(p.quantite) > 0)) f.push([inp('quantite'), `Pièce ${i + 1} : quantité invalide.`]);
        if (p.prix.trim() && !(nombre(p.prix) >= 0)) f.push([inp('prix'), `Pièce ${i + 1} : prix invalide (ex. 12,50).`]);
      });
    }
    if (n === 6) {
      if (radio('b_modeTemps') === 'duree') {
        if (!(dureeMinutes() > 0)) f.push([champ('b_dureeH'), 'Indique la durée.']);
      } else {
        requis('b_arrivee', "Indique l'heure d'arrivée.");
        requis('b_depart', "Indique l'heure de départ.");
      }
    }
    if (n === 9) {
      requis('b_techNom', 'Indique le nom du technicien.');
      if (pads.tech.vide) f.push([$('#sig-bon-tech'), 'La signature du technicien est requise.']);
      if (!pads.client.vide) requis('b_signataire', 'Indique le nom du signataire client.');
    }
    return signaler(f);
  }

  // ---------- Données du bon ----------
  function donnees() {
    const p = ctx.profil() || {};
    const natures = coches('b_nature').map((n) => NATURES_BON[n]);
    const mode = radio('b_modeTemps');
    const d = dureeMinutes();
    return {
      numero, date,
      societe: { raisonSociale: p.raisonSociale, adresse: p.adresse, siret: p.siret, logo: p.logo || null },
      technicien: { nom: val('b_techNom'), qualite: val('b_techQualite') },
      client: { nom: val('b_client'), adresse: val('b_adresse'), contact: val('b_contact') },
      equipement: {
        type: radio('b_type') === 'Autre' ? (val('b_typeAutre') || 'Autre') : radio('b_type'),
        marque: val('b_marque'), modele: val('b_modele'), serie: val('b_serie'),
      },
      natures,
      natureDetail: val('b_natureDetail'),
      description: champ('b_description').value.trim(),
      pieces: pieces.filter((x) => x.designation.trim()).map((x) => ({
        designation: x.designation.trim(), reference: x.reference.trim(),
        quantite: nombre(x.quantite) || 1, prixUnitaire: Number.isFinite(nombre(x.prix)) ? nombre(x.prix) : null,
      })),
      afficherPrix: champ('b_afficherPrix').checked,
      temps: mode === 'duree' ? { dureeMin: d } : { arrivee: val('b_arrivee'), depart: val('b_depart'), dureeMin: d },
      deplacement: val('b_deplacement'),
      observations: champ('b_observations').value.trim(),
      photos: [...photos],
      signataireClient: val('b_signataire'),
      qualiteClient: val('b_qualiteClient'),
    };
  }

  // ---------- Récapitulatif ----------
  function recap() {
    const b = donnees();
    const sigT = pads.tech.png(), sigC = pads.client.png();
    const blocs = [
      ['bon-1', 'Client', [['Client', b.client.nom], ['Adresse', b.client.adresse], ['Sur place', b.client.contact || '—']]],
      ['bon-2', 'Équipement', [['Type', b.equipement.type], ['Marque', b.equipement.marque], ['Modèle', b.equipement.modele], ['N° de série', b.equipement.serie || '—']]],
      ['bon-3', 'Nature', [['Opération', b.natures.join(', ')], ['Précisions', b.natureDetail || '—']]],
      ['bon-4', 'Travaux réalisés', [['Description', b.description]]],
      ['bon-5', 'Pièces', b.pieces.length
        ? b.pieces.map((x, i) => [`Pièce ${i + 1}`, `${x.designation}${x.reference ? ` (${x.reference})` : ''} × ${String(x.quantite).replace('.', ',')}${b.afficherPrix && x.prixUnitaire !== null ? ` — ${euros(x.prixUnitaire)}` : ''}`])
        : [['Pièces', 'Aucune']]],
      ['bon-6', 'Temps passé', [['Horaires', b.temps.arrivee ? `${b.temps.arrivee} → ${b.temps.depart}` : 'Durée saisie'], ['Durée', texteDuree(b.temps.dureeMin)], ['Déplacement', b.deplacement || '—']]],
      ['bon-7', 'Observations', [['Suite à donner', b.observations || '—']]],
      ['bon-8', 'Photos', [['Photos', photos.length ? `${photos.length} photo(s)` : 'Aucune']]],
      ['bon-9', 'Signatures', [['Technicien', `${b.technicien.nom}${b.technicien.qualite ? `, ${b.technicien.qualite}` : ''}`], ['Signature technicien', sigT],
        ['Client', sigC ? [b.signataireClient, b.qualiteClient].filter(Boolean).join(', ') : 'Non signé'], ...(sigC ? [['Signature client', sigC]] : [])]],
    ];
    const racine = $('#recap-bon');
    racine.innerHTML = '';
    const tete = document.createElement('p');
    tete.className = 'encart';
    tete.textContent = `${numero} — ${date} — ${ctx.profil()?.raisonSociale || ''}`;
    racine.append(tete);
    for (const [ecran, titre, lignes] of blocs) {
      const bloc = document.createElement('div');
      bloc.className = 'recap-bloc';
      const h = document.createElement('h3');
      h.textContent = titre;
      const mod = document.createElement('button');
      mod.type = 'button'; mod.className = 'lien'; mod.textContent = 'Modifier';
      mod.addEventListener('click', () => ctx.allerA(ecran));
      h.append(mod);
      const dl = document.createElement('dl');
      for (const [k, v] of lignes) {
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd');
        if (typeof v === 'string' && v.startsWith('data:image')) { const im = new Image(); im.src = v; im.alt = k; dd.append(im); } else dd.textContent = v ?? '';
        dl.append(dt, dd);
      }
      if (ecran === 'bon-8' && photos.length) {
        const g = document.createElement('div');
        g.className = 'recap-photos';
        photos.forEach((p) => { const im = new Image(); im.src = p; im.alt = 'Photo'; g.append(im); });
        dl.append(g);
      }
      bloc.append(h, dl);
      racine.append(bloc);
    }
  }

  // ---------- Génération ----------
  const nomFichier = (b) => {
    const propre = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return `Bon-intervention_${b.numero}_${propre(b.client.nom).slice(0, 40)}.pdf`;
  };
  async function generer(bouton) {
    bouton.disabled = true;
    bouton.textContent = 'Génération…';
    try {
      const b = donnees();
      b.signatureTechnicien = pads.tech.trace();
      b.signatureClient = pads.client.trace();
      const octets = await genererBon(window.PDFLib, b);
      const file = new File([octets], nomFichier(b), { type: 'application/pdf' });
      if (genere) URL.revokeObjectURL(genere.url);
      genere = { file, url: URL.createObjectURL(file), b };
      if (!numeroMemorise) { await memoriserNumeroBon(numero); numeroMemorise = true; }
      await enregistrerClient(b.client).catch(() => {});
      idHistorique = idHistorique || nouvelId();
      await ajouterFiche({
        id: idHistorique, type: 'bon', numero: b.numero, client: b.client.nom, adresse: b.client.adresse, date: b.date,
        detail: [b.equipement.type, b.natures.join(', ')].filter(Boolean).join(' — '), nomFichier: file.name,
      }, octets).catch((e) => console.warn('Historique non enregistré', e));
      enCours = null;
      $('#bon-nom-fichier').textContent = file.name;
      const email = ctx.profil()?.email;
      $('#bloc-email-bon').hidden = !email;
      $('#email-destinataire-bon').textContent = email || '';
      ctx.allerA('bon-pret');
    } catch (e) {
      console.error(e);
      signaler([[null, `Impossible de générer le PDF : ${e.message}`]]);
    } finally {
      bouton.disabled = false;
    }
  }
  $('#btn-partager-bon').addEventListener('click', () => ctx.partagerOuTelecharger(genere.file, `Bon d'intervention ${genere.b.numero} — ${genere.b.client.nom} (${genere.b.date})`, genere.url));
  $('#btn-telecharger-bon').addEventListener('click', () => ctx.telecharger(genere.file, genere.url));
  $('#btn-voir-bon').addEventListener('click', () => window.open(genere.url, '_blank'));
  $('#btn-copier-email-bon').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(ctx.profil().email); e.target.textContent = '✅ Adresse copiée'; } catch { e.target.textContent = ctx.profil().email; }
    setTimeout(() => { e.target.textContent = "📋 Copier l'adresse"; }, 2500);
  });

  // ---------- Nouveau bon ----------
  async function nouveauBon() {
    $$('[data-ecran^="bon-"] input, [data-ecran^="bon-"] textarea').forEach((el) => {
      if (el.type === 'file') return;
      if (el.type === 'radio' || el.type === 'checkbox') el.checked = el.name === 'b_modeTemps' && el.value === 'heures';
      else el.value = '';
    });
    pieces = [];
    photos = [];
    Object.values(pads).forEach((p) => p.effacer());
    rendrePieces();
    rendrePhotos();
    const p = ctx.profil() || {};
    champ('b_techNom').value = ctx.nomComplet(p);
    champ('b_techQualite').value = p.qualite || '';
    numero = await prochainNumeroBon();
    numeroMemorise = false;
    idHistorique = null;
    date = new Date().toLocaleDateString('fr-FR');
    clients = await lireClients();
    $('#bloc-type-autre').hidden = true;
    ctx.allerA('bon-1');
    majSuggestions();
  }
  $('#btn-nouveau-bon').addEventListener('click', nouveauBon);
  $('#btn-nouveau-bon-2').addEventListener('click', nouveauBon);
  $('#btn-reprendre-bon').addEventListener('click', () => ctx.allerA(enCours || 'bon-1'));

  // ---------- Interface avec la navigation de l'appli ----------
  const numeroEtape = (ecran) => { const m = /^bon-(\d)$/.exec(ecran); return m ? Number(m[1]) : null; };
  return {
    estEcran: (e) => typeof e === 'string' && e.startsWith('bon-'),
    /** Appelé à chaque affichage d'un écran du bon ; renvoie l'état de la barre de navigation. */
    async surAffichage(e) {
      const n = numeroEtape(e);
      if (n || e === 'bon-recap') enCours = e;
      if (e === 'bon-accueil') {
        $('#btn-reprendre-bon').hidden = !enCours;
        $('#bon-prochain-numero').textContent = `Prochain numéro : ${await prochainNumeroBon()}`;
      }
      if (e === 'bon-1') { clients = await lireClients(); majSuggestions(); }
      if (e === 'bon-5') rendrePieces();
      if (e === 'bon-6') majTemps();
      if (e === 'bon-8') rendrePhotos();
      if (e === 'bon-recap') recap();
      if (n) return { nav: true, progression: `Étape ${n} sur ${ETAPES_BON} — ${TITRES[n - 1]}`, pct: (n / (ETAPES_BON + 1)) * 100, suivant: 'Suivant →', retour: n === 1 ? '🏠 Accueil' : '← Retour' };
      if (e === 'bon-recap') return { nav: true, progression: `${numero} — vérification`, pct: 100, suivant: '📄 Générer le PDF', retour: '← Retour' };
      return { nav: false };
    },
    suivant(e, bouton) {
      const n = numeroEtape(e);
      if (e === 'bon-recap') return generer(bouton);
      if (n === 1 && valider(1)) { enregistrerClient({ nom: val('b_client'), adresse: val('b_adresse'), contact: val('b_contact') }).catch(() => {}); return ctx.allerA('bon-2'); }
      if (n && valider(n)) ctx.allerA(n === ETAPES_BON ? 'bon-recap' : `bon-${n + 1}`);
    },
    retour(e) {
      const n = numeroEtape(e);
      if (e === 'bon-recap') return ctx.allerA(`bon-${ETAPES_BON}`);
      ctx.allerA(n === 1 ? 'bon-accueil' : `bon-${n - 1}`);
    },
    ecranCourant: () => enCours,
  };
}
