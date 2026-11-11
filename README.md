# ❄️ FrigoFiche

Application web mobile (PWA) qui remplit le **Cerfa 15497\*04**, la fiche d'intervention pour les fluides frigorigènes, directement sur le téléphone du technicien.

1. **Opérateur** : raison sociale, SIRET, attestation de capacité, technicien (mémorisés sur le téléphone)
2. **Client et machine** : détenteur, adresse, référence, n° de série
3. **Fluide** : fluide, charge, nature de l'intervention, détection permanente. Calcul automatique des t éq. CO₂.
4. **Manipulation** : quantités chargée, recyclée et récupérée, et fuite constatée (pas de quantités pour un contrôle d'étanchéité)
5. **Signatures** au doigt. La signature du client devient obligatoire à partir de 3 kg de HCFC ou de 5 t éq. CO₂.

Vous vérifiez le récapitulatif, puis vous générez le PDF officiel et le partagez par e-mail, WhatsApp ou une autre application. Si le partage n'est pas disponible, le PDF est téléchargé.

**Confidentialité** : rien n'est envoyé à un serveur. Le PDF est rempli dans le navigateur avec [pdf-lib](https://pdf-lib.js.org), qui est inclus dans le dépôt. L'application fonctionne aussi hors ligne.

## Remplissage automatique du Cerfa

- Les cases [7] et [8]/[9] (seuil de quantité et fréquence du contrôle) sont cochées automatiquement.
- « Réparation » est reportée dans la case « Autre (préciser) », car le Cerfa n'a pas de case pour cette nature d'intervention.
- Le fluide vierge (A) est calculé ainsi : quantité chargée − quantité recyclée. Le fluide régénéré (C) est fixé à 0.
- Les cadres [5], [12] et [13] restent à compléter à la main si nécessaire.

Un exemple rempli se trouve dans `exemple/fiche-exemple.pdf`. Pour le régénérer :

```bash
npm install && npm run exemple
```

## Publication sur GitHub Pages

Dans le dépôt, allez dans **Settings → Pages**. Choisissez *Deploy from a branch*, puis la branche `main` et le dossier `/ (root)`. L'application sera ensuite accessible à l'adresse `https://<utilisateur>.github.io/frigofiche-/`.
