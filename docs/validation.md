# Validation et limites

## Vérifications du prototype

Tests exécutés dans l’environnement cloud Linux, Node.js 24.22.1, Chromium 155.0.8059.79 système via Playwright. Les postes indépendants sont des **contextes navigateur isolés**, pas trois ordinateurs physiques. Un format mobile 390 × 844 vérifie l’interface tactile et l’absence de débordement horizontal.

- `npm test` : **9 tests réussis sur 9** : métier/transport, scénario 3 → 5 → 7, adaptation à 3 × 15 et désactivation de la marche, ajouts obsolètes indépendants, conflits du même élément, retrait concurrent, annulation, anti-rejeu, mauvais programme, formats incohérents, transfert chiffré de 200 éléments, code corrompu et mauvais secret.
- `npm run test:e2e` : **5 parcours Chromium réussis sur 5** : trois professionnels et un patient, transfert par fichier/code, persistance IndexedDB et rechargement hors ligne ; QR généré puis décodé depuis ses vrais pixels ; édition directe sur téléphone, objectif et effacement ; choix explicite d’un conflit, rejet du doublon et annulation ; concurrence entre deux onglets.
- `npm ci --no-audit --no-fund --cache /tmp/broceliande-npm-cache` : installation reproduite à partir du lockfile, puis tests et compilation relancés.
- `npm run build` : TypeScript strict et compilation des ressources statiques ; service worker généré avec une liste fermée des ressources à précharger. Avertissement non bloquant de taille du bundle principal (~515 Ko avant gzip).

Le test hors ligne utilise l’émulation réseau coupé de Chromium après activation du service worker et recharge intégralement la page : consultation du programme et suivi enregistrés doivent rester présents. Ce n’est pas un redémarrage physique du téléphone. Un défaut de cache lié à `Vary: Origin` a été corrigé : la recherche des seules ressources statiques connues ignore cet en-tête lors de la lecture du cache.

### À tester avant tout pilote

- iPhone/Safari et Android/Chrome **physiques** : installation, permissions photo, photo de QR affiché sur différents écrans, stockage après redémarrage et longue période d’inactivité, comportement sous pression mémoire, restauration et mises à jour de l’application.
- Ergonomie avec patients et professionnels, navigation clavier et lecteur d’écran ; aucun audit complet WCAG/RGAA n’est revendiqué.
- Appareils gérés de l’établissement : téléchargement, choix de fichier, restrictions du navigateur et du réseau.
- Tests de quotas, disque plein et éviction IndexedDB sur chaque plateforme ; la transaction évite une écriture partielle, mais ne protège pas d’une suppression du stockage par le système.
- Audit de sécurité indépendant et tests de fichiers malformés plus étendus ; l’intégrité cryptographique et les schémas sont une première protection, pas un audit.

## Limites fonctionnelles assumées

- Pas de serveur, de synchronisation automatique, de rendez-vous par code court, de compte professionnel certifié ni de notification à distance. Un professionnel doit récupérer un état actuel du patient et lui remettre chaque lot. Le dernier lot reste disponible en mémoire tant que la session n’est pas fermée ; exporter immédiatement.
- Un seul programme patient persistant par navigateur/origine. Plusieurs programmes sur un PC ne sont pas une fonction de gestion de dossiers : une copie de travail à la fois.
- Protection contre les onglets obsolètes : lecture de l’état attendu puis écriture dans une même transaction ; si un autre onglet a écrit entre-temps, l’application exige un rechargement, sans écraser les données.
- Pas de vidéos ni d’illustrations cliniques animées ; les symboles graphiques sont décoratifs. Dix exercices génériques de démonstration, sans validation thérapeutique.
- QR unique limité, fichier de repli obligatoire. La saisie manuelle d’un programme complet est généralement impraticable.
- Export de programme : prescriptions, objectifs, révisions, historique et anti-rejeu, **sans suivi quotidien**. Le suivi est local et consultable sur le téléphone ; son export sécurisé est une évolution future.
- Données locales non chiffrées par l’application ; exports chiffrés par phrase secrète, sans récupération de clé. Une phrase courte/faible reste vulnérable à une attaque hors ligne. Utiliser une phrase longue unique et un canal distinct.
- L’effacement physique de la RAM, du presse-papiers, des captures et des exports n’est pas garanti. « Fermer la session » retire les données de travail de l’interface ; ne remplace pas les procédures des postes partagés.
- Historique et anti-rejeu ont des plafonds documentés ; pas encore d’archivage/compactage sans perte de causalité. Une sauvegarde régulière ne suffit pas à supprimer ces plafonds.

## Cadre réglementaire à instruire

Un stockage local sans identité nominative peut toujours constituer un traitement de données de santé à caractère personnel. Le code local ne rend pas le programme anonyme. Avec DPO, DSI, responsables cliniques et conseil compétent, établir les rôles et responsabilités, finalités, bases légales et exception applicable aux données de santé, information et droits des patients, conservation, gestion des incidents, analyse d’impact si requise et organisation du partage. Le consentement à remettre le téléphone ne constitue pas, à lui seul, l’ensemble de ce cadre.

L’absence de base distante de prescriptions ne suffit pas à conclure à une exemption HDS : examiner l’architecture réellement déployée, l’hébergement du client statique, journaux, exports, messageries, sauvegardes système et prestataires. Toute évolution vers une signalisation ou un relais éphémère doit expliciter flux et métadonnées et recevoir une analyse séparée ; le chiffrement ne décide pas à lui seul du périmètre HDS.

La destination médicale revendiquée et les fonctions réellement utilisées peuvent relever du règlement européen des dispositifs médicaux logiciels. Une analyse de qualification, de classification et des exigences associées est nécessaire avant diffusion clinique ; ce prototype n’a aucune certification, marquage ou validation clinique. Ne pas utiliser le catalogue pour traiter un patient réel.

## Évolutions recommandées

1. Revue clinique et tests utilisateurs des parcours et doses, puis essais réels iOS/Android.
2. Audit sécurité, gestion du verrouillage, politique de sauvegarde locale et analyse réglementaire formalisée.
3. Sauvegarde chiffrée du suivi, explication des changements à la granularité des champs et meilleure aide à la saisie.
4. Migrations de schéma, compatibilité de catalogue et stratégie d’archivage conservant les retraits/anti-rejeu.
5. Médias embarqués validés, installation et mises à jour guidées, audit complet d’accessibilité.
