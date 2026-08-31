import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, ConfirmDialog, Input, Modal } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

type Category = 'MARKETING' | 'UTILITY';
type SuggestedCategory = Category | 'AUTHENTICATION';

interface ManagedTemplate {
  id: string;
  name: string;
  label: string;
  language: string;
  requestedCategory: string;
  metaCategory: string | null;
  status: string;
  rejectionReason: string | null;
  qualityRating: string | null;
  body: string;
  footer: string;
  variableCount: number;
  exampleValues: string[];
  headerFormat: string;
  hasHeaderImage: boolean;
  submittedAt: string | null;
  syncedAt: string | null;
}

interface CategoryAnalysis {
  suggestedCategory: SuggestedCategory;
  confidence: 'high' | 'medium';
  reasons: string[];
}

const STATUS_LABELS: Record<string, string> = {
  APPROVED: 'Aprovado',
  PENDING: 'Em análise',
  REJECTED: 'Rejeitado',
  PAUSED: 'Pausado',
  DISABLED: 'Desativado',
  DRAFT: 'Rascunho',
};
const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
  PAUSED: 'warning',
  DISABLED: 'danger',
  DRAFT: 'neutral',
};
const CATEGORY_LABELS: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utility',
  AUTHENTICATION: 'Autenticação',
};

export function TemplatesPage() {
  const [templates, setTemplates] = useState<ManagedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<Category>('MARKETING');
  const [body, setBody] = useState('');
  const [footer, setFooter] = useState('');
  const [headerFormat, setHeaderFormat] = useState<'NONE' | 'IMAGE'>('NONE');
  const [headerImage, setHeaderImage] = useState<File | null>(null);
  const [examples, setExamples] = useState<string[]>([]);
  const [allowCategoryChange, setAllowCategoryChange] = useState(true);
  const [analysis, setAnalysis] = useState<CategoryAnalysis | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<ManagedTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const variableCount = useMemo(() => countVariables(body), [body]);
  const preview = useMemo(() => renderPreview(body, examples), [body, examples]);
  const headerPreviewUrl = useMemo(
    () => (headerImage ? URL.createObjectURL(headerImage) : ''),
    [headerImage],
  );

  useEffect(() => {
    return () => {
      if (headerPreviewUrl) URL.revokeObjectURL(headerPreviewUrl);
    };
  }, [headerPreviewUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/templates/meta`, { credentials: 'include' });
      if (!response.ok) throw new Error(await responseMessage(response));
      const data = (await response.json()) as { templates: ManagedTemplate[] };
      setTemplates(data.templates ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar os templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setExamples((current) =>
      Array.from({ length: variableCount }, (_, index) => current[index] ?? ''),
    );
    if (!body.trim()) {
      setAnalysis(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API}/api/templates/meta/classify`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        if (response.ok) setAnalysis((await response.json()) as CategoryAnalysis);
      } catch {
        // A recomendação é auxiliar e não deve bloquear a edição.
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [body, variableCount]);

  async function syncTemplates() {
    setSyncing(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`${API}/api/templates/meta/sync`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const result = (await response.json()) as { total: number };
      setSuccess(`${result.total} template(s) sincronizado(s) com a Meta.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao sincronizar com a Meta');
    } finally {
      setSyncing(false);
    }
  }

  async function submitTemplate() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const form = new FormData();
      form.set('name', name);
      form.set('label', label);
      form.set('language', 'pt_BR');
      form.set('category', category);
      form.set('body', body);
      form.set('footer', footer);
      form.set('exampleValues', JSON.stringify(examples));
      form.set('allowCategoryChange', String(allowCategoryChange));
      form.set('headerFormat', headerFormat);
      if (headerImage) form.set('headerImage', headerImage);
      const response = await fetch(`${API}/api/templates/meta`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setShowCreate(false);
      resetForm();
      setSuccess('Template enviado à Meta. O status será atualizado pela sincronização.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao enviar o template');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate() {
    if (!templateToDelete) return;
    setDeleting(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/templates/meta/${templateToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setSuccess('Template excluído na Meta e removido do CRM.');
      setTemplateToDelete(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao excluir o template');
    } finally {
      setDeleting(false);
    }
  }

  function resetForm() {
    setName('');
    setLabel('');
    setCategory('MARKETING');
    setBody('');
    setFooter('');
    setHeaderFormat('NONE');
    setHeaderImage(null);
    setExamples([]);
    setAllowCategoryChange(true);
    setAnalysis(null);
  }

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Templates</h1>
          <p className="content-subtitle">Crie, envie e acompanhe templates oficiais do WhatsApp</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" loading={syncing} onClick={syncTemplates}>
            Sincronizar com a Meta
          </Button>
          <Button onClick={() => setShowCreate(true)}>+ Novo template</Button>
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
      <Alert variant="info">
        O CRM recomenda uma categoria pelo texto, mas a classificação final é da Meta. Textos
        promocionais, mistos ou sem vínculo claro com uma solicitação anterior normalmente são
        Marketing.
      </Alert>

      {loading ? (
        <div className="card" style={{ marginTop: '1rem' }}>
          Carregando...
        </div>
      ) : templates.length === 0 ? (
        <div className="card" style={{ marginTop: '1rem', textAlign: 'center' }}>
          <p>Nenhum template sincronizado.</p>
          <p className="text-sm text-secondary" style={{ marginTop: '0.5rem' }}>
            Use “Sincronizar com a Meta” para importar os modelos já aprovados.
          </p>
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ marginTop: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
        >
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onDelete={() => setTemplateToDelete(template)}
            />
          ))}
        </div>
      )}

      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          resetForm();
        }}
        title="Novo template do WhatsApp"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreate(false);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              loading={saving}
              disabled={
                !name ||
                !body ||
                examples.some((value) => !value) ||
                (headerFormat === 'IMAGE' && !headerImage)
              }
              onClick={submitTemplate}
            >
              Enviar para aprovação
            </Button>
          </>
        }
      >
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
        >
          <Input
            label="Nome técnico"
            value={name}
            onChange={(event) => setName(normalizeName(event.target.value))}
            placeholder="ex.: lembrete_evento"
          />
          <Input
            label="Nome para exibição no CRM"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Ex.: Lembrete do evento"
          />
        </div>
        <div className="form-group">
          <label className="label" htmlFor="template-category">
            Categoria solicitada
          </label>
          <select
            id="template-category"
            className="select"
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
          >
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utility</option>
          </select>
        </div>
        <div className="form-group">
          <label className="label" htmlFor="template-header-format">
            Cabeçalho
          </label>
          <select
            id="template-header-format"
            className="select"
            value={headerFormat}
            onChange={(event) => {
              const value = event.target.value as 'NONE' | 'IMAGE';
              setHeaderFormat(value);
              if (value === 'NONE') setHeaderImage(null);
            }}
          >
            <option value="NONE">Sem imagem</option>
            <option value="IMAGE">Imagem</option>
          </select>
        </div>
        {headerFormat === 'IMAGE' && (
          <div className="form-group">
            <label className="label" htmlFor="template-header-image">
              Imagem JPG ou PNG
            </label>
            <input
              id="template-header-image"
              className="input"
              type="file"
              accept="image/jpeg,image/png"
              onChange={(event) => setHeaderImage(event.target.files?.[0] ?? null)}
            />
            <span className="text-xs text-secondary">Máximo de 5 MB.</span>
          </div>
        )}
        <div className="form-group">
          <label className="label" htmlFor="template-body">
            Corpo da mensagem
          </label>
          <textarea
            id="template-body"
            className="textarea"
            style={{ minHeight: '11rem' }}
            maxLength={1024}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={'Use {{1}}, {{2}} para valores variáveis.'}
          />
          <span className="text-xs text-secondary">
            {body.length}/1024 caracteres · {variableCount} variável(is)
          </span>
        </div>
        {examples.map((value, index) => (
          <Input
            key={index}
            label={`Exemplo para {{${index + 1}}}`}
            value={value}
            onChange={(event) =>
              setExamples((current) =>
                current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
              )
            }
            placeholder="Valor realista exigido pela Meta"
          />
        ))}
        <Input
          label="Rodapé opcional"
          value={footer}
          maxLength={60}
          onChange={(event) => setFooter(event.target.value)}
          placeholder="Até 60 caracteres; sem variáveis"
        />
        {analysis && <CategoryAnalysisPanel analysis={analysis} requested={category} />}
        <label className="flex items-start gap-2 text-sm" style={{ marginTop: '1rem' }}>
          <input
            type="checkbox"
            checked={allowCategoryChange}
            onChange={(event) => setAllowCategoryChange(event.target.checked)}
          />
          <span>
            Permitir que a Meta altere a categoria automaticamente. Se desmarcado e houver
            divergência, o template pode ser rejeitado.
          </span>
        </label>
        <div
          className="card"
          style={{ marginTop: '1rem', whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)' }}
        >
          <p className="text-xs text-secondary" style={{ marginBottom: '0.6rem' }}>
            PRÉVIA
          </p>
          {headerPreviewUrl && (
            <img
              src={headerPreviewUrl}
              alt="Prévia do cabeçalho"
              style={{ width: '100%', maxHeight: '220px', objectFit: 'cover', borderRadius: '12px', marginBottom: '0.8rem' }}
            />
          )}
          {preview || 'A mensagem aparecerá aqui.'}
          {footer && (
            <p className="text-xs text-secondary" style={{ marginTop: '0.75rem' }}>
              {footer}
            </p>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={Boolean(templateToDelete)}
        title="Excluir template"
        message={`Excluir “${templateToDelete?.label ?? ''}” também o remove da Meta. Campanhas antigas continuam no histórico.`}
        confirmLabel="Excluir definitivamente"
        variant="danger"
        loading={deleting}
        onConfirm={deleteTemplate}
        onCancel={() => setTemplateToDelete(null)}
      />
    </div>
  );
}

function TemplateCard({ template, onDelete }: { template: ManagedTemplate; onDelete: () => void }) {
  const finalCategory = template.metaCategory || template.requestedCategory;
  const reclassified = Boolean(
    template.metaCategory && template.metaCategory !== template.requestedCategory,
  );
  return (
    <article className="card">
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1rem' }}>{template.label}</h2>
          <p className="text-xs text-secondary">
            {template.name} · {template.language}
          </p>
        </div>
        <Badge variant={STATUS_VARIANTS[template.status] ?? 'neutral'}>
          {STATUS_LABELS[template.status] ?? template.status}
        </Badge>
      </div>
      {template.hasHeaderImage && (
        <img
          src={`${API}/api/templates/meta/${template.id}/header`}
          alt={`Cabeçalho de ${template.label}`}
          style={{
            width: '100%',
            maxHeight: '220px',
            objectFit: 'cover',
            borderRadius: '12px',
            marginBottom: '0.75rem',
          }}
        />
      )}
      <p style={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>{template.body}</p>
      {template.footer && (
        <p className="text-xs text-secondary" style={{ marginTop: '0.75rem' }}>
          {template.footer}
        </p>
      )}
      <div className="flex flex-wrap gap-2" style={{ marginTop: '1rem' }}>
        <Badge variant={finalCategory === 'MARKETING' ? 'warning' : 'info'}>
          {CATEGORY_LABELS[finalCategory] ?? finalCategory}
        </Badge>
        {template.qualityRating && (
          <Badge variant={template.qualityRating === 'GREEN' ? 'success' : 'warning'}>
            Qualidade {template.qualityRating}
          </Badge>
        )}
      </div>
      {reclassified && (
        <Alert variant="warning">
          A Meta alterou a categoria solicitada de{' '}
          {CATEGORY_LABELS[template.requestedCategory] ?? template.requestedCategory} para{' '}
          {CATEGORY_LABELS[finalCategory] ?? finalCategory}.
        </Alert>
      )}
      {template.rejectionReason && template.rejectionReason !== 'NONE' && (
        <Alert variant="danger">Motivo: {template.rejectionReason}</Alert>
      )}
      <div className="flex justify-end" style={{ marginTop: '1rem' }}>
        <Button variant="danger" size="sm" onClick={onDelete}>
          Excluir
        </Button>
      </div>
    </article>
  );
}

function CategoryAnalysisPanel({
  analysis,
  requested,
}: {
  analysis: CategoryAnalysis;
  requested: Category;
}) {
  const mismatch = analysis.suggestedCategory !== requested;
  return (
    <div className="card" style={{ marginTop: '1rem', background: 'var(--bg-secondary)' }}>
      <div className="flex items-center justify-between gap-2">
        <strong>Categoria sugerida: {CATEGORY_LABELS[analysis.suggestedCategory]}</strong>
        <Badge variant={mismatch ? 'warning' : 'success'}>
          {analysis.confidence === 'high' ? 'Confiança alta' : 'Confiança média'}
        </Badge>
      </div>
      <ul style={{ listStyle: 'disc', paddingLeft: '1.2rem', marginTop: '0.6rem' }}>
        {analysis.reasons.map((reason) => (
          <li className="text-sm text-secondary" key={reason}>
            {reason}
          </li>
        ))}
      </ul>
      {mismatch && (
        <p className="text-sm text-warning" style={{ marginTop: '0.6rem' }}>
          A categoria escolhida diverge da análise; a Meta pode reclassificar ou rejeitar.
        </p>
      )}
    </div>
  );
}

function countVariables(content: string): number {
  const indexes = [...content.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  return indexes.length === 0 ? 0 : Math.max(...indexes);
}
function renderPreview(content: string, examples: string[]): string {
  return content.replace(
    /\{\{(\d+)\}\}/g,
    (token, rawIndex: string) => examples[Number(rawIndex) - 1] || token,
  );
}
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
async function responseMessage(response: Response): Promise<string> {
  const responseBody = (await response.json().catch(() => null)) as { message?: string } | null;
  return responseBody?.message ?? 'A operação falhou';
}
