/** When auto-engage is OFF, high-confidence matches still auto-shortlist at this cutoff. */
export const DEFAULT_SHORTLIST_THRESHOLD = 85;

export function effectiveShortlistThreshold(
  autoEnabled: boolean,
  engageThreshold: number,
): number {
  return autoEnabled ? engageThreshold : DEFAULT_SHORTLIST_THRESHOLD;
}
