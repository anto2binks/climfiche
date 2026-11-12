# ⏱️ MesHeures

Petite application web mobile (PWA) pour noter ses horaires de travail et calculer ses heures supplémentaires. Elle est indépendante de FrigoFiche : elle a son propre dossier, son icône et ses données.

## Utilisation

- **Jour** : début, fin (bouton « Maintenant » pour pointer) et pause. Le total du jour s'affiche tout de suite et est enregistré automatiquement. Une fin plus tôt que le début compte comme une fin le lendemain (travail de nuit).
- **Semaine** (lundi → dimanche) : le détail des 7 jours, le total, puis la répartition heures normales / heures sup à 25 % / heures sup à 50 %, avec le salaire brut estimé.
- **Mois** : les heures travaillées du 1er au dernier jour, le bilan du mois (heures sup et salaire) et le détail semaine par semaine.
- **Réglages** : le taux horaire brut, l'export et l'import des horaires (fichier `.json`).

## Règles de calcul

| Heures dans la semaine | Taux |
|---|---|
| 1re à 35e heure | taux horaire normal |
| 36e à 43e heure | + 25 % |
| au-delà de 43 h | + 50 % |

Les heures sup se comptent à la semaine. Une semaine à cheval sur deux mois est rattachée au mois où elle se termine (son dimanche), elle n'est donc jamais comptée deux fois. Les montants sont bruts et indicatifs.

## Données

Tout reste sur le téléphone (`localStorage`, clé `mesheures-v1`). Rien n'est envoyé à un serveur. L'application fonctionne hors ligne.

## Tests

`npm run test-heures` vérifie les calculs (`heures/test/calcul.test.mjs`).
