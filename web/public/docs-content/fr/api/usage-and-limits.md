---
title: Consommation et limites de requêtes
description: Comment consulter les tokens et le coût d'une requête, et les limites de fréquence de la console et de l'API.
---

Cette page explique deux choses : comment savoir ce qu'une requête précise a consommé, et quelles limites de fréquence s'appliquent sur {{SYSTEM_NAME}}.

## Consulter la consommation d'une requête

### Depuis la console

Ouvrez [Journal d'utilisation](/usage-logs/common). Chaque ligne correspond à un appel d'API.

| Colonne               | Signification                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Tokens                | Affiché sous la forme `entrée / sortie`. En cas de cache, les lectures et écritures de cache sont indiquées en dessous |
| Coût                  | Le montant réellement prélevé pour cette requête, dans la devise affichée par le site                                  |
| Modèle / Clé / Groupe | Le modèle, la clé d'API et le groupe ayant traité la requête                                                           |
| Durée                 | Durée en secondes et indication de streaming                                                                           |

Cliquez sur une ligne pour voir le détail : mode de facturation, prix unitaire appliqué, répartition des tokens facturables et cache.

### Par identifiant de requête

Chaque réponse d'API contient un identifiant dans ses en-têtes :

```http
X-Oneapi-Request-Id: <identifiant de requête>
```

Interrogez cet identifiant pour récupérer l'entrée de journal de cette requête :

```bash
curl {{BASE_URL}}/api/log/self?request_id=REQUEST_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

`request_id` étant unique, `data.items` ne contient normalement qu'une seule entrée :

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "created_at": 1761177600,
        "type": 2,
        "model_name": "claude-sonnet-5-5",
        "token_name": "my-key",
        "group": "default",
        "prompt_tokens": 1520,
        "completion_tokens": 380,
        "quota": 1450,
        "use_time": 3,
        "is_stream": true,
        "request_id": "20261023xxxxxxxx"
      }
    ],
    "total": 1
  }
}
```

Cet endpoint exige une session connectée ou un jeton d'accès généré depuis la page du compte. Une clé API `sk-` ne peut pas l'appeler ; utilisez la méthode ci-dessous.

### Avec une clé d'API uniquement

Si vous disposez seulement d'une clé, sans compte connecté :

```bash
curl {{BASE_URL}}/api/log/token \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Cet endpoint renvoie les **1000 entrées les plus récentes** de cette clé. Il n'accepte pas de filtre `request_id` : comparez l'en-tête `X-Oneapi-Request-Id` reçu avec les résultats.

### Convertir le quota en montant

Champs utiles :

| Champ               | Signification                                                 |
| ------------------- | ------------------------------------------------------------- |
| `prompt_tokens`     | Tokens d'entrée                                               |
| `completion_tokens` | Tokens de sortie                                              |
| `quota`             | Montant prélevé pour cette requête, en unités internes        |
| `use_time`          | Durée en secondes                                             |
| `type`              | `2` consommation, `1` recharge, `5` erreur, `6` remboursement |

`quota` est converti automatiquement sur la page. La relation sous-jacente est :

```text
montant (USD) = quota / 500000
montant affiché = montant (USD) × taux de change du site
```

Par exemple, `quota = 1450` correspond à `0,0029` USD. L'entrée servie depuis le cache est généralement facturée à un prix unitaire inférieur ; le prix exact figure dans le détail.

:::tip
Si vous n'avez besoin que du nombre de tokens, inutile d'appeler le journal : les réponses non streamées contiennent un objet `usage` ; en streaming, ajoutez `"stream_options": {"include_usage": true}` et le dernier chunk portera `usage`. Le montant réellement prélevé n'est disponible que dans le journal.
:::

## Limites de fréquence

### Console et API

| Où                                                                                                                            | Compté par                | Fenêtre       | Limite       |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------- | ------------ |
| Appels d'API de la console                                                                                                    | IP                        | 180 secondes  | 360 requêtes |
| Pages de la console                                                                                                           | IP                        | 180 secondes  | 120 requêtes |
| Actions sensibles (connexion, inscription, réinitialisation du mot de passe, paiement, liaison d'un e-mail ou d'un téléphone) | IP                        | 1200 secondes | 20 requêtes  |
| Actions sensibles                                                                                                             | Compte, par type d'action | 1200 secondes | 20 requêtes  |
| Recherche (clés, journaux)                                                                                                    | Compte                    | 60 secondes   | 10 requêtes  |
| Codes de vérification par e-mail                                                                                              | IP                        | 30 secondes   | 2 requêtes   |

Quelques précisions :

- Ce sont les valeurs par défaut du site ; elles peuvent être ajustées selon l'exploitation, la réponse reçue fait foi.
- La consultation des journaux remonte au maximum à 365 jours, et une page renvoie au plus 100 lignes (10 par défaut).
- Les limites par IP sont partagées par tous ceux qui sortent par la même adresse réseau, un bureau ou un hôte cloud par exemple.

Les appels aux modèles (chat, embeddings, images) sont facturés au solde et ne sont pas concernés par les compteurs ci-dessus. Il n'existe pas de quota de requêtes par minute sur une clé d'API ; limitez le débit côté client si nécessaire.

### En cas de dépassement

La requête est rejetée avec HTTP 429 et un en-tête `Retry-After` en secondes :

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 47
```

Attendez ce nombre de secondes avant de réessayer ; réessayer immédiatement consomme le reste de la fenêtre et prolonge le blocage.

```python
import time, requests

resp = requests.post(url, headers=headers, json=payload)
if resp.status_code == 429:
    time.sleep(int(resp.headers.get("Retry-After", 60)))
    resp = requests.post(url, headers=headers, json=payload)
```

Si un prélèvement semble en double, vérifiez d'abord dans le journal s'il existe deux lignes avec le même `request_id`, puis contactez l'administrateur du site avec cet identifiant.
