import { describe, expect, it } from 'vitest';
import {
  calculateGroupManagerHealth,
  groupManagerSnapshotStaleAfterSeconds,
} from '../group-manager-health.js';

const NOW = new Date('2026-08-14T12:00:00.000Z');

function health(overrides: Partial<Parameters<typeof calculateGroupManagerHealth>[0]> = {}) {
  return calculateGroupManagerHealth({
    configured: true,
    providerConnected: true,
    lastSuccessfulPollAt: '2026-08-14T11:59:50.000Z',
    snapshotEvidenceAt: '2026-08-14T11:30:00.000Z',
    cursor: '100',
    providerLastSeq: 100,
    consecutiveFailures: 0,
    lastProviderError: null,
    snapshotStaleAfterSeconds: 7200,
    pollStaleAfterSeconds: 60,
    now: NOW,
    ...overrides,
  });
}

describe('Group Manager health model', () => {
  it('reports healthy when poll, snapshot and cursor are current', () => {
    expect(health()).toMatchObject({
      status: 'healthy',
      connected: true,
      snapshotFresh: true,
      cursorStatus: 'current',
    });
  });

  it('does not call an idle cursor stuck when the provider sequence is unchanged', () => {
    expect(health({
      snapshotEvidenceAt: '2026-08-14T10:30:00.000Z',
      cursor: '100',
      providerLastSeq: 100,
    }).cursorStatus).toBe('current');
  });

  it('reports a cursor behind only when provider sequence advanced', () => {
    expect(health({ providerLastSeq: 101 })).toMatchObject({
      status: 'degraded',
      cursorStatus: 'behind',
    });
  });

  it('reports stale when the snapshot is older than the threshold', () => {
    expect(health({
      snapshotEvidenceAt: '2026-08-14T09:59:59.000Z',
    })).toMatchObject({ status: 'stale', snapshotFresh: false });
  });

  it('reports stale when no snapshot has ever succeeded', () => {
    expect(health({ snapshotEvidenceAt: null })).toMatchObject({
      status: 'stale',
      snapshotAgeSeconds: null,
    });
  });

  it('reports disconnected only from an explicit provider signal', () => {
    expect(health({ providerConnected: false })).toMatchObject({
      status: 'disconnected',
      connected: false,
      connectionSource: 'provider',
    });
  });

  it('infers connection from fresh observations when provider omits the signal', () => {
    expect(health({ providerConnected: null })).toMatchObject({
      status: 'healthy',
      connected: true,
      connectionSource: 'inferred',
    });
  });

  it('keeps connection unknown when observations are stale', () => {
    expect(health({
      providerConnected: null,
      snapshotEvidenceAt: null,
    })).toMatchObject({
      status: 'stale',
      connected: null,
      connectionSource: 'unknown',
    });
  });

  it('escalates repeated provider failures to error', () => {
    expect(health({
      consecutiveFailures: 3,
      lastProviderError: 'HTTP 503',
    })).toMatchObject({ status: 'error' });
  });

  it('reports missing configuration without exposing configuration values', () => {
    expect(health({ configured: false })).toMatchObject({
      status: 'error',
      reasons: ['not_configured'],
    });
  });
});

describe('snapshot threshold configuration', () => {
  it('uses the documented default for missing or invalid values', () => {
    expect(groupManagerSnapshotStaleAfterSeconds(undefined)).toBe(7200);
    expect(groupManagerSnapshotStaleAfterSeconds('invalid')).toBe(7200);
    expect(groupManagerSnapshotStaleAfterSeconds('-1')).toBe(7200);
  });

  it('accepts a positive threshold', () => {
    expect(groupManagerSnapshotStaleAfterSeconds('3600')).toBe(3600);
  });
});
