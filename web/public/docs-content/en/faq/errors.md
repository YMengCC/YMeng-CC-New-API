---
title: Common Errors
description: Common errors organized by status code, with causes and solutions.
---

When a call fails, first check the HTTP status code and the returned `message`, then look it up in the tables below. Error messages are shown in Chinese or English depending on the request language.

## 401: Key problems

| Error message      | Cause                                                                            | Solution                                                                            |
| ------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Token not provided | No API key was included in the request headers                                   | Check that `Authorization: Bearer YOUR_API_KEY` is set                              |
| Invalid token      | The key does not exist, has expired, has used up its quota, or has been disabled | Check the key's status on the [API Keys](/keys) page and create a new one if needed |

:::tip
All key-related problems return the same "Invalid token" message; there is no separate "expired" message. When troubleshooting, check one by one whether the key is enabled, whether it has expired, and whether its quota is used up.
:::

## 403: Insufficient permission or balance

| Error message                                                                            | Cause                                                                                                          | Solution                                                               |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 用户额度不足 / 预扣费额度失败 (insufficient user quota / failed to pre-deduct quota)     | Your account balance is not enough to pay for this request                                                     | Top up in your [Wallet](/wallet)                                       |
| token quota is not enough                                                                | The quota set on the key itself is used up                                                                     | Edit the key to raise its quota, or switch it to unlimited quota       |
| 订阅额度不足或未配置订阅 (insufficient subscription quota or no subscription configured) | Your billing preference is **Membership Only**, but your membership quota is used up or you have no membership | Change your billing preference; see [Membership Plans](/subscriptions) |
| This token has no access to model xxx                                                    | The key has model restrictions that do not include this model                                                  | Edit the key's **Model Limits**, or use a different key                |
| 无权访问 xxx 分组 (no access to group xxx)                                               | Your account cannot use this group                                                                             | Edit the key and switch to an available group                          |
| 分组 xxx 已被弃用 (group xxx has been deprecated)                                        | The group has been retired                                                                                     | Edit the key and switch to an available group                          |
| 您的 IP 不在令牌允许访问的列表中 (your IP is not in the token's allowed list)            | The key has an IP allowlist                                                                                    | Add your current IP to the allowlist, or clear the allowlist           |
| User has been banned                                                                     | Your account has been suspended                                                                                | Contact the site administrator                                         |

## 400: Invalid request parameters

| Error message                                        | Cause                                 | Solution                  |
| ---------------------------------------------------- | ------------------------------------- | ------------------------- |
| Model name not specified, model name cannot be empty | The request body has no `model` field | Add the `model` parameter |

Other 400 errors usually come from upstream parameter validation; adjust your parameters based on the `message`.

## 429: Too many requests

| Error message                                                                                        | Cause                                             | Solution                                                                                            |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| You have reached the request limit                                                                   | You exceeded the model's request rate limit       | Lower your request rate and retry                                                                   |
| 请求次数已达到当前会员套餐的窗口上限 (request count has reached your membership plan's window limit) | You exceeded your membership plan's request limit | Wait for the window to reset; the `Retry-After` response header gives the number of seconds to wait |
| 并发请求数已达到当前套餐上限 (concurrent requests have reached your plan's limit)                    | Too many requests are running at the same time    | Reduce concurrency, or upgrade to a higher-tier membership plan                                     |
| (empty response body)                                                                                | The site-wide rate limit was triggered            | Wait as indicated by `Retry-After`, then retry                                                      |

## 503: No route available

| Error message                                      | Cause                                                                                 | Solution                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| No available channel for model xxx under group xxx | No route in this group can currently serve the model, or the model name is misspelled | Check the model name's spelling; confirm in the [Model Square](/pricing) that the model is available in your group; or switch to another group |

## Still stuck?

Note down the **request id** in the response and contact the site administrator with it so the problem can be located quickly.
