import { useState, useEffect, useCallback } from 'react';
import { Button, Input, Table, Badge, Alert, Modal } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  isStudent: boolean;
  purchaseStatus: 'unknown' | 'not_purchased' | 'purchased';
  source: string;
  campaignSource: string;
  optOut: boolean;
  lastCampaign: string | null;
  lastSendAt: string | null;
  lastSendStatus: string | null;
  totalParticipations: number;
  totalPurchases: number;
  firstSeenAt: string;
  lastSeenAt: string;
  [key: string]: unknown;
}

interface ContactHistory {
  id: string;
  name: string;
  phone: string | null;
  optOutAt: string | null;
  preferences: Array<{
    optedOut: boolean;
    blockedAt: string | null;
    reason: string;
    optedInAt: string | null;
    optInSource: string;
  }>;
  listMemberships: Array<{ list: { id: string; name: string; isActive: boolean } }>;
  followupMessages: Array<{
    id: string;
    status: string;
    submittedAt: string | null;
    deliveredAt: string | null;
    readAt: string | null;
    repliedAt: string | null;
    errorCode: string | null;
    campaign: { name: string; templateName: string };
  }>;
}

export function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [purchaseFilter, setPurchaseFilter] = useState('');
  const [optOutFilter, setOptOutFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [history, setHistory] = useState<ContactHistory | null>(null);
  const [quickOptOutPhone, setQuickOptOutPhone] = useState('');
  const [blockingPhone, setBlockingPhone] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    buyers: number;
    optOuts: number;
    eligible: number;
  } | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (purchaseFilter) params.set('purchaseStatus', purchaseFilter);
      if (optOutFilter) params.set('optOut', optOutFilter);
      const res = await fetch(`${API}/api/contacts?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao carregar contatos');
      const data = await res.json();
      setContacts(data.contacts);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [page, search, purchaseFilter, optOutFilter]);

  const fetchStats = useCallback(async () => {
    const response = await fetch(`${API}/api/contacts/stats`, { credentials: 'include' });
    if (response.ok) setStats(await response.json());
  }, []);

  async function updateContact(contact: Contact, body: Record<string, unknown>) {
    setError('');
    try {
      const response = await fetch(`${API}/api/contacts/${contact.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Não foi possível atualizar o contato');
      await fetchContacts();
      await fetchStats();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao atualizar contato');
    }
  }

  async function blockByPhone() {
    setBlockingPhone(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API}/api/contacts/opt-out-by-phone`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: quickOptOutPhone }),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        phone?: string;
        wasAlreadyBlocked?: boolean;
      } | null;
      if (!response.ok) throw new Error(body?.message ?? 'Não foi possível bloquear o telefone');
      setSuccess(
        body?.wasAlreadyBlocked
          ? `O telefone ${body.phone ?? ''} já estava bloqueado.`
          : `Telefone ${body?.phone ?? ''} bloqueado. Ele foi retirado de todos os próximos envios.`,
      );
      setQuickOptOutPhone('');
      await Promise.all([fetchContacts(), fetchStats()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao bloquear o telefone');
    } finally {
      setBlockingPhone(false);
    }
  }

  async function openHistory(contact: Contact) {
    const response = await fetch(`${API}/api/contacts/${contact.id}`, { credentials: 'include' });
    if (!response.ok) return setError('Não foi possível carregar o histórico');
    setHistory((await response.json()) as ContactHistory);
  }

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => void fetchStats(), [fetchStats]);

  const columns = [
    { key: 'name', header: 'Nome', render: (c: Contact) => c.name || '(sem nome)' },
    { key: 'phone', header: 'Telefone', render: (c: Contact) => c.phone ?? '-' },
    {
      key: 'purchaseStatus',
      header: 'Compra',
      render: (c: Contact) => (
        <Badge variant={c.purchaseStatus === 'purchased' || c.isStudent ? 'success' : 'neutral'}>
          {c.purchaseStatus === 'purchased' || c.isStudent
            ? 'Comprou'
            : c.purchaseStatus === 'not_purchased'
              ? 'Não comprou'
              : 'Desconhecido'}
        </Badge>
      ),
    },
    {
      key: 'optOut',
      header: 'Opt-out',
      render: (c: Contact) => (
        <Badge variant={c.optOut ? 'danger' : 'success'}>{c.optOut ? 'Sim' : 'Não'}</Badge>
      ),
    },
    { key: 'source', header: 'Origem' },
    {
      key: 'campaignSource',
      header: 'Campanha de origem',
      render: (c: Contact) => c.campaignSource || '-',
    },
    {
      key: 'lastSendAt',
      header: 'Último envio',
      render: (c: Contact) =>
        c.lastSendAt
          ? `${new Date(c.lastSendAt).toLocaleDateString('pt-BR')} · ${c.lastSendStatus}`
          : '-',
    },
    {
      key: 'actions',
      header: 'Ações',
      render: (c: Contact) => (
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              updateContact(c, {
                purchaseStatus: c.purchaseStatus === 'purchased' ? 'not_purchased' : 'purchased',
              })
            }
          >
            {c.purchaseStatus === 'purchased' ? 'Desmarcar compra' : 'Marcar comprador'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openHistory(c)}>
            Histórico
          </Button>
          <Button
            size="sm"
            variant={c.optOut ? 'secondary' : 'danger'}
            onClick={() => updateContact(c, { optOut: !c.optOut })}
          >
            {c.optOut ? 'Reativar' : 'Bloquear'}
          </Button>
        </div>
      ),
    },
  ];

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Contatos</h1>
          <p className="content-subtitle">
            Base de leads com compra, origem, opt-out e último envio
          </p>
        </div>
        <a className="btn btn-secondary" href={`${API}/api/contacts/opt-outs/export.csv`}>
          Exportar opt-outs
        </a>
      </div>

      {stats && (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            marginBottom: '1rem',
          }}
        >
          <div className="card">
            <p className="text-sm text-secondary">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="card">
            <p className="text-sm text-secondary">Elegíveis</p>
            <p className="text-2xl font-bold">{stats.eligible}</p>
          </div>
          <div className="card">
            <p className="text-sm text-secondary">Compradores</p>
            <p className="text-2xl font-bold">{stats.buyers}</p>
          </div>
          <div className="card">
            <p className="text-sm text-secondary">Opt-outs</p>
            <p className="text-2xl font-bold">{stats.optOuts}</p>
          </div>
        </div>
      )}

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
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Input
            label="Bloquear envios pelo telefone"
            placeholder="Ex.: 5591999999999"
            value={quickOptOutPhone}
            onChange={(event) => setQuickOptOutPhone(event.target.value)}
          />
          <Button
            variant="danger"
            loading={blockingPhone}
            disabled={!quickOptOutPhone.trim()}
            onClick={blockByPhone}
          >
            Bloquear WhatsApp
          </Button>
          <p className="text-sm text-secondary" style={{ marginBottom: '0.6rem' }}>
            Não apaga o contato nem o histórico; impede qualquer novo disparo.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Input
            label="Buscar"
            placeholder="Nome, telefone ou e-mail..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <div className="form-group" style={{ margin: 0 }}>
            <label>Compra</label>
            <select
              className="input"
              value={purchaseFilter}
              onChange={(e) => {
                setPurchaseFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="not_purchased">Não compradores</option>
              <option value="purchased">Compradores</option>
              <option value="unknown">Desconhecido</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Opt-out</label>
            <select
              className="input"
              value={optOutFilter}
              onChange={(e) => {
                setOptOutFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="false">Ativos</option>
              <option value="true">Opt-out</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
        ) : (
          <>
            <Table columns={columns} data={contacts} emptyMessage="Nenhum contato encontrado" />
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '1rem 0',
                }}
              >
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </Button>
                <span style={{ alignSelf: 'center' }}>
                  {page} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Proximo
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <Modal
        open={Boolean(history)}
        onClose={() => setHistory(null)}
        title={`Histórico · ${history?.name || 'Contato'}`}
      >
        {history && (
          <div className="grid gap-4">
            <div className="card">
              <p>
                <strong>Telefone:</strong> {history.phone ?? '-'}
              </p>
              <p>
                <strong>Públicos:</strong>{' '}
                {history.listMemberships.map((item) => item.list.name).join(', ') || 'Nenhum'}
              </p>
              <p>
                <strong>Consentimento:</strong>{' '}
                {history.preferences[0]?.optInSource || 'Não informado'}
                {history.preferences[0]?.optedInAt
                  ? ` · ${new Date(history.preferences[0].optedInAt).toLocaleDateString('pt-BR')}`
                  : ''}
              </p>
              <p>
                <strong>Status de envio:</strong>{' '}
                {history.preferences[0]?.optedOut ? 'Bloqueado (opt-out)' : 'Ativo'}
                {history.optOutAt
                  ? ` · desde ${new Date(history.optOutAt).toLocaleString('pt-BR')}`
                  : ''}
              </p>
              {history.preferences[0]?.optedOut && (
                <p>
                  <strong>Motivo:</strong>{' '}
                  {history.preferences[0].reason === 'keyword'
                    ? 'Resposta do contato'
                    : history.preferences[0].reason === 'admin_phone_lookup'
                      ? 'Bloqueio manual por telefone'
                      : history.preferences[0].reason || 'Não informado'}
                </p>
              )}
            </div>
            <div>
              <h3 style={{ marginBottom: '0.75rem' }}>Campanhas</h3>
              {history.followupMessages.length === 0 ? (
                <p className="text-secondary">Nenhum envio.</p>
              ) : (
                history.followupMessages.map((message) => (
                  <div key={message.id} className="card" style={{ marginBottom: '0.6rem' }}>
                    <div className="flex justify-between gap-2">
                      <strong>{message.campaign.name}</strong>
                      <Badge variant={message.status === 'failed' ? 'danger' : 'neutral'}>
                        {message.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-secondary">
                      {message.campaign.templateName}
                      {message.submittedAt
                        ? ` · ${new Date(message.submittedAt).toLocaleString('pt-BR')}`
                        : ''}
                      {message.errorCode ? ` · ${message.errorCode}` : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
