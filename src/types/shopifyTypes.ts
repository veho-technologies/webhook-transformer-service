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

/**
 * Supplementary event messages for Shopify tracker events.
 * - Overrides: Anansi messages where wording doesn't fit Shopify consumer context
 * - Gaps: Event codes from the Veho→Shopify mapping spreadsheet not covered by Anansi
 *
 * Checked BEFORE @veho/client-api-contract's getHumanReadablePackageOperationText()
 * so overrides take priority.
 *
 * @see https://linear.app/veho/issue/CLI-3032
 */
export const SHOPIFY_SUPPLEMENTARY_EVENT_MESSAGES: Record<string, string> = {
  // Overrides ("shipper" → "sender", "shipment" → "package")
  pickedUpFromClient: 'Package left sender facility',
  returnedToClient: 'Package returned to sender',
  pendingReturnToClient: 'Package pending return to sender',
  // Event codes not in Anansi
  PackageCreatedByClient: 'Label created',
  PackageImageAddedAsProofOfService: 'Package delivered',
  PackageHadDeliveryIssue: 'There was an issue with the delivery',
  delayed: 'The package has been delayed',
  OrderAddressCouldNotBeNormalized: 'The package address is incorrect',
  PackageReturnedToVehoByDriverWithoutDeliveryIssue: 'Package returned to Veho',
  PackageReturnedToVehoByDriverAfterDeliveryIssue: 'Package returned to Veho',
}
