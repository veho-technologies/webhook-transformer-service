import { getApolloSdk } from '@veho/janus-sdk'
import { log } from '@veho/observability-sdk'

const getJanusSdk = () => {
  return getApolloSdk({
    url: process.env.FACILITY_API_GATEWAY_URL!,
    serviceName: 'webhook-transformer-service',
    sigv4: true,
  })
}

export interface FacilityLocation {
  lat: number
  lng: number
  city?: string
}

export const janusAdapter = {
  async getFacilityLocation(facilityId: string): Promise<FacilityLocation | null> {
    try {
      const sdk = getJanusSdk()
      const { facility } = await sdk.GetFacility({ facilityId })
      const address = facility?.address
      const location = address?.location
      if (location?.lat != null && location?.lng != null) {
        return { lat: location.lat, lng: location.lng, ...(address?.city ? { city: address.city } : {}) }
      }
      log.warn('Facility has no coordinates', { facilityId })
      return null
    } catch (error) {
      log.error('Failed to fetch facility location from Janus', { facilityId, error })
      return null
    }
  },
}
