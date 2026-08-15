import { useState, useEffect, useCallback } from 'react';
import { Button, Badge, Alert, Table } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface HealthStatus {
  integration: string;
  sourceIdentity: string | null;
  baselineEstablished: boolean;
  status: 'healthy' | 'degraded' | 'disconnected' | 'stale' | 'error';
  connected: boolean | null;
  connectionSource: 'provider' | 'inferred' | 'unknown';
  snapshotFresh: boolean;
  pollFresh: boolean;
  snapshotAgeSeconds: number | null;
  pollAgeSeconds: number | null;
  cursorStatus: 'current' | 'behind' | 'stale' | 'unknown';
  reasons: string[];
  lastPolledAt: string | null;
  lastSuccessfulPollAt: string | null;
  lastSuccessfulSnapshotAt: string | null;
  providerSnapshotAt: string | null;
  lastSuccessfulEventAt: string | null;
  lastCursorAdvanceAt: string | null;
  cursor: string | null;
  providerLastSeq: number | null;
  consecutiveFailures: number;
  lastProviderError: string | null;
  lastProviderErrorScope: string | null;
  lastEventProcessedAt: string | null;
  lastEventType: string | null;
  totalProcessed: number;
  totalDeadLettered: number;
  totalSkipped: number;
  recentErrors: Array<{
    eventId: string;
    eventType: string;
    result: string;
    processedAt: string;
    [key: string]: unknown;
  }>;
}

const STATUS_LABELS: Record<HealthStatus['status'], string> = {
  healthy: 'Saudavel',
  degraded: 'Degradado',
  disconnected: 'Desconectado',
  stale: 'Snapshot obsoleto',
  error: 'Erro',
};

const CURSOR_LABELS: Record<HealthStatus['cursorStatus'], string> = {
  current: 'Atual',
  behind: 'Atrasado',
  stale: 'Sem consulta recente',
  unknown: 'Indeterminado',
};

interface OrphanGroup {
  id: string;
  whatsappId: string | null;
  name: string;
  createdAt: string;
  [key: string]: unknown;
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `${minutes}min atras`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atras`;
  return `${Math.floor(hours / 24)}d atras`;
}

function formatAge(seconds: number | null): string {
  if (seconds === null) return 'Nunca';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function IntegrationsPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [orphanGroups, setOrphanGroups] = useState<OrphanGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHealth = useCallback(async () => {
    try {
      const [healthRes, orphansRes] = await Promise.all([
        fetch(`${API}/api/integration/health`, { credentials: 'include' }),
        fetch(`${API}/api/integration/orphan-groups`, { credentials: 'include' }),
      ]);

      if (healthRes.ok) {
        setHealth(await healthRes.json());
      }
      if (orphansRes.ok) {
        const data = await orphansRes.json();
        setOrphanGroups(data.groups);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const delayMs = health?.lastPolledAt
    ? Date.now() - new Date(health.lastPolledAt).getTime()
    : null;
  const delayVariant = delayMs === null ? 'neutral' as const
    : delayMs < 60000 ? 'success' as const
    : delayMs < 300000 ? 'warning' as const
    : 'danger' as const;

  const statusVariant = health?.status === 'healthy' ? 'success' as const
    : health?.status === 'degraded' ? 'warning' as const
    : 'danger' as const;
  const statusAlertVariant = health?.status === 'healthy' ? 'success' as const
    : health?.status === 'degraded' ? 'warning' as const
    : 'danger' as const;
  const connectedLabel = health?.connected === true
    ? 'Sim'
    : health?.connected === false ? 'Nao' : 'Indeterminado';

  const errorColumns = [
    { key: 'eventId', header: 'Event ID', render: (e: HealthStatus['recentErrors'][0]) => e.eventId.slice(0, 12) },
    { key: 'eventType', header: 'Tipo' },
    { key: 'result', header: 'Resultado', render: (e: HealthStatus['recentErrors'][0]) => e.result.replace('dead-letter:', '') },
    { key: 'processedAt', header: 'Quando', render: (e: HealthStatus['recentErrors'][0]) => formatRelative(e.processedAt) },
  ];

  const orphanColumns = [
    { key: 'name', header: 'Nome' },
    { key: 'whatsappId', header: 'WhatsApp ID', render: (g: OrphanGroup) => g.whatsappId?.slice(0, 16) ?? '-' },
    { key: 'createdAt', header: 'Detectado em', render: (g: OrphanGroup) => new Date(g.createdAt).toLocaleDateString('pt-BR') },
  ];

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
  }

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Integracoes</h1>
          <p className="content-subtitle">Status do consumidor de eventos WhatsApp Manager</p>
        </div>
        <Button onClick={fetchHealth}>Atualizar</Button>
      </div>

      {error && <Alert variant="danger" onDismiss={() => setError('')}>{error}</Alert>}

      {health && (
        <>
          <Alert variant={statusAlertVariant}>
            <strong>Group Manager: {STATUS_LABELS[health.status]}</strong>
            {' — '}conexao: {connectedLabel}; snapshot: {health.snapshotFresh ? 'atual' : 'obsoleto'};
            cursor: {CURSOR_LABELS[health.cursorStatus]}.
            {health.lastProviderError && (
              <div style={{ marginTop: '0.35rem' }}>
                Ultimo erro do provedor: {health.lastProviderError}
              </div>
            )}
            {!health.baselineEstablished && (
              <div style={{ marginTop: '0.35rem' }}>
                Baseline da origem atual ainda nao estabelecido; consumo incremental bloqueado.
              </div>
            )}
          </Alert>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>Saude da integracao</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                <Badge variant={statusVariant}>{STATUS_LABELS[health.status]}</Badge>
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>Ultima consulta</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                <Badge variant={delayVariant}>{formatRelative(health.lastPolledAt)}</Badge>
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>Ultimo snapshot</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                <Badge variant={health.snapshotFresh ? 'success' : 'danger'}>
                  {formatAge(health.snapshotAgeSeconds)}
                </Badge>
              </div>
              <div style={{ opacity: 0.6, fontSize: '0.8rem', marginTop: '0.3rem' }}>
                Fonte: {formatRelative(health.providerSnapshotAt)}
              </div>
              <div style={{ opacity: 0.6, fontSize: '0.8rem' }}>
                Ultima reconciliacao valida: {formatRelative(health.lastSuccessfulSnapshotAt)}
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>Cursor</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{health.cursor ?? '-'}</div>
              <div style={{ opacity: 0.6, fontSize: '0.8rem' }}>
                {CURSOR_LABELS[health.cursorStatus]}
                {health.providerLastSeq !== null ? ` / provedor ${health.providerLastSeq}` : ''}
              </div>
              <div style={{ opacity: 0.6, fontSize: '0.8rem' }}>
                Origem: {health.sourceIdentity
                  ? `...${health.sourceIdentity.slice(-8)}`
                  : 'legada/nao identificada'}; baseline: {health.baselineEstablished ? 'OK' : 'pendente'}
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>Processados</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{health.totalProcessed.toLocaleString('pt-BR')}</div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>Dead Letter</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                <Badge variant={health.totalDeadLettered > 0 ? 'danger' : 'success'}>
                  {health.totalDeadLettered}
                </Badge>
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>Ignorados</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{health.totalSkipped}</div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>Ultimo evento</div>
              <div style={{ fontSize: '1rem', fontWeight: 500 }}>
                {health.lastEventType ?? '-'}{' '}
                <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>
                  {formatRelative(health.lastEventProcessedAt)}
                </span>
              </div>
            </div>
          </div>

          {health.recentErrors.length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ padding: '1rem 1rem 0', margin: 0 }}>Erros recentes</h3>
              <Table columns={errorColumns} data={health.recentErrors} emptyMessage="Nenhum erro" />
            </div>
          )}
        </>
      )}

      {orphanGroups.length > 0 && (
        <div className="card">
          <h3 style={{ padding: '1rem 1rem 0', margin: 0 }}>
            Grupos orfaos ({orphanGroups.length})
          </h3>
          <p style={{ padding: '0 1rem', opacity: 0.7, fontSize: '0.85rem' }}>
            Grupos que receberam eventos mas nao estao associados a nenhuma campanha.
          </p>
          <Table columns={orphanColumns} data={orphanGroups} emptyMessage="Nenhum grupo orfao" />
        </div>
      )}

      {!health && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ opacity: 0.7 }}>Nenhum dado de integracao disponivel.</p>
          <p style={{ opacity: 0.5, fontSize: '0.85rem' }}>
            Configure WHATSAPP_MANAGER_URL e o token de integracao no worker para iniciar.
          </p>
        </div>
      )}
    </div>
  );
}
