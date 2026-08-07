import { LayoutDashboard, Users, Megaphone, MessageSquare } from 'lucide-react';

export function DashboardPage() {
  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Dashboard</h1>
          <p className="content-subtitle">Visao geral do CRM</p>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <StatCard icon={Megaphone} label="Campanhas" value="0" />
        <StatCard icon={Users} label="Contatos" value="0" />
        <StatCard icon={LayoutDashboard} label="Grupos" value="0" />
        <StatCard icon={MessageSquare} label="Mensagens" value="0" />
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
