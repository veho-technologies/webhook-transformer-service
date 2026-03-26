import { getApolloSdk } from '@veho/janus-sdk'
import { log } from '@veho/observability-sdk'

const getJanusSdk = () =>
  getApolloSdk({
    url: process.env.FACILITY_API_GATEWAY_URL!,
    serviceName: 'webhook-transformer-service',
    sigv4: true,
  })

export const janusAdapter = {
  async getFacilityCoordinates(facilityId: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const sdk = getJanusSdk()
      const { facility } = await sdk.GetFacility({ facilityId })
      const location = facility?.address?.location
      if (location?.lat != null && location?.lng != null) {
        return { lat: location.lat, lng: location.lng }
      }
      log.warn('Facility has no coordinates', { facilityId })
      return null
    } catch (error) {
      log.error('Failed to fetch facility coordinates from Janus', { facilityId, error })
      return null
    }
  },
}
