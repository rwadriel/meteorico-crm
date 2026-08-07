import React, { useEffect, useState } from 'react';

interface HealthStatus {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  uptime: number;
}

export function App(): React.ReactElement {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setError('API indisponível'));
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <span className="logo-icon">☄</span>
          <h1>Meteórico CRM</h1>
        </div>
        <span className="version">v0.1.0</span>
      </header>

      <main className="main">
        <div className="status-card">
          <h2>Status do Sistema</h2>
          <div className="status-grid">
            <StatusItem
              label="Frontend"
              status="healthy"
              detail="React + Vite"
            />
            <StatusItem
              label="API"
              status={health ? 'healthy' : error ? 'down' : 'checking'}
              detail={health ? `Uptime: ${Math.floor(health.uptime)}s` : error ?? 'Verificando...'}
            />
            <StatusItem
              label="Banco de dados"
              status="pending"
              detail="PostgreSQL (Etapa 02)"
            />
            <StatusItem
              label="Redis"
              status="pending"
              detail="Cache/Filas (Etapa 02)"
            />
            <StatusItem
              label="Worker"
              status="pending"
              detail="Polling/Jobs (Etapa 05)"
            />
            <StatusItem
              label="WhatsApp Manager"
              status="pending"
              detail="Integração (Etapa 05)"
            />
          </div>
        </div>

        <div className="info-card">
          <h2>Etapas do Projeto</h2>
          <div className="stages">
            <Stage number={1} title="Fundação" status="active" />
            <Stage number={2} title="Banco e Segurança" status="pending" />
            <Stage number={3} title="Painel Admin" status="pending" />
            <Stage number={4} title="Campanhas e Importação" status="pending" />
            <Stage number={5} title="Eventos de Grupo" status="pending" />
            <Stage number={6} title="Mensagens e Atribuição" status="pending" />
            <Stage number={7} title="Motor de Classificação" status="pending" />
            <Stage number={8} title="Fluxos e IA" status="pending" />
            <Stage number={9} title="Dashboards e Analytics" status="pending" />
            <Stage number={10} title="Release" status="pending" />
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>Meteórico CRM &copy; 2026 — Fuso: America/Belem</p>
      </footer>
    </div>
  );
}

function StatusItem({ label, status, detail }: { label: string; status: string; detail: string }) {
  const colors: Record<string, string> = {
    healthy: '#84cc16',
    down: '#ef4444',
    checking: '#eab308',
    pending: '#6b7280',
  };

  return (
    <div className="status-item">
      <div className="status-dot" style={{ backgroundColor: colors[status] ?? '#6b7280' }} />
      <div>
        <strong>{label}</strong>
        <span className="detail">{detail}</span>
      </div>
    </div>
  );
}

function Stage({ number, title, status }: { number: number; title: string; status: string }) {
  return (
    <div className={`stage ${status}`}>
      <span className="stage-number">{String(number).padStart(2, '0')}</span>
      <span className="stage-title">{title}</span>
      {status === 'active' && <span className="stage-badge">EM ANDAMENTO</span>}
    </div>
  );
}
