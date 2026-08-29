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
  utmCampaign: string;
  utmContent: string;
  fbclid: string;
  metaCampaignId: string | null;
  metaAdsetId: string | null;
  metaAdId: string | null;
  creativeId: string | null;
  placement: string | null;
  usedCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  campaign: { name: string; slug: string };
  _count?: { clicks: number };
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
  const [copied, setCopied] = useState('');

  const [formCampaignId, setFormCampaignId] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formUtmSource, setFormUtmSource] = useState('');
  const [formUtmMedium, setFormUtmMedium] = useState('');
  const [formUtmCampaign, setFormUtmCampaign] = useState('');
  const [formUtmContent, setFormUtmContent] = useState('');
  const [formFbclid, setFormFbclid] = useState('');
  const [formMetaCampaignId, setFormMetaCampaignId] = useState('');
  const [formMetaAdsetId, setFormMetaAdsetId] = useState('');
  const [formMetaAdId, setFormMetaAdId] = useState('');
  const [formCreativeId, setFormCreativeId] = useState('');
  const [formPlacement, setFormPlacement] = useState('');
  const [formMaxUses, setFormMaxUses] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [showMeta, setShowMeta] = useState(false);

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
      if (formUtmCampaign) body.utmCampaign = formUtmCampaign;
      if (formUtmContent) body.utmContent = formUtmContent;
      if (formFbclid) body.fbclid = formFbclid;
      if (formMetaCampaignId) body.metaCampaignId = formMetaCampaignId;
      if (formMetaAdsetId) body.metaAdsetId = formMetaAdsetId;
      if (formMetaAdId) body.metaAdId = formMetaAdId;
      if (formCreativeId) body.creativeId = formCreativeId;
      if (formPlacement) body.placement = formPlacement;
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
    setFormUtmCampaign('');
    setFormUtmContent('');
    setFormFbclid('');
    setFormMetaCampaignId('');
    setFormMetaAdsetId('');
    setFormMetaAdId('');
    setFormCreativeId('');
    setFormPlacement('');
    setFormMaxUses('');
    setFormError('');
    setShowMeta(false);
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

  async function handleActivate(id: string) {
    try {
      await fetch(`${API}/api/messaging/redirect-links/${id}/activate`, {
        method: 'POST',
        credentials: 'include',
      });
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    }
  }

  function copyUrl(code: string) {
    const url = `${baseUrl}/api/r/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(''), 2000);
    });
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const columns = [
    {
      key: 'code',
      header: 'Link',
      render: (l: RedirectLink) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
            /r/{l.code}
          </span>
          <button
            onClick={() => copyUrl(l.code)}
            style={{
              background: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              padding: '2px 6px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              color: copied === l.code ? 'var(--color-success)' : 'var(--color-text-secondary)',
            }}
          >
            {copied === l.code ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      ),
    },
    { key: 'campaign', header: 'Campanha', render: (l: RedirectLink) => l.campaign.name },
    {
      key: 'clicks',
      header: 'Cliques',
      render: (l: RedirectLink) => {
        const count = l._count?.clicks ?? l.usedCount;
        return `${count}${l.maxUses ? `/${l.maxUses}` : ''}`;
      },
    },
    { key: 'utmSource', header: 'Source', render: (l: RedirectLink) => l.utmSource || '-' },
    { key: 'utmMedium', header: 'Medium', render: (l: RedirectLink) => l.utmMedium || '-' },
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
      ) : (
        <Button size="sm" variant="secondary" onClick={() => handleActivate(l.id)}>
          Ativar
        </Button>
      ),
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
          <p className="content-subtitle">Links de redirecionamento rastreaveis para campanhas</p>
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
        <Input label="URL de destino (WhatsApp)" placeholder="https://chat.whatsapp.com/..." value={formUrl} onChange={(e) => setFormUrl(e.target.value)} />
        <Input label="UTM Source" placeholder="facebook, instagram, google..." value={formUtmSource} onChange={(e) => setFormUtmSource(e.target.value)} />
        <Input label="UTM Medium" placeholder="cpc, social, email..." value={formUtmMedium} onChange={(e) => setFormUtmMedium(e.target.value)} />
        <Input label="UTM Campaign" placeholder="lancamento-s33..." value={formUtmCampaign} onChange={(e) => setFormUtmCampaign(e.target.value)} />
        <Input label="UTM Content" placeholder="banner-topo, cta-rodape..." value={formUtmContent} onChange={(e) => setFormUtmContent(e.target.value)} />
        <Input label="Limite de usos" type="number" value={formMaxUses} onChange={(e) => setFormMaxUses(e.target.value)} />

        <div style={{ marginTop: '1rem' }}>
          <button
            onClick={() => setShowMeta(!showMeta)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-primary)',
              cursor: 'pointer',
              fontSize: '0.875rem',
              padding: 0,
            }}
          >
            {showMeta ? '- Ocultar campos Meta Ads' : '+ Campos Meta Ads (opcional)'}
          </button>
        </div>

        {showMeta && (
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
            <Input label="fbclid" value={formFbclid} onChange={(e) => setFormFbclid(e.target.value)} />
            <Input label="Meta Campaign ID" value={formMetaCampaignId} onChange={(e) => setFormMetaCampaignId(e.target.value)} />
            <Input label="Meta Adset ID" value={formMetaAdsetId} onChange={(e) => setFormMetaAdsetId(e.target.value)} />
            <Input label="Meta Ad ID" value={formMetaAdId} onChange={(e) => setFormMetaAdId(e.target.value)} />
            <Input label="Creative ID" value={formCreativeId} onChange={(e) => setFormCreativeId(e.target.value)} />
            <Input label="Placement" placeholder="feed, stories, reels..." value={formPlacement} onChange={(e) => setFormPlacement(e.target.value)} />
          </div>
        )}
      </Modal>
    </div>
  );
}
