/**
 * Shopify Shipping Partner Platform — trackerUpdate GraphQL mutation types.
 * Derived from introspection of the 2026-01 API.
 */

export interface TrackerEventAttributes {
  status: string
  message: string
  /** ISO8601 with timezone offset */
  happenedAt: string
  territory: string
  zone?: string
  city?: string
  postalCode?: string
  latitude?: number
  longitude?: number
  originalEventCode?: string
  originalEventMessage?: string
}

export interface TrackerAttributes {
  idempotencyKey: string
  trackerReferenceId: string
  events: TrackerEventAttributes[]
  webhookId?: string
  carrierId?: string
  trackingNumber?: string
  mailClass?: string
  destinationPostalCode?: string
  /** ISO8601 UTC timestamp */
  estimatedDeliveryDateTimeStart?: string
  /** ISO8601 UTC timestamp */
  estimatedDeliveryDateTimeEnd?: string
}

export interface ShopifyGraphqlError {
  code?: string
  field?: string
  message: string
}
