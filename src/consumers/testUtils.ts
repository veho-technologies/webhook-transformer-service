import type { EventBridgeEvent, SQSEvent } from 'aws-lambda'

export function wrapInSqsEvent(ebEvent: EventBridgeEvent<string, unknown>): SQSEvent {
  return {
    Records: [
      {
        messageId: 'test-message-id',
        receiptHandle: 'test-receipt-handle',
        body: JSON.stringify(ebEvent),
        attributes: {} as never,
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:123456789:test-queue',
        awsRegion: 'us-east-1',
      },
    ],
  }
}

export const noopCallback = () => {}
