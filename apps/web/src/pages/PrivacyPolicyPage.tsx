const LAST_UPDATED = '11 de agosto de 2026';

const sectionStyle = {
  display: 'grid',
  gap: '0.75rem',
};

export function PrivacyPolicyPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '3rem 1.25rem',
        background: 'var(--bg-primary)',
      }}
    >
      <article
        style={{
          width: 'min(100%, 840px)',
          margin: '0 auto',
          padding: 'clamp(1.5rem, 4vw, 3rem)',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          display: 'grid',
          gap: '2rem',
        }}
      >
        <header style={{ display: 'grid', gap: '0.5rem' }}>
          <a href="/" className="text-accent font-bold text-2xl" aria-label="Meteórico CRM">
            Meteórico
          </a>
          <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', lineHeight: 1.2 }}>
            Política de Privacidade
          </h1>
          <p className="text-secondary">Última atualização: {LAST_UPDATED}</p>
        </header>

        <section style={sectionStyle}>
          <h2 className="text-xl">1. Sobre esta política</h2>
          <p className="text-secondary">
            Esta política descreve como o Meteórico CRM trata dados pessoais ao prestar serviços de
            relacionamento e atendimento por WhatsApp. O sistema é usado somente por pessoas
            autorizadas pela organização responsável pela conta empresarial conectada.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 className="text-xl">2. Dados tratados</h2>
          <p className="text-secondary">Conforme a interação realizada, o sistema pode tratar:</p>
          <ul
            className="text-secondary"
            style={{ listStyle: 'disc', paddingLeft: '1.5rem', display: 'grid', gap: '0.4rem' }}
          >
            <li>número de telefone, identificador do WhatsApp e nome de perfil;</li>
            <li>conteúdo, data, horário, direção e status das mensagens;</li>
            <li>preferências de comunicação, inclusive pedidos de não recebimento;</li>
            <li>dados de campanha e atendimento necessários para contextualizar a conversa;</li>
            <li>registros técnicos e de auditoria usados para segurança e diagnóstico.</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 className="text-xl">3. Finalidades</h2>
          <p className="text-secondary">
            Os dados são usados para receber e responder mensagens, identificar ou atualizar o
            contato, registrar o histórico do atendimento, classificar a conversa, respeitar
            preferências de comunicação, prevenir uso indevido e manter a operação segura do CRM.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 className="text-xl">4. Compartilhamento e operadores</h2>
          <p className="text-secondary">
            O tratamento pode envolver a Meta Platforms e seus serviços do WhatsApp, além de
            provedores de hospedagem, banco de dados e filas usados para operar o sistema. Os dados
            não são vendidos. O acesso é limitado ao necessário para as finalidades desta política
            e às obrigações legais aplicáveis.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 className="text-xl">5. Segurança e retenção</h2>
          <p className="text-secondary">
            São aplicados controles de acesso, segregação de ambientes, registros de auditoria e
            medidas técnicas compatíveis com o risco. Os dados são mantidos somente pelo período
            necessário ao atendimento, às obrigações legais e à defesa de direitos, e depois são
            eliminados ou anonimizados quando aplicável.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 className="text-xl">6. Direitos e exclusão de dados</h2>
          <p className="text-secondary">
            O titular pode solicitar confirmação do tratamento, acesso, correção, portabilidade,
            oposição ou exclusão, conforme a legislação aplicável. Também pode pedir a interrupção
            de mensagens a qualquer momento pelo próprio canal de WhatsApp.
          </p>
          <p className="text-secondary">
            Para solicitar exclusão ou exercer outros direitos, entre em contato com o responsável
            pela organização que iniciou o atendimento no WhatsApp e informe o número usado na
            conversa. A identidade poderá ser verificada antes do atendimento da solicitação.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 className="text-xl">7. Alterações</h2>
          <p className="text-secondary">
            Esta política pode ser atualizada para refletir mudanças legais, técnicas ou
            operacionais. A data da versão mais recente será sempre indicada no início da página.
          </p>
        </section>

        <footer
          className="text-secondary text-sm"
          style={{ paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}
        >
          Meteórico CRM — integração oficial com a Plataforma WhatsApp Business.
        </footer>
      </article>
    </main>
  );
}
