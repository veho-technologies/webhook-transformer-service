import { TransformDeliveryAttemptEntity, TransformDeliveryAttemptModel } from '../database/dynamo'

export type TransformDeliveryAttempt = TransformDeliveryAttemptEntity

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60

export const transformDeliveryAttemptDataAccessor = {
  async create(attempt: Omit<TransformDeliveryAttempt, 'id' | 'timeToLive'>): Promise<TransformDeliveryAttempt> {
    const timeToLive = Math.floor(Date.now() / 1000) + THIRTY_DAYS_IN_SECONDS
    return TransformDeliveryAttemptModel.create({ ...attempt, timeToLive })
  },

  async listByTrackingNumber(
    clientId: string,
    trackingNumber: string,
    limit?: number
  ): Promise<TransformDeliveryAttempt[]> {
    return TransformDeliveryAttemptModel.find({ pk: `attempt:${clientId}:${trackingNumber}` }, { limit })
  },
}
