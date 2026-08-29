import { useState, useEffect, useCallback } from 'react';
import { Table, Badge, Alert } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface KnowledgeDoc {
  id: string;
  title: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  [key: string]: unknown;
}

export function AiPage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const docsRes = await fetch(`${API}/api/knowledge`, { credentials: 'include' });

      if (docsRes.ok) {
        const data = await docsRes.json();
        setDocs(Array.isArray(data) ? data : data.documents ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const docColumns = [
    { key: 'title', header: 'Titulo' },
    { key: 'category', header: 'Categoria', render: (d: KnowledgeDoc) => d.category || '-' },
    {
      key: 'isActive',
      header: 'Status',
      render: (d: KnowledgeDoc) => (
        <Badge variant={d.isActive ? 'success' : 'neutral'}>
          {d.isActive ? 'Ativo' : 'Inativo'}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Criado em',
      render: (d: KnowledgeDoc) => new Date(d.createdAt).toLocaleDateString('pt-BR'),
    },
  ];

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">IA</h1>
          <p className="content-subtitle">Diagnostico e atendimento inteligente</p>
        </div>
      </div>

      {error && <Alert variant="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>Configuracao do Provedor</h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <p className="text-sm text-secondary">Provedor</p>
            <p className="font-bold">xAI (Grok)</p>
          </div>
          <div>
            <p className="text-sm text-secondary">Status</p>
            <Badge variant={process.env.XAI_API_KEY ? 'success' : 'warning'}>
              {process.env.XAI_API_KEY ? 'Configurado' : 'Aguardando chave'}
            </Badge>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>Base de Conhecimento</h2>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
        ) : (
          <Table columns={docColumns} data={docs} emptyMessage="Nenhum documento na base" />
        )}
      </div>
    </div>
  );
}
