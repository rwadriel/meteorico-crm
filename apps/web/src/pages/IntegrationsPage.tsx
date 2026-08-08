import { useState, useEffect, useCallback } from 'react';
import { Button, Badge, Alert, Table } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface HealthStatus {
  integration: string;
  lastPolledAt: string | null;
  cursor: string | null;
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>Ultima consulta</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                <Badge variant={delayVariant}>{formatRelative(health.lastPolledAt)}</Badge>
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>Cursor</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{health.cursor ?? '0'}</div>
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
