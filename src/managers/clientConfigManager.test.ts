import type { ClientConfig } from '../database'
import { clientConfigManager } from './clientConfigManager'

const mockGetByClientId = jest.fn()
const mockCreate = jest.fn()

jest.mock('../dataAccessors/clientConfigDataAccessor', () => ({
  clientConfigDataAccessor: {
    getByClientId: (...args: unknown[]) => mockGetByClientId(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}))

describe('clientConfigManager', () => {
  const mockConfig: ClientConfig = {
    clientId: 'client-123',
    endpointType: 'shopify_graphql',
    endpointUrl: 'https://shopify.example.com/graphql',
    authType: 'oauth',
    fieldMappings: [{ source: 'entity.package.trackingId', target: 'trackingNumber' }],
    statusMap: { DELIVERED: 'DELIVERED' },
  }

  beforeEach(() => jest.clearAllMocks())

  describe('getConfig', () => {
    it('should delegate to data accessor', async () => {
      mockGetByClientId.mockResolvedValue(mockConfig)

      const result = await clientConfigManager.getConfig('client-123')

      expect(mockGetByClientId).toHaveBeenCalledWith('client-123')
      expect(result).toEqual(mockConfig)
    })

    it('should return undefined when config not found', async () => {
      mockGetByClientId.mockResolvedValue(undefined)

      const result = await clientConfigManager.getConfig('nonexistent')

      expect(result).toBeUndefined()
    })
  })

  describe('upsertConfig', () => {
    it('should delegate to data accessor', async () => {
      mockCreate.mockResolvedValue(mockConfig)

      const result = await clientConfigManager.upsertConfig(mockConfig)

      expect(mockCreate).toHaveBeenCalledWith(mockConfig)
      expect(result).toEqual(mockConfig)
    })
  })
})
