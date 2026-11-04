# Brocéliande Rééducation

Prototype PWA de prescription collaborative **sans backend de dossiers patients**. Les programmes sont conservés sur le téléphone ; chaque poste professionnel récupère une copie explicite, travaille en mémoire, puis rend un lot incrémental. Un code court ne récupère aucune donnée.

**Démonstration uniquement : catalogue et parcours non validés pour les soins réels. Aucune conformité RGPD, HDS ou dispositif médical n’est revendiquée.**

## Tester sans installer Node.js

Le workflow [Publier Brocéliande sur GitHub Pages](.github/workflows/pages.yml) installe les outils dans GitHub, exécute les tests, compile et publie uniquement `dist/`. Aucun outil à installer sur les ordinateurs ou téléphones qui utilisent le site.

**Première activation par le propriétaire du dépôt** : GitHub → **Settings → Pages → Build and deployment → Source → GitHub Actions**. Si Pages n’est pas proposé, vérifier les droits d’administration et les conditions du forfait GitHub pour la visibilité actuelle du dépôt ; le workflow ne change pas sa visibilité.

Ensuite, ouvrir **Actions → Publier Brocéliande sur GitHub Pages → Run workflow → main → Run workflow**. L’adresse confirmée par GitHub apparaît dans le job de déploiement et dans Settings → Pages. L’adresse prévue pour ce dépôt est `https://med4tek.github.io/broceliande-reeducation-codex/` ; elle ne doit être considérée disponible qu’après un déploiement réussi. Chaque nouveau push sur `main` relance tests et publication.

L’artefact de compilation `github-pages` est également téléchargeable depuis une exécution réussie du job de construction. Le code source reste dans Git ; la compilation est générée par Actions et n’a pas besoin d’être ajoutée au dépôt.

Le site distribue uniquement les fichiers génériques de l’application. Les programmes ne sont jamais envoyés à GitHub par l’application. GitHub peut traiter les métadonnées normales de consultation du site ; cela ne constitue pas une validation réglementaire pour les soins.

**Important :** les données locales sont liées au navigateur, à l’origine et au chemin de déploiement. Avant de changer d’adresse ou de navigateur, exporter le programme chiffré puis le restaurer à la nouvelle adresse. Pour les premiers essais, utiliser exclusivement des données fictives.

## Démarrer

Node.js 22.12+ (testé avec 24.22.1), npm et un navigateur récent sont requis.

```sh
npm ci
npm test
npm run build
npm run preview -- --port 4173
```

`npm run dev` : développement avec rechargement automatique. Le service worker est activé uniquement dans la version compilée (`build` puis `preview`). Héberger `dist/` **sur une origine HTTPS** pour les téléphones (racine par défaut ; sous-chemin configurable avec `VITE_BASE_PATH`) ; localhost est accepté pour le développement. Ne jamais mettre de données individuelles dans les URL. Aucun secret de serveur nécessaire.

```sh
npm run test:e2e
```

Les tests navigateur utilisent Chromium système si disponible, sinon celui de Playwright (`npx playwright install chromium`). Variable facultative `PLAYWRIGHT_CHROMIUM_PATH` pour un exécutable local. Les tests démarrent et arrêtent leur propre serveur compilé sur le port 4173, qui doit être libre.

## Essayer le scénario

1. « Je suis professionnel » → « Essayer avec les 3 exercices du scénario fictif » → finaliser.
2. Partager le **programme complet** avec une phrase secrète d’au moins 8 caractères. Télécharger le fichier chiffré.
3. Sur le téléphone, « Je suis patient » → importer le fichier et sa phrase secrète → vérifier et valider.
4. Le patient partage son programme actuel. Sur un autre poste, importer ce programme, ajouter les deux exercices ERGO, finaliser et **transmettre le dernier lot**. Le patient importe ce lot : cinq exercices.
5. Refaire depuis le programme actualisé avec les deux exercices APA : sept exercices.
6. Un kinésithérapeute importe la version actuelle, adapte la flexion à 3 × 15 et désactive la marche. Finaliser et transmettre le lot.

Pour tester la concurrence, importer le même état sur deux postes puis modifier le même exercice différemment. Le deuxième lot affiche les deux versions et exige une décision. Les ajouts indépendants restent conservés.

## Livrables

- [Architecture et formats](docs/architecture.md)
- [Notice patients et thérapeutes](docs/notices.md)
- [Validation et limites réglementaires](docs/validation.md)
- Moteur indépendant : `src/core.ts` ; chiffrement et transport : `src/transfer.ts`.
- Catalogue versionné de démonstration : `src/catalogue.ts` ; stockage : `src/storage.ts`.
- Tests métier : `tests/core.test.ts` ; parcours navigateur : `tests/browser/workflow.spec.ts`.

Le poste professionnel ne stocke pas le programme dans IndexedDB. Les fichiers téléchargés, le presse-papiers, les captures et les fonctions du système d’exploitation restent hors du contrôle de l’application. Utiliser uniquement des données fictives à ce stade.
