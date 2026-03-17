import { NodejsFunction, TableV2, VehoStack, VehoStackProps } from '@veho/cdk'
import { Duration, RemovalPolicy } from 'aws-cdk-lib'
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb'
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'

export interface WebhookTransformerStackProps extends VehoStackProps {
  mergedApiUrl: string
}

export class WebhookTransformerStack extends VehoStack {
  public readonly clientConfigTable: TableV2
  public readonly trackerSubscriptionTable: TableV2
  public readonly transformDeliveryAttemptTable: TableV2

  constructor(scope: Construct, id: string, { mergedApiUrl, ...props }: WebhookTransformerStackProps) {
    super(scope, id, props)

    const mergedApiReadPolicy = ManagedPolicy.fromManagedPolicyName(
      this,
      'MergedApiReadPolicy',
      'merged-api-ReadApiPolicy'
    )

    this.clientConfigTable = new TableV2(this, 'ClientConfigTable', {
      partitionKey: { name: 'clientId', type: AttributeType.STRING },
      disableCompositePrimaryKey: true,
      disableTtl: true,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    this.trackerSubscriptionTable = new TableV2(this, 'TrackerSubscriptionTable', {
      partitionKey: { name: 'trackingNumber', type: AttributeType.STRING },
      disableCompositePrimaryKey: true,
      globalSecondaryIndexes: [
        {
          indexName: 'byClientId',
          partitionKey: { name: 'clientId', type: AttributeType.STRING },
          sortKey: { name: 'subscribedAt', type: AttributeType.STRING },
        },
        {
          indexName: 'byTrackerReferenceId',
          partitionKey: { name: 'trackerReferenceId', type: AttributeType.STRING },
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

    // Testing only — remove once real handlers are wired up
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

    // Testing only — remove once real handlers are wired up
    new NodejsFunction(this, 'LugusSmoke', {
      entry: 'src/handlers/lugusSmoke.ts',
      timeout: Duration.seconds(30),
      environment: {
        MERGED_API_URL: mergedApiUrl,
      },
      managedPolicies: [mergedApiReadPolicy],
    })
  }
}
