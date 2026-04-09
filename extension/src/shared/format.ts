export function formatDistance(valueMeters: number): string {
  return `${(valueMeters / 1000).toFixed(1)} km`;
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

export function formatDurationCompact(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatElevation(valueMeters: number): string {
  return `${Math.round(valueMeters).toLocaleString()} m`;
}

export function formatPercent(value: number | null): string {
  if (value === null) {
    return 'n/a';
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function formatShortDate(value: string | null): string {
  if (!value) {
    return 'n/a';
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}
