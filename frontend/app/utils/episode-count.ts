export function adjustEpisodeCount(value: number | string, delta: number) {
  const parsedValue = Number.parseInt(String(value), 10)
  const currentValue = Number.isFinite(parsedValue) ? parsedValue : 1

  return Math.min(999, Math.max(1, currentValue + delta))
}
