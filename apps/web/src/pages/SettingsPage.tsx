import { useState, useEffect, useCallback } from 'react';
import { Button, Table, Alert, Modal, Input } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface Setting {
  id: string;
  key: string;
  value: unknown;
  description: string;
  updatedAt: string;
  [k: string]: unknown;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editSetting, setEditSetting] = useState<Setting | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/settings`, { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao carregar configuracoes');
      const data = await res.json();
      setSettings(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  function openEdit(s: Setting) {
    setEditSetting(s);
    setEditValue(typeof s.value === 'string' ? s.value : JSON.stringify(s.value, null, 2));
    setEditDescription(s.description);
  }

  async function handleSave() {
    if (!editSetting) return;
    setSaving(true);
    try {
      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(editValue);
      } catch {
        parsedValue = editValue;
      }

      const res = await fetch(`${API}/api/settings/${editSetting.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ value: parsedValue, description: editDescription }),
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      setEditSetting(null);
      fetchSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { key: 'key', header: 'Chave' },
    {
      key: 'value',
      header: 'Valor',
      render: (s: Setting) => {
        const str = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
        return str.length > 60 ? str.slice(0, 57) + '...' : str;
      },
    },
    { key: 'description', header: 'Descricao', render: (s: Setting) => s.description || '-' },
    {
      key: 'updatedAt',
      header: 'Atualizado',
      render: (s: Setting) => new Date(s.updatedAt).toLocaleString('pt-BR'),
    },
    {
      key: 'actions',
      header: '',
      render: (s: Setting) => (
        <Button size="sm" variant="secondary" onClick={() => openEdit(s)}>Editar</Button>
      ),
    },
  ];

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Configuracoes</h1>
          <p className="content-subtitle">Preferencias do sistema</p>
        </div>
      </div>

      {error && <Alert variant="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <div className="card">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
        ) : settings.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center' }} className="text-secondary">
            Nenhuma configuracao definida
          </div>
        ) : (
          <Table columns={columns} data={settings} emptyMessage="Nenhuma configuracao" />
        )}
      </div>

      <Modal
        open={editSetting !== null}
        onClose={() => setEditSetting(null)}
        title={`Editar: ${editSetting?.key ?? ''}`}
        footer={
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setEditSetting(null)}>Cancelar</Button>
            <Button loading={saving} onClick={handleSave}>Salvar</Button>
          </div>
        }
      >
        <div className="form-group">
          <label>Valor</label>
          <textarea
            className="input"
            rows={4}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
          />
        </div>
        <Input label="Descricao" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
      </Modal>
    </div>
  );
}
