import { Upload } from 'lucide-react';
import { PlaceholderPage } from './PlaceholderPage.js';

export function ImportsPage() {
  return (
    <PlaceholderPage
      title="Importacoes"
      description="Importe contatos e dados externos"
      icon={Upload}
      etapa={5}
    />
  );
}
