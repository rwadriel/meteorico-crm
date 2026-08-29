import { useState, useEffect, useCallback } from 'react';
import { Button, Input, Modal, Table, Badge, Alert, ConfirmDialog } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

const CATEGORIES = ['novo', 'reparticipante', 'veterano', 'aluno', 'geral'] as const;
const CATEGORY_LABELS: Record<string, string> = {
  novo: 'Novo',
  reparticipante: 'Reparticipante',
  veterano: 'Veterano',
  aluno: 'Aluno',
  geral: 'Geral',
};
const CATEGORY_VARIANTS: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  novo: 'info',
  reparticipante: 'warning',
  veterano: 'success',
  aluno: 'danger',
  geral: 'neutral',
};

interface Group {
  id: string;
  name: string;
  category: string;
  capacity: number | null;
  priority: number;
  isActive: boolean;
  inviteLink: string | null;
  campaignId: string;
  [key: string]: unknown;
}

interface CampaignOption {
  id: string;
  name: string;
  editionNumber: number | null;
}

export function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<string>('novo');
  const [formCapacity, setFormCapacity] = useState('');
  const [formPriority, setFormPriority] = useState('0');
  const [formInviteLink, setFormInviteLink] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/campaigns?limit=100`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setCampaigns(data.campaigns);
          if (data.campaigns.length > 0) {
            setSelectedCampaign(data.campaigns[0].id);
          }
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const fetchGroups = useCallback(async () => {
    if (!selectedCampaign) { setGroups([]); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/groups?campaignId=${selectedCampaign}&limit=100`, { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao carregar grupos');
      const data = await res.json();
      setGroups(data.groups);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [selectedCampaign]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  function openCreate() {
    setEditingGroup(null);
    setFormName('');
    setFormCategory('novo');
    setFormCapacity('');
    setFormPriority('0');
    setFormInviteLink('');
    setFormError('');
    setShowModal(true);
  }

  function openEdit(g: Group) {
    setEditingGroup(g);
    setFormName(g.name);
    setFormCategory(g.category);
    setFormCapacity(g.capacity != null ? String(g.capacity) : '');
    setFormPriority(String(g.priority));
    setFormInviteLink(g.inviteLink ?? '');
    setFormError('');
    setShowModal(true);
  }

  async function handleSave() {
    setFormLoading(true);
    setFormError('');
    try {
      const body: Record<string, unknown> = {
        name: formName,
        category: formCategory,
        priority: parseInt(formPriority, 10) || 0,
      };
      if (formCapacity) body.capacity = parseInt(formCapacity, 10);
      if (formInviteLink) body.inviteLink = formInviteLink;

      if (editingGroup) {
        const res = await fetch(`${API}/api/groups/${editingGroup.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Falha ao atualizar' }));
          throw new Error(err.message);
        }
      } else {
        body.campaignId = selectedCampaign;
        const res = await fetch(`${API}/api/groups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Falha ao criar' }));
          throw new Error(err.message);
        }
      }
      setShowModal(false);
      fetchGroups();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao salvar grupo');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`${API}/api/groups/${deleteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Falha ao excluir' }));
        throw new Error(err.message);
      }
      fetchGroups();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir');
    } finally {
      setDeleteId(null);
    }
  }

  const columns = [
    { key: 'name', header: 'Nome' },
    {
      key: 'category',
      header: 'Categoria',
      render: (g: Group) => (
        <Badge variant={CATEGORY_VARIANTS[g.category] ?? 'neutral'}>
          {CATEGORY_LABELS[g.category] ?? g.category}
        </Badge>
      ),
    },
    { key: 'capacity', header: 'Capacidade', render: (g: Group) => g.capacity ?? '-' },
    { key: 'priority', header: 'Prioridade' },
    {
      key: 'isActive',
      header: 'Ativo',
      render: (g: Group) => <Badge variant={g.isActive ? 'success' : 'neutral'}>{g.isActive ? 'Sim' : 'Nao'}</Badge>,
    },
    {
      key: 'actions',
      header: 'Acoes',
      render: (g: Group) => (
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <Button size="sm" variant="secondary" onClick={() => openEdit(g)}>Editar</Button>
          <Button size="sm" variant="danger" onClick={() => setDeleteId(g.id)}>Excluir</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Grupos</h1>
          <p className="content-subtitle">Gerencie os grupos de WhatsApp por campanha</p>
        </div>
        <Button onClick={openCreate} disabled={!selectedCampaign}>Novo Grupo</Button>
      </div>

      {error && <Alert variant="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Campanha</label>
          <select
            className="input"
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
          >
            {campaigns.length === 0 && <option value="">Nenhuma campanha</option>}
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.editionNumber ? ` (Ed. ${c.editionNumber})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
        ) : (
          <Table columns={columns} data={groups} emptyMessage="Nenhum grupo nesta campanha" />
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingGroup ? 'Editar Grupo' : 'Novo Grupo'}
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button loading={formLoading} onClick={handleSave} disabled={!formName}>
              {editingGroup ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        }
      >
        {formError && <Alert variant="danger">{formError}</Alert>}
        <Input label="Nome" value={formName} onChange={(e) => setFormName(e.target.value)} />
        <div className="form-group">
          <label>Categoria</label>
          <select className="input" value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <Input label="Capacidade" type="number" value={formCapacity} onChange={(e) => setFormCapacity(e.target.value)} />
        <Input label="Prioridade" type="number" value={formPriority} onChange={(e) => setFormPriority(e.target.value)} />
        <Input label="Link de convite" value={formInviteLink} onChange={(e) => setFormInviteLink(e.target.value)} />
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir grupo"
        message="Tem certeza que deseja excluir este grupo?"
        confirmLabel="Excluir"
        variant="danger"
      />
    </div>
  );
}
