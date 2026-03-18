import { log } from '@veho/observability-sdk'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { clientConfigDataAccessor } from '../dataAccessors/clientConfigDataAccessor'

export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  log.info('Listing all client configs')

  const configs = await clientConfigDataAccessor.list()

  return { statusCode: 200, body: JSON.stringify(configs) }
}
