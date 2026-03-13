/**
 * Shopify trackerUpdate GraphQL mutation types.
 * Derived from the Shopify Tracking Implementation Guide (beta, closed).
 */

export interface TrackerEvent {
  status: string
  message: string
  /** ISO8601 with timezone offset */
  happenedAt: string
  territory?: string
  zone?: string
  city?: string
  postalCode?: string
  latitude?: number
  longitude?: number
  originalEventCode?: string
  originalEventMessage?: string
}

export interface TrackerAttributes {
  trackingNumber: string
  carrierId: string
  events: TrackerEvent[]
  mailClass?: string
  idempotencyKey?: string
  webhookId?: string
  trackerReferenceId?: string
  destinationPostalCode?: string
  /** ISO8601 UTC timestamp */
  estimatedDeliveryDateTimeStart?: string
  /** ISO8601 UTC timestamp */
  estimatedDeliveryDateTimeEnd?: string
}

export interface ShopifyGraphqlError {
  field: string
  message: string
}
