import { useState, useEffect, useCallback } from 'react';
import { Button, Table, Alert, Badge, Modal, Input } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface Setting {
  id: string;
  key: string;
  value: unknown;
  description: string;
  updatedAt: string;
  [k: string]: unknown;
}

interface WhatsAppStatus {
  provider: string;
  outboundEnabled: boolean;
  graphVersion: string;
  metaConfigured: boolean;
  n8nConfigured: boolean;
  approvedTemplates: number;
  requiredTemplates: number;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editSetting, setEditSetting] = useState<Setting | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppStatus | null>(null);

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

  useEffect(() => {
    fetch(`${API}/api/followup/system-status`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Falha ao carregar o status do WhatsApp');
        return response.json() as Promise<WhatsAppStatus>;
      })
      .then(setWhatsAppStatus)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar o status do WhatsApp'));
  }, []);

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

  async function handleChangePassword() {
    setChangingPassword(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/auth/change-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? 'Não foi possível alterar a senha');
      setCurrentPassword('');
      setNewPassword('');
      setSuccess(body?.message ?? 'Senha alterada');
      window.setTimeout(() => { window.location.href = '/login'; }, 1200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível alterar a senha');
    } finally {
      setChangingPassword(false);
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
          <h1 className="content-title">Configurações</h1>
          <p className="content-subtitle">WhatsApp, segurança e preferências do sistema</p>
        </div>
      </div>

      {error && <Alert variant="danger" onDismiss={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" onDismiss={() => setSuccess('')}>{success}</Alert>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: '1rem' }}>
          <div>
            <h2>Status do WhatsApp</h2>
            <p className="text-sm text-secondary">Somente indicadores; credenciais nunca são exibidas.</p>
          </div>
          <Badge variant={whatsAppStatus?.metaConfigured ? 'success' : 'warning'}>
            {whatsAppStatus?.metaConfigured ? 'Meta configurada' : 'Configuração pendente'}
          </Badge>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <StatusText label="Provedor" value={whatsAppStatus?.provider ?? '—'} />
          <StatusText label="Graph API" value={whatsAppStatus?.graphVersion ?? '—'} />
          <StatusText label="Disparo" value={whatsAppStatus?.outboundEnabled ? 'Ativado' : 'Bloqueado'} />
          <StatusText label="n8n" value={whatsAppStatus?.n8nConfigured ? 'Configurado' : 'Pendente'} />
          <StatusText label="Templates aprovados" value={whatsAppStatus ? `${whatsAppStatus.approvedTemplates}/${whatsAppStatus.requiredTemplates}` : '—'} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginBottom: '0.25rem' }}>Segurança</h2>
        <p className="text-sm text-secondary" style={{ marginBottom: '1rem' }}>Alterar a senha encerra todas as sessões abertas.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <Input label="Senha atual" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          <Input label="Nova senha (mínimo 12 caracteres)" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          <Button loading={changingPassword} disabled={!currentPassword || newPassword.length < 12} onClick={handleChangePassword}>Alterar senha</Button>
        </div>
      </div>

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

function StatusText({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-secondary">{label}</p><p className="font-semibold">{value}</p></div>;
}
