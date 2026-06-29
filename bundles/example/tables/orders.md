---
type: BigQuery Table
title: Orders
description: One row per completed customer order.
resource: https://console.cloud.google.com/bigquery?t=orders
tags: [sales, revenue]
timestamp: 2026-05-28T14:30:00Z
---

# Schema

| Column | Type | Description |
|--------|------|-------------|
| `order_id` | STRING | Globally unique order identifier. |
| `customer_id` | STRING | FK to [customers](customers.md). |

# Joins

Joined with [customers](customers.md) on `customer_id`. Feeds the
[weekly active users](../metrics/weekly_active_users.md) metric.

See the [BigQuery console](https://console.cloud.google.com/bigquery?t=orders).
