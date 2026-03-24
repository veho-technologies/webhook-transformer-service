import { log } from '@veho/observability-sdk'
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

function buildClient(): GraphQLClient {
  return new GraphQLClient(process.env.SHOPIFY_API_URL!, {
    headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN! },
  })
}

export const shopifyGraphqlAdapter = {
  async sendTrackerUpdate(
    trackerAttributes: TrackerAttributes,
    webhookId: string,
    idempotencyKey: string
  ): Promise<ShopifyAdapterResult> {
    const client = buildClient()

    let data: TrackerUpdateResponse

    try {
      data = await client.request<TrackerUpdateResponse>(TRACKER_UPDATE_MUTATION, {
        trackerAttributes,
        webhookId,
        idempotencyKey,
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
