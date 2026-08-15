export const DEFAULT_GROUP_MANAGER_SNAPSHOT_STALE_AFTER_SECONDS = 7200;

export type GroupManagerHealthStatus =
  | 'healthy'
  | 'degraded'
  | 'disconnected'
  | 'stale'
  | 'error';

export type GroupManagerCursorStatus = 'current' | 'behind' | 'stale' | 'unknown';
export type GroupManagerConnectionSource = 'provider' | 'inferred' | 'unknown';

export interface GroupManagerHealthInput {
  configured: boolean;
  providerConnected: boolean | null;
  lastSuccessfulPollAt: Date | string | null;
  snapshotEvidenceAt: Date | string | null;
  cursor: string | null;
  providerLastSeq: number | null;
  consecutiveFailures: number;
  lastProviderError: string | null;
  baselineRequired?: boolean;
  snapshotStaleAfterSeconds?: number;
  pollStaleAfterSeconds: number;
  now?: Date;
}

export interface GroupManagerHealthResult {
  status: GroupManagerHealthStatus;
  connected: boolean | null;
  connectionSource: GroupManagerConnectionSource;
  pollFresh: boolean;
  snapshotFresh: boolean;
  pollAgeSeconds: number | null;
  snapshotAgeSeconds: number | null;
  cursorStatus: GroupManagerCursorStatus;
  reasons: string[];
}

export function groupManagerSnapshotStaleAfterSeconds(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_GROUP_MANAGER_SNAPSHOT_STALE_AFTER_SECONDS;
}

export function calculateGroupManagerHealth(
  input: GroupManagerHealthInput,
): GroupManagerHealthResult {
  const now = input.now ?? new Date();
  const pollAgeSeconds = ageSeconds(input.lastSuccessfulPollAt, now);
  const snapshotAgeSeconds = ageSeconds(input.snapshotEvidenceAt, now);
  const snapshotStaleAfterSeconds = input.snapshotStaleAfterSeconds
    ?? DEFAULT_GROUP_MANAGER_SNAPSHOT_STALE_AFTER_SECONDS;
  const pollFresh = pollAgeSeconds !== null
    && pollAgeSeconds <= input.pollStaleAfterSeconds;
  const snapshotFresh = snapshotAgeSeconds !== null
    && snapshotAgeSeconds <= snapshotStaleAfterSeconds;
  const cursorStatus = getCursorStatus(
    input.cursor,
    input.providerLastSeq,
    pollFresh,
  );

  let connected: boolean | null = input.providerConnected;
  let connectionSource: GroupManagerConnectionSource = input.providerConnected === null
    ? 'unknown'
    : 'provider';

  if (connected === null && pollFresh && snapshotFresh) {
    connected = true;
    connectionSource = 'inferred';
  }

  const reasons: string[] = [];
  let status: GroupManagerHealthStatus = 'healthy';

  if (!input.configured) {
    status = 'error';
    reasons.push('not_configured');
  } else if (input.providerConnected === false) {
    status = 'disconnected';
    reasons.push('provider_disconnected');
  } else if (input.baselineRequired) {
    status = 'degraded';
    reasons.push('baseline_required');
  } else if (input.consecutiveFailures >= 3) {
    status = 'error';
    reasons.push('repeated_provider_failures');
  } else if (!pollFresh || !snapshotFresh) {
    status = 'stale';
    if (!pollFresh) reasons.push('poll_stale');
    if (!snapshotFresh) reasons.push('snapshot_stale');
  } else if (
    input.consecutiveFailures > 0
    || input.lastProviderError !== null
    || cursorStatus === 'behind'
    || cursorStatus === 'unknown'
  ) {
    status = 'degraded';
    if (input.consecutiveFailures > 0 || input.lastProviderError !== null) {
      reasons.push('provider_failure');
    }
    if (cursorStatus === 'behind') reasons.push('cursor_behind');
    if (cursorStatus === 'unknown') reasons.push('cursor_unknown');
  }

  return {
    status,
    connected,
    connectionSource,
    pollFresh,
    snapshotFresh,
    pollAgeSeconds,
    snapshotAgeSeconds,
    cursorStatus,
    reasons,
  };
}

function ageSeconds(value: Date | string | null, now: Date): number | null {
  if (value === null) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 1000));
}

function getCursorStatus(
  cursor: string | null,
  providerLastSeq: number | null,
  pollFresh: boolean,
): GroupManagerCursorStatus {
  if (!pollFresh) return 'stale';

  const cursorNumber = cursor === null ? Number.NaN : Number(cursor);
  if (!Number.isInteger(cursorNumber) || providerLastSeq === null) return 'unknown';
  return providerLastSeq > cursorNumber ? 'behind' : 'current';
}
