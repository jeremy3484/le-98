# Test manuel — Scénario complet à 4 joueurs

Ce guide décrit un test d'intégration **de bout en bout** simulant une partie réelle à
4 joueurs, à exécuter dans **4 onglets** (ou 4 fenêtres/appareils). Il couvre :
création de partie, personnalisation des règles, lancement, plusieurs tours,
déclenchement d'un palier, d'une règle perso, d'un Joker, et une manche perdue avec
redistribution.

> Prérequis : migrations `0001 → 0004` appliquées, Edge Functions `start-game` et
> `play-card` déployées, app accessible (Vercel ou `npm run build && npm start`).
> En `npm run dev`, le Realtime fonctionne mais la PWA est désactivée.

---

## Préparation

| Onglet | Rôle | Compte |
| --- | --- | --- |
| **A** | Hôte | joueur1@test.dev |
| **B** | Invité | joueur2@test.dev |
| **C** | Invité | joueur3@test.dev |
| **D** | Invité | joueur4@test.dev |

1. Dans chaque onglet, **créer un compte distinct** (signup) ou se connecter.
   Astuce : utiliser 4 profils de navigateur / fenêtres de navigation privée
   différentes pour éviter le partage de session.
2. Choisir un **pseudo** reconnaissable par onglet (J1, J2, J3, J4).

---

## Étape 1 — Création de la partie (Onglet A)

- [ ] J1 va sur `/lobby` et **crée une partie**.
- [ ] La partie est créée → redirection vers `game/[roomId]/lobby` (salle d'attente).
- [ ] Un **code de room** (et/ou QR code) est affiché.

**✅ Attendu :** aucune erreur `column reference "code" is ambiguous`. Le code à 6
caractères s'affiche. (Si l'erreur apparaît, la migration `0004` n'est pas appliquée.)

---

## Étape 2 — Les autres joueurs rejoignent (Onglets B, C, D)

- [ ] J2, J3, J4 rejoignent via le **code** (page `/join/[code]`) ou en scannant le QR.
- [ ] Chaque joueur apparaît **en temps réel** dans la salle d'attente de tous les onglets.

**✅ Attendu :** les 4 joueurs (J1–J4) sont listés dans tous les onglets sans
rafraîchissement manuel (Realtime).

---

## Étape 3 — Personnalisation des règles (Onglet A, hôte)

J1 ouvre `game/[roomId]/settings` et configure :

- [ ] **Une règle personnalisée carte** — ex. cible `7` → action `cul_sec`
      (ou `sips_fixed` avec un montant, ou `free_text`).
- [ ] **Un ou plusieurs Jokers** (max **4**) — pour ce test, ajouter au moins
      `reverse` (Inversion du sens) et `reset_zero` (Reset à zéro), faciles à observer.
- [ ] (Optionnel) ajuster `sipStep` / `sipRange` si l'UI le permet ; sinon garder
      les défauts (palier tous les **10**, plage 10–90).

**✅ Attendu :** la règle perso et les Jokers sélectionnés sont **persistés**
(rechargement de page = toujours là) et **visibles** côté joueurs si l'UI les expose.

---

## Étape 4 — Lancement (Onglet A)

- [ ] J1 clique **Lancer la partie** (`start-game`).
- [ ] Tous les onglets basculent sur la **table de jeu** `game/[roomId]`.

**✅ Attendu :**
- [ ] Chaque joueur a une **main de 4 cartes**.
- [ ] Le **total courant** affiché = `0`.
- [ ] L'**ordre des joueurs** et le **joueur actif** (J1) sont indiqués.
- [ ] Le **sens** initial est horaire.

---

## Étape 5 — Plusieurs tours normaux

Jouer 3–4 cartes « ordinaires » (2 à 10) en suivant le tour J1 → J2 → J3 → J4 :

- [ ] À chaque carte, le **total augmente** de la valeur faciale (ex. `6` → +6).
- [ ] Le tour passe **au joueur suivant** dans le sens courant.
- [ ] La carte jouée part en **défausse**, le joueur **repioche** pour revenir à 4 cartes.

**Cartes spéciales à vérifier au passage (si elles sortent / si jouables) :**
- [ ] **As** : +1 ou +11 selon le choix proposé (défaut 11).
- [ ] **Valet (J)** : −10, **plancher à 0** (jamais négatif).
- [ ] **Dame (Q)** : +0 et **inverse le sens** du jeu.
- [ ] **Roi (K)** : **fixe** le total à 70 (valeur par défaut).

**✅ Attendu :** total et tours cohérents avec les règles ci-dessus.

---

## Étape 6 — Déclenchement d'un palier

Amener le total sur un **multiple de 10** dans la plage (10–90), p. ex. **50** ou **80** :

- [ ] À l'atteinte de **50**, un événement palier annonce **5 gorgées** (50 / 10).
- [ ] À l'atteinte de **80**, un événement palier annonce **8 gorgées** (80 / 10).
- [ ] **Contre-vérification** : passer par **72** ne déclenche **aucun** palier
      (72 n'est pas multiple de 10).

**✅ Attendu :** palier affiché uniquement sur les multiples de 10, montant =
`total / 10` gorgées, distribué selon le réglage (par défaut : le joueur qui a posé).

---

## Étape 7 — Déclenchement de la règle personnalisée

- [ ] Faire jouer la carte ciblée à l'étape 3 (ex. un **7**).
- [ ] L'événement de **règle perso** s'affiche à **tous** les joueurs
      (« Cul sec ! », gorgées fixes, ou texte libre selon la config).

**✅ Attendu :** l'effet correspond exactement à la règle configurée et est visible
par les 4 onglets en temps réel.

---

## Étape 8 — Déclenchement d'un Joker

Faire jouer une **carte Joker** par un joueur :

- [ ] **Reverse** : le **sens s'inverse** immédiatement (le tour repart dans l'autre
      direction). Le joker quitte la main, le joueur repioche à 4.
- [ ] **Reset à zéro** : le **total retombe à 0**.
- [ ] (Si configurés, vérifier les autres effets) :
  - `swap_hands` : les mains **tournent d'un cran**.
  - `ghost_draw` : tous **sauf le poseur** piochent +1 carte.
  - `immunity` : le poseur **ignore** le prochain palier qui le viserait.
  - `musical_chairs` : l'**ordre des joueurs est mélangé**.
  - `double_or_nothing` : la **prochaine carte compte double**.
  - `mirror` : le joueur suivant doit **rejouer la même valeur** que la dernière
    carte sous peine de boire.

**✅ Attendu :** l'effet du pouvoir correspond au catalogue (`lib/supabase/jokers.ts`)
et est appliqué de manière autoritaire par l'Edge Function `play-card` (cohérent dans
les 4 onglets).

---

## Étape 9 — Manche perdue avec redistribution

Pousser le total **au plus près de 98** puis forcer un **dépassement** (bust) :

- [ ] Un joueur est **contraint** de dépasser 98 (aucune carte ne permet de rester ≤ 98).
- [ ] La manche est marquée **perdue** pour ce joueur.
- [ ] **Redistribution** : nouvelle donne, total réinitialisé, le **premier joueur de
      la manche suivante** suit le réglage `firstPlayerAfterLoss` (défaut : le perdant).

**✅ Attendu :**
- [ ] Le perdant est clairement désigné (et « boit » selon les règles de la table).
- [ ] Les mains sont **redistribuées** (chacun revient à 4 cartes).
- [ ] Le **total repart à 0** et une **nouvelle manche** démarre proprement.

---

## Checklist de synthèse

- [ ] Création de partie sans erreur SQL
- [ ] Jonction temps réel des 4 joueurs
- [ ] Règle perso + Jokers persistés
- [ ] Lancement : mains de 4, total 0, ordre correct
- [ ] Tours normaux : total et sens corrects
- [ ] Cartes spéciales (A / J / Q / K) conformes
- [ ] Palier sur 50 (5) et 80 (8), **rien** sur 72
- [ ] Règle perso déclenchée et visible par tous
- [ ] Joker déclenché avec le bon effet
- [ ] Manche perdue + redistribution + nouvelle manche

---

## En cas d'anomalie

| Symptôme | Piste |
| --- | --- |
| `column reference "code" is ambiguous` | Migration `0004` non appliquée |
| Joueurs n'apparaissent pas en direct | Realtime non activé sur les tables, ou policies RLS |
| « Lancer » ne fait rien / erreur | Edge Function `start-game` non déployée |
| Coup refusé / total figé | Edge Function `play-card` non déployée ou désynchronisée du moteur pur |
| Effet Joker absent | Joker non ajouté en `settings`, ou logique `play-card` à resynchroniser avec `lib/game-engine/jokers.ts` |
| Palier incohérent | Vérifier `sipStep` / `sipRange` / `sipsMultiplier` des réglages |
