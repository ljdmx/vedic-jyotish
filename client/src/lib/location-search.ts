export function normalizeLocationSearch(address: string) {
  return address.trim();
}

export function shouldScheduleLocationSearch(address: string, lastCompletedAddress: string | null) {
  const normalized = normalizeLocationSearch(address);
  return normalized.length >= 2 && normalized !== lastCompletedAddress;
}
