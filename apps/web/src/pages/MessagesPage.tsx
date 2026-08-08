import { useState, useEffect, useCallback } from 'react';
import { Button, Badge, Alert, Table, Input, Modal } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface RedirectLink {
  id: string;
  code: string;
  campaignId: string;
  destinationUrl: string;
  utmSource: string;
  utmMedium: string;
  usedCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  campaign: { name: string; slug: string };
  [key: string]: unknown;
}

interface Campaign {
  id: string;
  name: string;
  slug: string;
  [key: string]: unknown;
}

export function MessagesPage() {
  const [links, setLinks] = useState<RedirectLink[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const [formCampaignId, setFormCampaignId] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formUtmSource, setFormUtmSource] = useState('');
  const [formUtmMedium, setFormUtmMedium] = useState('');
  const [formMaxUses, setFormMaxUses] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [linksRes, campsRes] = await Promise.all([
        fetch(`${API}/api/messaging/redirect-links`, { credentials: 'include' }),
        fetch(`${API}/api/campaigns?limit=100`, { credentials: 'include' }),
      ]);

      if (linksRes.ok) setLinks(await linksRes.json().then((d) => d.links));
      if (campsRes.ok) setCampaigns(await campsRes.json().then((d) => d.campaigns));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCreate() {
    setFormLoading(true);
    setFormError('');
    try {
      const body: Record<string, unknown> = {
        campaignId: formCampaignId,
        destinationUrl: formUrl,
      };
      if (formUtmSource) body.utmSource = formUtmSource;
      if (formUtmMedium) body.utmMedium = formUtmMedium;
      if (formMaxUses) body.maxUses = parseInt(formMaxUses, 10);

      const res = await fetch(`${API}/api/messaging/redirect-links`, {
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
      fetchData();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setFormLoading(false);
    }
  }

  function resetForm() {
    setFormCampaignId('');
    setFormUrl('');
    setFormUtmSource('');
    setFormUtmMedium('');
    setFormMaxUses('');
    setFormError('');
  }

  async function handleDeactivate(id: string) {
    try {
      await fetch(`${API}/api/messaging/redirect-links/${id}/deactivate`, {
        method: 'POST',
        credentials: 'include',
      });
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    }
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const columns = [
    {
      key: 'code',
      header: 'Link',
      render: (l: RedirectLink) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {baseUrl}/r/{l.code}
        </span>
      ),
    },
    { key: 'campaign', header: 'Campanha', render: (l: RedirectLink) => l.campaign.name },
    {
      key: 'usedCount',
      header: 'Cliques',
      render: (l: RedirectLink) => `${l.usedCount}${l.maxUses ? `/${l.maxUses}` : ''}`,
    },
    { key: 'utmSource', header: 'UTM Source', render: (l: RedirectLink) => l.utmSource || '-' },
    {
      key: 'isActive',
      header: 'Status',
      render: (l: RedirectLink) => (
        <Badge variant={l.isActive ? 'success' : 'danger'}>
          {l.isActive ? 'Ativo' : 'Inativo'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Acoes',
      render: (l: RedirectLink) => l.isActive ? (
        <Button size="sm" variant="danger" onClick={() => handleDeactivate(l.id)}>
          Desativar
        </Button>
      ) : null,
    },
  ];

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>;
  }

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Mensagens e Links</h1>
          <p className="content-subtitle">Links de redirecionamento rastreavéis para campanhas</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>Novo Link</Button>
      </div>

      {error && <Alert variant="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <div className="card">
        <Table columns={columns} data={links} emptyMessage="Nenhum link criado" />
      </div>

      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); resetForm(); }}
        title="Novo Link de Redirecionamento"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => { setShowCreate(false); resetForm(); }}>Cancelar</Button>
            <Button loading={formLoading} onClick={handleCreate} disabled={!formCampaignId || !formUrl}>Criar</Button>
          </div>
        }
      >
        {formError && <Alert variant="danger">{formError}</Alert>}
        <div className="form-group">
          <label>Campanha</label>
          <select className="input" value={formCampaignId} onChange={(e) => setFormCampaignId(e.target.value)}>
            <option value="">Selecione...</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <Input label="URL de destino" placeholder="https://wa.me/..." value={formUrl} onChange={(e) => setFormUrl(e.target.value)} />
        <Input label="UTM Source" value={formUtmSource} onChange={(e) => setFormUtmSource(e.target.value)} />
        <Input label="UTM Medium" value={formUtmMedium} onChange={(e) => setFormUtmMedium(e.target.value)} />
        <Input label="Limite de usos" type="number" value={formMaxUses} onChange={(e) => setFormMaxUses(e.target.value)} />
      </Modal>
    </div>
  );
}
