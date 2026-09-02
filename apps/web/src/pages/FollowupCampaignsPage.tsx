import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
} from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface Template {
  id?: string;
  name: string;
  label: string;
  language: string;
  requiresUrl: boolean;
  preview: string;
  parameterCount: number;
  examples: string[];
  category: string;
  headerFormat: string;
  hasHeaderImage: boolean;
  urlMode: 'button' | 'body' | null;
  buttons: Array<{ type: 'URL' | 'QUICK_REPLY'; text: string; url?: string }>;
}

interface Audience {
  total: number;
  eligible: number;
  excluded: number;
  invalidPhones: number;
  buyers: number;
  optOuts: number;
}

interface AudienceList extends Audience {
  id: string;
  name: string;
  createdAt: string;
}

interface WhatsAppSender {
  id: string;
  internalName: string;
  displayPhoneNumber: string;
  verifiedName: string;
  status: string;
  qualityRating: string;
  isDefault: boolean;
  isActive: boolean;
  sendEnabled: boolean;
}

interface FollowupCampaign {
  id: string;
  name: string;
  templateName: string;
  offerUrl: string | null;
  audienceListId: string | null;
  audienceList: { id: string; name: string } | null;
  senderId: string | null;
  sender: Pick<
    WhatsAppSender,
    'id' | 'internalName' | 'displayPhoneNumber' | 'verifiedName'
  > | null;
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
  clickCount: number;
  uniqueClickCount: number;
  createdAt: string;
  scheduledAt: string | null;
  batchSize: number;
  batchIntervalSeconds: number;
  cooldownDays: number;
  [key: string]: unknown;
}

interface Preflight {
  total: number;
  eligible: number;
  excluded: number;
  exclusions: { invalidPhone: number; buyer: number; optOut: number; recentDuplicate: number };
  consentMissing: number;
  sample: Array<{ id: string; name: string; phone: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  ready: 'Pronta',
  running: 'Em execução',
  paused: 'Pausada',
  scheduled: 'Agendada',
  cancelled: 'Cancelada',
  completed: 'Concluída',
  failed: 'Falhou',
};

const STATUS_VARIANTS: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  ready: 'info',
  running: 'success',
  paused: 'warning',
  scheduled: 'warning',
  cancelled: 'neutral',
  completed: 'info',
  failed: 'danger',
};

export function FollowupCampaignsPage() {
  const [campaigns, setCampaigns] = useState<FollowupCampaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [audiences, setAudiences] = useState<AudienceList[]>([]);
  const [senders, setSenders] = useState<WhatsAppSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [templateName, setTemplateName] = useState('meteorico_acompanhamento');
  const [templateParameters, setTemplateParameters] = useState<string[]>([]);
  const [offerUrl, setOfferUrl] = useState('');
  const [audienceListId, setAudienceListId] = useState('');
  const [senderId, setSenderId] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmStart, setConfirmStart] = useState<FollowupCampaign | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<FollowupCampaign | null>(null);
  const [batchSize, setBatchSize] = useState(5);
  const [batchIntervalSeconds, setBatchIntervalSeconds] = useState(60);
  const [cooldownDays, setCooldownDays] = useState(7);
  const [scheduledAt, setScheduledAt] = useState('');
  const [preflight, setPreflight] = useState<Preflight | null>(null);

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
      const [
        campaignResponse,
        templateResponse,
        audienceResponse,
        audiencesResponse,
        sendersResponse,
      ] = await Promise.all([
        fetch(`${API}/api/followup/campaigns?limit=100`, { credentials: 'include' }),
        fetch(`${API}/api/followup/templates`, { credentials: 'include' }),
        fetch(`${API}/api/followup/audience`, { credentials: 'include' }),
        fetch(`${API}/api/followup/audiences`, { credentials: 'include' }),
        fetch(`${API}/api/whatsapp/senders`, { credentials: 'include' }),
      ]);
      if (
        !campaignResponse.ok ||
        !templateResponse.ok ||
        !audienceResponse.ok ||
        !audiencesResponse.ok ||
        !sendersResponse.ok
      ) {
        throw new Error('Não foi possível carregar o módulo de follow-up');
      }
      const [campaignData, templateData, audienceData, audiencesData, sendersData] =
        await Promise.all([
          campaignResponse.json(),
          templateResponse.json(),
          audienceResponse.json(),
          audiencesResponse.json(),
          sendersResponse.json(),
        ]);
      setCampaigns(campaignData.campaigns);
      setTemplates(templateData.templates);
      setAudience(audienceData);
      setAudiences(audiencesData.audiences);
      setSenders(sendersData.senders);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (audiences.length > 0 && !audiences.some((item) => item.id === audienceListId)) {
      setAudienceListId(audiences[0].id);
    }
  }, [audiences, audienceListId]);
  useEffect(() => {
    const available = senders.filter((sender) => sender.isActive && sender.sendEnabled);
    if (!available.some((sender) => sender.id === senderId)) {
      setSenderId(available.find((sender) => sender.isDefault)?.id ?? available[0]?.id ?? '');
    }
  }, [senders, senderId]);
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
    setOfferUrl('');
  }, [selectedTemplate?.name, selectedTemplate?.parameterCount]);
  useEffect(() => {
    if (!campaigns.some((campaign) => campaign.status === 'running')) return;
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [campaigns, load]);
  useEffect(() => {
    if (!showCreate || !audienceListId || !templateName) return;
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({
        audienceListId,
        templateName,
        cooldownDays: String(cooldownDays),
      });
      const response = await fetch(`${API}/api/followup/preflight?${params}`, {
        credentials: 'include',
      });
      if (response.ok) setPreflight((await response.json()) as Preflight);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [showCreate, audienceListId, templateName, cooldownDays]);

  async function createCampaign() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/followup/campaigns`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          templateName,
          templateParameters,
          offerUrl: selectedTemplate?.urlMode === 'button' ? offerUrl : undefined,
          audienceListId,
          senderId,
          batchSize,
          batchIntervalSeconds,
          cooldownDays,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setShowCreate(false);
      setName('');
      setTemplateParameters([]);
      setOfferUrl('');
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
    actionName: 'dry-run' | 'start' | 'pause' | 'resume' | 'cancel',
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
            ? 'Campanha iniciada ou agendada conforme a data escolhida.'
            : actionName === 'pause'
              ? 'Campanha pausada.'
              : actionName === 'resume'
                ? 'Campanha retomada.'
                : 'Campanha cancelada.',
        );
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'A ação não pôde ser concluída');
    }
  }

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
          <Metric label="Opt-outs" value={audience.optOuts} />
          <Metric label="Telefones inválidos" value={audience.invalidPhones} />
        </div>
      )}

      <section className="campaign-list-panel" aria-label="Campanhas de WhatsApp">
        {loading ? (
          <div className="campaign-list-loading">Carregando...</div>
        ) : campaigns.length === 0 ? (
          <EmptyState title="Nenhuma campanha de follow-up criada" />
        ) : (
          <div className="campaign-list">
            {campaigns.map((campaign) => (
              <article className="campaign-record" key={campaign.id}>
                <header className="campaign-record-header">
                  <div className="campaign-record-title">
                    <span className="campaign-record-kicker">Campanha</span>
                    <h2>{campaign.name}</h2>
                    <p>{campaign.templateName}</p>
                  </div>
                  <Badge variant={STATUS_VARIANTS[campaign.status] ?? 'neutral'}>
                    {STATUS_LABELS[campaign.status] ?? campaign.status}
                  </Badge>
                </header>

                <div className="campaign-record-context">
                  <div>
                    <span>Público</span>
                    <strong>{campaign.audienceList?.name ?? 'Base geral (legado)'}</strong>
                  </div>
                  <div>
                    <span>Remetente</span>
                    <strong>
                      {campaign.sender
                        ? `${campaign.sender.internalName || campaign.sender.verifiedName} · ${campaign.sender.displayPhoneNumber}`
                        : 'Número padrão (legado)'}
                    </strong>
                  </div>
                </div>

                <div className="campaign-record-metrics">
                  <CampaignMetric label="Elegíveis" value={campaign.eligibleContacts} />
                  <CampaignMetric label="Submetidas" value={campaign.submittedCount} />
                  <CampaignMetric label="Enviadas" value={campaign.sentCount} />
                  <CampaignMetric label="Entregues" value={campaign.deliveredCount} />
                  <CampaignMetric label="Lidas" value={campaign.readCount} />
                  <CampaignMetric
                    label="Cliques"
                    value={campaign.uniqueClickCount}
                    detail={`${campaign.clickCount} totais`}
                  />
                  <CampaignMetric label="CTR" value={campaignClickRate(campaign)} />
                  <CampaignMetric label="Respostas" value={campaign.repliedCount} />
                  <CampaignMetric label="Opt-outs" value={campaign.optOutCount} />
                  <CampaignMetric label="Falhas" value={campaign.failedCount} />
                </div>

                <footer className="campaign-record-actions">
                  {['draft', 'ready'].includes(campaign.status) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => action(campaign, 'dry-run')}
                    >
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
                  {['draft', 'ready', 'scheduled', 'running', 'paused'].includes(
                    campaign.status,
                  ) && (
                    <Button size="sm" variant="danger" onClick={() => setConfirmCancel(campaign)}>
                      Cancelar
                    </Button>
                  )}
                  <a
                    className="btn btn-secondary btn-sm"
                    href={`${API}/api/followup/campaigns/${campaign.id}/export.csv`}
                  >
                    Exportar relatório
                  </a>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nova campanha"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button
              loading={saving}
              onClick={createCampaign}
              disabled={
                !audienceListId ||
                !senderId ||
                !name.trim() ||
                (selectedTemplate?.urlMode === 'button' && !offerUrl.trim())
              }
            >
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
          <label>Público</label>
          <select
            className="input"
            value={audienceListId}
            onChange={(event) => setAudienceListId(event.target.value)}
          >
            {audiences.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.eligible} elegíveis de {item.total}
              </option>
            ))}
          </select>
          {audiences.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--warning)', marginTop: '0.4rem' }}>
              Importe um CSV de contatos para criar o primeiro público.
            </p>
          )}
        </div>
        <div className="form-group">
          <label>Número remetente</label>
          <select
            className="input"
            value={senderId}
            onChange={(event) => setSenderId(event.target.value)}
          >
            {senders
              .filter((sender) => sender.isActive && sender.sendEnabled)
              .map((sender) => (
                <option key={sender.id} value={sender.id}>
                  {sender.internalName || sender.verifiedName} — {sender.displayPhoneNumber}
                  {sender.isDefault ? ' (padrão)' : ''}
                </option>
              ))}
          </select>
          {!senderId && (
            <p className="text-sm" style={{ color: 'var(--warning)', marginTop: '0.4rem' }}>
              Sincronize e libere um número em Configurações antes de criar a campanha.
            </p>
          )}
          {senderId && (
            <p className="text-xs text-secondary" style={{ marginTop: '0.4rem' }}>
              Nome público na Meta:{' '}
              {senders.find((sender) => sender.id === senderId)?.verifiedName || 'não informado'}
            </p>
          )}
        </div>
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
            label={`${selectedTemplate?.urlMode === 'body' && index === 0 ? 'URL HTTPS' : 'Valor'} para {{${index + 1}}}`}
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
              (selectedTemplate?.urlMode === 'body' && index === 0
                ? 'https://...'
                : 'Valor da variável')
            }
          />
        ))}
        {selectedTemplate?.urlMode === 'button' && (
          <div>
            <Input
              label="Página final aberta pelo botão (URL HTTPS)"
              value={offerUrl}
              onChange={(event) => setOfferUrl(event.target.value)}
              placeholder="https://musicalucrativa.com.br/"
            />
            <p className="text-xs text-secondary" style={{ marginTop: '-0.5rem' }}>
              Este é o destino real desta campanha. O CRM usa um endereço rastreado do domínio
              musicalucrativa.com.br para medir os cliques antes de abrir esta página.
            </p>
          </div>
        )}
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
        >
          <Input
            label="Mensagens por lote"
            type="number"
            min={1}
            max={25}
            value={batchSize}
            onChange={(event) => setBatchSize(Number(event.target.value))}
          />
          <Input
            label="Intervalo (segundos)"
            type="number"
            min={10}
            max={300}
            value={batchIntervalSeconds}
            onChange={(event) => setBatchIntervalSeconds(Number(event.target.value))}
          />
          <Input
            label="Não repetir por (dias)"
            type="number"
            min={0}
            max={365}
            value={cooldownDays}
            onChange={(event) => setCooldownDays(Number(event.target.value))}
          />
        </div>
        <Input
          label="Agendar para (opcional)"
          type="datetime-local"
          value={scheduledAt}
          onChange={(event) => setScheduledAt(event.target.value)}
        />
        <div
          className="card"
          style={{ marginTop: '1rem', whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)' }}
        >
          <p className="text-sm text-secondary" style={{ marginBottom: '0.6rem' }}>
            PRÉVIA
          </p>
          {selectedTemplate?.hasHeaderImage && selectedTemplate.id && (
            <img
              src={`${API}/api/templates/meta/${selectedTemplate.id}/header`}
              alt="Imagem do cabeçalho do template"
              style={{
                width: '100%',
                maxHeight: '220px',
                objectFit: 'cover',
                borderRadius: '12px',
                marginBottom: '0.8rem',
              }}
            />
          )}
          {renderedPreview}
          {selectedTemplate && (selectedTemplate.buttons ?? []).length > 0 && (
            <div className="grid gap-2" style={{ marginTop: '0.9rem' }}>
              {(selectedTemplate.buttons ?? []).map((button, index) => (
                <div
                  key={`${button.type}-${button.text}-${index}`}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '0.6rem 0.8rem',
                    textAlign: 'center',
                    color: 'var(--primary)',
                    fontWeight: 600,
                  }}
                >
                  {button.type === 'URL' ? '↗ ' : '↩ '}
                  {button.text}
                </div>
              ))}
            </div>
          )}
        </div>
        {preflight && (
          <div className="card" style={{ marginTop: '1rem', background: 'var(--bg-secondary)' }}>
            <strong>
              Pré-envio: {preflight.eligible} de {preflight.total} receberão
            </strong>
            <p className="text-sm text-secondary" style={{ marginTop: '0.4rem' }}>
              Excluídos: {preflight.exclusions.invalidPhone} inválidos, {preflight.exclusions.buyer}{' '}
              compradores, {preflight.exclusions.optOut} opt-outs e{' '}
              {preflight.exclusions.recentDuplicate} enviados recentemente.
            </p>
            {preflight.consentMissing > 0 && (
              <p className="text-sm text-warning" style={{ marginTop: '0.4rem' }}>
                {preflight.consentMissing} elegíveis sem origem de consentimento registrada.
              </p>
            )}
            {preflight.sample.length > 0 && (
              <p className="text-sm text-secondary" style={{ marginTop: '0.4rem' }}>
                Amostra: {preflight.sample.map((item) => item.phone).join(', ')}
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmStart)}
        onCancel={() => setConfirmStart(null)}
        onConfirm={() => {
          if (confirmStart) action(confirmStart, 'start');
          setConfirmStart(null);
        }}
        title="Iniciar campanha real"
        message={`${confirmStart?.eligibleContacts || 0} contatos do público “${confirmStart?.audienceList?.name ?? 'selecionado'}” poderão receber este template pelo número ${confirmStart?.sender?.displayPhoneNumber ?? 'padrão'}. Confirme somente após executar o Modo Teste.`}
        confirmLabel="INICIAR CAMPANHA"
      />
      <ConfirmDialog
        open={Boolean(confirmCancel)}
        onCancel={() => setConfirmCancel(null)}
        onConfirm={() => {
          if (confirmCancel) action(confirmCancel, 'cancel');
          setConfirmCancel(null);
        }}
        title="Cancelar campanha"
        message="Os envios que ainda estiverem na fila serão cancelados. O histórico já enviado será preservado."
        confirmLabel="Cancelar campanha"
        variant="danger"
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

function CampaignMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail?: string;
}) {
  return (
    <div className="campaign-record-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function campaignClickRate(campaign: FollowupCampaign) {
  if (campaign.deliveredCount === 0) return '0%';
  return `${((campaign.uniqueClickCount / campaign.deliveredCount) * 100).toFixed(1)}%`;
}

async function responseMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: string } | null;
  return body?.message ?? 'A operação falhou';
}
