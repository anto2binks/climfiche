// FrigoFiche — écran « Mes fiches » : liste, recherche, filtre, revoir / partager / supprimer.
import { listerFiches, lirePdf, supprimerFiche, filtrerFiches, texteTaille } from './historique.js';

const $ = (s, r = document) => r.querySelector(s);

/**
 * @param {object} ctx { partagerOuTelecharger(file, texte, url), telecharger(file, url) }
 */
export function initHistorique(ctx) {
  let fiches = [];
  let ouverte = null; // id de la fiche dépliée

  const typeChoisi = () => document.querySelector('[name="h_type"]:checked')?.value || 'tout';

  function message(texte, erreur = false) {
    const m = $('#message-historique');
    m.textContent = texte;
    m.classList.toggle('erreur', erreur);
    m.hidden = false;
    clearTimeout(m.t);
    m.t = setTimeout(() => { m.hidden = true; }, 5000);
  }

  // Le PDF est chargé dès qu'une fiche est dépliée : au moment de l'appui sur « Partager » ou « Voir »,
  // il est déjà prêt (iPhone : le partage et l'ouverture doivent suivre l'appui sans attente).
  let pdf = null; // { id, file, url }
  function libererPdf() { if (pdf) URL.revokeObjectURL(pdf.url); pdf = null; }
  async function chargerPdf(fiche) {
    libererPdf();
    try {
      const file = await lirePdf(fiche);
      if (ouverte !== fiche.id) return;
      pdf = { id: fiche.id, file, url: URL.createObjectURL(file) };
    } catch (e) { message(e.message, true); }
  }
  async function avecPdf(fiche, action) {
    if (pdf?.id !== fiche.id) await chargerPdf(fiche);
    if (pdf?.id !== fiche.id) return;
    try { await action(pdf.file, pdf.url); } catch (e) { message(e.message, true); }
  }

  function rendre() {
    const liste = filtrerFiches(fiches, typeChoisi(), $('#recherche-fiches').value);
    const zone = $('#liste-fiches');
    zone.innerHTML = '';
    const total = fiches.reduce((s, f) => s + (f.taille || 0), 0);
    $('#compteur-fiches').textContent = fiches.length
      ? `${liste.length} sur ${fiches.length} fiche${fiches.length > 1 ? 's' : ''} — ${texteTaille(total)} sur le téléphone`
      : '';

    if (!liste.length) {
      const vide = document.createElement('p');
      vide.className = 'encart';
      vide.textContent = fiches.length
        ? 'Aucune fiche ne correspond à la recherche.'
        : 'Aucune fiche pour l’instant. Chaque fiche Cerfa et chaque bon que tu génères apparaîtra ici automatiquement.';
      zone.append(vide);
      return;
    }

    for (const f of liste) {
      const carte = document.createElement('div');
      carte.className = 'fiche';
      const tete = document.createElement('button');
      tete.type = 'button';
      tete.className = 'fiche-tete';
      tete.setAttribute('aria-expanded', String(ouverte === f.id));
      tete.innerHTML = '<span class="fiche-icone" aria-hidden="true"></span><span class="fiche-texte"><small></small><strong></strong><small class="fiche-detail"></small></span>';
      tete.querySelector('.fiche-icone').textContent = f.type === 'bon' ? '🧰' : '📄';
      tete.querySelector('small').textContent = `${f.type === 'bon' ? 'Bon' : 'Cerfa'} n° ${f.numero} — ${f.date}`;
      tete.querySelector('strong').textContent = f.client || '—';
      tete.querySelector('.fiche-detail').textContent = [f.detail, (f.adresse || '').replace(/\n/g, ', ')].filter(Boolean).join(' · ');
      tete.addEventListener('click', () => {
        ouverte = ouverte === f.id ? null : f.id;
        if (ouverte) chargerPdf(f); else libererPdf();
        rendre();
      });
      carte.append(tete);

      if (ouverte === f.id) {
        const actions = document.createElement('div');
        actions.className = 'fiche-actions';
        const bouton = (texte, classe, action) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `bouton ${classe}`;
          b.textContent = texte;
          b.addEventListener('click', action);
          actions.append(b);
        };
        const texte = `${f.type === 'bon' ? "Bon d'intervention" : "Fiche d'intervention"} n° ${f.numero} — ${f.client} (${f.date})`;
        bouton('📤 Partager le PDF', 'principal', () => avecPdf(f, (file, url) => ctx.partagerOuTelecharger(file, texte, url)));
        bouton('👁️ Voir le PDF', '', () => avecPdf(f, (file, url) => { window.open(url, '_blank'); }));
        bouton('⬇️ Télécharger', '', () => avecPdf(f, (file, url) => ctx.telecharger(file, url)));
        bouton('🗑️ Supprimer', 'discret', async () => {
          if (!confirm(`Supprimer définitivement ${f.type === 'bon' ? 'le bon' : 'la fiche'} n° ${f.numero} (${f.client}) de ce téléphone ?`)) return;
          try {
            await supprimerFiche(f.id);
            fiches = fiches.filter((x) => x.id !== f.id);
            ouverte = null;
            libererPdf();
            rendre();
            message('🗑️ Fiche supprimée.');
          } catch (e) { message(e.message, true); }
        });
        carte.append(actions);
      }
      zone.append(carte);
    }
  }

  $('#recherche-fiches').addEventListener('input', rendre);
  $('#filtre-fiches').addEventListener('change', rendre);

  return {
    async afficher() {
      try { fiches = await listerFiches(); } catch (e) { fiches = []; message(e.message, true); }
      rendre();
    },
  };
}
