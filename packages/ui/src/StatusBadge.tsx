import React from 'react';

export interface StatusBadgeProps {
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  label?: string;
}

const STATUS_COLORS: Record<StatusBadgeProps['status'], string> = {
  healthy: '#84cc16',
  degraded: '#eab308',
  down: '#ef4444',
  unknown: '#6b7280',
};

export function StatusBadge({ status, label }: StatusBadgeProps): React.ReactElement {
  return React.createElement('span', {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 12px',
      borderRadius: '9999px',
      fontSize: '0.875rem',
      fontWeight: 500,
      backgroundColor: `${STATUS_COLORS[status]}20`,
      color: STATUS_COLORS[status],
    },
  }, [
    React.createElement('span', {
      key: 'dot',
      style: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: STATUS_COLORS[status],
      },
    }),
    label ?? status,
  ]);
}
