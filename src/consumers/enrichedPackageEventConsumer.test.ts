import type { EventBridgeEvent } from 'aws-lambda'

import { type EnrichedPackageEventWithEventLog, transformationManager } from '../managers/transformationManager'
import { handler } from './enrichedPackageEventConsumer'
import { noopCallback, wrapInSqsEvent } from './testUtils'

jest.mock('../managers/transformationManager', () => ({
  transformationManager: {
    processEnrichedPackageEvent: jest.fn(),
  },
}))

const mockProcessEnrichedPackageEvent = transformationManager.processEnrichedPackageEvent as jest.Mock

function buildEvent(
  detail: Partial<EnrichedPackageEventWithEventLog> = {}
): EventBridgeEvent<'EnrichedPackageEvent', EnrichedPackageEventWithEventLog> {
  const defaultDetail = {
    entity: {
      package: {
        trackingId: 'TRK-001',
        eventLog: [{ eventType: 'PICKED_UP', timestamp: '2024-01-01T00:00:00Z' }],
      },
    },
    ...detail,
  } as EnrichedPackageEventWithEventLog

  return {
    id: 'test-id',
    version: '0',
    account: '123456789',
    time: '2024-01-01T00:00:00Z',
    region: 'us-east-1',
    resources: [],
    source: 'veho.hydratr',
    'detail-type': 'EnrichedPackageEvent',
    detail: defaultDetail,
  }
}

describe('enrichedPackageEventConsumer', () => {
  beforeEach(() => jest.clearAllMocks())

  it('calls processEnrichedPackageEvent with event detail', async () => {
    const ebEvent = buildEvent()
    await handler(wrapInSqsEvent(ebEvent), {} as never, noopCallback)

    expect(mockProcessEnrichedPackageEvent).toHaveBeenCalledWith(ebEvent.detail)
  })

  it('returns batch item failure when handler errors', async () => {
    const error = new Error('transformation failure')
    mockProcessEnrichedPackageEvent.mockRejectedValue(error)

    const result = await handler(wrapInSqsEvent(buildEvent()), {} as never, noopCallback)

    expect(result).toEqual({
      batchItemFailures: [{ itemIdentifier: 'test-message-id' }],
    })
  })
})
