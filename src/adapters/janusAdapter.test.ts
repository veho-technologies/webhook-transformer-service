import { janusAdapter } from './janusAdapter'

const mockGetFacility = jest.fn()

jest.mock('@veho/janus-sdk', () => ({
  getApolloSdk: () => ({
    GetFacility: (...args: unknown[]) => mockGetFacility(...args),
  }),
}))

describe('janusAdapter', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('getFacilityLocation', () => {
    it('should return lat/lng/city when facility has coordinates and city', async () => {
      mockGetFacility.mockResolvedValue({
        facility: {
          facilityId: 'fac-001',
          address: { city: 'New York', location: { lat: 40.7128, lng: -74.006 } },
        },
      })

      const result = await janusAdapter.getFacilityLocation('fac-001')

      expect(result).toEqual({ lat: 40.7128, lng: -74.006, city: 'New York' })
      expect(mockGetFacility).toHaveBeenCalledWith({ facilityId: 'fac-001' })
    })

    it('should return lat/lng without city when facility has no city', async () => {
      mockGetFacility.mockResolvedValue({
        facility: {
          facilityId: 'fac-001',
          address: { city: null, location: { lat: 40.7128, lng: -74.006 } },
        },
      })

      const result = await janusAdapter.getFacilityLocation('fac-001')

      expect(result).toEqual({ lat: 40.7128, lng: -74.006 })
    })

    it('should return null when facility has no location', async () => {
      mockGetFacility.mockResolvedValue({
        facility: {
          facilityId: 'fac-001',
          address: { location: null },
        },
      })

      const result = await janusAdapter.getFacilityLocation('fac-001')

      expect(result).toBeNull()
    })

    it('should return null when facility has no address', async () => {
      mockGetFacility.mockResolvedValue({
        facility: {
          facilityId: 'fac-001',
          address: null,
        },
      })

      const result = await janusAdapter.getFacilityLocation('fac-001')

      expect(result).toBeNull()
    })

    it('should return null when facility is not found', async () => {
      mockGetFacility.mockResolvedValue({ facility: null })

      const result = await janusAdapter.getFacilityLocation('nonexistent')

      expect(result).toBeNull()
    })

    it('should return null when location has lat but no lng', async () => {
      mockGetFacility.mockResolvedValue({
        facility: {
          facilityId: 'fac-001',
          address: { location: { lat: 40.7128, lng: null } },
        },
      })

      const result = await janusAdapter.getFacilityLocation('fac-001')

      expect(result).toBeNull()
    })

    it('should return null and not throw when SDK throws', async () => {
      mockGetFacility.mockRejectedValue(new Error('Network error'))

      const result = await janusAdapter.getFacilityLocation('fac-001')

      expect(result).toBeNull()
    })
  })
})
