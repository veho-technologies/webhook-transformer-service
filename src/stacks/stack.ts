import { NodejsFunction, TableV2, VehoStack, VehoStackProps } from '@veho/cdk'
import { Duration, RemovalPolicy } from 'aws-cdk-lib'
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb'
import { Construct } from 'constructs'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WebhookTransformerStackProps extends VehoStackProps {
  // define additional props here...
}

export class WebhookTransformerStack extends VehoStack {
  public readonly clientConfigTable: TableV2
  public readonly trackerSubscriptionTable: TableV2
  public readonly transformDeliveryAttemptTable: TableV2

  constructor(scope: Construct, id: string, { ...props }: WebhookTransformerStackProps) {
    super(scope, id, props)

    this.clientConfigTable = new TableV2(this, 'ClientConfigTable', {
      partitionKey: { name: 'clientId', type: AttributeType.STRING },
      disableCompositePrimaryKey: true,
      disableTtl: true,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    this.trackerSubscriptionTable = new TableV2(this, 'TrackerSubscriptionTable', {
      partitionKey: { name: 'trackingNumber', type: AttributeType.STRING },
      disableCompositePrimaryKey: true,
      disableTtl: true,
      globalSecondaryIndexes: [
        {
          indexName: 'byClientId',
          partitionKey: { name: 'clientId', type: AttributeType.STRING },
          sortKey: { name: 'subscribedAt', type: AttributeType.STRING },
        },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    })

    this.transformDeliveryAttemptTable = new TableV2(this, 'TransformDeliveryAttemptTable', {
      partitionKey: { name: 'clientIdTrackingNumber', type: AttributeType.STRING },
      sortKey: { name: 'id', type: AttributeType.STRING },
      timeToLiveAttribute: 'timeToLive',
      removalPolicy: RemovalPolicy.RETAIN,
    })

    new NodejsFunction(this, 'DynamoSmokeTest', {
      entry: 'src/handlers/dynamoSmokeTest.ts',
      timeout: Duration.seconds(30),
      environment: {
        CLIENT_CONFIG_TABLE_NAME: this.clientConfigTable.tableName,
        TRACKER_SUBSCRIPTION_TABLE_NAME: this.trackerSubscriptionTable.tableName,
        TRANSFORM_DELIVERY_ATTEMPT_TABLE_NAME: this.transformDeliveryAttemptTable.tableName,
      },
      dynamoTables: [this.clientConfigTable, this.trackerSubscriptionTable, this.transformDeliveryAttemptTable],
    })
  }
}
