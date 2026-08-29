import { useState, useEffect, useCallback } from 'react';
import { Button, Table, Badge, Alert, Modal, Input } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface Flow {
  id: string;
  name: string;
  description: string;
  trigger: string;
  isActive: boolean;
  createdAt: string;
  _count?: { versions: number };
  [key: string]: unknown;
}

export function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState('');
  const [formTrigger, setFormTrigger] = useState('new_contact');
  const [formDescription, setFormDescription] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchFlows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/flows`, { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao carregar fluxos');
      const data = await res.json();
      setFlows(Array.isArray(data) ? data : data.flows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);

  async function handleCreate() {
    setFormLoading(true);
    setFormError('');
    try {
      const res = await fetch(`${API}/api/flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: formName, trigger: formTrigger, description: formDescription }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Falha ao criar' }));
        throw new Error(err.message);
      }
      setShowCreate(false);
      setFormName('');
      setFormTrigger('new_contact');
      setFormDescription('');
      fetchFlows();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro ao criar fluxo');
    } finally {
      setFormLoading(false);
    }
  }

  const TRIGGER_LABELS: Record<string, string> = {
    new_contact: 'Novo contato',
    classification_changed: 'Classificacao alterada',
    purchase_completed: 'Compra realizada',
    group_join: 'Entrou no grupo',
    group_leave: 'Saiu do grupo',
    manual: 'Manual',
  };

  const columns = [
    { key: 'name', header: 'Nome' },
    { key: 'trigger', header: 'Gatilho', render: (f: Flow) => TRIGGER_LABELS[f.trigger] ?? f.trigger },
    {
      key: 'isActive',
      header: 'Status',
      render: (f: Flow) => (
        <Badge variant={f.isActive ? 'success' : 'neutral'}>
          {f.isActive ? 'Ativo' : 'Inativo'}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Criado em',
      render: (f: Flow) => new Date(f.createdAt).toLocaleDateString('pt-BR'),
    },
  ];

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Fluxos</h1>
          <p className="content-subtitle">Automacoes de mensagens e sequencias</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>Novo Fluxo</Button>
      </div>

      {error && <Alert variant="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <div className="card">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
        ) : (
          <Table columns={columns} data={flows} emptyMessage="Nenhum fluxo criado" />
        )}
      </div>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Novo Fluxo"
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button loading={formLoading} onClick={handleCreate} disabled={!formName}>Criar</Button>
          </div>
        }
      >
        {formError && <Alert variant="danger">{formError}</Alert>}
        <Input label="Nome" value={formName} onChange={(e) => setFormName(e.target.value)} />
        <Input label="Descricao" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
        <div className="form-group">
          <label>Gatilho</label>
          <select className="input" value={formTrigger} onChange={(e) => setFormTrigger(e.target.value)}>
            {Object.entries(TRIGGER_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
      </Modal>
    </div>
  );
}
