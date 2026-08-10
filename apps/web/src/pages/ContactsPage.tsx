import { useState, useEffect, useCallback } from 'react';
import { Button, Input, Table, Badge, Alert } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  isStudent: boolean;
  totalParticipations: number;
  totalPurchases: number;
  firstSeenAt: string;
  lastSeenAt: string;
  [key: string]: unknown;
}

export function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<{
    total: number;
    students: number;
    withEmail: number;
    unresolvedHistory: number;
    needsReview: number;
  } | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (studentFilter) params.set('isStudent', studentFilter);
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
  }, [page, search, studentFilter]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  useEffect(() => {
    fetch(`${API}/api/contacts/stats`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setStats(data); })
      .catch(() => {});
  }, []);

  const columns = [
    { key: 'name', header: 'Nome', render: (c: Contact) => c.name || '(sem nome)' },
    { key: 'phone', header: 'Telefone', render: (c: Contact) => c.phone ?? '-' },
    { key: 'email', header: 'E-mail', render: (c: Contact) => c.email ?? '-' },
    {
      key: 'isStudent',
      header: 'Aluno',
      render: (c: Contact) => (
        <Badge variant={c.isStudent ? 'success' : 'neutral'}>
          {c.isStudent ? 'Sim' : 'Nao'}
        </Badge>
      ),
    },
    { key: 'totalParticipations', header: 'Participacoes' },
    { key: 'totalPurchases', header: 'Compras' },
    {
      key: 'lastSeenAt',
      header: 'Visto em',
      render: (c: Contact) => new Date(c.lastSeenAt).toLocaleDateString('pt-BR'),
    },
  ];

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Contatos</h1>
          <p className="content-subtitle">Base de leads e participantes</p>
        </div>
      </div>

      {stats && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: '1rem' }}>
          <div className="card"><p className="text-sm text-secondary">Total</p><p className="text-2xl font-bold">{stats.total}</p></div>
          <div className="card"><p className="text-sm text-secondary">Alunos</p><p className="text-2xl font-bold">{stats.students}</p></div>
          <div className="card"><p className="text-sm text-secondary">Com e-mail</p><p className="text-2xl font-bold">{stats.withEmail}</p></div>
          <div className="card"><p className="text-sm text-secondary">Historico nao resolvido</p><p className="text-2xl font-bold">{stats.unresolvedHistory}</p></div>
          <div className="card"><p className="text-sm text-secondary">Em revisao</p><p className="text-2xl font-bold">{stats.needsReview}</p></div>
        </div>
      )}

      {error && <Alert variant="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Input
            label="Buscar"
            placeholder="Nome, telefone ou e-mail..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <div className="form-group" style={{ margin: 0 }}>
            <label>Aluno</label>
            <select
              className="input"
              value={studentFilter}
              onChange={(e) => { setStudentFilter(e.target.value); setPage(1); }}
            >
              <option value="">Todos</option>
              <option value="true">Sim</option>
              <option value="false">Nao</option>
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
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', padding: '1rem 0' }}>
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
                <span style={{ alignSelf: 'center' }}>{page} / {totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Proximo</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
