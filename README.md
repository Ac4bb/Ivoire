# 🎹 Ivoire

**Ivoire est un piano virtuel interactif** qui permet de jouer de la musique directement dans son navigateur. Il propose deux instruments, un mode entraînement, la gestion des partitions AZERTY et QWERTY ainsi que plusieurs options de personnalisation.

## 📋 Prérequis

- **Windows, Linux ou macOS** avec **Node.js 24**.
- Si tu télécharges les sources, **lance le serveur local** (voir Lancement) pour utiliser le piano dans ton navigateur. Aucune compilation ni installation de dépendances npm n'est nécessaire.

## 🚀 Lancement

Choisis l'une des deux options :

- **Port fixe :** sur la page GitHub, clique sur **Code → Download ZIP**, puis extrais l'archive. Ouvre un terminal dans le dossier du projet et lance :

```
node tools/serve.mjs 5050
```

- **Port automatique :** si le port 5050 est indisponible, lance :

```
node tools/serve.mjs 0
```

Ouvre ensuite `http://127.0.0.1:5050/` dans ton navigateur, ou l'adresse indiquée dans le terminal si tu utilises le port automatique.

## ⚠️ Informations importantes

Ivoire fonctionne localement et ne nécessite aucun compte ni service distant.

Chaque utilisateur peut ajouter, modifier et conserver ses propres partitions en AZERTY ou QWERTY. Les partitions personnelles, les favoris et la progression sont enregistrés directement dans son navigateur, sans être partagés avec les autres utilisateurs.

Ces données peuvent être perdues si tu effaces les données du navigateur ou changes de profil. Pour retrouver tes partitions, utilise le même navigateur et la même adresse locale.

Le projet ne contient aucune bibliothèque de morceaux personnels, mais propose une démonstration intégrée.

## 📄 Licence

MIT pour le code original, voir le fichier `LICENSE`.

Les banques audio et les ressources tierces possèdent leurs propres licences, voir `AUDIO-LICENSES.md`. Les illustrations issues de *Berserk* et les icônes dérivées sont exclues de la licence MIT et restent soumises aux droits de leurs propriétaires respectifs.
