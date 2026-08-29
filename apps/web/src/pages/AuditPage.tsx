import { useState, useEffect, useCallback } from 'react';
import { Button, Table, Badge, Alert } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  ipAddress: string;
  createdAt: string;
  user: { name: string; email: string } | null;
  [key: string]: unknown;
}

export function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [resourceFilter, setResourceFilter] = useState('');
  const [resources, setResources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (resourceFilter) params.set('resource', resourceFilter);
      const res = await fetch(`${API}/api/audit-logs?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao carregar logs');
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [page, resourceFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    fetch(`${API}/api/audit-logs/resources`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : [])
      .then(setResources)
      .catch(() => {});
  }, []);

  const columns = [
    {
      key: 'createdAt',
      header: 'Data',
      render: (l: AuditLog) => new Date(l.createdAt).toLocaleString('pt-BR'),
    },
    {
      key: 'user',
      header: 'Usuario',
      render: (l: AuditLog) => l.user?.name ?? 'Sistema',
    },
    {
      key: 'action',
      header: 'Acao',
      render: (l: AuditLog) => <Badge variant="info">{l.action}</Badge>,
    },
    { key: 'resource', header: 'Recurso' },
    {
      key: 'resourceId',
      header: 'ID',
      render: (l: AuditLog) => l.resourceId ? l.resourceId.slice(0, 8) : '-',
    },
    {
      key: 'ipAddress',
      header: 'IP',
      render: (l: AuditLog) => l.ipAddress || '-',
    },
  ];

  const totalPages = Math.ceil(total / 50);

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Auditoria</h1>
          <p className="content-subtitle">Logs de atividade do sistema</p>
        </div>
      </div>

      {error && <Alert variant="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Recurso</label>
            <select
              className="input"
              value={resourceFilter}
              onChange={(e) => { setResourceFilter(e.target.value); setPage(1); }}
            >
              <option value="">Todos</option>
              {resources.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
        ) : (
          <>
            <Table columns={columns} data={logs} emptyMessage="Nenhum log encontrado" />
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', padding: '1rem 0' }}>
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
                <span style={{ alignSelf: 'center' }}>{page} / {totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Proximo</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
