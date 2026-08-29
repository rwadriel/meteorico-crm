import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Table, Badge, Alert, ConfirmDialog, Input } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

const TYPE_LABELS: Record<string, string> = {
  contacts: 'Contatos',
  participations: 'Participacoes',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  previewing: 'Previa',
  processing: 'Processando',
  done: 'Concluido',
  failed: 'Falhou',
  rolled_back: 'Revertido',
};

const STATUS_VARIANTS: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'neutral',
  previewing: 'info',
  processing: 'warning',
  done: 'success',
  failed: 'danger',
  rolled_back: 'neutral',
};

interface ImportRecord {
  id: string;
  type: string;
  status: string;
  filename: string;
  audienceName: string | null;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  createdAt: string;
  [key: string]: unknown;
}

interface PreviewResult {
  import: ImportRecord;
  validCount: number;
  errorCount: number;
  errors: { row: number; field: string; message: string }[];
  preview: { rowNumber: number; data: Record<string, unknown> }[];
}

export function ImportsPage() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [step, setStep] = useState<'list' | 'upload' | 'preview' | 'processing'>('list');
  const [importType, setImportType] = useState<'contacts' | 'participations'>('contacts');
  const [file, setFile] = useState<File | null>(null);
  const [audienceName, setAudienceName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [rollbackId, setRollbackId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchImports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/imports?limit=50`, { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao carregar importacoes');
      const data = await res.json();
      setImports(data.imports);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchImports(); }, [fetchImports]);

  function resetWizard() {
    setStep('list');
    setFile(null);
    setPreview(null);
    setImportType('contacts');
    setAudienceName('');
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', importType);
      if (importType === 'contacts') formData.append('audienceName', audienceName.trim());

      const res = await fetch(`${API}/api/imports/preview`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Falha no upload' }));
        throw new Error(err.message);
      }
      const data: PreviewResult = await res.json();
      setPreview(data);
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro no upload');
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setConfirming(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/imports/${preview.import.id}/confirm`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Falha ao confirmar' }));
        throw new Error(err.message);
      }
      setSuccess(`Importacao concluida com sucesso!`);
      resetWizard();
      fetchImports();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao confirmar');
    } finally {
      setConfirming(false);
    }
  }

  async function handleRollback() {
    if (!rollbackId) return;
    try {
      const res = await fetch(`${API}/api/imports/${rollbackId}/rollback`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Falha ao reverter' }));
        throw new Error(err.message);
      }
      setSuccess('Importacao revertida com sucesso');
      fetchImports();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao reverter');
    } finally {
      setRollbackId(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.csv')) setFile(f);
  }

  const historyColumns = [
    { key: 'filename', header: 'Arquivo' },
    {
      key: 'audienceName',
      header: 'Grupo',
      render: (i: ImportRecord) => i.audienceName || '—',
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (i: ImportRecord) => TYPE_LABELS[i.type] ?? i.type,
    },
    {
      key: 'status',
      header: 'Status',
      render: (i: ImportRecord) => (
        <Badge variant={STATUS_VARIANTS[i.status] ?? 'neutral'}>
          {STATUS_LABELS[i.status] ?? i.status}
        </Badge>
      ),
    },
    { key: 'totalRows', header: 'Total' },
    { key: 'processedRows', header: 'Processados' },
    { key: 'errorRows', header: 'Erros' },
    {
      key: 'createdAt',
      header: 'Data',
      render: (i: ImportRecord) => new Date(i.createdAt).toLocaleDateString('pt-BR'),
    },
    {
      key: 'actions',
      header: 'Acoes',
      render: (i: ImportRecord) => (
        i.status === 'done' ? (
          <Button size="sm" variant="danger" onClick={() => setRollbackId(i.id)}>
            Reverter
          </Button>
        ) : null
      ),
    },
  ];

  return (
    <div>
      <div className="content-header">
        <div>
          <h1 className="content-title">Importar CSV</h1>
          <p className="content-subtitle">Importe contatos, telefones e status de compra com prévia antes de salvar</p>
        </div>
        {step === 'list' && <Button onClick={() => setStep('upload')}>Nova importação</Button>}
        {step !== 'list' && <Button variant="secondary" onClick={resetWizard}>Voltar</Button>}
      </div>

      {error && <Alert variant="danger" onDismiss={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" onDismiss={() => setSuccess('')}>{success}</Alert>}

      {step === 'upload' && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Upload de CSV</h3>

          <div className="form-group">
            <label>Tipo de importação</label>
            <select className="input" value={importType} onChange={(e) => setImportType(e.target.value as 'contacts' | 'participations')}>
              <option value="contacts">Contatos (carga inicial)</option>
              <option value="participations">Participacoes por campanha</option>
            </select>
          </div>

          {importType === 'contacts' && (
            <Input
              label="Nome do grupo de contatos"
              value={audienceName}
              onChange={(event) => setAudienceName(event.target.value)}
              placeholder="Ex.: Grupo 2 ou Alunos de agosto"
            />
          )}

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: '0.5rem',
              padding: '3rem',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.2s',
              marginBottom: '1rem',
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }}
            />
            {file ? (
              <p>{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
            ) : (
              <p style={{ color: 'var(--text-secondary)' }}>
                Arraste um arquivo CSV aqui ou clique para selecionar
              </p>
            )}
          </div>

          <Button
            onClick={handleUpload}
            disabled={!file || (importType === 'contacts' && !audienceName.trim())}
            loading={uploading}
          >
            Enviar e Visualizar
          </Button>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Previa da Importacao</h3>

          {preview.import.audienceName && (
            <p style={{ marginBottom: '1rem' }}>
              Grupo: <strong>{preview.import.audienceName}</strong>
            </p>
          )}

          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Validos: </span>
              <strong style={{ color: 'var(--success)' }}>{preview.validCount}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Erros: </span>
              <strong style={{ color: 'var(--danger)' }}>{preview.errorCount}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Total: </span>
              <strong>{preview.validCount + preview.errorCount}</strong>
            </div>
          </div>

          {preview.errors.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>Erros encontrados</h4>
              <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                {preview.errors.map((err, i) => (
                  <div key={i} style={{ fontSize: '0.875rem', color: 'var(--danger)', marginBottom: '0.25rem' }}>
                    Linha {err.row}: {err.field} - {err.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.preview.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>Amostra (primeiras {preview.preview.length} linhas)</h4>
              <div style={{ overflow: 'auto', maxHeight: '300px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      {Object.keys(preview.preview[0].data).filter(k => !k.startsWith('_')).map((k) => (
                        <th key={k}>{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        {Object.entries(row.data).filter(([k]) => !k.startsWith('_')).map(([k, v]) => (
                          <td key={k}>{String(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={resetWizard}>Cancelar</Button>
            <Button onClick={handleConfirm} loading={confirming} disabled={preview.validCount === 0}>
              Confirmar Importacao ({preview.validCount} registros)
            </Button>
          </div>
        </div>
      )}

      {step === 'list' && (
        <div className="card">
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>
          ) : (
            <Table columns={historyColumns} data={imports} emptyMessage="Nenhuma importacao realizada" />
          )}
        </div>
      )}

      <ConfirmDialog
        open={rollbackId !== null}
        onCancel={() => setRollbackId(null)}
        onConfirm={handleRollback}
        title="Reverter importacao"
        message="Esta acao ira desfazer os registros criados por esta importacao. Deseja continuar?"
        confirmLabel="Reverter"
        variant="danger"
      />
    </div>
  );
}
