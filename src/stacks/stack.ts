import { EventBridgeConsumer, NodejsFunctionProps, TableV2, VehoRestAPI, VehoStack, VehoStackProps } from '@veho/cdk'
import { EventNames } from '@veho/event-types'
import { Duration, Fn, RemovalPolicy, Stack } from 'aws-cdk-lib'
import { AuthorizationType } from 'aws-cdk-lib/aws-apigateway'
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb'
import { EventBus } from 'aws-cdk-lib/aws-events'
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

    // ── IAM ──────────────────────────────────────────────────────────────

    const mergedApiReadPolicy = ManagedPolicy.fromManagedPolicyName(
      this,
      'MergedApiReadPolicy',
      'merged-api-ReadApiPolicy'
    )

    // ── DynamoDB Tables ──────────────────────────────────────────────────

    this.clientConfigTable = new TableV2(this, 'ClientConfigTable', {
      partitionKey: { name: 'clientId', type: AttributeType.STRING },
      disableCompositePrimaryKey: true,
      disableTtl: true,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    this.trackerSubscriptionTable = new TableV2(this, 'TrackerSubscriptionTable', {
      partitionKey: { name: 'trackingNumber', type: AttributeType.STRING },
      disableCompositePrimaryKey: true,
      timeToLiveAttribute: 'timeToLive',
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

    const allTables = [this.clientConfigTable, this.trackerSubscriptionTable, this.transformDeliveryAttemptTable]

    // ── Shared Lambda props ──────────────────────────────────────────────

    const sharedConsumerLambdaProps: NodejsFunctionProps = {
      timeout: Duration.seconds(30),
      environment: {
        CLIENT_CONFIG_TABLE_NAME: this.clientConfigTable.tableName,
        TRACKER_SUBSCRIPTION_TABLE_NAME: this.trackerSubscriptionTable.tableName,
        TRANSFORM_DELIVERY_ATTEMPT_TABLE_NAME: this.transformDeliveryAttemptTable.tableName,
        MERGED_API_URL: mergedApiUrl,
      },
      dynamoTables: allTables,
      managedPolicies: [mergedApiReadPolicy],
    }

    const sharedApiLambdaProps: NodejsFunctionProps = {
      timeout: Duration.seconds(30),
      environment: {
        CLIENT_CONFIG_TABLE_NAME: this.clientConfigTable.tableName,
        TRACKER_SUBSCRIPTION_TABLE_NAME: this.trackerSubscriptionTable.tableName,
        TRANSFORM_DELIVERY_ATTEMPT_TABLE_NAME: this.transformDeliveryAttemptTable.tableName,
      },
      dynamoTables: allTables,
    }

    // ── EventBridge Buses ────────────────────────────────────────────────

    const bifrostBus = EventBus.fromEventBusName(this, 'BifrostBus', Fn.importValue('BifrostEventBusName'))
    const hydratrBus = EventBus.fromEventBusName(this, 'HydratrBus', 'hydratrEventBus')

    // ── EventBridge Consumers ────────────────────────────────────────────

    new EventBridgeConsumer(this, 'TrackerSubscribedConsumer', {
      entry: 'src/consumers/trackerSubscribedConsumer.ts',
      eventBus: bifrostBus,
      eventPattern: { detailType: [EventNames.TrackingSubscriptionCreated], account: [Stack.of(this).account] },
      description: 'Processes new tracker subscriptions — creates subscription record and sends initial Shopify update',
      lambdaProps: sharedConsumerLambdaProps,
    })

    new EventBridgeConsumer(this, 'TrackerUnsubscribedConsumer', {
      entry: 'src/consumers/trackerUnsubscribedConsumer.ts',
      eventBus: bifrostBus,
      eventPattern: { detailType: [EventNames.TrackingSubscriptionDeleted], account: [Stack.of(this).account] },
      description: 'Processes tracker unsubscriptions — removes subscription record',
      lambdaProps: sharedConsumerLambdaProps,
    })

    new EventBridgeConsumer(this, 'TrackerStatusRequestedConsumer', {
      entry: 'src/consumers/trackerStatusRequestedConsumer.ts',
      eventBus: bifrostBus,
      eventPattern: { detailType: [EventNames.TrackingStatusRequested], account: [Stack.of(this).account] },
      description: 'Processes status requests — fetches fresh data from Lugus and sends Shopify update',
      lambdaProps: sharedConsumerLambdaProps,
    })

    new EventBridgeConsumer(this, 'EnrichedPackageEventConsumer', {
      entry: 'src/consumers/enrichedPackageEventConsumer.ts',
      eventBus: hydratrBus,
      eventPattern: { detailType: ['EnrichedPackageEvent'] },
      description: 'Processes enriched package events from hydratr — transforms and delivers to Shopify',
      lambdaProps: sharedConsumerLambdaProps,
    })

    // ── CRUD API Gateway (IAM-authed, internal) ──────────────────────────

    new VehoRestAPI(this, 'CrudApi', {
      routes: {
        clients: {
          get: {
            lambdaProps: { ...sharedApiLambdaProps, entry: 'src/handlers/listClients.ts' },
            methodProps: { authorizationType: AuthorizationType.IAM },
          },
          childRoutes: {
            '{clientId}': {
              get: {
                lambdaProps: { ...sharedApiLambdaProps, entry: 'src/handlers/getClient.ts' },
                methodProps: { authorizationType: AuthorizationType.IAM },
              },
              put: {
                lambdaProps: { ...sharedApiLambdaProps, entry: 'src/handlers/putClient.ts' },
                methodProps: { authorizationType: AuthorizationType.IAM },
              },
            },
          },
        },
        subscriptions: {
          childRoutes: {
            '{trackingNumber}': {
              get: {
                lambdaProps: { ...sharedApiLambdaProps, entry: 'src/handlers/getSubscription.ts' },
                methodProps: { authorizationType: AuthorizationType.IAM },
              },
            },
          },
        },
      },
    })
  }
}
