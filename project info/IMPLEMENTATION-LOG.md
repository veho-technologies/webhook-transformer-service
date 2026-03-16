# Implementation Log — webhook-transformer-service

Tracks what was built per ticket and any deviations from the plan.

---

## CLI-2982 (Ticket 7): Repository Scaffold + Projen Config

**PR:** #1
**Branch:** `feature/cli-2982-repository-scaffold-projen-config`

- Scaffolded repo with `@veho/gaia-projen` AwsCdkTypeScriptApp
- Node.js 22, CDK v2, ts-jest, eslint + prettier
- CircleCI config, Husky pre-commit hooks
- Base CDK stack with placeholder Lambda

---

## CLI-2983 (Ticket 8): DynamoDB Schema + Data Accessors

**PR:** #3
**Branch:** `feature/cli-2983-dynamodb-schema-data-accessors`

- Used `dynamodb-toolbox` (not OneTable as RFC suggested) — aligns with existing Veho patterns
- Three entities: `ClientConfigEntity`, `TrackerSubscriptionEntity`, `TransformDeliveryAttemptEntity`
- Data accessors with CRUD methods + GSI queries (listByClientId, listByTrackingNumber)
- DynamoDB DocumentClient singleton
- Smoke test Lambda for validating table access
- Co-located tests (`.test.ts` next to source, not `test/unit/`)

**Deviation from plan:** Tests are co-located (`src/**/*.test.ts`) not in `test/unit/`. This matches the projen jest config and is consistent across the repo.

---

## CLI-2984 (Ticket 9): Field Mapping Engine + Shopify Types

**PR:** #4
**Branch:** `feature/cli-2984-webhook-transformer-service-field-mapping-engine-shopify`

- `src/transformers/fieldMappingEngine.ts` — `getNestedValue` (dot-path resolver), `applyFieldMapping` (config-driven mapper)
- `FieldMapping` interface: `{ source, target, transform? }` — `transform: 'statusMap'` triggers lookup in `config.statusMap`
- Unknown status values pass through with `console.warn`
- Engine is flat-only — does NOT iterate arrays. `transformationManager` (Ticket 13) is responsible for iterating `eventLog[]` and calling `applyFieldMapping` per entry
- `src/types/shopifyTypes.ts` — `TrackerEvent`, `TrackerAttributes`, `ShopifyGraphqlError` (from Shopify trackerUpdate mutation spec)
- 11 tests including full EnrichedPackageEvent → Shopify fixture demonstrating the two-pass pattern (top-level fields + per-event mapping)
- 100% coverage on engine

---

## CLI-2985 (Ticket 10): Tracker Subscription Manager

**PR:** #5
**Branch:** `feature/cli-2985-webhook-transformer-service-tracker-subscription-manager`

- `src/managers/trackerSubscriptionManager.ts` — `createSubscription`, `removeSubscription`, `getSubscription`
- Idempotent create (skips if subscription already exists) and remove (skips if not found)
- Uses `trackerSubscriptionDataAccessor` for all DynamoDB operations
- Co-located tests with full mock coverage for all paths

---

## CLI-2986 (Ticket 11): Shopify GraphQL Adapter

**PR:** #6
**Branch:** `feature/cli-2986-webhook-transformer-service-shopify-graphql-adapter`

- `src/adapters/shopifyGraphqlAdapter.ts` — `sendTrackerUpdate(trackerAttributes, webhookId, idempotencyKey)`
- Wraps the Shopify `trackerUpdate` GraphQL mutation with `graphql-request` + `gql` tagged template
- Never throws — returns `{ success: boolean, errors?: ShopifyGraphqlError[] }`
- Handles `ClientError` (GraphQL-level errors) and network errors separately
- `buildClient()` reads `SHOPIFY_API_URL` + `SHOPIFY_ACCESS_TOKEN` from env, sets `X-Shopify-Access-Token` header
- 6 tests covering success, userErrors, ClientError, network error, headers, and variables

**Deviation from plan:** Used `graphql-request` instead of `got` — aligns with how other Veho services (shapash, hydratr, route-plans) call the merged API. Also added `graphql` and `aws-sigv4-fetch` as dependencies for future internal GraphQL calls.

---

## CLI-2986 (Ticket 12): Lugus Adapter via Merged API

**PR:** #7
**Branch:** `feature/cli-2987-webhook-transformer-service-lugus-adapter`

- `src/adapters/mergedApiClient.ts` — shared `buildMergedApiClient()` returning a `GraphQLClient` with SigV4 signing (`aws-sigv4-fetch`, service: `appsync`)
- `src/adapters/lugusAdapter.ts` — `getPackageEventHistory(trackingId)` queries `getPackageByTrackingId` for `packageLog` entries
- Uses `@veho/merged-api` types (`Query`, `QueryGetPackageByTrackingIdArgs`, `LugusPackageLog`) — no local type definitions
- Throws on errors (intentional divergence from Shopify adapter — TransformationManager catches and logs)
- Null package response returns empty array
- `src/handlers/lugusSmoke.ts` — temporary smoke test Lambda, validated end-to-end in dev
- Stack wired with per-environment `MERGED_API_URL` and `merged-api-ReadApiPolicy` managed policy (same pattern as hydratr, package-search)
- 5 tests: success, null package, network error throws, ClientError throws, correct variables

**Deviation from plan:** Dropped local `src/types/lugusTypes.ts` — used `@veho/merged-api` types instead, matching the pattern across other Veho services. Added smoke test Lambda (not in original plan) to validate merged API connectivity. Removed `meta` field from query per PR review — contains sensitive data, will add back selectively if needed.

---

## CLI-2988 (Ticket 13): Transformation Manager + Client Config Manager

**Branch:** `feature/cli-2988-webhook-transformer-service-transformation-manager-client`

- `src/managers/transformationManager.ts` — core orchestration layer with three entry points:
  - `processEnrichedPackageEvent(event)` — ongoing event delivery from hydratr (Ticket 15 consumer)
  - `processStatusRequest(params)` — on-demand full refresh from Shopify (Ticket 14 consumer)
  - `processInitialSubscription(params)` — backfill history on first subscribe (Ticket 14 consumer)
- Prefix-based event-level mapping: splits `config.fieldMappings` into top-level (applied once) and event-level (`eventLog.` prefix stripped, applied per entry)
- `splitFieldMappings()` and `buildTrackerEvents()` shared helpers
- `EnrichedPackageEventWithEventLog` type — mirrors hydratr's `HydratrPackageEvent` intersection pattern to add `eventLog` back onto `OrderAndPackage.package`
- `src/managers/clientConfigManager.ts` — thin CRUD wrapper: `getConfig`, `upsertConfig`
- `src/database/clientConfig.ts` — added `transform: schema.string().optional()` to fieldMappings schema, changed `statusMap` value schema from `schema.any()` to `schema.string()` for proper typing
- 17 transformation manager tests + 3 realistic data tests (typed against `@veho/events` `EnrichedPackageEvent`, `PackageStatusOperations`, and `@veho/merged-api` `LugusPackageLog`)
- 3 client config manager tests
- `toRecord()` helper for the single dynamic→typed boundary at `applyFieldMapping`; `getConfigMappings()` extracts config fields without casts
- 59 total tests passing, tsc + lint clean

**Deviation from plan:** Used typed `EnrichedPackageEventWithEventLog` param instead of `Record<string, unknown>` — direct property access on `event.entity.package.trackingId` and `.eventLog` rather than `getNestedValue()` calls. Changed `statusMap` DynamoDB schema from `schema.any()` to `schema.string()` to eliminate repeated `as Record<string, string>` casts. Realistic test fixtures use actual `@veho/events` types and `PackageStatusOperations` enums rather than raw strings.

---

## Next Up (unblocked)

| Ticket | Name | Depends On | Size |
|--------|------|-----------|------|
| **14** | Tracker Lifecycle EventBridge Consumers | 10 ✅, 13 ✅ | M |
| **15** | EnrichedPackageEvent Consumer | 13 ✅ | M |
| **16** | CDK Stack | 14, 15 | L |

**Recommended next:** Ticket 14 (Tracker Lifecycle EventBridge Consumers) or Ticket 15 (EnrichedPackageEvent Consumer) — both unblocked.
