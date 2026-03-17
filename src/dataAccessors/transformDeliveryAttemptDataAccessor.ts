import { PutItemCommand, QueryCommand } from 'dynamodb-toolbox'
import { ulid } from 'ulid'

import {
  type TransformDeliveryAttempt,
  TransformDeliveryAttemptEntity,
  transformDeliveryAttemptTable,
} from '../database'

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60

function buildCompositeKey(clientId: string, trackingNumber: string): string {
  return `${clientId}#${trackingNumber}`
}

export const transformDeliveryAttemptDataAccessor = {
  async create(
    attempt: Omit<TransformDeliveryAttempt, 'id' | 'ttl' | 'clientIdTrackingNumber'>
  ): Promise<TransformDeliveryAttempt> {
    const id = ulid()
    const ttl = Math.floor(Date.now() / 1000) + THIRTY_DAYS_IN_SECONDS
    const clientIdTrackingNumber = buildCompositeKey(attempt.clientId, attempt.trackingNumber)
    const item = { ...attempt, id, ttl, clientIdTrackingNumber }
    await TransformDeliveryAttemptEntity.build(PutItemCommand).item(item).send()
    return item
  },

  async listByTrackingNumber(
    clientId: string,
    trackingNumber: string,
    limit?: number
  ): Promise<TransformDeliveryAttempt[]> {
    const command = transformDeliveryAttemptTable
      .build(QueryCommand)
      .query({ partition: buildCompositeKey(clientId, trackingNumber) })
      .entities(TransformDeliveryAttemptEntity)

    if (limit) {
      const { Items = [] } = await command.options({ limit }).send()
      return Items
    }

    const { Items = [] } = await command.send()
    return Items
  },
}
