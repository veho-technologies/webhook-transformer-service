import { janusAdapter } from './janusAdapter'

const mockGetFacility = jest.fn()

jest.mock('@veho/janus-sdk', () => ({
  getApolloSdk: () => ({
    GetFacility: (...args: unknown[]) => mockGetFacility(...args),
  }),
}))

describe('janusAdapter', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('getFacilityCoordinates', () => {
    it('should return lat/lng when facility has coordinates', async () => {
      mockGetFacility.mockResolvedValue({
        facility: {
          facilityId: 'fac-001',
          address: { location: { lat: 40.7128, lng: -74.006 } },
        },
      })

      const result = await janusAdapter.getFacilityCoordinates('fac-001')

      expect(result).toEqual({ lat: 40.7128, lng: -74.006 })
      expect(mockGetFacility).toHaveBeenCalledWith({ facilityId: 'fac-001' })
    })

    it('should return null when facility has no location', async () => {
      mockGetFacility.mockResolvedValue({
        facility: {
          facilityId: 'fac-001',
          address: { location: null },
        },
      })

      const result = await janusAdapter.getFacilityCoordinates('fac-001')

      expect(result).toBeNull()
    })

    it('should return null when facility has no address', async () => {
      mockGetFacility.mockResolvedValue({
        facility: {
          facilityId: 'fac-001',
          address: null,
        },
      })

      const result = await janusAdapter.getFacilityCoordinates('fac-001')

      expect(result).toBeNull()
    })

    it('should return null when facility is not found', async () => {
      mockGetFacility.mockResolvedValue({ facility: null })

      const result = await janusAdapter.getFacilityCoordinates('nonexistent')

      expect(result).toBeNull()
    })

    it('should return null when location has lat but no lng', async () => {
      mockGetFacility.mockResolvedValue({
        facility: {
          facilityId: 'fac-001',
          address: { location: { lat: 40.7128, lng: null } },
        },
      })

      const result = await janusAdapter.getFacilityCoordinates('fac-001')

      expect(result).toBeNull()
    })

    it('should return null and not throw when SDK throws', async () => {
      mockGetFacility.mockRejectedValue(new Error('Network error'))

      const result = await janusAdapter.getFacilityCoordinates('fac-001')

      expect(result).toBeNull()
    })
  })
})
