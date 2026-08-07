import { Shield } from 'lucide-react';
import { PlaceholderPage } from './PlaceholderPage.js';

export function AuditPage() {
  return (
    <PlaceholderPage
      title="Auditoria"
      description="Logs de atividade e seguranca"
      icon={Shield}
      etapa={4}
    />
  );
}
