import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import AWSXRay from 'aws-xray-sdk-core'

const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined

let instance: DynamoDBDocumentClient | undefined

export const DocumentClientSingleton = {
  get(): DynamoDBDocumentClient {
    if (!instance) {
      const rawClient = isTest
        ? new DynamoDBClient({ endpoint: 'http://localhost:8000', region: 'us-east-1' })
        : AWSXRay.captureAWSv3Client(new DynamoDBClient({}))

      instance = DynamoDBDocumentClient.from(rawClient, {
        marshallOptions: { removeUndefinedValues: true },
      })
    }
    return instance
  },
}
