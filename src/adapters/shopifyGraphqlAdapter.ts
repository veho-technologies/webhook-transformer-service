import { log } from '@veho/observability-sdk'
import { createHmac } from 'crypto'
import { ClientError, gql, GraphQLClient } from 'graphql-request'

import type { ShopifyGraphqlError, TrackerAttributes } from '../types/shopifyTypes'

const TRACKER_UPDATE_MUTATION = gql`
  mutation trackerUpdate($trackerAttributes: TrackerUpdateInput!, $webhookId: String!, $idempotencyKey: String!) {
    trackerUpdate(trackerAttributes: $trackerAttributes, webhookId: $webhookId, idempotencyKey: $idempotencyKey) {
      userErrors {
        field
        message
      }
    }
  }
`

export interface ShopifyAdapterResult {
  success: boolean
  errors?: ShopifyGraphqlError[]
}

interface TrackerUpdateResponse {
  trackerUpdate: {
    userErrors: ShopifyGraphqlError[]
  }
}

// ── Secret fetching (same pattern as anansi) ────────────────────────────────

let cachedHmacSecret: string | undefined

async function fetchSecretFromCache(secretId: string): Promise<string> {
  const port = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT ?? '2773'
  const url = `http://localhost:${port}/secretsmanager/get?secretId=${encodeURIComponent(secretId)}`

  const response = await fetch(url, {
    headers: { 'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN! },
  })

  const data = (await response.json()) as { SecretString: string }
  return data.SecretString
}

async function getHmacSecret(): Promise<string> {
  if (cachedHmacSecret) return cachedHmacSecret

  if (process.env.SHOPIFY_HMAC_SECRET) {
    cachedHmacSecret = process.env.SHOPIFY_HMAC_SECRET
    return cachedHmacSecret
  }

  const secretName = process.env.SHOPIFY_HMAC_SECRET_NAME
  if (!secretName) {
    throw new Error('Neither SHOPIFY_HMAC_SECRET nor SHOPIFY_HMAC_SECRET_NAME is set')
  }

  cachedHmacSecret = await fetchSecretFromCache(secretName)
  return cachedHmacSecret
}

export function resetCachedHmacSecret(): void {
  cachedHmacSecret = undefined
}

// ── Client + HMAC signing ───────────────────────────────────────────────────

function computeHmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('base64')
}

function buildClient(): GraphQLClient {
  return new GraphQLClient(process.env.SHOPIFY_API_URL!)
}

export const shopifyGraphqlAdapter = {
  async sendTrackerUpdate(
    trackerAttributes: TrackerAttributes,
    webhookId: string,
    idempotencyKey: string
  ): Promise<ShopifyAdapterResult> {
    const client = buildClient()
    const secret = await getHmacSecret()

    const variables = { trackerAttributes, webhookId, idempotencyKey }
    const body = JSON.stringify({ query: TRACKER_UPDATE_MUTATION, variables })
    const hmac = computeHmac(body, secret)

    let data: TrackerUpdateResponse

    try {
      data = await client.request<TrackerUpdateResponse>({
        document: TRACKER_UPDATE_MUTATION,
        variables,
        requestHeaders: {
          'X-Shopify-Hmac-SHA256': hmac,
          'X-Shopify-App-Id': process.env.SHOPIFY_APP_ID!,
        },
      })
    } catch (err) {
      if (err instanceof ClientError) {
        const message = err.response.errors?.map(e => e.message).join('; ') ?? err.message
        log.error(`sendTrackerUpdate: GraphQL client error`, {
          webhookId,
          idempotencyKey,
          message,
          statusCode: err.response.status,
          errors: err.response.errors,
          stack: err.stack,
        })
        return { success: false, errors: [{ field: 'graphql', message }] }
      }
      const message = err instanceof Error ? err.message : String(err)
      log.error(`sendTrackerUpdate: unexpected error`, {
        webhookId,
        idempotencyKey,
        message,
        stack: err instanceof Error ? err.stack : undefined,
        error: err,
      })
      return { success: false, errors: [{ field: 'http', message }] }
    }

    const userErrors = data.trackerUpdate?.userErrors ?? []
    if (userErrors.length > 0) {
      log.error(`sendTrackerUpdate: Shopify userErrors returned`, {
        webhookId,
        idempotencyKey,
        userErrors,
      })
      return { success: false, errors: userErrors }
    }

    return { success: true }
  },
}
