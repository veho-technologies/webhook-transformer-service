import type { LugusPackageLog, Query, QueryGetPackageByTrackingIdArgs } from '@veho/merged-api'
import { gql } from 'graphql-request'

import { buildMergedApiClient } from './mergedApiClient'

const GET_PACKAGE_BY_TRACKING_ID = gql`
  query getPackageByTrackingId($trackingId: String!) {
    getPackageByTrackingId(trackingId: $trackingId) {
      packageLog {
        eventType
        timestamp
        message
        location {
          lat
          lng
        }
      }
    }
  }
`

const GET_PACKAGE_WITH_HISTORY = gql`
  query getPackageWithHistory($trackingId: String!) {
    getPackageByTrackingId(trackingId: $trackingId) {
      clientId
      packageLog {
        eventType
        timestamp
        message
        location {
          lat
          lng
        }
      }
    }
  }
`

export const lugusAdapter = {
  async getPackageEventHistory(trackingId: string): Promise<LugusPackageLog[]> {
    const client = buildMergedApiClient()
    const data = await client.request<Query, QueryGetPackageByTrackingIdArgs>(GET_PACKAGE_BY_TRACKING_ID, {
      trackingId,
    })
    return data.getPackageByTrackingId?.packageLog?.filter((e): e is LugusPackageLog => e != null) ?? []
  },

  async getPackageWithHistory(trackingId: string): Promise<{ clientId: string | null; packageLog: LugusPackageLog[] }> {
    const client = buildMergedApiClient()
    const data = await client.request<Query, QueryGetPackageByTrackingIdArgs>(GET_PACKAGE_WITH_HISTORY, {
      trackingId,
    })
    const pkg = data.getPackageByTrackingId
    return {
      clientId: pkg?.clientId ?? null,
      packageLog: pkg?.packageLog?.filter((e): e is LugusPackageLog => e != null) ?? [],
    }
  },
}
