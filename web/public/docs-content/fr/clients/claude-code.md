---
title: Claude Code
description: Définir la Base URL et le jeton de Claude Code, l'outil officiel d'Anthropic, ou l'importer en un clic avec CC Switch.
---

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) est l'assistant de programmation en ligne de commande officiel d'Anthropic. Il existe deux façons de le connecter : l'import en un clic via CC Switch, ou la définition manuelle de variables d'environnement.

## Méthode 1 : import en un clic avec CC Switch (recommandé)

[CC Switch](https://ccswitch.io/zh/) est un outil graphique qui permet de gérer plusieurs configurations de Claude Code et de passer rapidement de l'une à l'autre.

1. Installez CC Switch ;
2. Sur la page [Clés API](/keys), ouvrez le menu **⋯** à droite de la clé et choisissez **CC Switch** ;
3. Dans la fenêtre qui s'ouvre, sélectionnez `Claude` pour **Application**, puis choisissez le **Modèle principal** (vous pouvez aussi renseigner les modèles correspondant à Haiku / Sonnet / Opus) ;
4. Cliquez sur **Ouvrir le commutateur CC**, puis confirmez l'import et activez cette configuration dans CC Switch ;
5. Rouvrez votre terminal et lancez Claude Code.

## Méthode 2 : définir manuellement les variables d'environnement

Définissez les variables d'environnement suivantes dans votre terminal (remplacez `YOUR_API_KEY` par votre clé).

macOS / Linux :

```bash
export ANTHROPIC_BASE_URL="{{BASE_URL}}"
export ANTHROPIC_AUTH_TOKEN="YOUR_API_KEY"
```

Windows PowerShell :

```powershell
$env:ANTHROPIC_BASE_URL = "{{BASE_URL}}"
$env:ANTHROPIC_AUTH_TOKEN = "YOUR_API_KEY"
```

Une fois la configuration terminée, exécutez `claude` dans la même fenêtre de terminal.

:::danger N'ajoutez pas /v1 à l'adresse
Claude Code ajoute lui-même `/v1/messages`. Dans `ANTHROPIC_BASE_URL`, saisissez uniquement `{{BASE_URL}}` ; ajouter `/v1` fera échouer les requêtes.
:::

## Modèles recommandés

- `claude-sonnet-5`
- `claude-opus-5`

Utilisez un nom de modèle disponible pour le groupe choisi dans la [Place des modèles](/pricing).

## Problèmes fréquents

| Symptôme                                                                       | Cause                                                                                         | Solution                                                                                      |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 401 / authentication_error                                                     | `ANTHROPIC_AUTH_TOKEN` n'est pas défini, ou la clé a été désactivée ou supprimée              | Créez une nouvelle clé et vérifiez qu'elle est bien définie dans le terminal en cours         |
| Les requêtes partent toujours vers les serveurs officiels d'Anthropic          | `ANTHROPIC_BASE_URL` n'est pas pris en compte, ou `/v1` y a été ajouté                        | Saisissez l'adresse exactement comme indiqué sur cette page, sans aucun chemin                |
| Après un changement de configuration, l'ancienne adresse est toujours utilisée | Plusieurs configurations locales se mélangent et le changement n'a pas été fait via CC Switch | Gérez toutes vos configurations avec CC Switch et rouvrez le terminal après chaque changement |

## Essayer maintenant

Pour vérifier d'abord que votre clé et le modèle fonctionnent, envoyez directement un message dans l'[Aire de jeux](/playground).
