import { useState, useEffect, useCallback } from 'react';
import { Button, Table, Alert, Badge, Modal, Input, ConfirmDialog } from '../components/index.js';
import { useAuth } from '../context/AuthContext.js';

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

interface AccessRole {
  id: string;
  name: string;
  description: string;
}

interface SystemUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: AccessRole;
  [k: string]: unknown;
}

interface WhatsAppSender {
  id: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  internalName: string;
  status: string;
  qualityRating: string;
  codeVerificationStatus: string;
  isDefault: boolean;
  isActive: boolean;
  sendEnabled: boolean;
  lastSyncedAt: string | null;
  [k: string]: unknown;
}

export function SettingsPage() {
  const { user: currentUser } = useAuth();
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
  const [senders, setSenders] = useState<WhatsAppSender[]>([]);
  const [sendersLoading, setSendersLoading] = useState(false);
  const [senderSaving, setSenderSaving] = useState(false);
  const [editSender, setEditSender] = useState<WhatsAppSender | null>(null);
  const [editSenderName, setEditSenderName] = useState('');
  const [confirmEnableSender, setConfirmEnableSender] = useState<WhatsAppSender | null>(null);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [accessRoles, setAccessRoles] = useState<AccessRole[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRoleId, setNewUserRoleId] = useState('');
  const [userSaving, setUserSaving] = useState(false);
  const [resetUser, setResetUser] = useState<SystemUser | null>(null);
  const [resetUserPassword, setResetUserPassword] = useState('');
  const canManageUsers = currentUser?.role === 'owner';

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

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    fetch(`${API}/api/followup/system-status`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Falha ao carregar o status do WhatsApp');
        return response.json() as Promise<WhatsAppStatus>;
      })
      .then(setWhatsAppStatus)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : 'Falha ao carregar o status do WhatsApp',
        ),
      );
  }, []);

  const fetchSenders = useCallback(async () => {
    setSendersLoading(true);
    try {
      const response = await fetch(`${API}/api/whatsapp/senders`, { credentials: 'include' });
      const body = (await response.json().catch(() => null)) as {
        senders?: WhatsAppSender[];
        message?: string;
      } | null;
      if (!response.ok) throw new Error(body?.message ?? 'Falha ao carregar números remetentes');
      setSenders(Array.isArray(body?.senders) ? body.senders : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar números remetentes');
    } finally {
      setSendersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSenders();
  }, [fetchSenders]);

  async function syncSenders() {
    setSenderSaving(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/whatsapp/senders/sync`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = (await response.json().catch(() => null)) as {
        synced?: number;
        senders?: WhatsAppSender[];
        message?: string;
      } | null;
      if (!response.ok) throw new Error(body?.message ?? 'Não foi possível sincronizar com a Meta');
      setSenders(Array.isArray(body?.senders) ? body.senders : []);
      setSuccess(`${body?.synced ?? 0} número(s) sincronizado(s) com a Meta.`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Não foi possível sincronizar com a Meta',
      );
    } finally {
      setSenderSaving(false);
    }
  }

  async function patchSender(id: string, data: Record<string, unknown>, successMessage: string) {
    setSenderSaving(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/whatsapp/senders/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? 'Não foi possível alterar o número');
      setSuccess(successMessage);
      await fetchSenders();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível alterar o número');
    } finally {
      setSenderSaving(false);
    }
  }

  const fetchUsers = useCallback(async () => {
    if (!canManageUsers) return;
    setUsersLoading(true);
    try {
      const [usersResponse, rolesResponse] = await Promise.all([
        fetch(`${API}/api/users`, { credentials: 'include' }),
        fetch(`${API}/api/users/roles`, { credentials: 'include' }),
      ]);
      if (!usersResponse.ok || !rolesResponse.ok) throw new Error('Falha ao carregar usuários');
      const [usersBody, rolesBody] = await Promise.all([
        usersResponse.json() as Promise<{ users?: SystemUser[] }>,
        rolesResponse.json() as Promise<{ roles?: AccessRole[] }>,
      ]);
      const roles = Array.isArray(rolesBody.roles) ? rolesBody.roles : [];
      setSystemUsers(Array.isArray(usersBody.users) ? usersBody.users : []);
      setAccessRoles(roles);
      setNewUserRoleId(
        (current) =>
          current || roles.find((role) => role.name === 'operator')?.id || roles[0]?.id || '',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar usuários');
    } finally {
      setUsersLoading(false);
    }
  }, [canManageUsers]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleCreateUser() {
    setUserSaving(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          roleId: newUserRoleId,
        }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? 'Não foi possível criar o usuário');
      setShowCreateUser(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setSuccess('Usuário criado. Ele já pode acessar o CRM.');
      await fetchUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível criar o usuário');
    } finally {
      setUserSaving(false);
    }
  }

  async function handleToggleUser(user: SystemUser) {
    setUserSaving(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/users/${user.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? 'Não foi possível alterar o acesso');
      setSuccess(user.isActive ? 'Acesso desativado e sessões encerradas.' : 'Acesso reativado.');
      await fetchUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível alterar o acesso');
    } finally {
      setUserSaving(false);
    }
  }

  async function handleResetUserPassword() {
    if (!resetUser) return;
    setUserSaving(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/users/${resetUser.id}/reset-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetUserPassword }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? 'Não foi possível redefinir a senha');
      setResetUser(null);
      setResetUserPassword('');
      setSuccess(body?.message ?? 'Senha redefinida.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível redefinir a senha');
    } finally {
      setUserSaving(false);
    }
  }

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
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? 'Não foi possível alterar a senha');
      setCurrentPassword('');
      setNewPassword('');
      setSuccess(body?.message ?? 'Senha alterada');
      window.setTimeout(() => {
        window.location.href = '/login';
      }, 1200);
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
        <Button size="sm" variant="secondary" onClick={() => openEdit(s)}>
          Editar
        </Button>
      ),
    },
  ];

  const userColumns = [
    {
      key: 'name',
      header: 'Usuário',
      render: (user: SystemUser) => (
        <div>
          <p className="font-semibold">{user.name}</p>
          <p className="text-xs text-secondary">{user.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Perfil',
      render: (user: SystemUser) => roleLabel(user.role.name),
    },
    {
      key: 'status',
      header: 'Status',
      render: (user: SystemUser) => (
        <Badge variant={user.isActive ? 'success' : 'neutral'}>
          {user.isActive ? 'Ativo' : 'Desativado'}
        </Badge>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Último acesso',
      render: (user: SystemUser) =>
        user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('pt-BR') : 'Nunca acessou',
    },
    {
      key: 'actions',
      header: '',
      render: (user: SystemUser) => {
        if (user.id === currentUser?.id) return <Badge variant="info">Você</Badge>;
        if (user.role.name === 'owner') return <Badge variant="neutral">Proprietário</Badge>;
        return (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setResetUser(user);
                setResetUserPassword('');
              }}
            >
              Redefinir senha
            </Button>
            <Button
              size="sm"
              variant={user.isActive ? 'danger' : 'secondary'}
              disabled={userSaving}
              onClick={() => handleToggleUser(user)}
            >
              {user.isActive ? 'Desativar' : 'Reativar'}
            </Button>
          </div>
        );
      },
    },
  ];

  const senderColumns = [
    {
      key: 'internalName',
      header: 'Identificação no CRM',
      render: (sender: WhatsAppSender) => (
        <div>
          <p className="font-semibold">{sender.internalName || 'Sem nome interno'}</p>
          <p className="text-xs text-secondary">
            {sender.displayPhoneNumber || sender.phoneNumberId}
          </p>
        </div>
      ),
    },
    {
      key: 'verifiedName',
      header: 'Nome público na Meta',
      render: (sender: WhatsAppSender) => sender.verifiedName || 'Em definição',
    },
    {
      key: 'status',
      header: 'Meta',
      render: (sender: WhatsAppSender) => (
        <div className="flex flex-wrap gap-2">
          <Badge variant={sender.status === 'CONNECTED' ? 'success' : 'warning'}>
            {sender.status === 'CONNECTED' ? 'Conectado' : 'Pendente'}
          </Badge>
          <Badge variant={sender.qualityRating === 'GREEN' ? 'success' : 'neutral'}>
            Qualidade{' '}
            {sender.qualityRating === 'GREEN' ? 'alta' : sender.qualityRating.toLowerCase()}
          </Badge>
        </div>
      ),
    },
    {
      key: 'usage',
      header: 'Uso no CRM',
      render: (sender: WhatsAppSender) => (
        <div className="flex flex-wrap gap-2">
          <Badge variant={sender.sendEnabled && sender.isActive ? 'success' : 'neutral'}>
            {sender.sendEnabled && sender.isActive ? 'Liberado' : 'Bloqueado'}
          </Badge>
          {sender.isDefault && <Badge variant="info">Padrão</Badge>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Ações',
      render: (sender: WhatsAppSender) => (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditSender(sender);
              setEditSenderName(sender.internalName);
            }}
          >
            Editar nome
          </Button>
          {!sender.isDefault && sender.sendEnabled && (
            <Button
              size="sm"
              variant="secondary"
              disabled={senderSaving}
              onClick={() => patchSender(sender.id, { isDefault: true }, 'Número padrão alterado.')}
            >
              Tornar padrão
            </Button>
          )}
          <Button
            size="sm"
            variant={sender.sendEnabled ? 'danger' : 'secondary'}
            disabled={senderSaving}
            onClick={() =>
              sender.sendEnabled
                ? patchSender(
                    sender.id,
                    { sendEnabled: false },
                    'Número bloqueado para novos envios.',
                  )
                : setConfirmEnableSender(sender)
            }
          >
            {sender.sendEnabled ? 'Bloquear envios' : 'Liberar envios'}
          </Button>
        </div>
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

      {error && (
        <Alert variant="danger" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" onDismiss={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: '1rem' }}>
          <div>
            <h2>Status do WhatsApp</h2>
            <p className="text-sm text-secondary">
              Somente indicadores; credenciais nunca são exibidas.
            </p>
          </div>
          <Badge variant={whatsAppStatus?.metaConfigured ? 'success' : 'warning'}>
            {whatsAppStatus?.metaConfigured ? 'Meta configurada' : 'Configuração pendente'}
          </Badge>
        </div>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
        >
          <StatusText label="Provedor" value={whatsAppStatus?.provider ?? '—'} />
          <StatusText label="Graph API" value={whatsAppStatus?.graphVersion ?? '—'} />
          <StatusText
            label="Disparo"
            value={whatsAppStatus?.outboundEnabled ? 'Ativado' : 'Bloqueado'}
          />
          <StatusText
            label="n8n"
            value={whatsAppStatus?.n8nConfigured ? 'Configurado' : 'Pendente'}
          />
          <StatusText
            label="Templates aprovados"
            value={
              whatsAppStatus
                ? `${whatsAppStatus.approvedTemplates}/${whatsAppStatus.requiredTemplates}`
                : '—'
            }
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: '1rem' }}>
          <div>
            <h2>Números remetentes</h2>
            <p className="text-sm text-secondary">
              O nome interno é editável. O nome que aparece no WhatsApp é controlado pela Meta.
            </p>
          </div>
          <Button variant="secondary" loading={senderSaving} onClick={syncSenders}>
            Sincronizar com a Meta
          </Button>
        </div>
        {sendersLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando números...</div>
        ) : (
          <Table columns={senderColumns} data={senders} emptyMessage="Nenhum número encontrado" />
        )}
        <p className="text-xs text-secondary" style={{ marginTop: '0.75rem' }}>
          Só libere um novo número depois que o Gerenciador do WhatsApp mostrar o status Conectado.
          Opt-outs continuam valendo para o contato em todos os números.
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginBottom: '0.25rem' }}>Segurança</h2>
        <p className="text-sm text-secondary" style={{ marginBottom: '1rem' }}>
          Alterar a senha encerra todas as sessões abertas.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
            alignItems: 'end',
          }}
        >
          <Input
            label="Senha atual"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <Input
            label="Nova senha (mínimo 12 caracteres)"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <Button
            loading={changingPassword}
            disabled={!currentPassword || newPassword.length < 12}
            onClick={handleChangePassword}
          >
            Alterar senha
          </Button>
        </div>
      </div>

      {canManageUsers && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="flex items-center justify-between gap-3" style={{ marginBottom: '1rem' }}>
            <div>
              <h2>Usuários com acesso</h2>
              <p className="text-sm text-secondary">
                Crie acessos individuais e encerre permissões sem compartilhar sua senha.
              </p>
            </div>
            <Button onClick={() => setShowCreateUser(true)}>+ Adicionar usuário</Button>
          </div>
          {usersLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando usuários...</div>
          ) : (
            <Table
              columns={userColumns}
              data={systemUsers}
              emptyMessage="Nenhum usuário encontrado"
            />
          )}
        </div>
      )}

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
            <Button variant="secondary" onClick={() => setEditSetting(null)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={handleSave}>
              Salvar
            </Button>
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
        <Input
          label="Descricao"
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
        />
      </Modal>

      <Modal
        open={showCreateUser}
        onClose={() => setShowCreateUser(false)}
        title="Adicionar usuário"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateUser(false)}>
              Cancelar
            </Button>
            <Button
              loading={userSaving}
              disabled={
                !newUserName.trim() ||
                !newUserEmail.trim() ||
                newUserPassword.length < 12 ||
                !newUserRoleId
              }
              onClick={handleCreateUser}
            >
              Criar acesso
            </Button>
          </>
        }
      >
        <Input
          label="Nome"
          value={newUserName}
          onChange={(event) => setNewUserName(event.target.value)}
          autoComplete="off"
        />
        <Input
          label="E-mail"
          type="email"
          value={newUserEmail}
          onChange={(event) => setNewUserEmail(event.target.value)}
          autoComplete="off"
        />
        <Input
          label="Senha provisória (mínimo 12 caracteres)"
          type="password"
          value={newUserPassword}
          onChange={(event) => setNewUserPassword(event.target.value)}
          autoComplete="new-password"
        />
        <div className="form-group">
          <label htmlFor="new-user-role">Perfil de acesso</label>
          <select
            id="new-user-role"
            className="select"
            value={newUserRoleId}
            onChange={(event) => setNewUserRoleId(event.target.value)}
          >
            {accessRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {roleLabel(role.name)}
              </option>
            ))}
          </select>
          <p className="text-xs text-secondary">
            {accessRoles.find((role) => role.id === newUserRoleId)?.description}
          </p>
        </div>
      </Modal>

      <Modal
        open={resetUser !== null}
        onClose={() => setResetUser(null)}
        title={`Redefinir senha — ${resetUser?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetUser(null)}>
              Cancelar
            </Button>
            <Button
              loading={userSaving}
              disabled={resetUserPassword.length < 12}
              onClick={handleResetUserPassword}
            >
              Salvar nova senha
            </Button>
          </>
        }
      >
        <p className="text-sm text-secondary" style={{ marginBottom: '1rem' }}>
          As sessões abertas desse usuário serão encerradas imediatamente.
        </p>
        <Input
          label="Nova senha (mínimo 12 caracteres)"
          type="password"
          value={resetUserPassword}
          onChange={(event) => setResetUserPassword(event.target.value)}
          autoComplete="new-password"
        />
      </Modal>

      <Modal
        open={editSender !== null}
        onClose={() => setEditSender(null)}
        title={`Editar número — ${editSender?.displayPhoneNumber ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditSender(null)}>
              Cancelar
            </Button>
            <Button
              loading={senderSaving}
              disabled={!editSenderName.trim()}
              onClick={async () => {
                if (!editSender) return;
                await patchSender(
                  editSender.id,
                  { internalName: editSenderName.trim() },
                  'Nome interno atualizado.',
                );
                setEditSender(null);
              }}
            >
              Salvar nome interno
            </Button>
          </>
        }
      >
        <Input
          label="Nome para identificar dentro do CRM"
          value={editSenderName}
          onChange={(event) => setEditSenderName(event.target.value)}
          placeholder="Ex.: Meteórico principal"
        />
        <p className="text-sm text-secondary">
          Isso não altera o nome público “{editSender?.verifiedName || 'em análise'}”. Esse nome só
          pode ser alterado e aprovado no Gerenciador do WhatsApp da Meta.
        </p>
      </Modal>

      <ConfirmDialog
        open={confirmEnableSender !== null}
        onCancel={() => setConfirmEnableSender(null)}
        onConfirm={() => {
          if (confirmEnableSender) {
            patchSender(
              confirmEnableSender.id,
              { sendEnabled: true },
              'Número liberado para campanhas.',
            );
          }
          setConfirmEnableSender(null);
        }}
        title="Liberar este número para envios?"
        message={`Confirme que ${confirmEnableSender?.displayPhoneNumber ?? 'o número'} já aparece como Conectado na Meta. O CRM não fará envios por ele enquanto estiver bloqueado.`}
        confirmLabel="Liberar número"
      />
    </div>
  );
}

function StatusText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-secondary">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    owner: 'Proprietário',
    admin: 'Administrador',
    operator: 'Operador',
    analyst: 'Analista',
    read_only: 'Somente leitura',
  };
  return labels[role] ?? role;
}
