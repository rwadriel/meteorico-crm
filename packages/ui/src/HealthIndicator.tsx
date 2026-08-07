import React from 'react';
import { StatusBadge } from './StatusBadge.js';

export interface HealthIndicatorProps {
  service: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  details?: string;
}

export function HealthIndicator({ service, status, details }: HealthIndicatorProps): React.ReactElement {
  return React.createElement('div', {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 16px',
      backgroundColor: '#1a1a2e',
      borderRadius: '8px',
      border: '1px solid #2a2a3e',
    },
  }, [
    React.createElement('div', { key: 'info' }, [
      React.createElement('span', {
        key: 'name',
        style: { color: '#e2e8f0', fontWeight: 600 },
      }, service),
      details ? React.createElement('span', {
        key: 'details',
        style: { color: '#94a3b8', fontSize: '0.75rem', marginLeft: '8px' },
      }, details) : null,
    ]),
    React.createElement(StatusBadge, { key: 'badge', status }),
  ]);
}
