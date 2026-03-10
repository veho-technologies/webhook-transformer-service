import type { LldConfigTs } from 'lambda-live-debugger'

export default {
  framework: 'cdk',
  profile: 'veho-dev',
  region: 'us-east-1',
  observable: false,
  verbose: false,
  getLambdas: async foundLambdas => {
    const found =
      foundLambdas?.filter(lambda =>
        lambda.metadata.stackName?.startsWith(`webhook-transformer-service-personal-${process.env.PERSONAL_STACK_NAME}`)
      ) ?? []
    return found
  },
} satisfies LldConfigTs
