import { useEffect, useState } from 'react';
import { AlertTriangle, LayoutDashboard, Users, Megaphone, MessageSquare, SearchCheck } from 'lucide-react';
import { Alert } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface DashboardMetrics {
  total_contacts: number;
  total_campaigns: number;
  historical_unresolved: number;
  needs_review: number;
}

export function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    fetch(`${API}/api/analytics/dashboard`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Falha ao carregar o Dashboard');
        return response.json() as Promise<{ metrics: DashboardMetrics }>;
      })
      .then((data) => {
        if (active) setMetrics(data.metrics);
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
  const unresolvedValue = loading ? '—' : String(metrics?.historical_unresolved ?? 0);
  const needsReviewValue = loading ? '—' : String(metrics?.needs_review ?? 0);

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Dashboard</h1>
          <p className="content-subtitle">Visao geral do CRM</p>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <StatCard icon={Megaphone} label="Todas as campanhas" value={campaignsValue} />
        <StatCard icon={Users} label="Total de contatos" value={contactsValue} />
        <StatCard icon={LayoutDashboard} label="Grupos" value="0" />
        <StatCard icon={MessageSquare} label="Mensagens" value="0" />
        <StatCard icon={AlertTriangle} label="Historico nao resolvido" value={unresolvedValue} />
        <StatCard icon={SearchCheck} label="Em revisao" value={needsReviewValue} />
      </div>
    </div>
  );
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
