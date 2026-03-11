import { TrackerSubscriptionEntity, TrackerSubscriptionModel } from '../database/dynamo'

export const trackerSubscriptionDataAccessor = {
  async getByTrackingNumber(trackingNumber: string): Promise<TrackerSubscriptionEntity | undefined> {
    return TrackerSubscriptionModel.get({ trackingNumber })
  },

  async create(subscription: TrackerSubscriptionEntity): Promise<TrackerSubscriptionEntity> {
    return TrackerSubscriptionModel.create(subscription)
  },

  async delete(trackingNumber: string): Promise<void> {
    await TrackerSubscriptionModel.remove({ trackingNumber })
  },

  async listByClientId(clientId: string): Promise<TrackerSubscriptionEntity[]> {
    return TrackerSubscriptionModel.find({ clientId }, { index: 'gs1' })
  },
}
