import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCheck,
  Clock3,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import { Alert, Badge, Button } from '../components/index.js';

const API = import.meta.env.VITE_API_URL ?? '';

interface ConversationMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  messageType: string;
  deliveryStatus: string;
  sentAt: string;
}

interface ConversationSummary {
  id: string;
  status: string;
  startedAt: string;
  contact: {
    id: string;
    name: string;
    phone: string;
    optedOut: boolean;
  };
  campaign: { id: string; name: string } | null;
  lastMessage: ConversationMessage | null;
  messageCount: number;
  awaitingReply: boolean;
  unreadCount: number;
  unread: boolean;
  lastInboundAt: string | null;
  serviceWindowOpen: boolean;
  serviceWindowExpiresAt: string | null;
}

interface ConversationDetail extends Omit<
  ConversationSummary,
  'lastMessage' | 'messageCount' | 'awaitingReply'
> {
  messages: ConversationMessage[];
  assignee: { id: string; name: string } | null;
}

interface ConversationListResponse {
  conversations: ConversationSummary[];
  summary: { total: number; awaitingReply: number; unread: number };
}

export function ConversationsPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [summary, setSummary] = useState({ total: 0, awaitingReply: 0, unread: 0 });
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState<ConversationDetail | null>(null);
  const [search, setSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingReplyKeyRef = useRef('');

  const loadConversations = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '200' });
        if (search.trim()) params.set('search', search.trim());
        const response = await fetch(`${API}/api/messaging/conversations?${params}`, {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Não foi possível carregar as conversas.');
        const data = (await response.json()) as ConversationListResponse;
        setConversations(data.conversations);
        setSummary(data.summary);
        setSelectedId((current) =>
          current && data.conversations.some((conversation) => conversation.id === current)
            ? current
            : (data.conversations[0]?.id ?? ''),
        );
        setError('');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Erro ao carregar conversas.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [search],
  );

  const loadConversation = useCallback(async (conversationId: string, silent = false) => {
    if (!conversationId) {
      setSelected(null);
      return;
    }
    try {
      const response = await fetch(`${API}/api/messaging/conversations/${conversationId}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Não foi possível abrir a conversa.');
      setSelected((await response.json()) as ConversationDetail);
      setError('');
    } catch (cause) {
      if (!silent) {
        setError(cause instanceof Error ? cause.message : 'Erro ao abrir conversa.');
      }
    }
  }, []);

  const openConversation = useCallback(async (conversationId: string) => {
    setSelectedId(conversationId);
    const wasUnread = conversations.find(
      (conversation) => conversation.id === conversationId,
    )?.unread;
    if (!wasUnread) return;

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unread: false, unreadCount: 0 }
          : conversation,
      ),
    );
    setSummary((current) => ({ ...current, unread: Math.max(0, current.unread - 1) }));

    try {
      const response = await fetch(`${API}/api/messaging/conversations/${conversationId}/read`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Não foi possível marcar a conversa como lida.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao marcar conversa como lida.');
      void loadConversations(true);
    }
  }, [conversations, loadConversations]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadConversations(), 250);
    const poller = window.setInterval(() => void loadConversations(true), 7000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poller);
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    void loadConversation(selectedId);
    const poller = window.setInterval(() => void loadConversation(selectedId, true), 4000);
    return () => window.clearInterval(poller);
  }, [loadConversation, selectedId]);

  useEffect(() => {
    const end = messagesEndRef.current;
    if (typeof end?.scrollIntoView === 'function') {
      end.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [selected?.messages.length, selectedId]);

  async function sendReply() {
    const content = replyText.trim();
    if (!selected || !content) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const idempotencyKey = pendingReplyKeyRef.current
        || `manual:web:${selected.id}:${crypto.randomUUID()}`;
      pendingReplyKeyRef.current = idempotencyKey;
      const response = await fetch(`${API}/api/messaging/conversations/${selected.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ content, messageType: 'text', idempotencyKey }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Não foi possível enviar a resposta.');
      pendingReplyKeyRef.current = '';
      setReplyText('');
      setNotice('Resposta enviada para processamento.');
      window.setTimeout(() => {
        void loadConversation(selected.id, true);
        void loadConversations(true);
      }, 1200);
    } catch (cause) {
      setError(
        cause instanceof DOMException && cause.name === 'TimeoutError'
          ? 'O envio demorou demais. Tente novamente; a proteção contra duplicidade está ativa.'
          : cause instanceof Error
            ? cause.message
            : 'Erro ao enviar resposta.',
      );
    } finally {
      setSending(false);
    }
  }

  function handleReplyKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendReply();
    }
  }

  const replyBlockedReason = selected?.contact.optedOut
    ? 'Este contato pediu para não receber mensagens.'
    : selected && !selected.serviceWindowOpen
      ? 'A janela de atendimento terminou. Para iniciar outra conversa, use um template aprovado em Campanhas.'
      : '';

  return (
    <div>
      <div className="content-header inbox-page-header">
        <div>
          <h1 className="content-title">Conversas</h1>
          <p className="content-subtitle">
            Leia e responda às mensagens recebidas no WhatsApp oficial
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            void loadConversations();
            if (selectedId) void loadConversation(selectedId);
          }}
        >
          <RefreshCw size={15} /> Atualizar
        </Button>
      </div>

      {error && (
        <Alert variant="danger" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" onDismiss={() => setNotice('')}>
          {notice}
        </Alert>
      )}

      <div className="inbox-summary" aria-label="Resumo das conversas">
        <div>
          <span>Conversas</span>
          <strong>{summary.total}</strong>
        </div>
        <div>
          <span>Aguardando resposta</span>
          <strong>{summary.awaitingReply}</strong>
        </div>
        <div>
          <span>Não lidas</span>
          <strong>{summary.unread}</strong>
        </div>
      </div>

      <section className="inbox-shell" aria-label="Caixa de entrada do WhatsApp">
        <aside className="inbox-sidebar">
          <label className="inbox-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Buscar por telefone ou nome</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar telefone ou nome"
            />
          </label>

          <div className="inbox-conversation-list">
            {loading ? (
              <div className="inbox-placeholder">Carregando conversas...</div>
            ) : conversations.length === 0 ? (
              <div className="inbox-placeholder">
                <MessageCircle size={28} />
                <strong>Nenhuma conversa encontrada</strong>
                <span>As respostas recebidas pelo webhook aparecerão aqui.</span>
              </div>
            ) : (
              conversations.map((conversation) => (
                <button
                  type="button"
                  className={`inbox-conversation-item ${selectedId === conversation.id ? 'active' : ''}`}
                  key={conversation.id}
                  onClick={() => void openConversation(conversation.id)}
                >
                  <span className="inbox-conversation-avatar">
                    {conversation.contact.name.trim().charAt(0).toUpperCase() || '#'}
                  </span>
                  <span className="inbox-conversation-copy">
                    <span className="inbox-conversation-line">
                      <strong>{contactLabel(conversation.contact)}</strong>
                      <time>{formatCompactDate(conversation.lastMessage?.sentAt)}</time>
                    </span>
                    <span className="inbox-conversation-phone">
                      {formatPhone(conversation.contact.phone)}
                    </span>
                    <span className="inbox-conversation-line">
                      <span className="inbox-conversation-preview">
                        {conversation.lastMessage?.direction === 'outbound' ? 'Você: ' : ''}
                        {conversation.lastMessage?.content ?? 'Sem mensagens'}
                      </span>
                      {conversation.unread && (
                        <i
                          aria-label={`${conversation.unreadCount} mensagem(ns) não lida(s)`}
                        />
                      )}
                    </span>
                    {conversation.campaign && <small>{conversation.campaign.name}</small>}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="inbox-thread">
          {!selected ? (
            <div className="inbox-thread-empty">
              <MessageCircle size={34} />
              <strong>Selecione uma conversa</strong>
              <span>O histórico completo será exibido aqui.</span>
            </div>
          ) : (
            <>
              <header className="inbox-thread-header">
                <div>
                  <strong>{contactLabel(selected.contact)}</strong>
                  <a
                    className="inbox-whatsapp-link"
                    href={whatsappContactUrl(selected.contact.phone)}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir contato no WhatsApp"
                  >
                    {formatPhone(selected.contact.phone)}
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                </div>
                <div className="inbox-thread-badges">
                  {selected.campaign && <Badge variant="neutral">{selected.campaign.name}</Badge>}
                  {selected.contact.optedOut ? (
                    <Badge variant="danger">Opt-out</Badge>
                  ) : selected.serviceWindowOpen ? (
                    <Badge variant="success">Atendimento aberto</Badge>
                  ) : (
                    <Badge variant="warning">Janela encerrada</Badge>
                  )}
                </div>
              </header>

              <div className="inbox-messages" aria-live="polite">
                {selected.messages.map((message) => (
                  <article
                    className={`inbox-message ${message.direction === 'outbound' ? 'outbound' : 'inbound'}`}
                    key={message.id}
                  >
                    <p>{message.content}</p>
                    <footer>
                      <time>{formatMessageDate(message.sentAt)}</time>
                      {message.direction === 'outbound' && (
                        <span title={deliveryLabel(message.deliveryStatus)}>
                          <CheckCheck size={13} /> {deliveryLabel(message.deliveryStatus)}
                        </span>
                      )}
                    </footer>
                  </article>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <footer className="inbox-composer">
                {replyBlockedReason ? (
                  <div className="inbox-window-warning">
                    <Clock3 size={16} />
                    <span>{replyBlockedReason}</span>
                  </div>
                ) : (
                  <div className="inbox-window-open">
                    <Clock3 size={14} />
                    Você pode responder livremente até{' '}
                    {formatWindowTime(selected.serviceWindowExpiresAt)}.
                  </div>
                )}
                <div className="inbox-compose-row">
                  <textarea
                    className="textarea"
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    onKeyDown={handleReplyKeyDown}
                    disabled={Boolean(replyBlockedReason) || sending}
                    maxLength={4096}
                    rows={2}
                    placeholder="Digite sua resposta... (Enter envia; Shift + Enter quebra a linha)"
                    aria-label="Resposta"
                  />
                  <Button
                    onClick={() => void sendReply()}
                    disabled={Boolean(replyBlockedReason) || !replyText.trim()}
                    loading={sending}
                    aria-label="Enviar resposta"
                  >
                    <Send size={17} />
                    <span>Enviar</span>
                  </Button>
                </div>
              </footer>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function contactLabel(contact: { name: string; phone: string }) {
  return contact.name.trim() || formatPhone(contact.phone);
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return phone || 'Contato sem telefone';
}

function whatsappContactUrl(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

function formatCompactDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatMessageDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatWindowTime(value: string | null) {
  if (!value) return 'o fim da janela de atendimento';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function deliveryLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'Processando',
    sent: 'Enviada',
    delivered: 'Entregue',
    read: 'Lida',
    failed: 'Falhou',
  };
  return labels[status] ?? status;
}
