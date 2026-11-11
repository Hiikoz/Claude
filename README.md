# Ma Vidéothèque

Petite web app pour iPhone : je note les films et séries que j'ai regardés pour les retrouver facilement.

## Fonctions
- **Remplissage automatique** : on tape le titre, on choisit Film ou Série, puis on touche le bon résultat. L'année, le genre, le synopsis, l'affiche, la durée, le nombre de saisons et d'épisodes et où regarder en France se remplissent seuls (base TMDB, clé gratuite à mettre dans Réglages ; sans clé, les séries marchent via TVmaze)
- Ajouter un film ou une série : titre, statut (Vu / En cours / À voir), note sur 5 étoiles, date de visionnage, année, genre, plateforme, saison et épisode (séries), lien d'affiche, mon avis
- Recherche, filtres (films, séries, vus, en cours, à voir, coups de cœur) et tri
- Fonctionne hors ligne, mode sombre automatique
- Sauvegarde : export / import d'un fichier `.json` (à garder dans Fichiers ou iCloud Drive)

Les données restent sur le téléphone (stockage local du navigateur), rien n'est envoyé sur Internet.

## Installer sur l'iPhone
1. Mettre l'app en ligne avec GitHub Pages : sur GitHub, **Settings → Pages**, source « Deploy from a branch », choisir la branche et le dossier `/ (root)`.
2. Ouvrir l'adresse donnée (`https://<utilisateur>.github.io/<dépôt>/`) dans **Safari** sur l'iPhone.
3. Bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.

L'icône « Vidéothèque » apparaît alors comme une vraie app, en plein écran.
