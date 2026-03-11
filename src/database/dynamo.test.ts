import { schema, table } from './dynamo'

describe('dynamo schema', () => {
  it('should have all 3 models accessible', () => {
    expect(table.getModel('ClientConfig')).toBeDefined()
    expect(table.getModel('TrackerSubscription')).toBeDefined()
    expect(table.getModel('TransformDeliveryAttempt')).toBeDefined()
  })

  it('should have primary and gs1 indexes defined in schema', () => {
    expect(schema.indexes.primary).toEqual({ hash: 'pk', sort: 'sk' })
    expect(schema.indexes.gs1).toEqual({ hash: 'gs1pk', sort: 'gs1sk', project: 'all' })
  })
})
