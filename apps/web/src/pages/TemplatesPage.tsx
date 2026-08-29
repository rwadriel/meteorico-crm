import { useEffect, useState } from 'react';
import { Alert, Badge } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface FollowupTemplate {
  name: string;
  language: string;
  label: string;
  preview: string;
  requiresUrl: boolean;
  status: 'approved' | 'pending';
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<FollowupTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`${API}/api/followup/templates`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Falha ao carregar os templates');
        return response.json() as Promise<{ templates: FollowupTemplate[] }>;
      })
      .then((data) => {
        if (active) setTemplates(data.templates ?? []);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Falha ao carregar os templates');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Templates</h1>
          <p className="content-subtitle">Mensagens oficiais usadas nas campanhas do WhatsApp</p>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      <Alert variant="info">
        O texto é controlado para permanecer igual ao aprovado na Meta. O nome do contato não é usado.
      </Alert>

      {loading ? (
        <div className="card" style={{ marginTop: '1rem' }}>Carregando...</div>
      ) : (
        <div className="grid gap-4" style={{ marginTop: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {templates.map((template) => (
            <article className="card" key={template.name}>
              <div className="flex items-center justify-between gap-3" style={{ marginBottom: '0.75rem' }}>
                <div>
                  <h2 style={{ fontSize: '1rem' }}>{template.label}</h2>
                  <p className="text-xs text-secondary">{template.name} · {template.language}</p>
                </div>
                <Badge variant={template.status === 'approved' ? 'success' : 'warning'}>
                  {template.status === 'approved' ? 'Aprovado' : 'Pendente na Meta'}
                </Badge>
              </div>
              <p style={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>{template.preview}</p>
              {template.requiresUrl && (
                <p className="text-xs text-secondary" style={{ marginTop: '0.75rem' }}>
                  O campo {'{{1}}'} recebe somente a URL HTTPS informada na campanha.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
