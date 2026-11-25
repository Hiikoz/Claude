# Ma Vidéothèque

Petite web app pour iPhone : je note les films et séries que j'ai regardés pour les retrouver facilement.

## Fonctions
- **Remplissage automatique** : on tape le titre, on choisit Film ou Série, puis on touche le bon résultat. L'année, le genre, le synopsis, l'affiche, la durée, le nombre de saisons et d'épisodes et où regarder en France se remplissent seuls (base TMDB, clé gratuite à mettre dans Réglages ; sans clé, les séries marchent via TVmaze)
- Ajouter un film ou une série : titre, statut (Vu / En cours / À voir), note sur 5 étoiles, date de visionnage, année, genre, plateforme, saison et épisode (séries), lien d'affiche, mon avis
- **Fiche détaillée** : grande affiche, synopsis, note TMDB, réalisateur, acteurs, où regarder, bouton **Bande-annonce VF**, progression et bouton « +1 épisode » pour les séries
- **Nouveautés des séries** : vérification automatique deux fois par jour, avec une alerte 🔔 quand une nouvelle saison est annoncée ou sort
- **Saga complète** : après avoir choisi un film, un bouton ajoute tous les films sortis de sa saga d'un coup
- **Suites de films** : alerte 🔔 quand une suite d'un de tes films est annoncée, puis quand elle sort, avec un bouton pour l'ajouter « À voir »
- **Pour toi ✨** : une vingtaine de films et de séries (deux onglets) que tu n'as pas encore vus, choisis d'après ce que tu as regardé. Pour chaque titre : où le regarder en France, la raison (« Parce que tu as aimé… »), le résumé et la bande-annonce. Bouton **✓ Vu** (le titre rejoint ta vidéothèque) et **👎 Pas aimé** (il ne revient plus, et les titres du même style reculent). Pas d'anime, et pas de titre d'avant 2000 sauf les grands classiques
- **Une envie ? 🔎** : dans « Pour toi », on tape un thème (« Guerre », « Militaire », « Hôpital », « Braquage », « Voyage dans le temps »…) et l'app propose les films et séries les plus connus et les mieux notés sur ce thème, avec les mêmes fiches (où regarder, résumé, bande-annonce) et un bouton **＋ À voir** en plus. Des idées de thèmes sont proposées sous le champ. Les mots courants sont traduits par l'app elle-même ; pour un mot qu'elle ne connaît pas, seul ce mot est envoyé au service de traduction gratuit MyMemory
- **Vue Affiches** : la liste en grille d'affiches
- **Statistiques** : temps passé devant l'écran, films et épisodes vus, note moyenne, titres par mois, genres et plateformes préférés, mieux notés
- Recherche, filtres (films, séries, vus, en cours, à voir, coups de cœur) et tri
- Thème « Cinéma » animé, mode sombre automatique, fonctionne hors ligne
- Sauvegarde : export / import d'un fichier `.json` (à garder dans Fichiers ou iCloud Drive)

Les données restent sur le téléphone (stockage local du navigateur) : ta vidéothèque n'est envoyée nulle part. Seules les recherches partent vers TMDB, TVmaze et, pour les thèmes peu courants, MyMemory.

## Installer sur l'iPhone
1. Mettre l'app en ligne avec GitHub Pages : sur GitHub, **Settings → Pages**, source « Deploy from a branch », choisir la branche et le dossier `/ (root)`.
2. Ouvrir l'adresse donnée (`https://<utilisateur>.github.io/<dépôt>/`) dans **Safari** sur l'iPhone.
3. Bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.

L'icône « Vidéothèque » apparaît alors comme une vraie app, en plein écran.
