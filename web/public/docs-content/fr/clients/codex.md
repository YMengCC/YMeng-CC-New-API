---
title: Codex CLI
description: Faire passer Codex CLI, l'outil officiel d'OpenAI, par {{SYSTEM_NAME}} grâce aux variables d'environnement.
---

[Codex CLI](https://github.com/openai/codex) est l'assistant de programmation en ligne de commande officiel d'OpenAI. Il suffit de définir deux variables d'environnement pour qu'il appelle les modèles via {{SYSTEM_NAME}}.

## Prérequis

Créez une clé sur la page [Clés API](/keys) et copiez-la, puis installez Codex CLI en suivant sa documentation officielle.

## Étapes de configuration

Définissez les variables d'environnement suivantes dans votre terminal (remplacez `YOUR_API_KEY` par votre clé).

macOS / Linux :

```bash
export OPENAI_BASE_URL="{{BASE_URL}}/v1"
export OPENAI_API_KEY="YOUR_API_KEY"
```

Windows PowerShell :

```powershell
$env:OPENAI_BASE_URL = "{{BASE_URL}}/v1"
$env:OPENAI_API_KEY = "YOUR_API_KEY"
```

Une fois la configuration terminée, lancez Codex CLI **dans la même fenêtre de terminal**.

Si vous gérez vos configurations avec [CC Switch](https://ccswitch.io/zh/), vous pouvez aussi choisir **CC Switch** dans le menu **⋯** de la liste des clés API, sélectionner `Codex` pour **Application**, puis importer en un clic ; `/v1` est ajouté automatiquement à l'adresse.

:::tip Rendre la configuration permanente
Ajoutez les lignes `export` ci-dessus à un fichier de configuration du shell, comme `~/.bashrc` ou `~/.zshrc`, puis ouvrez un nouveau terminal.
:::

## Modèles recommandés

- `gpt-4.1`
- `gpt-4o-mini`

Utilisez un nom de modèle disponible pour le groupe choisi dans la [Place des modèles](/pricing).

## Problèmes fréquents

| Symptôme                                                           | Cause                                                                                       | Solution                                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 401                                                                | `OPENAI_API_KEY` n'est pas défini dans le terminal en cours                                 | Définissez-la dans la même fenêtre de terminal, ou ajoutez-la au fichier de configuration du shell puis ouvrez un nouveau terminal         |
| Les requêtes partent toujours vers les serveurs officiels d'OpenAI | `OPENAI_BASE_URL` n'est pas pris en compte, ou est écrasé par une autre configuration       | Exécutez `echo $OPENAI_BASE_URL` pour vérifier sa valeur et recherchez les réglages contradictoires dans les scripts de démarrage du shell |
| model not found                                                    | Le nom du modèle ne correspond pas aux modèles réellement disponibles dans le groupe choisi | Choisissez l'un des modèles recommandés, ou consultez la liste disponible dans la Place des modèles                                        |

## Essayer maintenant

Pour vérifier d'abord que votre clé et le modèle fonctionnent, envoyez directement un message dans l'[Aire de jeux](/playground).
