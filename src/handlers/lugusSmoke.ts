import { lugusAdapter } from '../adapters/lugusAdapter'

interface LugusSmokeEvent {
  trackingId: string
}

export const handler = async (event: LugusSmokeEvent) => {
  const { trackingId } = event

  const packageLog = await lugusAdapter.getPackageEventHistory(trackingId)

  return {
    statusCode: 200,
    body: JSON.stringify({ trackingId, eventCount: packageLog.length, packageLog }, null, 2),
  }
}
