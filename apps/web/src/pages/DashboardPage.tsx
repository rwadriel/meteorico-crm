import { useEffect, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCheck,
  CircleSlash,
  Eye,
  Megaphone,
  MessageSquare,
  Send,
  Users,
} from 'lucide-react';
import { Alert } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface DashboardMetrics {
  total_contacts: number;
  total_campaigns: number;
}

interface AudienceSummary {
  total: number;
  eligible: number;
  excluded: number;
  invalidPhones: number;
  optOuts: number;
}

interface FollowupCampaign {
  id?: string;
  name: string;
  status: string;
  submittedCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  createdAt?: string;
  audienceList?: { id: string; name: string } | null;
}

export function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [audience, setAudience] = useState<AudienceSummary | null>(null);
  const [campaigns, setCampaigns] = useState<FollowupCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch(`${API}/api/analytics/dashboard`, { credentials: 'include' }),
      fetch(`${API}/api/followup/audience`, { credentials: 'include' }),
      fetch(`${API}/api/followup/campaigns?limit=5`, { credentials: 'include' }),
    ])
      .then(async ([dashboardResponse, audienceResponse, campaignsResponse]) => {
        if (!dashboardResponse.ok || !audienceResponse.ok || !campaignsResponse.ok) {
          throw new Error('Falha ao carregar o Dashboard');
        }
        const [dashboardData, audienceData, campaignsData] = await Promise.all([
          dashboardResponse.json() as Promise<{ metrics: DashboardMetrics }>,
          audienceResponse.json() as Promise<Partial<AudienceSummary>>,
          campaignsResponse.json() as Promise<{ campaigns?: FollowupCampaign[] }>,
        ]);
        return {
          metrics: dashboardData.metrics,
          audience: normalizeAudience(audienceData),
          campaigns: Array.isArray(campaignsData.campaigns) ? campaignsData.campaigns : [],
        };
      })
      .then((data) => {
        if (!active) return;
        setMetrics(data.metrics);
        setAudience(data.audience);
        setCampaigns(data.campaigns);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Erro desconhecido');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const latest = campaigns[0] ?? null;
  const totalContacts = metrics?.total_contacts ?? audience?.total ?? 0;
  const eligible = audience?.eligible ?? 0;
  const eligibleRate = totalContacts > 0 ? Math.round((eligible / totalContacts) * 100) : 0;

  return (
    <div className="dashboard-shell">
      <div className="dashboard-heading">
        <div>
          <span className="dashboard-eyebrow">Central de desempenho</span>
          <h1 className="content-title">Visão geral</h1>
          <p className="content-subtitle">Acompanhe seus públicos e resultados de WhatsApp.</p>
        </div>
        <a className="dashboard-action" href="/followup">
          Ver campanhas <ArrowUpRight size={16} />
        </a>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <section className="dashboard-stats" aria-label="Indicadores principais">
        <StatCard icon={Users} label="Contatos" value={loading ? '—' : formatNumber(totalContacts)} detail="na base atual" />
        <StatCard icon={CheckCheck} label="Elegíveis" value={loading ? '—' : formatNumber(eligible)} detail={`${eligibleRate}% dos contatos`} accent />
        <StatCard icon={Megaphone} label="Campanhas" value={loading ? '—' : formatNumber(metrics?.total_campaigns ?? 0)} detail="criadas no CRM" />
        <StatCard icon={CircleSlash} label="Opt-outs" value={loading ? '—' : formatNumber(audience?.optOuts ?? 0)} detail="bloqueados globalmente" />
      </section>

      <section className="dashboard-main-grid">
        <div className="dashboard-panel dashboard-performance">
          <div className="dashboard-panel-header">
            <div>
              <span className="dashboard-panel-kicker">Última campanha</span>
              <h2>{latest?.name ?? 'Nenhuma campanha enviada'}</h2>
            </div>
            {latest && <StatusBadge status={latest.status} />}
          </div>

          {latest ? (
            <>
              <div className="dashboard-metric-row">
                <PerformanceMetric icon={Send} label="Submetidas" value={latest.submittedCount} />
                <PerformanceMetric icon={CheckCheck} label="Entregues" value={latest.deliveredCount} />
                <PerformanceMetric icon={Eye} label="Lidas" value={latest.readCount} />
                <PerformanceMetric icon={MessageSquare} label="Respostas" value={latest.repliedCount} />
              </div>
              <div className="delivery-funnel" aria-label="Funil da última campanha">
                <FunnelBar label="Submetidas" value={latest.submittedCount} total={latest.submittedCount} />
                <FunnelBar label="Entregues" value={latest.deliveredCount} total={latest.submittedCount} />
                <FunnelBar label="Lidas" value={latest.readCount} total={latest.submittedCount} />
                <FunnelBar label="Respostas" value={latest.repliedCount} total={latest.submittedCount} />
              </div>
              {latest.failedCount > 0 && (
                <div className="dashboard-warning">
                  <AlertTriangle size={16} /> {formatNumber(latest.failedCount)} mensagem(ns) com falha
                </div>
              )}
            </>
          ) : (
            <div className="dashboard-empty">
              <Send size={28} />
              <p>Os indicadores de entrega e leitura aparecerão após o primeiro disparo.</p>
            </div>
          )}
        </div>

        <div className="dashboard-panel dashboard-audience">
          <div className="dashboard-panel-header">
            <div>
              <span className="dashboard-panel-kicker">Qualidade da base</span>
              <h2>Público disponível</h2>
            </div>
          </div>
          <div
            className="audience-ring"
            style={{ '--audience-rate': `${Math.min(100, eligibleRate) * 3.6}deg` } as CSSProperties}
            aria-label={`${eligibleRate}% dos contatos estão elegíveis`}
          >
            <div>
              <strong>{loading ? '—' : `${eligibleRate}%`}</strong>
              <span>elegíveis</span>
            </div>
          </div>
          <div className="audience-breakdown">
            <AudienceLine label="Disponíveis" value={eligible} color="var(--accent)" />
            <AudienceLine label="Opt-outs" value={audience?.optOuts ?? 0} color="var(--warning)" />
            <AudienceLine label="Telefones inválidos" value={audience?.invalidPhones ?? 0} color="var(--danger)" />
          </div>
        </div>
      </section>

      <section className="dashboard-panel dashboard-recent">
        <div className="dashboard-panel-header">
          <div>
            <span className="dashboard-panel-kicker">Histórico recente</span>
            <h2>Campanhas</h2>
          </div>
          <a href="/followup">Ver todas</a>
        </div>
        {campaigns.length > 0 ? (
          <div className="recent-campaign-list">
            {campaigns.map((campaign, index) => (
              <div className="recent-campaign" key={campaign.id ?? `${campaign.name}-${index}`}>
                <div className="recent-campaign-name">
                  <span className="campaign-index">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{campaign.name}</strong>
                    <span>{campaign.audienceList?.name ?? 'Público não informado'}{formatDate(campaign.createdAt)}</span>
                  </div>
                </div>
                <StatusBadge status={campaign.status} />
                <MetricText label="Enviadas" value={campaign.submittedCount} />
                <MetricText label="Entregues" value={campaign.deliveredCount} />
                <MetricText label="Lidas" value={campaign.readCount} />
              </div>
            ))}
          </div>
        ) : (
          <p className="dashboard-empty-inline">Nenhuma campanha registrada.</p>
        )}
      </section>
    </div>
  );
}

function normalizeAudience(data: Partial<AudienceSummary>): AudienceSummary {
  return {
    total: typeof data.total === 'number' ? data.total : 0,
    eligible: typeof data.eligible === 'number' ? data.eligible : 0,
    excluded: typeof data.excluded === 'number' ? data.excluded : 0,
    invalidPhones: typeof data.invalidPhones === 'number' ? data.invalidPhones : 0,
    optOuts: typeof data.optOuts === 'number' ? data.optOuts : 0,
  };
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  accent = false,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={`dashboard-stat ${accent ? 'dashboard-stat-accent' : ''}`}>
      <div className="dashboard-stat-top">
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function PerformanceMetric({ icon: Icon, label, value }: { icon: typeof Send; label: string; value: number }) {
  return (
    <div>
      <span><Icon size={14} /> {label}</span>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function FunnelBar({ label, value, total }: { label: string; value: number; total: number }) {
  const rate = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="funnel-row">
      <span>{label}</span>
      <div className="funnel-track"><i style={{ width: `${Math.max(value > 0 ? 3 : 0, rate)}%` }} /></div>
      <strong>{rate}%</strong>
    </div>
  );
}

function AudienceLine({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <span><i style={{ background: color }} />{label}</span>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function MetricText({ label, value }: { label: string; value: number }) {
  return <div className="recent-campaign-metric"><span>{label}</span><strong>{formatNumber(value)}</strong></div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`campaign-status campaign-status-${status.toLowerCase()}`}>{translateStatus(status)}</span>;
}

function translateStatus(status: string) {
  const labels: Record<string, string> = {
    draft: 'Rascunho', ready: 'Pronta', running: 'Em envio', paused: 'Pausada',
    completed: 'Concluída', canceled: 'Cancelada', failed: 'Falhou', scheduled: 'Agendada',
  };
  return labels[status.toLowerCase()] ?? status;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return ` · ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date)}`;
}
