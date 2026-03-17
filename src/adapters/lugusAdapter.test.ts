import { GraphQLError } from 'graphql'
import { ClientError } from 'graphql-request'

import { lugusAdapter } from './lugusAdapter'

const mockRequest = jest.fn()

jest.mock('./mergedApiClient', () => ({
  buildMergedApiClient: () => ({ request: mockRequest }),
}))

describe('lugusAdapter.getPackageEventHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns package log entries on success', async () => {
    const entries = [
      { eventType: 'PICKED_UP', timestamp: '2026-03-10T08:00:00Z', message: 'Package picked up' },
      { eventType: 'IN_TRANSIT', timestamp: '2026-03-10T12:00:00Z', message: 'In transit' },
    ]
    mockRequest.mockResolvedValue({ getPackageByTrackingId: { packageLog: entries } })

    const result = await lugusAdapter.getPackageEventHistory('VH1234567890')

    expect(result).toEqual(entries)
  })

  it('returns empty array when package is not found (null response)', async () => {
    mockRequest.mockResolvedValue({ getPackageByTrackingId: null })

    const result = await lugusAdapter.getPackageEventHistory('VH0000000000')

    expect(result).toEqual([])
  })

  it('throws on network error', async () => {
    mockRequest.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(lugusAdapter.getPackageEventHistory('VH1234567890')).rejects.toThrow('ECONNREFUSED')
  })

  it('throws on ClientError', async () => {
    const clientError = new ClientError({ errors: [new GraphQLError('Unauthorized')], status: 401 } as never, {
      query: '',
    })
    mockRequest.mockRejectedValue(clientError)

    await expect(lugusAdapter.getPackageEventHistory('VH1234567890')).rejects.toThrow(ClientError)
  })

  it('passes trackingId as variable to the query', async () => {
    mockRequest.mockResolvedValue({ getPackageByTrackingId: { packageLog: [] } })

    await lugusAdapter.getPackageEventHistory('VH9999999999')

    expect(mockRequest).toHaveBeenCalledWith(expect.anything(), { trackingId: 'VH9999999999' })
  })
})

describe('lugusAdapter.getPackageWithHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns clientId and package log entries on success', async () => {
    const entries = [
      { eventType: 'PICKED_UP', timestamp: '2026-03-10T08:00:00Z', message: 'Package picked up' },
    ]
    mockRequest.mockResolvedValue({
      getPackageByTrackingId: { clientId: 'client-abc', packageLog: entries },
    })

    const result = await lugusAdapter.getPackageWithHistory('VH1234567890')

    expect(result).toEqual({ clientId: 'client-abc', packageLog: entries })
  })

  it('returns null clientId and empty packageLog when package is not found', async () => {
    mockRequest.mockResolvedValue({ getPackageByTrackingId: null })

    const result = await lugusAdapter.getPackageWithHistory('VH0000000000')

    expect(result).toEqual({ clientId: null, packageLog: [] })
  })

  it('returns null clientId when package exists but has no clientId', async () => {
    mockRequest.mockResolvedValue({
      getPackageByTrackingId: { clientId: null, packageLog: [] },
    })

    const result = await lugusAdapter.getPackageWithHistory('VH1234567890')

    expect(result).toEqual({ clientId: null, packageLog: [] })
  })

  it('filters null entries from packageLog', async () => {
    const entries = [
      { eventType: 'IN_TRANSIT', timestamp: '2026-03-10T12:00:00Z', message: 'In transit' },
      null,
    ]
    mockRequest.mockResolvedValue({
      getPackageByTrackingId: { clientId: 'client-abc', packageLog: entries },
    })

    const result = await lugusAdapter.getPackageWithHistory('VH1234567890')

    expect(result.packageLog).toHaveLength(1)
  })

  it('passes trackingId as variable to the query', async () => {
    mockRequest.mockResolvedValue({ getPackageByTrackingId: { clientId: 'c-1', packageLog: [] } })

    await lugusAdapter.getPackageWithHistory('VH9999999999')

    expect(mockRequest).toHaveBeenCalledWith(expect.anything(), { trackingId: 'VH9999999999' })
  })

  it('throws on network error', async () => {
    mockRequest.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(lugusAdapter.getPackageWithHistory('VH1234567890')).rejects.toThrow('ECONNREFUSED')
  })
})
