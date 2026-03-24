import { log } from '@veho/observability-sdk'
import { createHmac } from 'crypto'
import { ClientError, gql, GraphQLClient } from 'graphql-request'

import type { ShopifyGraphqlError, TrackerAttributes } from '../types/shopifyTypes'

const TRACKER_UPDATE_MUTATION = gql`
  mutation trackerUpdate($input: TrackerAttributes!) {
    trackerUpdate(input: $input) {
      errors {
        code
        field
        message
      }
      idempotencyKey
    }
  }
`

export interface ShopifyAdapterResult {
  success: boolean
  errors?: ShopifyGraphqlError[]
}

interface TrackerUpdateResponse {
  trackerUpdate: {
    errors: ShopifyGraphqlError[]
    idempotencyKey: string | null
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

function buildClient(secret: string): GraphQLClient {
  return new GraphQLClient(process.env.SHOPIFY_API_URL!, {
    requestMiddleware: request => {
      const body = request.body as string
      const hmac = computeHmac(body, secret)
      const headers = new Headers(request.headers)
      headers.set('X-Shopify-Hmac-SHA256', hmac)
      headers.set('X-Shopify-App-Id', process.env.SHOPIFY_APP_ID!)
      return { ...request, headers }
    },
  })
}

export const shopifyGraphqlAdapter = {
  async sendTrackerUpdate(input: TrackerAttributes): Promise<ShopifyAdapterResult> {
    const secret = await getHmacSecret()
    const client = buildClient(secret)

    // Shopify requires non-empty `territory` and `message` on every event.
    // Default territory to 'US' since Veho only operates domestically.
    // Default message to the status value when the carrier doesn't provide one.
    const normalizedInput: TrackerAttributes = {
      ...input,
      events: input.events.map(event => ({
        ...event,
        territory: event.territory || 'US',
        message: event.message || event.status,
      })),
    }

    log.debug('sendTrackerUpdate: payload', {
      trackerReferenceId: normalizedInput.trackerReferenceId,
      idempotencyKey: normalizedInput.idempotencyKey,
      trackingNumber: normalizedInput.trackingNumber,
      eventCount: normalizedInput.events.length,
      input: normalizedInput,
    })

    let data: TrackerUpdateResponse

    try {
      data = await client.request<TrackerUpdateResponse>(TRACKER_UPDATE_MUTATION, { input: normalizedInput })
    } catch (err) {
      if (err instanceof ClientError) {
        const message = err.response.errors?.map(e => e.message).join('; ') ?? err.message
        log.error(`sendTrackerUpdate: GraphQL client error`, {
          trackerReferenceId: input.trackerReferenceId,
          idempotencyKey: input.idempotencyKey,
          message,
          statusCode: err.response.status,
          errors: err.response.errors,
          stack: err.stack,
        })
        return { success: false, errors: [{ field: 'graphql', message }] }
      }
      const message = err instanceof Error ? err.message : String(err)
      log.error(`sendTrackerUpdate: unexpected error`, {
        trackerReferenceId: input.trackerReferenceId,
        idempotencyKey: input.idempotencyKey,
        message,
        stack: err instanceof Error ? err.stack : undefined,
        error: err,
      })
      return { success: false, errors: [{ field: 'http', message }] }
    }

    const errors = data.trackerUpdate?.errors ?? []
    if (errors.length > 0) {
      log.error(`sendTrackerUpdate: Shopify errors returned`, {
        trackerReferenceId: input.trackerReferenceId,
        idempotencyKey: input.idempotencyKey,
        errors,
      })
      return { success: false, errors }
    }

    return { success: true }
  },
}
