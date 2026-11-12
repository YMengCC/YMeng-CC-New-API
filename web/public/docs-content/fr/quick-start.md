---
title: Démarrage rapide
description: Inscription, recharge, création d'une clé API, configuration du client et premier appel, en 5 étapes.
---

Cette page vous guide pas à pas à travers le parcours complet : **inscription → recharge → création d'une clé API → configuration du client → premier appel**. Quelques minutes suffisent.

:::info Retenez ces deux informations
- **Base URL** : `{{BASE_URL}}/v1` (pour les clients et SDK compatibles OpenAI)
- **Authentification** : en-tête de requête `Authorization: Bearer votre clé API`
:::

## Étape 1 : créer un compte

Ouvrez la [page d'inscription](/sign-up), saisissez un nom d'utilisateur et un mot de passe pour vous inscrire. Si le site propose d'autres modes de connexion, comme l'e-mail ou GitHub, vous pouvez aussi les utiliser directement.

![Page d'inscription](/docs-assets/quick-start/fr/step-1-sign-up.png "Page d'inscription")

## Étape 2 : recharger votre compte

Une fois connecté, cliquez sur **Points** dans le menu de gauche pour accéder à la [page du portefeuille](/wallet). Dans la zone « Ajouter des fonds », choisissez un montant prédéfini ou saisissez un montant personnalisé, puis sélectionnez une méthode de paiement pour régler. Si vous disposez d'un code d'échange, vous pouvez également l'utiliser sur cette même page.

![Zone de recharge de la page du portefeuille](/docs-assets/quick-start/fr/step-2-top-up.png 'Choisissez le montant et la méthode de paiement dans « Ajouter des fonds »')

:::tip
Le solde obtenu par recharge n'expire pas. Les paliers de montant, les méthodes de paiement et le montant minimum de recharge sont ceux affichés sur la page. Pour les règles de facturation, consultez [Facturation](/pricing).
:::

## Étape 3 : créer une clé API

Accédez à la page [Clés API](/keys) et cliquez sur **Créer une clé API** en haut à droite :

1. **Nom** : saisissez ce que vous voulez pour identifier l'usage de la clé, par exemple `my-first-key`.
2. **Groupe** : le groupe détermine les modèles que cette clé peut appeler et le multiplicateur de facturation appliqué. La liste déroulante affiche le multiplicateur de chaque groupe et indique s'il accepte les bons d'achat.
3. **Heure d'expiration**, **Quota** : conservez les valeurs par défaut (sans expiration, quota illimité) ; ne les définissez que si vous souhaitez limiter les risques.
4. Cliquez sur **Enregistrer les modifications**.

![Créer une clé API](/docs-assets/quick-start/fr/step-3-create-key.png 'Saisissez un nom et choisissez un groupe')

:::warning Protégez votre clé API comme un mot de passe
La clé permet de consommer directement votre solde. Ne la partagez pas dans des discussions de groupe, des captures d'écran ou des dépôts de code publics. En cas de fuite, désactivez-la ou supprimez-la immédiatement dans la liste, puis créez-en une nouvelle.
:::

## Étape 4 : configurer le client

Dans la liste des clés, cliquez sur l'icône de copie à côté de la clé, ou ouvrez le menu **⋯** à droite et choisissez **Copier la clé**. Le même menu propose aussi :

- **CC Switch** : importe la clé dans CC Switch en un clic, idéal pour les utilisateurs de Claude Code.
- **Discuter** : ouvre directement la clé dans un client de discussion compatible.

![Menu d'actions de la clé](/docs-assets/quick-start/fr/step-4-key-menu.png 'Copiez la clé ou importez-la dans un client en un clic')

Renseignez ensuite deux champs dans votre client :

| Type de client                                            | Adresse (Base URL / API Host) | Clé           |
| --------------------------------------------------------- | ----------------------------- | ------------- |
| Clients compatibles OpenAI (Cherry Studio, ChatBox, etc.) | `{{BASE_URL}}/v1`             | Votre clé API |
| Claude Code                                               | `{{BASE_URL}}` (sans `/v1`)   | Votre clé API |

:::danger Erreur la plus fréquente : /v1 en trop ou manquant dans l'adresse
Les clients compatibles OpenAI nécessitent généralement `/v1`, alors que Claude Code ne doit **pas** l'inclure. Certains clients ajoutent `/v1` automatiquement ; dans ce cas, saisissez simplement `{{BASE_URL}}`. N'ajoutez pas de barre oblique à la fin de l'adresse. Pour la configuration de chaque client, consultez [Configuration des clients](/docs/clients/cherry-studio).
:::

## Étape 5 : effectuer votre premier appel

Remplacez `YOUR_API_KEY` dans la commande ci-dessous par votre clé, puis exécutez-la dans un terminal :

```bash
curl {{BASE_URL}}/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{ "role": "user", "content": "Bonjour, ceci est mon premier appel" }]
  }'
```

Si la réponse contient le champ `choices`, l'intégration fonctionne. Utilisez un nom de modèle disponible pour le groupe choisi dans la [Place des modèles](/pricing).

Si vous préférez éviter la ligne de commande, ouvrez l'[Aire de jeux](/playground), choisissez un modèle et envoyez directement un message de test.

![Test dans l'Aire de jeux](/docs-assets/quick-start/fr/step-5-playground.png "Envoyez votre premier message dans l'Aire de jeux")

## Étapes suivantes

- Comprendre comment les coûts sont calculés : [Facturation](/pricing)
- Configurer vos clients habituels : [Cherry Studio](/docs/clients/cherry-studio), [Claude Code](/docs/clients/claude-code)
- Appeler l'API depuis votre code : [Présentation de l'API](/docs/api/overview)
- En cas d'erreur : [Erreurs courantes](/docs/faq/errors)
