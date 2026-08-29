import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, ConfirmDialog, Input, Modal, Table } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface Template {
  name: string;
  label: string;
  language: string;
  requiresUrl: boolean;
  preview: string;
  parameterCount: number;
  examples: string[];
  category: string;
}

interface Audience {
  total: number;
  eligible: number;
  excluded: number;
  invalidPhones: number;
  buyers: number;
  optOuts: number;
}

interface FollowupCampaign {
  id: string;
  name: string;
  templateName: string;
  offerUrl: string | null;
  status: string;
  eligibleContacts: number;
  queuedCount: number;
  submittedCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  repliedCount: number;
  optOutCount: number;
  createdAt: string;
  [key: string]: unknown;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  ready: 'Pronta',
  running: 'Em execução',
  paused: 'Pausada',
  completed: 'Concluída',
  failed: 'Falhou',
};

const STATUS_VARIANTS: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  ready: 'info',
  running: 'success',
  paused: 'warning',
  completed: 'info',
  failed: 'danger',
};

export function FollowupCampaignsPage() {
  const [campaigns, setCampaigns] = useState<FollowupCampaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [templateName, setTemplateName] = useState('meteorico_acompanhamento');
  const [templateParameters, setTemplateParameters] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmStart, setConfirmStart] = useState<FollowupCampaign | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.name === templateName),
    [templates, templateName],
  );
  const renderedPreview = selectedTemplate
    ? selectedTemplate.preview.replace(
        /\{\{(\d+)\}\}/g,
        (token, rawIndex: string) =>
          templateParameters[Number(rawIndex) - 1] ||
          selectedTemplate.examples[Number(rawIndex) - 1] ||
          token,
      )
    : '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignResponse, templateResponse, audienceResponse] = await Promise.all([
        fetch(`${API}/api/followup/campaigns?limit=100`, { credentials: 'include' }),
        fetch(`${API}/api/followup/templates`, { credentials: 'include' }),
        fetch(`${API}/api/followup/audience`, { credentials: 'include' }),
      ]);
      if (!campaignResponse.ok || !templateResponse.ok || !audienceResponse.ok) {
        throw new Error('Não foi possível carregar o módulo de follow-up');
      }
      const [campaignData, templateData, audienceData] = await Promise.all([
        campaignResponse.json(),
        templateResponse.json(),
        audienceResponse.json(),
      ]);
      setCampaigns(campaignData.campaigns);
      setTemplates(templateData.templates);
      setAudience(audienceData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (templates.length === 0) return;
    if (!templates.some((template) => template.name === templateName))
      setTemplateName(templates[0].name);
  }, [templates, templateName]);
  useEffect(() => {
    setTemplateParameters(
      Array.from(
        { length: selectedTemplate?.parameterCount ?? 0 },
        (_, index) => selectedTemplate?.examples[index] ?? '',
      ),
    );
  }, [selectedTemplate?.name, selectedTemplate?.parameterCount]);
  useEffect(() => {
    if (!campaigns.some((campaign) => campaign.status === 'running')) return;
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [campaigns, load]);

  async function createCampaign() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/followup/campaigns`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, templateName, templateParameters }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setShowCreate(false);
      setName('');
      setTemplateParameters([]);
      setSuccess('Campanha criada. Execute o Modo Teste antes do envio real.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao criar campanha');
    } finally {
      setSaving(false);
    }
  }

  async function action(
    campaign: FollowupCampaign,
    actionName: 'dry-run' | 'start' | 'pause' | 'resume',
  ) {
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API}/api/followup/campaigns/${campaign.id}/${actionName}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      if (actionName === 'dry-run') {
        const result = await response.json();
        setSuccess(
          `Modo Teste concluído: ${result.audience.eligible} elegíveis, ${result.audience.excluded} excluídos e nenhuma mensagem enviada.`,
        );
      } else {
        setSuccess(
          actionName === 'start'
            ? 'Campanha iniciada.'
            : actionName === 'pause'
              ? 'Campanha pausada.'
              : 'Campanha retomada.',
        );
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'A ação não pôde ser concluída');
    }
  }

  const columns = [
    { key: 'name', header: 'Nome' },
    { key: 'templateName', header: 'Template' },
    {
      key: 'status',
      header: 'Status',
      render: (campaign: FollowupCampaign) => (
        <Badge variant={STATUS_VARIANTS[campaign.status] ?? 'neutral'}>
          {STATUS_LABELS[campaign.status] ?? campaign.status}
        </Badge>
      ),
    },
    { key: 'eligibleContacts', header: 'Elegíveis' },
    { key: 'submittedCount', header: 'Submetidas' },
    { key: 'deliveredCount', header: 'Entregues' },
    { key: 'readCount', header: 'Lidas' },
    { key: 'repliedCount', header: 'Respostas' },
    {
      key: 'actions',
      header: 'Ações',
      render: (campaign: FollowupCampaign) => (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {['draft', 'ready'].includes(campaign.status) && (
            <Button size="sm" variant="secondary" onClick={() => action(campaign, 'dry-run')}>
              Modo Teste
            </Button>
          )}
          {['draft', 'ready'].includes(campaign.status) && (
            <Button size="sm" onClick={() => setConfirmStart(campaign)}>
              Iniciar
            </Button>
          )}
          {campaign.status === 'running' && (
            <Button size="sm" variant="secondary" onClick={() => action(campaign, 'pause')}>
              Pausar
            </Button>
          )}
          {campaign.status === 'paused' && (
            <Button size="sm" onClick={() => action(campaign, 'resume')}>
              Continuar
            </Button>
          )}
          <a
            className="btn btn-secondary btn-sm"
            href={`${API}/api/followup/campaigns/${campaign.id}/export.csv`}
          >
            Exportar CSV
          </a>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Follow-up via WhatsApp</h1>
          <p className="content-subtitle">
            Campanhas oficiais por template, com opt-out e proteção contra duplicidade
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Nova campanha</Button>
      </div>

      {error && (
        <Alert variant="danger" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" onDismiss={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {audience && (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            marginBottom: '1rem',
          }}
        >
          <Metric label="Total de contatos" value={audience.total} />
          <Metric label="Elegíveis" value={audience.eligible} />
          <Metric label="Compradores" value={audience.buyers} />
          <Metric label="Opt-outs" value={audience.optOuts} />
          <Metric label="Telefones inválidos" value={audience.invalidPhones} />
        </div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
        ) : (
          <Table
            columns={columns}
            data={campaigns}
            emptyMessage="Nenhuma campanha de follow-up criada"
          />
        )}
      </div>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nova campanha"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={createCampaign}>
              Criar campanha
            </Button>
          </>
        }
      >
        <Input
          label="Nome da campanha"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Oferta Meteórico — agosto"
        />
        <div className="form-group">
          <label>Template aprovado</label>
          <select
            className="input"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
          >
            {templates.map((template) => (
              <option key={template.name} value={template.name}>
                {template.label}
              </option>
            ))}
          </select>
        </div>
        {Array.from({ length: selectedTemplate?.parameterCount ?? 0 }, (_, index) => (
          <Input
            key={index}
            label={`${selectedTemplate?.requiresUrl && index === 0 ? 'URL HTTPS' : 'Valor'} para {{${index + 1}}}`}
            value={templateParameters[index] ?? ''}
            onChange={(event) =>
              setTemplateParameters((current) =>
                current.map((value, itemIndex) =>
                  itemIndex === index ? event.target.value : value,
                ),
              )
            }
            placeholder={
              selectedTemplate?.examples[index] ||
              (selectedTemplate?.requiresUrl && index === 0 ? 'https://...' : 'Valor da variável')
            }
          />
        ))}
        <div
          className="card"
          style={{ marginTop: '1rem', whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)' }}
        >
          <p className="text-sm text-secondary" style={{ marginBottom: '0.6rem' }}>
            PRÉVIA
          </p>
          {renderedPreview}
        </div>
        <p className="text-sm text-secondary" style={{ marginTop: '1rem' }}>
          {audience?.eligible ?? 0} contatos elegíveis neste momento. O nome importado não será
          usado na mensagem.
        </p>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmStart)}
        onCancel={() => setConfirmStart(null)}
        onConfirm={() => {
          if (confirmStart) action(confirmStart, 'start');
          setConfirmStart(null);
        }}
        title="Iniciar campanha real"
        message={`${confirmStart?.eligibleContacts || audience?.eligible || 0} contatos poderão receber este template. Confirme somente após executar o Modo Teste.`}
        confirmLabel="INICIAR CAMPANHA"
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="text-sm text-secondary">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

async function responseMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return body?.message ?? 'A operação falhou';
}
