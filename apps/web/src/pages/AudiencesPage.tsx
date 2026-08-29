import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, ConfirmDialog, Input, Modal, Table } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface Audience {
  id: string;
  name: string;
  createdAt: string;
  total: number;
  eligible: number;
  excluded: number;
  invalidPhones: number;
  buyers: number;
  optOuts: number;
  [key: string]: unknown;
}
interface AudienceContact {
  id: string;
  name: string;
  phone: string | null;
  eligible: boolean;
  exclusion: string | null;
  consentSource: string | null;
  consentAt: string | null;
  [key: string]: unknown;
}

export function AudiencesPage() {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [selected, setSelected] = useState<Audience | null>(null);
  const [contacts, setContacts] = useState<AudienceContact[]>([]);
  const [editing, setEditing] = useState<Audience | null>(null);
  const [archiving, setArchiving] = useState<Audience | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/contact-lists`, { credentials: 'include' });
      if (!response.ok) throw new Error('Falha ao carregar os públicos');
      setAudiences(((await response.json()) as { audiences: Audience[] }).audiences);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar os públicos');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function openAudience(audience: Audience) {
    setSelected(audience);
    setContacts([]);
    const response = await fetch(`${API}/api/contact-lists/${audience.id}/contacts`, {
      credentials: 'include',
    });
    if (response.ok)
      setContacts(((await response.json()) as { contacts: AudienceContact[] }).contacts);
  }

  async function saveName() {
    if (!editing) return;
    setSaving(true);
    const response = await fetch(`${API}/api/contact-lists/${editing.id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setSaving(false);
    if (!response.ok) return setError('Não foi possível renomear o público');
    setEditing(null);
    await load();
  }

  async function archiveAudience() {
    if (!archiving) return;
    const response = await fetch(`${API}/api/contact-lists/${archiving.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) return setError('Não foi possível arquivar o público');
    setArchiving(null);
    await load();
  }

  const columns = [
    { key: 'name', header: 'Público' },
    { key: 'total', header: 'Contatos' },
    { key: 'eligible', header: 'Elegíveis' },
    { key: 'excluded', header: 'Excluídos' },
    {
      key: 'createdAt',
      header: 'Criado em',
      render: (audience: Audience) => new Date(audience.createdAt).toLocaleDateString('pt-BR'),
    },
    {
      key: 'actions',
      header: 'Ações',
      render: (audience: Audience) => (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="secondary" onClick={() => openAudience(audience)}>
            Ver contatos
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditing(audience);
              setName(audience.name);
            }}
          >
            Renomear
          </Button>
          <Button size="sm" variant="danger" onClick={() => setArchiving(audience)}>
            Arquivar
          </Button>
        </div>
      ),
    },
  ];
  const contactColumns = [
    {
      key: 'name',
      header: 'Nome',
      render: (contact: AudienceContact) => contact.name || '(sem nome)',
    },
    { key: 'phone', header: 'Telefone' },
    {
      key: 'eligible',
      header: 'Status',
      render: (contact: AudienceContact) => (
        <Badge variant={contact.eligible ? 'success' : 'warning'}>
          {contact.eligible ? 'Elegível' : contact.exclusion}
        </Badge>
      ),
    },
    {
      key: 'consentSource',
      header: 'Origem do consentimento',
      render: (contact: AudienceContact) => contact.consentSource || 'Não informada',
    },
  ];

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Públicos</h1>
          <p className="content-subtitle">Grupos independentes criados em cada importação de CSV</p>
        </div>
      </div>
      {error && (
        <Alert variant="danger" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}
      <div className="card">
        {loading ? (
          'Carregando...'
        ) : (
          <Table columns={columns} data={audiences} emptyMessage="Nenhum público importado" />
        )}
      </div>
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name ?? 'Contatos'}
      >
        <Table
          columns={contactColumns}
          data={contacts}
          emptyMessage="Nenhum contato neste público"
        />
      </Modal>
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Renomear público"
        footer={
          <Button loading={saving} onClick={saveName}>
            Salvar
          </Button>
        }
      >
        <Input
          label="Nome do público"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Modal>
      <ConfirmDialog
        open={Boolean(archiving)}
        title="Arquivar público"
        message={`O público “${archiving?.name ?? ''}” deixará de aparecer em novas campanhas. O histórico será preservado.`}
        confirmLabel="Arquivar"
        variant="danger"
        onConfirm={archiveAudience}
        onCancel={() => setArchiving(null)}
      />
    </div>
  );
}
