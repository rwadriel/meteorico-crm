import { useState, useEffect, useCallback } from 'react';
import { Button, Input, Modal, Table, Badge, Alert, ConfirmDialog } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';
const STATUSES = ['draft', 'active', 'completed', 'historical', 'archived'] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  active: 'Ativa',
  completed: 'Concluida',
  historical: 'Historica',
  archived: 'Arquivada',
};

const STATUS_VARIANTS: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  active: 'success',
  completed: 'info',
  historical: 'warning',
  archived: 'danger',
};

interface Campaign {
  id: string;
  name: string;
  slug: string;
  editionNumber: number | null;
  status: string;
  timezone: string;
  cartOpenDay: string;
  captationStartsAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  _count?: { groups: number; participations: number };
  [key: string]: unknown;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formEdition, setFormEdition] = useState('');
  const [formCartDay, setFormCartDay] = useState('wednesday');
  const [formTimezone, setFormTimezone] = useState('America/Sao_Paulo');
  const [formCaptationStartsAt, setFormCaptationStartsAt] = useState('');
  const [formStartsAt, setFormStartsAt] = useState('');
  const [formEndsAt, setFormEndsAt] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string; label: string } | null>(null);
  const [_actionLoading, setActionLoading] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const res = await fetch(`${API}/api/campaigns?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao carregar campanhas');
      const data = await res.json();
      setCampaigns(data.campaigns);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  async function handleCreate() {
    setFormLoading(true);
    setFormError('');
    try {
      const body: Record<string, unknown> = {
        name: formName,
        slug: formSlug || toSlug(formName),
        timezone: formTimezone,
        cartOpenDay: formCartDay,
      };
      if (formEdition) body.editionNumber = parseInt(formEdition, 10);
      if (formCaptationStartsAt) body.captationStartsAt = new Date(formCaptationStartsAt).toISOString();
      if (formStartsAt) body.startsAt = new Date(formStartsAt).toISOString();
      if (formEndsAt) body.endsAt = new Date(formEndsAt).toISOString();

      const res = await fetch(`${API}/api/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Falha ao criar' }));
        throw new Error(err.message);
      }
      setShowCreate(false);
      resetForm();
      fetchCampaigns();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao criar campanha');
    } finally {
      setFormLoading(false);
    }
  }

  function resetForm() {
    setFormName('');
    setFormSlug('');
    setFormEdition('');
    setFormCartDay('wednesday');
    setFormTimezone('America/Sao_Paulo');
    setFormCaptationStartsAt('');
    setFormStartsAt('');
    setFormEndsAt('');
    setFormError('');
  }

  async function handleAction(id: string, action: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`${API}/api/campaigns/${id}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Acao falhou' }));
        throw new Error(err.message);
      }
      fetchCampaigns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na acao');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const res = await fetch(`${API}/api/campaigns/${id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Falha ao duplicar' }));
        throw new Error(err.message);
      }
      fetchCampaigns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao duplicar');
    }
  }

  async function handleDelete(id: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`${API}/api/campaigns/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Falha ao excluir' }));
        throw new Error(err.message);
      }
      fetchCampaigns();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir');
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  }

  const columns = [
    { key: 'editionNumber', header: 'Ed.', render: (c: Campaign) => c.editionNumber ?? '-' },
    { key: 'name', header: 'Nome' },
    {
      key: 'status',
      header: 'Status',
      render: (c: Campaign) => (
        <Badge variant={STATUS_VARIANTS[c.status] ?? 'neutral'}>
          {STATUS_LABELS[c.status] ?? c.status}
        </Badge>
      ),
    },
    {
      key: 'captationStartsAt',
      header: 'Captacao',
      render: (c: Campaign) => c.captationStartsAt ? new Date(c.captationStartsAt).toLocaleDateString('pt-BR') : '-',
    },
    {
      key: 'startsAt',
      header: 'Abertura',
      render: (c: Campaign) => c.startsAt ? new Date(c.startsAt).toLocaleDateString('pt-BR') : '-',
    },
    {
      key: 'endsAt',
      header: 'Fim',
      render: (c: Campaign) => c.endsAt ? new Date(c.endsAt).toLocaleDateString('pt-BR') : '-',
    },
    {
      key: 'actions',
      header: 'Acoes',
      render: (c: Campaign) => (
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {c.status === 'draft' && (
            <Button size="sm" onClick={() => setConfirmAction({ id: c.id, action: 'activate', label: 'Ativar' })}>
              Ativar
            </Button>
          )}
          {c.status === 'active' && (
            <Button size="sm" variant="secondary" onClick={() => setConfirmAction({ id: c.id, action: 'complete', label: 'Concluir' })}>
              Concluir
            </Button>
          )}
          {(c.status === 'completed' || c.status === 'historical') && (
            <Button size="sm" variant="secondary" onClick={() => setConfirmAction({ id: c.id, action: 'archive', label: 'Arquivar' })}>
              Arquivar
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => handleDuplicate(c.id)}>
            Duplicar
          </Button>
          {c.status === 'draft' && (
            <Button size="sm" variant="danger" onClick={() => setConfirmAction({ id: c.id, action: 'delete', label: 'Excluir' })}>
              Excluir
            </Button>
          )}
        </div>
      ),
    },
  ];

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Campanhas</h1>
          <p className="content-subtitle">Gerencie seus lancamentos semanais</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>Nova Campanha</Button>
      </div>

      {error && <Alert variant="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Status</label>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">Todos</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <Input
            label="Buscar"
            placeholder="Nome ou slug..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
        ) : (
          <>
            <Table columns={columns} data={campaigns} emptyMessage="Nenhuma campanha encontrada" />
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', padding: '1rem 0' }}>
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <span style={{ alignSelf: 'center' }}>{page} / {totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Proximo
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); resetForm(); }}
        title="Nova Campanha"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => { setShowCreate(false); resetForm(); }}>Cancelar</Button>
            <Button loading={formLoading} onClick={handleCreate} disabled={!formName}>Criar</Button>
          </div>
        }
      >
        {formError && <Alert variant="danger">{formError}</Alert>}
        <Input label="Nome" value={formName} onChange={(e) => { setFormName(e.target.value); if (!formSlug) setFormSlug(toSlug(e.target.value)); }} />
        <Input label="Slug" value={formSlug} onChange={(e) => setFormSlug(e.target.value)} />
        <Input label="Numero da edicao" type="number" value={formEdition} onChange={(e) => setFormEdition(e.target.value)} />
        <div className="form-group">
          <label>Dia de abertura do carrinho</label>
          <select className="input" value={formCartDay} onChange={(e) => setFormCartDay(e.target.value)}>
            <option value="monday">Segunda</option>
            <option value="tuesday">Terca</option>
            <option value="wednesday">Quarta</option>
            <option value="thursday">Quinta</option>
            <option value="friday">Sexta</option>
            <option value="saturday">Sabado</option>
            <option value="sunday">Domingo</option>
          </select>
        </div>
        <Input label="Timezone" value={formTimezone} onChange={(e) => setFormTimezone(e.target.value)} />
        <Input label="Inicio da captacao" type="datetime-local" value={formCaptationStartsAt} onChange={(e) => setFormCaptationStartsAt(e.target.value)} />
        <Input label="Abertura do carrinho" type="datetime-local" value={formStartsAt} onChange={(e) => setFormStartsAt(e.target.value)} />
        <Input label="Encerramento" type="datetime-local" value={formEndsAt} onChange={(e) => setFormEndsAt(e.target.value)} />
      </Modal>

      <ConfirmDialog
        open={confirmAction !== null}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          if (confirmAction.action === 'delete') {
            handleDelete(confirmAction.id);
          } else {
            handleAction(confirmAction.id, confirmAction.action);
          }
        }}
        title={`${confirmAction?.label ?? 'Confirmar'} campanha`}
        message={`Tem certeza que deseja ${(confirmAction?.label ?? '').toLowerCase()} esta campanha?`}
        confirmLabel={confirmAction?.label ?? 'Confirmar'}
        variant={confirmAction?.action === 'delete' ? 'danger' : 'primary'}
      />
    </div>
  );
}
