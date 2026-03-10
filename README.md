[![CircleCI](https://dl.circleci.com/status-badge/img/gh/veho-technologies/webhook-transformer-service/tree/main.svg?style=shield&circle-token=<status-badge-token>)](https://dl.circleci.com/status-badge/redirect/gh/veho-technologies/webhook-transformer-service/tree/main)
[![release](https://github.com/veho-technologies/webhook-transformer-service/workflows/release/badge.svg)](https://github.com/veho-technologies/webhook-transformer-service/actions/workflows/release.yml)
[![codecov](https://codecov.io/gh/veho-technologies/webhook-transformer-service/graph/badge.svg?token=<status-badge-token>)](https://codecov.io/gh/veho-technologies/webhook-transformer-service)
# webhook-transformer-service

A generic, config-driven webhook transformer service that consumes Veho internal package events and transforms them into client-specific webhook formats for delivery. Uses JSON field mapping configurations to support multiple clients without code changes.

The first integration target is Shopify's Universal Tracking platform.

## Related

- [CLI-2975](https://linear.app/veho/issue/CLI-2975) - Shopify Tracking Integration
- [Planning PR](https://github.com/veho-technologies/webhooks-service/pull/296) - RFC, Implementation Guide, Tickets
