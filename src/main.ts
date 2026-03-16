import { App } from 'aws-cdk-lib'

import { WebhookTransformerStack } from './stacks/stack'

const TAGS = {
  Service: 'webhook-transformer-service',
  Team: 'growth',
  ProductArea: 'client-operations',
}

const app = new App()
const region = 'us-east-1'

const envs: Record<
  string,
  {
    account: string
    mergedApiUrl: string
  }
> = {
  dev: {
    account: '657230704726',
    mergedApiUrl: 'https://graph.dev.shipveho.com/graphql',
  },
  staging: {
    account: '048595045497',
    mergedApiUrl: 'https://graph.staging.shipveho.com/graphql',
  },
  prod: {
    account: '595208618232',
    mergedApiUrl: 'https://graph.shipveho.com/graphql',
  },
  sandbox: {
    account: '050838062588',
    mergedApiUrl: 'https://graph.sandbox.shipveho.com/graphql',
  },
}

for (const [envName, env] of Object.entries(envs)) {
  new WebhookTransformerStack(app, `webhook-transformer-service-${envName}`, {
    stackName: 'webhook-transformer-service',
    appEnvironment: envName,
    serviceName: 'webhook-transformer-service',
    teamName: 'growth',
    isEphemeral: false,
    env: { region, account: env.account },
    tags: TAGS,
    mergedApiUrl: env.mergedApiUrl,
  })
}

// PERSONAL STACK
const personalStackName = process.env.PERSONAL_STACK_NAME
if (personalStackName) {
  new WebhookTransformerStack(app, `webhook-transformer-service-personal-${personalStackName}`, {
    env: { account: envs.dev.account, region },
    appEnvironment: `ephemeral-${personalStackName}`,
    serviceName: 'webhook-transformer-service',
    teamName: 'growth',
    tags: TAGS,
    isEphemeral: true,
    mergedApiUrl: envs.dev.mergedApiUrl,
  })
}

app.synth()
