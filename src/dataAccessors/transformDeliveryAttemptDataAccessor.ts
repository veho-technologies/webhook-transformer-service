import { TransformDeliveryAttemptEntity, TransformDeliveryAttemptModel } from '../database/dynamo'

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60

export const transformDeliveryAttemptDataAccessor = {
  async create(
    attempt: Omit<TransformDeliveryAttemptEntity, 'id' | 'timeToLive'>
  ): Promise<TransformDeliveryAttemptEntity> {
    const timeToLive = Math.floor(Date.now() / 1000) + THIRTY_DAYS_IN_SECONDS
    return TransformDeliveryAttemptModel.create({ ...attempt, timeToLive })
  },

  async listByTrackingNumber(
    clientId: string,
    trackingNumber: string,
    limit?: number
  ): Promise<TransformDeliveryAttemptEntity[]> {
    return TransformDeliveryAttemptModel.find({ clientId, trackingNumber }, { limit })
  },
}
