import { App } from 'aws-cdk-lib'

import { WebhookTransformerStack } from './stacks/stack'

const TAGS = {
  Service: 'webhook-transformer-service',
  Team: 'growth',
  ProductArea: 'client-operations',
}

const app = new App()
const region = 'us-east-1'

const MERGED_API_URLS: Record<string, string> = {
  dev: 'https://graph.dev.shipveho.com/graphql',
  staging: 'https://graph.staging.shipveho.com/graphql',
  prod: 'https://graph.shipveho.com/graphql',
  sandbox: 'https://graph.sandbox.shipveho.com/graphql',
}

const envs: Record<
  string,
  {
    account: string
  }
> = {
  dev: {
    account: '657230704726',
  },
  staging: {
    account: '048595045497',
  },
  prod: {
    account: '595208618232',
  },
  sandbox: {
    account: '050838062588',
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
    mergedApiUrl: MERGED_API_URLS[envName],
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
    mergedApiUrl: MERGED_API_URLS.dev,
  })
}

app.synth()
