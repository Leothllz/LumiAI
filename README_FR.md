# Guide du projet Lumi

Ce fichier décrit les parties principales du dépôt **LumiAI** et explique l'organisation du code. Il complète le `README.md` en anglais avec un aperçu détaillé des fichiers importants et des technologies utilisées.

## Organisation générale

- **`backend/`** : serveur Node.js basé sur **Express** qui expose l'API de chat et intègre la chaîne RAG (Retrieval-Augmented Generation).
- **`frontend/`** : application **Vue 3** construite avec **Vite** pour l'interface web de Lumi.
- **`data/`** : textes (format `.txt` ou `.md`) utilisés pour constituer l'index de connaissances.
- **`lumi_rag.js`** : script Node.js autonome permettant de tester la chaîne RAG en ligne de commande.
- **`index.json`** : fichier d'index généré automatiquement lors du premier lancement pour accélérer les recherches ultérieures.

Chaque sous-projet possède son `package.json` avec les dépendances nécessaires.

## Détails des principaux fichiers

### Backend (`backend/`)

- **`server.js`** : point d'entrée du serveur Express. Il charge/initialise l'index RAG via `rag.js` puis expose l'endpoint `/api/lumi-stream` qui renvoie les réponses de l'IA en streaming.
- **`rag.js`** : toutes les fonctions de la chaîne RAG (chargement des documents, création d'index avec embeddings, recherche par similarité cosinus). Le module peut utiliser OpenAI, DeepSeek ou Google pour les embeddings et les modèles de chat.
- **`test-rag.js`** : petit script de test pour vérifier que l'indexation et la recherche fonctionnent.
- **`test-index.json`** : échantillon d'index prêt à l'emploi pour les tests unitaires.
- **`package.json`** : liste les dépendances (OpenAI, Google, nodemon...) et définit les scripts `start` et `dev`.

### Frontend (`frontend/`)

- **`index.html`** : fichier HTML minimal qui monte l'application Vue.
- **`src/main.js`** : crée l'instance Vue et monte le composant principal `App.vue`.
- **`src/App.vue`** : composant principal gérant l'interface de chat (messages, envoi de requêtes, thème clair/sombre, etc.).
- **`tailwind.config.js`** et **`postcss.config.js`** : configuration de Tailwind CSS utilisée pour le style.
- **`src/style.css`** : feuille de style regroupant les utilitaires Tailwind importée dans l'application.
- **`vite.config.js`** : configuration du serveur de développement (proxy vers `/api`) et plugin Vue.
- **`public/img/`** : contient les GIF d'animation de l'avatar (état idle et en parole).

### Autres fichiers

- **`lumi_rag.js`** : script CLI indépendant pour indexer les fichiers du dossier `data/` et discuter avec Lumi depuis le terminal (options `--reindex`, `--embedProvider`, `--chatProvider`, ...).
- **`package.json`** (racine) : fournit les dépendances communes au script CLI (OpenAI SDK, utilitaires de tokenisation, etc.).
- **`node_modules/`** : répertoire généré après installation des dépendances.
- **`index.json`** : index RAG créé automatiquement pour accélérer les réponses (à ne pas modifier manuellement).

## Frameworks et choix techniques

- **Express** est utilisé côté serveur pour sa simplicité et sa compatibilité avec les flux SSE (Server-Sent Events) employés ici pour envoyer la réponse de l'IA progressivement.
- **Vue 3** couplé à **Vite** est choisi pour le frontend : l'écosystème Vue offre une courbe d'apprentissage douce et un rendu réactif idéal pour une interface de chat légère.
- **Tailwind CSS** permet de styliser rapidement l'interface sans écrire beaucoup de CSS personnalisé.
- **Yargs** sert à gérer les options de la CLI `lumi_rag.js`.
- **Fast-glob** et **tiktoken** sont utilisés côté serveur pour parcourir les fichiers et découper efficacement les textes.

## Fonctionnement global

1. Au démarrage, le backend vérifie la présence d'un fichier d'index (`index.json`). S'il n'existe pas, il lit tous les documents de `data/`, les découpe en morceaux et crée les embeddings pour constituer l'index.
2. Lorsqu'un utilisateur envoie une question depuis le frontend, `server.js` récupère les passages les plus pertinents grâce à `rag.js` puis appelle le modèle de chat choisi. La réponse est renvoyée au fur et à mesure via l'endpoint `/api/lumi-stream`.
3. Le frontend affiche cette réponse en direct et gère les interactions (saisie de la question, thème clair/sombre, animation de l'avatar, etc.).
4. Le script `lumi_rag.js` permet de réaliser les mêmes étapes sans interface graphique, uniquement dans le terminal.
5. Les clés API (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, ...) doivent être définies dans l'environnement pour que les appels aux modèles fonctionnent.
6. Exemple de lancement de la CLI : `node lumi_rag.js --reindex --embedProvider openai --chatProvider deepseek`.

