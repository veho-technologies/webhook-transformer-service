import { TrackerSubscriptionEntity, TrackerSubscriptionModel } from '../database/dynamo'

export type TrackerSubscription = TrackerSubscriptionEntity

export const trackerSubscriptionDataAccessor = {
  async getByTrackingNumber(trackingNumber: string): Promise<TrackerSubscription | undefined> {
    return TrackerSubscriptionModel.get({ trackingNumber })
  },

  async create(subscription: TrackerSubscription): Promise<TrackerSubscription> {
    return TrackerSubscriptionModel.create(subscription)
  },

  async delete(trackingNumber: string): Promise<void> {
    await TrackerSubscriptionModel.remove({ trackingNumber })
  },

  async listByClientId(clientId: string): Promise<TrackerSubscription[]> {
    return TrackerSubscriptionModel.find({ gs1pk: `client:${clientId}` }, { index: 'gs1' })
  },
}
