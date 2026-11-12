# ❄️ FrigoFiche

Application web mobile (PWA) qui remplit le **Cerfa 15497\*04**, la fiche d'intervention pour les fluides frigorigènes, directement sur le téléphone du technicien.

**Profil du technicien** : à la première ouverture, l'écran « Crée ton profil » demande la société, le SIRET (14 chiffres), l'attestation de capacité, le nom, la qualité et un e-mail facultatif. Chaque nouvelle fiche reprend ensuite ces informations dans la rubrique [1] et pour le signataire opérateur. Depuis l'accueil, le bouton « Mon profil » permet de :
- modifier ces informations ;
- définir un code de verrouillage facultatif à 4 chiffres (seule une empreinte PBKDF2 est enregistrée) ;
- exporter ou importer le profil (fichier `.json`, sans le code) pour changer de téléphone.

1. **Client et machine** : détenteur, adresse, référence, n° de série
2. **Fluide** : fluide, charge, une ou plusieurs natures d'intervention, détection permanente. Calcul automatique des t éq. CO₂.
3. **Contrôle et manipulation** :
   - Pour un contrôle d'étanchéité : date du contrôle et détecteur manuel (cadre [5]).
   - Quantités chargée, recyclée et récupérée. Elles ne sont pas demandées pour un contrôle d'étanchéité seul.
   - Fuite constatée : jusqu'à 3 fuites, chacune avec « réparation réalisée / à faire » (cadre [10]).
4. **Signatures** au doigt, avec le nom et la qualité du technicien et du signataire client. La signature du client devient obligatoire à partir de 3 kg de HCFC ou de 5 t éq. CO₂.

Vous vérifiez le récapitulatif, puis vous générez le PDF officiel et le partagez par e-mail, WhatsApp ou une autre application. Si le partage n'est pas disponible, le PDF est téléchargé.

**Confidentialité** : rien n'est envoyé à un serveur. Le profil est enregistré sur le téléphone, dans `localStorage` avec une copie de secours dans IndexedDB. Les mises à jour de l'application ne touchent qu'au cache des fichiers, jamais au profil. Le PDF est rempli dans le navigateur avec [pdf-lib](https://pdf-lib.js.org), qui est inclus dans le dépôt. L'application fonctionne aussi hors ligne.

## Bon d'intervention

Le deuxième onglet sert à faire des bons d'intervention classiques, sans Cerfa. Il compte 8 écrans courts :
1. Client
2. Nature de l'opération
3. Travaux réalisés (compatible avec la dictée du clavier)
4. Pièces remplacées (prix facultatifs, masqués par défaut)
5. Temps passé (arrivée et départ, ou durée saisie)
6. Observations
7. Photos (1 à 4, réduites automatiquement)
8. Signatures

Aucun écran n'est bloquant : on peut passer à l'écran suivant sans tout remplir. Le récapitulatif liste ce qui manque (avec un lien vers l'écran concerné), mais le bon peut quand même être généré.

La société (avec le logo choisi dans « Mon profil »), le technicien et la date sont remplis automatiquement. Le PDF A4 a un bandeau de couleur avec le logo, des cartes « Client » et « Intervention », des pastilles pour la nature de l'opération, un tableau de pièces et un encadré pour les observations. Il passe sur plusieurs pages si besoin.

- **Numérotation** : `BI-AAAA-NNNN`, propre à l'appareil.
- **Clients** : les clients saisis sont proposés à la saisie suivante.
- **Données** : clients et numérotation sont enregistrés comme le profil (`localStorage` + IndexedDB). Une mise à jour de l'application ne les efface jamais.

Un exemple se trouve dans `exemple/bon-exemple.pdf` (pour le régénérer : `npm run exemple-bon`).

## Mes fiches (historique)

Le troisième onglet, **Mes fiches**, liste toutes les fiches Cerfa et tous les bons générés sur le téléphone, du plus récent au plus ancien. Une recherche (client, numéro, adresse, date) et un filtre Tout / Cerfa / Bons permettent de retrouver une fiche. En touchant une fiche, on peut la partager à nouveau, la voir, la télécharger ou la supprimer.

Les PDF sont enregistrés dans IndexedDB (base `frigofiche-historique`), uniquement sur l'appareil. Une mise à jour de l'application ne les efface pas, mais la suppression de l'application ou des données du navigateur, si.

## Remplissage automatique du Cerfa

- Les cases [7] et [8]/[9] (seuil de quantité et fréquence du contrôle) sont cochées automatiquement.
- Sous les seuils (moins de 2 kg de HCFC, moins de 5 t éq. CO₂ de HFC, moins de 1 kg de HFO), aucune case n'est cochée. Le réglage « Cocher la première case de [7] », désactivé par défaut, change ce comportement.
- « Réparation » est reportée dans la case « Autre (préciser) », car le Cerfa n'a pas de case pour cette nature d'intervention.
- Le fluide vierge (A) est calculé ainsi : quantité chargée − quantité recyclée. Le fluide régénéré (C) est fixé à 0.
- Les cadres [12] et [13] restent à compléter à la main si nécessaire.

Un exemple rempli se trouve dans `exemple/fiche-exemple.pdf`. Pour le régénérer :

```bash
npm install && npm run exemple
```

## Publication sur GitHub Pages

Dans le dépôt, allez dans **Settings → Pages**. Choisissez *Deploy from a branch*, puis la branche `main` et le dossier `/ (root)`. L'application sera ensuite accessible à l'adresse `https://<utilisateur>.github.io/frigofiche-/`.

## MesHeures (deuxième application)

Le dossier [`heures/`](heures/) contient une application séparée pour saisir ses horaires de travail : total par jour, par semaine et par mois, heures sup à 25 % (36e à 43e heure) et à 50 % (au-delà de 43 h), salaire brut estimé à partir du taux horaire. Voir [`heures/README.md`](heures/README.md).
