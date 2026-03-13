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
        meta
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
}
