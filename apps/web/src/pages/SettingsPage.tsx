import { Settings } from 'lucide-react';
import { PlaceholderPage } from './PlaceholderPage.js';

export function SettingsPage() {
  return (
    <PlaceholderPage
      title="Configuracoes"
      description="Preferencias do sistema"
      icon={Settings}
      etapa={4}
    />
  );
}
