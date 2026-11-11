# ❄️ FrigoFiche

Application web mobile (PWA) qui remplit le **Cerfa 15497\*04**, la fiche d'intervention pour les fluides frigorigènes, directement sur le téléphone du technicien.

1. **Opérateur** : raison sociale, adresse, SIRET, attestation de capacité, nom et qualité du technicien, mémorisés sur le téléphone. On y trouve aussi les réglages.
2. **Client et machine** : détenteur, adresse, référence, n° de série
3. **Fluide** : fluide, charge, une ou plusieurs natures d'intervention, détection permanente. Calcul automatique des t éq. CO₂.
4. **Contrôle et manipulation** :
   - Pour un contrôle d'étanchéité : date du contrôle et détecteur manuel (cadre [5]).
   - Quantités chargée, recyclée et récupérée. Elles ne sont pas demandées pour un contrôle d'étanchéité seul.
   - Fuite constatée : jusqu'à 3 fuites, chacune avec « réparation réalisée / à faire » (cadre [10]).
5. **Signatures** au doigt, avec le nom et la qualité du technicien et du signataire client. La signature du client devient obligatoire à partir de 3 kg de HCFC ou de 5 t éq. CO₂.

Vous vérifiez le récapitulatif, puis vous générez le PDF officiel et le partagez par e-mail, WhatsApp ou une autre application. Si le partage n'est pas disponible, le PDF est téléchargé.

**Confidentialité** : rien n'est envoyé à un serveur. Le PDF est rempli dans le navigateur avec [pdf-lib](https://pdf-lib.js.org), qui est inclus dans le dépôt. L'application fonctionne aussi hors ligne.

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
