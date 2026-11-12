---
title: Erreurs courantes
description: Erreurs fréquentes classées par code d'état, avec leurs causes et leurs solutions.
---

Lorsqu'un appel échoue, commencez par regarder le code d'état HTTP et le `message` renvoyé, puis reportez-vous aux tableaux ci-dessous. Selon la langue de la requête, les messages d'erreur s'affichent en chinois ou en anglais.

## 401 : problème de clé

| Message d'erreur   | Cause                                                                 | Solution                                                                                       |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Token not provided | Aucune clé API n'est présente dans les en-têtes de la requête         | Vérifiez que `Authorization: Bearer YOUR_API_KEY` est bien défini                              |
| Invalid token      | La clé n'existe pas, a expiré, a épuisé son quota ou a été désactivée | Vérifiez l'état de la clé sur la page [Clés API](/keys) et créez-en une nouvelle si nécessaire |

:::tip
Tous les problèmes liés à la clé renvoient le même message « Invalid token » ; aucun message distinct n'indique qu'elle a « expiré ». Lors du diagnostic, vérifiez un par un que la clé est activée, qu'elle n'a pas expiré et que son quota n'est pas épuisé.
:::

## 403 : autorisation ou solde insuffisant

| Message d'erreur                                                                                        | Cause                                                                                                                       | Solution                                                                          |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 用户额度不足 / 预扣费额度失败 (quota utilisateur insuffisant / échec du pré-débit)                      | Le solde du compte ne suffit pas à payer cette requête                                                                      | Rechargez depuis le [portefeuille](/wallet)                                       |
| token quota is not enough                                                                               | Le quota défini sur la clé elle-même est épuisé                                                                             | Modifiez la clé pour augmenter son quota ou le rendre illimité                    |
| 订阅额度不足或未配置订阅 (quota d'adhésion insuffisant ou aucune adhésion configurée)                   | La préférence de facturation est « Adhésion uniquement », mais le quota d'adhésion est épuisé ou vous n'avez pas d'adhésion | Modifiez la préférence de facturation, voir [Formules d'adhésion](/subscriptions) |
| This token has no access to model xxx                                                                   | La clé a des limites de modèles qui n'incluent pas ce modèle                                                                | Modifiez les « Limites du modèle » de la clé, ou utilisez une autre clé           |
| 无权访问 xxx 分组 (pas d'accès au groupe xxx)                                                           | Votre compte ne peut pas utiliser ce groupe                                                                                 | Modifiez la clé pour choisir un groupe disponible                                 |
| 分组 xxx 已被弃用 (le groupe xxx est obsolète)                                                          | Ce groupe a été désactivé                                                                                                   | Modifiez la clé pour choisir un groupe disponible                                 |
| 您的 IP 不在令牌允许访问的列表中 (votre IP ne figure pas dans la liste des IP autorisées pour ce jeton) | La clé a une liste blanche d'adresses IP                                                                                    | Ajoutez votre IP actuelle à la liste blanche, ou videz la liste blanche           |
| User has been banned                                                                                    | Le compte a été suspendu                                                                                                    | Contactez l'administrateur du site                                                |

## 400 : paramètres de requête incorrects

| Message d'erreur                                     | Cause                                                   | Solution                     |
| ---------------------------------------------------- | ------------------------------------------------------- | ---------------------------- |
| Model name not specified, model name cannot be empty | Le corps de la requête ne contient pas de champ `model` | Ajoutez le paramètre `model` |

Les autres erreurs 400 proviennent généralement de la validation des paramètres par l'amont ; ajustez vos paramètres en fonction du `message`.

## 429 : trop de requêtes

| Message d'erreur                                                                                                           | Cause                                                       | Solution                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| You have reached the request limit                                                                                         | La limite de fréquence des requêtes du modèle est dépassée  | Réduisez la fréquence des requêtes puis réessayez                                                                       |
| 请求次数已达到当前会员套餐的窗口上限 (le nombre de requêtes a atteint la limite de la fenêtre de votre formule d'adhésion) | La limite de requêtes de la formule d'adhésion est dépassée | Attendez la réinitialisation de la fenêtre ; l'en-tête de réponse `Retry-After` indique le nombre de secondes d'attente |
| 并发请求数已达到当前套餐上限 (le nombre de requêtes simultanées a atteint la limite de votre formule)                      | Trop de requêtes sont en cours en même temps                | Réduisez la concurrence, ou passez à une formule d'adhésion supérieure                                                  |
| (corps de réponse vide)                                                                                                    | La limitation de débit globale du site a été déclenchée     | Attendez le délai indiqué par `Retry-After` puis réessayez                                                              |

## 503 : aucune ligne disponible

| Message d'erreur                                   | Cause                                                                                                 | Solution                                                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No available channel for model xxx under group xxx | Ce groupe n'a momentanément aucune ligne capable de fournir ce modèle, ou le nom du modèle est erroné | Vérifiez l'orthographe du nom du modèle ; confirmez dans la [Place des modèles](/pricing) que ce modèle est disponible dans votre groupe ; ou changez de groupe |

## Le problème persiste ?

Notez le **request id** figurant dans la réponse, puis contactez l'administrateur du site avec cet identifiant pour localiser rapidement le problème.
