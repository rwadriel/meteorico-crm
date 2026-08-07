import type { LucideIcon } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: LucideIcon;
  etapa: number;
}

export function PlaceholderPage({ title, description, icon: Icon, etapa }: PlaceholderPageProps) {
  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">{title}</h1>
          <p className="content-subtitle">{description}</p>
        </div>
      </div>
      <div className="card">
        <div className="empty-state">
          <Icon size={48} className="empty-state-icon" />
          <h2 className="empty-state-title">{title}</h2>
          <p className="empty-state-description">
            Este modulo sera implementado na Etapa {String(etapa).padStart(2, '0')}.
          </p>
        </div>
      </div>
    </div>
  );
}
