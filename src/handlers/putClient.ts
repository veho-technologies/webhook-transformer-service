import { log } from '@veho/observability-sdk'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { clientConfigDataAccessor } from '../dataAccessors/clientConfigDataAccessor'
import type { ClientConfig } from '../database'

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const clientId = event.pathParameters?.clientId
  if (!clientId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing clientId' }) }
  }

  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) }
  }

  log.info('Upserting client config', { clientId })

  let body: Omit<ClientConfig, 'clientId'>
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  try {
    const config = await clientConfigDataAccessor.create({ ...body, clientId } as ClientConfig)
    return { statusCode: 200, body: JSON.stringify(config) }
  } catch (error) {
    if (error instanceof Error && error.name === 'ValidationError') {
      return { statusCode: 400, body: JSON.stringify({ error: error.message }) }
    }
    throw error
  }
}
