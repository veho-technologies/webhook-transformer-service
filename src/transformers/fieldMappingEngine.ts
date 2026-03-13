import { log } from '@veho/observability-sdk'

export interface FieldMapping {
  source: string
  target: string
  transform?: string
}

export interface MappingConfig {
  mappings: FieldMapping[]
  statusMap: Record<string, string>
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    return (current as Record<string, unknown>)[segment]
  }, obj)
}

/**
 * Applies field mappings to a source object, producing a flat output object.
 *
 * This engine operates on flat, scalar fields only. It does NOT iterate arrays.
 * For Shopify's trackerUpdate payload, the caller (transformationManager) is responsible
 * for iterating over `eventLog[]` entries and calling this function once per entry to
 * build each TrackerEvent, then assembling the final `events` array.
 */
export function applyFieldMapping(source: Record<string, unknown>, config: MappingConfig): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const mapping of config.mappings) {
    const value = getNestedValue(source, mapping.source)

    if (value === undefined) {
      continue
    }

    if (mapping.transform === 'statusMap') {
      const stringValue = String(value)
      const mapped = config.statusMap[stringValue]
      if (mapped !== undefined) {
        result[mapping.target] = mapped
      } else {
        log.warn(`Unknown status value: "${stringValue}" — passing through unmapped`)
        result[mapping.target] = stringValue
      }
    } else {
      result[mapping.target] = value
    }
  }

  return result
}
