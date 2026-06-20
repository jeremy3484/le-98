# Jeu du 98

Jeu de cartes multijoueur en temps réel — variante du **98** — pensé **mobile-first** et installable en **PWA** (iOS / Android). Construit avec **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, **shadcn/ui** et **Supabase** (Auth, Postgres + RLS, Realtime, Edge Functions).

---

## Sommaire

1. [Prérequis](#prérequis)
2. [Lancer le projet en local](#lancer-le-projet-en-local)
3. [Configurer Supabase](#configurer-supabase)
4. [Déployer sur Vercel](#déployer-sur-vercel)
5. [Déployer une mise à jour](#déployer-une-mise-à-jour)
6. [PWA — installation iOS / Android](#pwa--installation-ios--android)
7. [Tests](#tests)
8. [Architecture du projet](#architecture-du-projet)

---

## Prérequis

- **Node.js 18.18+** (ou 20+ recommandé)
- **npm** (le dépôt fournit un `package-lock.json`)
- Un compte **Supabase** (projet gratuit suffisant)
- Un compte **Vercel** pour la production
- Optionnel : **Supabase CLI** (`npm i -g supabase`) pour appliquer migrations / Edge Functions depuis le terminal

---

## Lancer le projet en local

```bash
# 1. Installer les dépendances
npm install

# 2. Créer le fichier d'environnement
cp .env.local.example .env.local
# puis renseigner les valeurs (voir section Supabase ci-dessous)

# 3. Démarrer le serveur de dev
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

> **Note PWA** : le service worker est **désactivé en développement** (voir `next.config.mjs`). Pour tester l'installation PWA, il faut une build de production (`npm run build && npm start`) ou le site déployé sur Vercel.

### Variables d'environnement

Le fichier `.env.local` doit contenir (valeurs depuis **Supabase Dashboard → Project Settings → API**) :

| Variable | Côté | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + serveur | URL du projet (`https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + serveur | Clé publique `anon` (protégée par les policies RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **serveur uniquement** | Clé `service_role` — **SECRET**, bypass la RLS. Ne jamais l'exposer au client ni la committer |

---

## Configurer Supabase

### 1. Créer le projet

Créer un projet sur [supabase.com](https://supabase.com). Récupérer l'URL et les clés dans **Project Settings → API**, puis les copier dans `.env.local`.

### 2. Appliquer les migrations SQL

Les migrations se trouvent dans `supabase/migrations/` et **doivent être appliquées dans l'ordre** :

| Fichier | Contenu |
| --- | --- |
| `0001_init.sql` | Tables de base (profiles, rooms, players, game state, card_rules, joker_configs…), types, RLS de base |
| `0002_auth_storage.sql` | Trigger de création de profil, bucket Storage avatars |
| `0003_rooms.sql` | RPC `generate_room_code()`, `create_room()`, `join_room()` |
| `0004_fix_room_code_ambiguity.sql` | Correctif : lève l'erreur `column reference "code" is ambiguous` (variables renommées `v_*`, colonnes qualifiées) |

**Méthode A — Dashboard (la plus simple) :**

1. Aller dans **SQL Editor** sur le dashboard Supabase.
2. Coller le contenu de chaque fichier migration, dans l'ordre, et exécuter.

**Méthode B — Supabase CLI :**

```bash
supabase link --project-ref <votre-project-ref>
supabase db push
```

### 3. Déployer les Edge Functions

La logique de jeu autoritaire vit dans deux Edge Functions Deno :

| Function | Rôle |
| --- | --- |
| `start-game` | Initialise la partie : mélange le paquet, distribue les mains, fixe l'ordre |
| `play-card` | Résout un coup : application de la carte, plafond 98, paliers, règles perso, pouvoirs Joker, manche perdue + redistribution |

```bash
supabase functions deploy start-game
supabase functions deploy play-card
```

> Les Edge Functions ont besoin des secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`. Ils sont injectés automatiquement par la plateforme Supabase pour les fonctions déployées ; en local (`supabase functions serve`) ils proviennent de `supabase/.env` / `config.toml`.

### 4. URLs de redirection Auth

Dans **Authentication → URL Configuration** :

- **Site URL** : l'URL de production (ex. `https://votre-app.vercel.app`)
- **Redirect URLs** : ajouter
  - `http://localhost:3000/auth/callback` (dev)
  - `https://votre-app.vercel.app/auth/callback` (prod)
  - l'URL de chaque déploiement preview si besoin (`https://*-votre-projet.vercel.app/auth/callback`)

La route de callback OAuth/email est `app/auth/callback/route.ts`.

> Par défaut, la confirmation par email est **désactivée** (`enable_confirmations = false` dans `config.toml`) pour fluidifier les parties improvisées. Activez-la si vous voulez vérifier les emails.

---

## Déployer sur Vercel

1. **Importer le dépôt** sur [vercel.com/new](https://vercel.com/new) (framework détecté automatiquement : Next.js).
2. **Configurer les variables d'environnement** (Project → Settings → Environment Variables), pour les environnements **Production** *et* **Preview** :

   | Variable | Valeur | Exposée au client ? |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase | Oui (préfixe `NEXT_PUBLIC_`) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon | Oui |
   | `SUPABASE_SERVICE_ROLE_KEY` | clé service_role | **Non — secret serveur** |

3. **Déployer.** Vercel lance `npm run build` puis sert l'app.
4. **Mettre à jour la Site URL / Redirect URLs** côté Supabase avec le domaine Vercel obtenu (voir section Auth ci-dessus).

> ⚠️ Le service worker PWA et le manifest ne sont générés qu'au **build de production**. C'est la version Vercel (ou `npm run build && npm start` en local) qui est installable.

---

## Déployer une mise à jour

Cycle de mise à jour complet selon ce qui a changé :

**Code applicatif (pages, composants, moteur de jeu) :**
```bash
git add -A && git commit -m "..." && git push
```
Vercel redéploie automatiquement à chaque push sur la branche de production.

**Schéma de base / RPC (nouveau fichier `supabase/migrations/000X_*.sql`) :**
- Dashboard → SQL Editor → coller + exécuter, **ou** `supabase db push`.

**Logique de jeu (Edge Functions) :**
```bash
supabase functions deploy play-card
supabase functions deploy start-game
```

**Variables d'environnement :**
- Les modifier dans Vercel → Settings → Environment Variables, puis **redéployer** pour qu'elles soient prises en compte.

> Après une mise à jour de la PWA, les utilisateurs déjà « installés » reçoivent la nouvelle version au prochain chargement (le service worker est configuré avec `reloadOnOnline` et le rafraîchissement à la navigation).

---

## PWA — installation iOS / Android

L'app est installable sur l'écran d'accueil :

- **Manifest** : `public/manifest.json` (nom, couleurs, `display: standalone`, `orientation: portrait`).
- **Icônes** : `public/icons/`
  - `icon.svg` (vectoriel, toutes tailles)
  - `icon-192.png`, `icon-512.png` (`purpose: any maskable`)
  - `apple-touch-icon.png` (180×180) — **iOS Safari n'accepte pas le SVG** en apple-touch-icon, d'où ce PNG dédié.
- **Couleurs** : `theme_color` / `background_color` = `#0b0a12` (cohérent avec le thème sombre).

**Installer sur iOS (Safari) :** Partager → « Sur l'écran d'accueil ». L'icône PNG 180×180 et le `background_color` servent d'écran de démarrage.

**Installer sur Android (Chrome) :** menu ⋮ → « Installer l'application » / bannière automatique. L'écran de démarrage est généré automatiquement à partir du `name` + icône 512 + `background_color` du manifest.

---

## Tests

Tests unitaires du **moteur de jeu pur** (Vitest) :

```bash
npm test          # exécution unique (vitest run)
```

Couverture actuelle (6 fichiers) :

- `lib/game-engine/engine.test.ts` — résolution des coups, pioche
- `lib/game-engine/rules.test.ts` — valeurs des cartes, plafond 98, plancher Valet, sens, paliers
- `lib/game-engine/custom-settings.test.ts` — `resolveSettings`, réglages personnalisés, cas **72 = aucun palier**, 50/80 = bons montants
- `lib/game-engine/jokers.test.ts` — les **10 pouvoirs Joker**
- `lib/supabase/card-rules.test.ts` — règles personnalisées (`ALL`/`EVEN`/`ODD`/valeur)
- `lib/supabase/jokers.test.ts` — catalogue des Jokers + helpers

Pour un scénario d'intégration manuel à 4 joueurs, voir **[`TEST-MANUEL-4-JOUEURS.md`](./TEST-MANUEL-4-JOUEURS.md)**.

---

## Architecture du projet

```
app/
  (auth)/login, (auth)/signup     Authentification
  (lobby)/lobby                   Accueil / création / liste de parties
  (game)/game/[roomId]            Table de jeu
  (game)/game/[roomId]/lobby      Salle d'attente (joueurs prêts)
  (game)/game/[roomId]/settings   Personnalisation des règles + Jokers (hôte)
  join/[code]                     Rejoindre via code
  auth/callback/route.ts          Callback OAuth/email
lib/
  game-engine/                    Moteur PUR (source de vérité) : cards, rules,
                                  engine, settings, jokers (+ tests)
  supabase/                       Client SSR, helpers card-rules, jokers, hooks
supabase/
  migrations/                     0001 → 0004 (SQL ordonné)
  functions/                      Edge Functions Deno : start-game, play-card
types/database.ts                 Types Postgres partagés
```

**Principe clé** : `lib/game-engine` est la spécification pure et testable du jeu. L'Edge Function `play-card` **réimplémente la même logique** (Deno ne résout pas les alias `@/`), gardée synchrone avec le moteur — c'est pourquoi les tests Vitest ciblent le moteur pur.
