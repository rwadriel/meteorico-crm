import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Input, Modal, Table } from '../components/index.js';
import { usePermission } from '../hooks/usePermission.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface TemplateVersion {
  id: string;
  version: number;
  content: string;
  variables: string[] | null;
  isCurrent: boolean;
  createdAt: string;
}

interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  versions: TemplateVersion[];
  [key: string]: unknown;
}

interface TemplateForm {
  name: string;
  category: string;
  content: string;
}

const EMPTY_FORM: TemplateForm = { name: '', category: '', content: '' };

async function responseError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
  return body?.message ?? body?.error ?? fallback;
}

export function TemplatesPage() {
  const canRead = usePermission('messages', 'read');
  const canCreate = usePermission('messages', 'create');
  const canUpdate = usePermission('messages', 'update');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchTemplates = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/templates`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(await responseError(response, 'Falha ao carregar templates'));
      }
      const data = await response.json();
      setTemplates(Array.isArray(data) ? data : data.templates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  function openCreate() {
    setSelected(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalMode('create');
  }

  function openEdit(template: MessageTemplate) {
    const current = template.versions.find((version) => version.isCurrent)
      ?? template.versions[0];
    setSelected(template);
    setForm({
      name: template.name,
      category: template.category,
      content: current?.content ?? '',
    });
    setFormError('');
    setModalMode('edit');
  }

  function closeModal() {
    setModalMode(null);
    setSelected(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  async function saveTemplate() {
    const name = form.name.trim();
    const content = form.content.trim();
    if ((modalMode === 'create' && !name) || !content) {
      setFormError('Preencha os campos obrigatorios.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const editing = modalMode === 'edit' && selected;
      const response = await fetch(
        editing ? `${API}/api/templates/${selected.id}` : `${API}/api/templates`,
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(editing
            ? { content }
            : { name, category: form.category.trim(), content }),
        },
      );

      if (!response.ok) {
        throw new Error(await responseError(
          response,
          editing ? 'Falha ao atualizar template' : 'Falha ao criar template',
        ));
      }

      closeModal();
      await fetchTemplates();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar template');
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <div>
        <div className="content-header">
          <div>
            <h1 className="content-title">Templates</h1>
            <p className="content-subtitle">Mensagens reutilizaveis do CRM</p>
          </div>
        </div>
        <Alert variant="danger">Voce nao tem permissao para visualizar templates.</Alert>
      </div>
    );
  }

  const columns = [
    { key: 'name', header: 'Nome' },
    {
      key: 'category',
      header: 'Categoria',
      render: (template: MessageTemplate) => template.category || '-',
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (template: MessageTemplate) => (
        <Badge variant={template.isActive ? 'success' : 'neutral'}>
          {template.isActive ? 'Ativo' : 'Inativo'}
        </Badge>
      ),
    },
    {
      key: 'version',
      header: 'Versao',
      render: (template: MessageTemplate) => {
        const current = template.versions.find((version) => version.isCurrent)
          ?? template.versions[0];
        return current ? `v${current.version}` : '-';
      },
    },
    {
      key: 'updatedAt',
      header: 'Atualizado em',
      render: (template: MessageTemplate) => new Date(template.updatedAt).toLocaleDateString('pt-BR'),
    },
    {
      key: 'actions',
      header: 'Acoes',
      render: (template: MessageTemplate) => canUpdate ? (
        <Button variant="secondary" size="sm" onClick={() => openEdit(template)}>
          Editar
        </Button>
      ) : '-',
    },
  ];

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Templates</h1>
          <p className="content-subtitle">Mensagens reutilizaveis e versionadas do CRM</p>
        </div>
        {canCreate && <Button onClick={openCreate}>Novo Template</Button>}
      </div>

      {error && <Alert variant="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <div className="card">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
        ) : (
          <Table columns={columns} data={templates} emptyMessage="Nenhum template criado" />
        )}
      </div>

      <Modal
        open={modalMode !== null}
        onClose={closeModal}
        title={modalMode === 'edit' ? 'Editar Template' : 'Novo Template'}
        footer={(
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancelar</Button>
            <Button loading={saving} onClick={saveTemplate}>Salvar</Button>
          </div>
        )}
      >
        {formError && <Alert variant="danger">{formError}</Alert>}
        {modalMode === 'create' && (
          <>
            <Input
              label="Nome"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
            <Input
              label="Categoria"
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            />
          </>
        )}
        {modalMode === 'edit' && selected && (
          <Alert variant="info">
            A alteracao cria uma nova versao de <strong>{selected.name}</strong>.
          </Alert>
        )}
        <div className="form-group">
          <label htmlFor="template-content">Conteudo</label>
          <textarea
            id="template-content"
            className="input"
            rows={8}
            value={form.content}
            onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
            required
          />
        </div>
      </Modal>
    </div>
  );
}
