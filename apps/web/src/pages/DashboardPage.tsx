import { useEffect, useState } from 'react';
import { AlertTriangle, LayoutDashboard, Users, Megaphone, MessageSquare, CheckCheck, Eye, UserCheck, UserX } from 'lucide-react';
import { Alert } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface DashboardMetrics { total_contacts: number; total_campaigns: number }

interface FollowupSummary {
  audience: { eligible: number; buyers: number; optOuts: number };
  campaign: {
    name: string;
    status: string;
    submittedCount: number;
    deliveredCount: number;
    readCount: number;
    repliedCount: number;
    failedCount: number;
  } | null;
}

export function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [followup, setFollowup] = useState<FollowupSummary | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch(`${API}/api/analytics/dashboard`, { credentials: 'include' }),
      fetch(`${API}/api/followup/audience`, { credentials: 'include' }),
      fetch(`${API}/api/followup/campaigns?limit=1`, { credentials: 'include' }),
    ])
      .then(async ([dashboardResponse, audienceResponse, campaignsResponse]) => {
        if (!dashboardResponse.ok || !audienceResponse.ok || !campaignsResponse.ok) throw new Error('Falha ao carregar o Dashboard');
        const [dashboard, audience, campaigns] = await Promise.all([
          dashboardResponse.json() as Promise<{ metrics: DashboardMetrics }>,
          audienceResponse.json(),
          campaignsResponse.json(),
        ]);
        const normalizedAudience = typeof audience?.eligible === 'number'
          ? audience
          : { eligible: 0, buyers: 0, optOuts: 0 };
        const campaign = Array.isArray(campaigns?.campaigns) ? campaigns.campaigns[0] ?? null : null;
        return { dashboard, audience: normalizedAudience, campaign };
      })
      .then((data) => {
        if (active) {
          setMetrics(data.dashboard.metrics);
          setFollowup({ audience: data.audience, campaign: data.campaign });
        }
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

  const contactsValue = loading ? '—' : String(metrics?.total_contacts ?? 0);
  const campaignsValue = loading ? '—' : String(metrics?.total_campaigns ?? 0);
  const latest = followup?.campaign;

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Dashboard</h1>
          <p className="content-subtitle">Visão geral do follow-up pelo WhatsApp</p>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <StatCard icon={Users} label="Total de contatos" value={contactsValue} />
        <StatCard icon={Users} label="Elegíveis para follow-up" value={loading ? '—' : String(followup?.audience.eligible ?? 0)} />
        <StatCard icon={Megaphone} label="Campanhas criadas" value={campaignsValue} />
        <StatCard icon={MessageSquare} label="Enviadas na última campanha" value={loading ? '—' : String(latest?.submittedCount ?? 0)} />
        <StatCard icon={CheckCheck} label="Entregues" value={loading ? '—' : String(latest?.deliveredCount ?? 0)} />
        <StatCard icon={Eye} label="Lidas" value={loading ? '—' : String(latest?.readCount ?? 0)} />
        <StatCard icon={MessageSquare} label="Respostas" value={loading ? '—' : String(latest?.repliedCount ?? 0)} />
        <StatCard icon={AlertTriangle} label="Falhas" value={loading ? '—' : String(latest?.failedCount ?? 0)} />
        <StatCard icon={UserCheck} label="Compradores" value={loading ? '—' : String(followup?.audience.buyers ?? 0)} />
        <StatCard icon={UserX} label="Opt-outs" value={loading ? '—' : String(followup?.audience.optOuts ?? 0)} />
      </div>

      {followup?.campaign && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Última campanha de follow-up</h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <MetricText label="Nome" value={followup.campaign.name} />
            <MetricText label="Status" value={followup.campaign.status} />
            <MetricText label="Submetidas" value={String(followup.campaign.submittedCount)} />
            <MetricText label="Entregues" value={String(followup.campaign.deliveredCount)} />
            <MetricText label="Lidas" value={String(followup.campaign.readCount)} />
            <MetricText label="Respostas" value={String(followup.campaign.repliedCount)} />
            <MetricText label="Falhas" value={String(followup.campaign.failedCount)} />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricText({ label, value }: { label: string; value: string }) {
  return <div><p className="text-sm text-secondary">{label}</p><p className="font-bold">{value}</p></div>;
}

function StatCard({ icon: Icon, label, value }: { icon: typeof LayoutDashboard; label: string; value: string }) {
  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div style={{ color: 'var(--accent)' }}>
          <Icon size={24} />
        </div>
        <div>
          <p className="text-sm text-secondary">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}
