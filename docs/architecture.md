# Architecture de transfert et fusion — version 1

## Faisabilité

| Méthode                  | Fonctionnement réel                                     | Limites / sécurité                                                                                                             | Compatibilité                                                                   |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Identifiant BROC         | Repère local dérivé des 8 premiers caractères de l’UUID | Collision possible, aucune authentification ni récupération distante                                                           | Tous les écrans ; UUID complet utilisé pour toute fusion                        |
| Code BR1                 | Les données compressées et chiffrées sont dans le code  | Souvent trop long à recopier ; préférer copier-coller. Phrase secrète séparée                                                  | Navigateur moderne, hors ligne                                                  |
| QR autonome              | Exactement le même code BR1, sans URL                   | Affichage limité à 1 800 caractères pour la lisibilité ; aucune confidentialité intrinsèque du QR. Chiffrement obligatoire ici | Génération locale ; lecture locale depuis photo/image, pas de caméra PC requise |
| Fichier `.broc`          | Même code chiffré, export/import local                  | Canal de remise à choisir ; ne pas envoyer de données réelles par un service externe non évalué                                | Sélecteur de fichiers iOS/Android/PC, hors ligne                                |
| WebRTC / liaison directe | Non implémenté                                          | Signalisation, STUN/TURN, réseaux hospitaliers et métadonnées compliquent la fiabilité et le cadre HDS                         | Écarté du MVP                                                                   |

Un petit code de rendez-vous ne contient pas un programme. Aucun service de découverte, dépôt de fichiers, authentification, analyse d’usage ou relais réseau n’est intégré. Les seules requêtes de l’application sont les ressources statiques locales de son origine. Les ressources génériques ne contiennent aucun programme. Le service worker ne traite que la liste fermée des fichiers de la compilation, sans paramètres de requête.

## Modèle

Les schémas exécutables stricts Zod de `src/core.ts` sont la référence. Tous les documents portent `schema: 1` ; les versions inconnues sont refusées (migration à ajouter avant une v2).

- `Program` : UUID `id`, compteur local `revision`, `items`, `applied` (UUID de lots déjà traités), `history`.
- `Entity` : UUID `id` stable, UUID `rev`, `kind: exercise|goal`, identifiant stable `catalogueId`, titre, discipline d’origine immuable, séries, répétitions, minutes, fréquence, repos en secondes, consignes, adaptations, progression de l’objectif (0–100), état `active|inactive|removed`, date UTC ISO et auteur déclaratif.
- Aucun nom, date de naissance ou identifiant national du patient. Ne pas les saisir en texte libre.
- `Batch` : UUID du lot, UUID du programme, révision de départ, date, auteur, opérations `{id, before: Entity|null, after: Entity}`.
- Une création a `before:null`. Un retrait est une nouvelle révision avec `status:removed` ; on conserve cette pierre tombale pour les imports obsolètes. Rien n’est supprimé parce qu’absent d’un lot.
- `history` : date d’application, lot avec **état antérieur réellement remplacé**, identifiants acceptés. Il expose le dosage antérieur et l’auteur dans l’écran Mon parcours. Les choix « conserver » n’apparaissent pas comme appliqués ; le lot reste identifié comme traité.
- Suivi facultatif : tableau local séparé `{id,date,status}`. Jamais utilisé pour adapter automatiquement une prescription. Non transmis dans les exports de programme du MVP (limite explicite : la sauvegarde concerne les prescriptions et leur historique, pas les réalisations).

Le catalogue version 1 fournit dix exemples sans médias distants couvrant les neuf parcours prioritaires. Il n’y a pas de vidéos de démonstration. Les identifiants ne doivent jamais être réaffectés à d’autres mouvements. Le titre et les consignes prescrites sont conservés dans les documents pour rester lisibles si le catalogue change.

## Fusion atomique

1. Valider format, limites, UUID et appartenance au programme ; refuser un lot déjà appliqué.
2. Pour chaque ajout, vérifier que l’UUID n’existe pas. Pour chaque modification, comparer `before.rev` à la révision courante de cet élément. Le compteur global n’interdit pas des modifications indépendantes.
3. Toute divergence devient un conflit explicite. Le patient avec son professionnel choisit l’état courant ou l’état proposé, élément par élément. Aucun lot partiel n’est écrit avant toutes les décisions.
4. Les éléments non concernés sont conservés ; écrire l’état, l’historique et les UUID traités dans une seule transaction IndexedDB en mode patient/téléphone. Un échec d’écriture ne remplace pas l’état en mémoire.
5. Incrémenter le compteur global une fois par lot, y compris un lot entièrement refusé explicitement. La répétition du même lot est bloquée, y compris après annulation.

Une photographie complète sert à ouvrir une copie de travail sur PC ou à initialiser/restaurer un téléphone vide. Elle ne remplace jamais un programme existant sur le téléphone. Restaurer impose d’exporter puis d’effacer explicitement le programme courant. Le PC peut reprendre un nouvel état complet après finalisation ou abandon de son brouillon.

L’annulation construit un **nouveau lot inverse**, vérifie les révisions et restaure les états réellement remplacés ; les ajouts sont marqués retirés. Elle ne remet pas tout le programme à une ancienne photographie. Annuler l’annulation réapplique les états précédents. Historique et anti-rejeu sont conservés.

## Format de transport

Après validation du schéma, sérialisation UTF-8 JSON :

```json
{
  "schema": 1,
  "type": "snapshot",
  "program": {
    "schema": 1,
    "id": "UUID",
    "revision": 0,
    "items": [],
    "applied": [],
    "history": []
  }
}
```

Ou `{schema:1,type:"batch",batch:...}`. Compression DEFLATE brute fflate, puis AES-256-GCM (tag 128 bits) avec clé dérivée par PBKDF2-HMAC-SHA256, 210 000 itérations. Sel aléatoire 16 octets et IV aléatoire 12 octets à chaque export. La phrase n’est jamais sauvegardée ni transmise.

Format : `BR1-` suivi de Base32 RFC4648 majuscule, sans padding, de `sel[16] || IV[12] || ciphertext+tag`. Même représentation pour fichier, QR et code. Pas d’identité, URL, clé ou média dans un lien. L’intégrité cryptographique détecte corruption et phrase incorrecte ; **ce n’est pas une signature professionnelle**. Toute personne connaissant la phrase peut fabriquer un transfert.

Limites : JSON décompressé 2 000 000 octets, Base32 3 300 000 caractères, 500 éléments et opérations, 5 000 lots/historiques. Décompression incrémentale avec arrêt si dépassement. L’historique volumineux peut atteindre la limite avant 500 éléments : exporter/archiver n’élimine pas cette limite. Pas de découpage multi-QR dans le MVP ; fichier obligatoire au-delà du seuil QR. Un changement d’un de ces plafonds nécessite des tests de ressources.

## Stockage et exploitation

IndexedDB, base `broceliande-local`, store `patient`, clé `data` : programme et suivi. Pas de stockage patient distant ; le poste PC travaille uniquement dans l’état React. Fermer la session retire les références de travail de l’interface (effacement sécurisé de la RAM non garanti par JavaScript).

Le stockage local n’est pas chiffré par l’application. Verrouillage et chiffrement système du téléphone indispensables à évaluer. Les caches ne contiennent que les fichiers statiques. Les sauvegardes système du navigateur/téléphone peuvent avoir leurs propres mécanismes cloud : le déploiement doit les examiner, et l’application ne peut pas garantir leur absence.

Déploiement à la racine d’un hébergement HTTPS, sans injection de scripts tiers. Configurer au niveau du serveur : TLS, politique CSP sans origine externe (les workers et images `data:` doivent être autorisés localement), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, pas de télémétrie. Évaluer soigneusement les journaux et les changements de code statique : une mise à jour malveillante du client aurait accès aux données locales.
