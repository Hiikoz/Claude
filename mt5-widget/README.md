# Widget iPhone : P&L MetaTrader 5 sur l'écran de verrouillage

Affiche en direct sur l'écran de verrouillage de l'iPhone le P&L flottant de
vos positions MT5, le P&L réalisé du jour, l'équité et le nombre de positions.

```
 ┌───────────────────────────────┐
 │ MT5 · 3 pos · il y a 1 min    │
 │ ▲ +125,40 €                   │
 │ Jour −80,50 · Éq 10 125       │
 └───────────────────────────────┘
```

## Démarrage rapide : 100 % iPhone et gratuit (Myfxbook)

C'est le mode par défaut du script. Il n'y a rien à installer sur la VM.

1. Reliez votre compte MT5 à [Myfxbook](https://www.myfxbook.com) (gratuit),
   avec le **mot de passe investisseur**.
2. Installez [Scriptable](https://apps.apple.com/app/scriptable/id1405459188),
   créez un script `MT5 PnL` et collez-y `scriptable/MT5-PnL.js`.
3. Appuyez sur ▶︎ : le script demande vos identifiants **Myfxbook**, les range
   dans le trousseau iOS, puis vous fait choisir le compte à suivre.
4. Ajoutez le widget Scriptable (format rectangulaire) sur l'écran verrouillé
   et choisissez le script `MT5 PnL`.

Avec Myfxbook, les données ont **5 à 20 min de décalage**, et le P&L du jour
n'est pas affiché. Pour un suivi plus réactif, passez à l'option A
ci-dessous (`backend: "upstash"`) quand vous aurez accès à la VM.

## Comment ça marche (option A)

```
 MT5 (PC / VPS)            Upstash Redis (gratuit)        iPhone
 ┌──────────────┐  POST    ┌──────────────┐   GET    ┌──────────────────┐
 │ EA PnLPusher │ ───────► │  clé mt5pnl  │ ◄─────── │ Scriptable widget│
 └──────────────┘ /15 s    └──────────────┘          └──────────────────┘
```

- **`mql5/PnLPusher.mq5`** : un Expert Advisor qui **ne passe aucun ordre**. Il
  lit le compte toutes les 15 s et envoie un petit JSON à Upstash (seulement si
  quelque chose a changé, pour économiser le quota).
- **`scriptable/MT5-PnL.js`** : le widget iOS (app gratuite
  [Scriptable](https://apps.apple.com/app/scriptable/id1405459188)).

> ⚠️ **L'EA ne fonctionne que sur MT5 pour ordinateur** (Windows, macOS, ou un
> VPS), qui doit rester allumé. L'app MT5 pour iPhone ne fait pas tourner
> d'EA. Si vous n'avez pas d'ordinateur allumé en permanence, voyez
> l'[option B (MetaApi)](#option-b--sans-ordinateur-metaapi).

---

## Option A : EA + Upstash (recommandée)

### 1. Créer la base Upstash (2 min, gratuit)

1. Créez un compte sur <https://console.upstash.com>, puis **Create Database**
   (type Redis, région proche de votre broker ou VPS).
2. Dans la base, section **REST API**, notez :
   - `UPSTASH_REDIS_REST_URL` (ex. `https://eu1-xxx-12345.upstash.io`)
   - `UPSTASH_REDIS_REST_TOKEN` : token **lecture/écriture**, **pour l'EA**
   - le **Read-Only Token** : **pour l'iPhone**

Le plan gratuit (500 000 commandes par mois) suffit largement. À 15 s, et en
n'envoyant que les changements, on reste bien en dessous.

### 2. Installer l'EA dans MT5

1. Dans MT5 : **Fichier › Ouvrir le dossier des données › MQL5 › Experts**, et
   copiez-y `PnLPusher.mq5`.
2. Ouvrez-le dans **MetaEditor** et compilez-le (**F7**).
3. **Outils › Options › Expert Advisors** :
   - cochez **Autoriser WebRequest pour les URL listées** ;
   - ajoutez votre URL Upstash (`https://eu1-xxx-12345.upstash.io`).
4. Glissez **PnLPusher** sur n'importe quel graphique et renseignez :
   - `UpstashUrl` : l'URL REST, **sans `/` final** ;
   - `UpstashToken` : le token lecture/écriture.
5. Activez le bouton **Algo Trading**. L'onglet **Experts** ne doit afficher
   aucune erreur.

Pour vérifier depuis n'importe quel terminal :

```bash
curl -H "Authorization: Bearer READ_ONLY_TOKEN" https://eu1-xxx-12345.upstash.io/get/mt5pnl
```

### 3. Installer le widget sur l'iPhone

1. Installez **Scriptable** depuis l'App Store.
2. Créez un nouveau script (**+**), nommez-le `MT5 PnL`, et collez-y le contenu
   de `scriptable/MT5-PnL.js`.
3. Appuyez sur ▶︎, puis **Passer en MT5 direct (Upstash)**. Collez l'URL et
   le token **Read-Only**. Le script teste la connexion, puis range les
   réglages dans le trousseau iOS : rien à modifier dans le code.
5. Sur l'écran de verrouillage, faites un appui long, puis **Personnaliser ›
   Écran verrouillé**. Touchez la zone des widgets, ajoutez **Scriptable**
   (format **rectangulaire** conseillé), touchez-le, puis choisissez le script
   `MT5 PnL`.

Les trois formats d'écran de verrouillage (en ligne, circulaire,
rectangulaire) et les trois formats d'écran d'accueil (petit, moyen, grand)
sont pris en charge. Les formats d'écran d'accueil listent aussi vos
positions, triées par impact.

**Plusieurs comptes ?** Lancez un EA par compte avec un `RedisKey` différent
(ex. `mt5pnl_demo`), puis tapez cette clé dans le champ **Parameter** du
widget.

---

## Option B : sans ordinateur (MetaApi)

[MetaApi.cloud](https://metaapi.cloud) se connecte à votre compte MT5 depuis
ses propres serveurs : il suffit de l'identifiant du compte, du mot de passe
**investisseur** (lecture seule) et du nom du serveur du broker. Il existe un
plan gratuit limité, à vérifier sur leur site.

1. Ajoutez votre compte dans MetaApi, puis récupérez le **token API**,
   l'**account ID** et la **région**.
2. Dans le script : `backend: "metaapi"`, puis remplissez `CONFIG.metaapi`.

Avec MetaApi, le « P&L du jour » n'est pas affiché ; le P&L flottant, l'équité
et les positions le sont.

---

## À savoir : « en direct » sur iOS

- **iOS limite le rafraîchissement des widgets**, en général toutes les
  **5 à 15 minutes** selon l'usage et la batterie. Le script le demande toutes
  les 60 s, mais c'est iOS qui décide. Aucun widget tiers ne peut être mis à
  jour à la seconde.
- **L'indication « il y a X min » est mise à jour par iOS en temps réel.** Elle
  montre toujours l'âge exact de la donnée affichée, et un ⚠︎ apparaît
  au-delà de 5 min ou en cas d'erreur réseau. En cas d'erreur, la dernière
  valeur connue reste affichée.
- **Toucher le widget** ouvre Scriptable et rafraîchit les données
  immédiatement.
- **Pour du vrai temps réel à la seconde**, il faudrait une *Live Activity*
  (comme le suivi Uber), c'est-à-dire une app iOS native avec notifications
  push. C'est faisable, mais c'est un projet bien plus lourd (Xcode, compte
  développeur Apple).

## Sécurité

- L'EA est en **lecture seule** : il n'appelle aucune fonction de trading.
- L'iPhone utilise le token **Read-Only** d'Upstash : même si on vous le vole,
  personne ne peut modifier les données.
- Ne commitez jamais vos tokens dans Git.
