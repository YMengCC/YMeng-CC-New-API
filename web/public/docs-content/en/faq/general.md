---
title: FAQ
description: Common questions about accounts, balance, keys and models.
---

## Does my balance expire?

Balance from top-ups and redemption codes never expires. Vouchers and membership quota may have an expiry date, as stated in their own terms. See [Top-up & Vouchers](/wallet) for details.

## Why did my balance drop by less than the amount in the Usage Logs?

The Usage Logs record the **full cost** of each request. If part of a request was covered by a voucher, only the remainder is deducted from your balance, so the two differ. This is normal.

## How should I choose a group?

The group determines which models you can call and the billing multiplier. When you create a key, the group dropdown shows each group's multiplier, its multiplier after membership discount, and whether it supports vouchers. In general:

- To use a specific model: first check in the [Model Square](/pricing) which groups offer that model;
- To use vouchers: choose a group marked as supporting vouchers;
- To save money: choose the group with the lowest multiplier among those available.

## Which models are supported?

All available models and their prices are listed in the [Model Square](/pricing), and you can also get them from the [model list API](/docs/api/models-and-pricing). Models are updated continuously.

## Can one account create multiple keys?

Yes. We recommend creating separate keys for different purposes, for example one for Claude Code and one for your own app, so you can view usage, set limits or disable each one independently.

## What if my key leaks?

Immediately disable or delete the key on the [API Keys](/keys) page, then create a new one. You can check the [Usage Logs](/usage-logs/common) for any unusual calls.

## How can I see how much each call cost?

Open the [Usage Logs](/usage-logs/common) to see the time, model, token count and amount charged for every request.

## What if requests are slow or time out?

1. First test the same model in the [Playground](/playground) to see whether the model itself is slow to respond;
2. Check your local network and try a different one;
3. Switch to another group, since different groups use different routes;
4. If the problem persists, contact the site administrator and provide the request id.

## Where can I get help?

- Check [Common Errors](/docs/faq/errors) to troubleshoot on your own;
- Contact the site administrator, and include your user ID on this site when reporting an issue.
