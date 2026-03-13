import { trackerSubscriptionDataAccessor } from '../dataAccessors/trackerSubscriptionDataAccessor'
import type { TrackerSubscription } from '../database'

export const trackerSubscriptionManager = {
  async createSubscription(subscription: TrackerSubscription): Promise<void> {
    const existing = await trackerSubscriptionDataAccessor.getByTrackingNumber(subscription.trackingNumber)
    if (existing) {
      console.log(`Subscription already exists for tracking number: ${subscription.trackingNumber}`)
      return
    }
    await trackerSubscriptionDataAccessor.create(subscription)
  },

  async removeSubscription(trackingNumber: string): Promise<void> {
    const existing = await trackerSubscriptionDataAccessor.getByTrackingNumber(trackingNumber)
    if (!existing) {
      console.log(`No subscription found for tracking number: ${trackingNumber}`)
      return
    }
    await trackerSubscriptionDataAccessor.delete(trackingNumber)
  },

  async getSubscription(trackingNumber: string): Promise<TrackerSubscription | undefined> {
    return trackerSubscriptionDataAccessor.getByTrackingNumber(trackingNumber)
  },
}
