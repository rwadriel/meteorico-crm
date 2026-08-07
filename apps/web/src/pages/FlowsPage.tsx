import { GitBranch } from 'lucide-react';
import { PlaceholderPage } from './PlaceholderPage.js';

export function FlowsPage() {
  return (
    <PlaceholderPage
      title="Fluxos"
      description="Automacoes de mensagens e sequencias"
      icon={GitBranch}
      etapa={6}
    />
  );
}
