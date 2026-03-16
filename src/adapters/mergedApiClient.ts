import { createSignedFetcher } from 'aws-sigv4-fetch'
import { GraphQLClient } from 'graphql-request'

export function buildMergedApiClient(): GraphQLClient {
  const url = process.env.MERGED_API_URL!
  const region = process.env.REGION ?? process.env.AWS_REGION ?? 'us-east-1'

  const signedFetch = createSignedFetcher({ service: 'appsync', region })

  return new GraphQLClient(url, { fetch: signedFetch })
}
