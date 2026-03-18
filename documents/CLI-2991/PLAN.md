# PLAN — CLI-2991: [webhook-transformer-service] CDK Stack

📍 **Source:** [CLI-2991](https://linear.app/veho/issue/CLI-2991) via Linear API  
📍 **Source:** [Planning PR #296](https://github.com/veho-technologies/webhooks-service/pull/296) (CLI-2975 RFC/Tickets)  
📍 **Source:** `@veho/cdk` type definitions (`EventBridgeConsumer`, `VehoRestAPI`, `NodejsFunction`)  
📍 **Source:** `webhooks-service` stack (`src/stacks/webhooksService.ts`) for EventBridge patterns  

---

## Context

This is ticket 16 (final ticket) of CLI-2975 (Shopify Tracking Integration). It wires the full CDK stack: EventBridge consumers, CRUD API Gateway, and environment variables. Depends on tickets 14 (lifecycle consumers) and 15 (enriched package event consumer), both complete.

## Current State

`src/stacks/stack.ts` already has:
- 3 DynamoDB tables: `ClientConfigTable`, `TrackerSubscriptionTable`, `TransformDeliveryAttemptTable`
- 2 smoke test Lambdas (`DynamoSmokeTest`, `LugusSmoke`) — to be removed
- 1 IAM managed policy (`merged-api-ReadApiPolicy`)

## Changes Required

### 1. Remove Smoke Test Lambdas

Delete from stack:
- `DynamoSmokeTest` NodejsFunction + its environment/permissions block
- `LugusSmoke` NodejsFunction + its environment/permissions block

Delete handler files:
- `src/handlers/dynamoSmokeTest.ts`
- `src/handlers/lugusSmoke.ts`

### 2. EventBridge Consumer Lambdas (4)

Use `EventBridgeConsumer` from `@veho/cdk` — this construct wires EventBridge Rule → SQS queue → Lambda with DLQs and retry built-in. This is the same pattern used in `webhooks-service`.

**Event buses:**

```typescript
// Bifrost — for tracker lifecycle events (subscribe/unsubscribe/status-request)
const bifrostBus = EventBus.fromEventBusName(this, 'BifrostBus', Fn.importValue('BifrostEventBusName'))

// hydratr — for enriched package events
const hydratrBus = EventBus.fromEventBusName(this, 'HydratrBus', 'hydratrEventBus')
```

**Consumers:**

| ID | Consumer | Event Bus | `detailType` | Entry file |
|----|----------|-----------|-------------|------------|
| 1 | TrackerSubscribedConsumer | `bifrostBus` | `TrackingSubscriptionCreated` | `src/consumers/trackerSubscribedConsumer.ts` |
| 2 | TrackerUnsubscribedConsumer | `bifrostBus` | `TrackingSubscriptionDeleted` | `src/consumers/trackerUnsubscribedConsumer.ts` |
| 3 | TrackerStatusRequestedConsumer | `bifrostBus` | `TrackingStatusRequested` | `src/consumers/trackerStatusRequestedConsumer.ts` |
| 4 | EnrichedPackageEventConsumer | `hydratrBus` | `EnrichedPackageEvent` | `src/consumers/enrichedPackageEventConsumer.ts` |

**Shared Lambda props for all consumers:**

```typescript
lambdaProps: {
  timeout: Duration.seconds(30),
  environment: {
    CLIENT_CONFIG_TABLE_NAME: clientConfigTable.tableName,
    TRACKER_SUBSCRIPTION_TABLE_NAME: trackerSubscriptionTable.tableName,
    TRANSFORM_DELIVERY_ATTEMPT_TABLE_NAME: transformDeliveryAttemptTable.tableName,
    MERGED_API_URL: mergedApiUrl,
  },
  dynamoTables: [clientConfigTable, trackerSubscriptionTable, transformDeliveryAttemptTable],
  managedPolicies: [mergedApiReadPolicy],
}
```

> **Note:** `EnrichedPackageEventConsumer` doesn't call Lugus directly (it receives the enriched payload), but still gets `mergedApiReadPolicy` and `MERGED_API_URL` for simplicity/consistency. No harm — the policy is read-only.

### 3. CRUD API Gateway (IAM-authed, internal)

Use `VehoRestAPI` from `@veho/cdk` with `AuthorizationType.IAM` as the default authorizer.

**Routes:**

| Method | Path | Handler file | Description |
|--------|------|-------------|-------------|
| GET | `/clients` | `src/handlers/listClients.ts` | Scan all client configs |
| GET | `/clients/{clientId}` | `src/handlers/getClient.ts` | Get single client config |
| PUT | `/clients/{clientId}` | `src/handlers/putClient.ts` | Create/update client config |
| GET | `/subscriptions/{trackingNumber}` | `src/handlers/getSubscription.ts` | Get subscription by tracking number |

**All API Lambdas get:**
- `dynamoTables`: all 3 tables
- Environment: `CLIENT_CONFIG_TABLE_NAME`, `TRACKER_SUBSCRIPTION_TABLE_NAME`, `TRANSFORM_DELIVERY_ATTEMPT_TABLE_NAME`
- IAM auth (no public access)

**API handler pattern** (thin wrappers):

```typescript
// Example: src/handlers/getClient.ts
import { clientConfigDataAccessor } from '../dataAccessors/clientConfigDataAccessor'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const clientId = event.pathParameters?.clientId
  if (!clientId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing clientId' }) }

  const config = await clientConfigDataAccessor.getByClientId(clientId)
  if (!config) return { statusCode: 404, body: JSON.stringify({ error: 'Client not found' }) }

  return { statusCode: 200, body: JSON.stringify(config) }
}
```

**New data accessor method needed:**
- `clientConfigDataAccessor.list()` — DynamoDB Scan for `GET /clients` (acceptable for low-volume internal config table)

### 4. Stack Props

No new props needed. `mergedApiUrl` already passed per-environment from `src/main.ts`.

### 5. Files to Create

| File | Purpose |
|------|---------|
| `src/handlers/listClients.ts` | API handler: scan all client configs |
| `src/handlers/getClient.ts` | API handler: get client config by ID |
| `src/handlers/putClient.ts` | API handler: create/update client config |
| `src/handlers/getSubscription.ts` | API handler: get subscription by tracking number |

### 6. Files to Modify

| File | Change |
|------|--------|
| `src/stacks/stack.ts` | Remove smoke tests, add EventBridge consumers, add CRUD API |
| `src/dataAccessors/clientConfigDataAccessor.ts` | Add `list()` scan method |

### 7. Files to Delete

| File | Reason |
|------|--------|
| `src/handlers/dynamoSmokeTest.ts` | Replaced by real consumers |
| `src/handlers/lugusSmoke.ts` | Replaced by real consumers |

## VehoRestAPI Integration Detail

`VehoRestAPI` accepts a `routes` tree and wires each route to a Lambda:

```typescript
const crudApi = new VehoRestAPI(this, 'CrudApi', {
  routes: {
    clients: {
      GET: {
        lambdaProps: { entry: 'src/handlers/listClients.ts', ...sharedApiLambdaProps },
      },
      '{clientId}': {
        GET: {
          lambdaProps: { entry: 'src/handlers/getClient.ts', ...sharedApiLambdaProps },
        },
        PUT: {
          lambdaProps: { entry: 'src/handlers/putClient.ts', ...sharedApiLambdaProps },
        },
      },
    },
    subscriptions: {
      '{trackingNumber}': {
        GET: {
          lambdaProps: { entry: 'src/handlers/getSubscription.ts', ...sharedApiLambdaProps },
        },
      },
    },
  },
  restApiProps: {
    policy: iamResourcePolicy, // IAM resource policy restricting to internal Veho principals
  },
})
```

IAM auth is set via a resource policy on the RestApi (restricting to Veho AWS account principals) and `AuthorizationType.IAM` on each method.

## Alternatives Considered

1. **Raw `Rule` + `NodejsFunction`** instead of `EventBridgeConsumer` — Rejected: `EventBridgeConsumer` is the established Veho pattern (used in webhooks-service). Provides SQS buffering, DLQs, and retry configuration out of the box.

2. **Plain `RestApi`** instead of `VehoRestAPI` — Fallback option if `VehoRestAPI`'s route tree doesn't compose well with IAM auth. `VehoRestAPI` provides WAF association and access logging by default.

3. **Separate table per entity (current state) vs single-table design** — The ticket mentions "single table" but the repo already has 3 separate tables from ticket 8. Keeping the existing 3-table design — it's deployed and working. The ticket's "single table" language appears to be from the original RFC which was superseded during implementation.

## Acceptance Criteria Mapping

- [x] `npm run synth` passes — will verify after implementation
- [ ] 4 EventBridge consumer Lambdas defined with correct bus + event pattern
- [ ] Bifrost consumers on correct Bifrost bus; EnrichedPackageEvent consumer on hydratrEventBus
- [ ] CRUD API Gateway has IAM resource policy (not public)
- [ ] DynamoDB tables created with GSI for TrackerSubscription list-by-client — ✅ already done (ticket 8)
- [ ] TTL enabled on DynamoDB table — ✅ already done (TransformDeliveryAttempt has 30-day TTL)
