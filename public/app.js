const main = document.querySelector("main");
const originalMain = main.innerHTML;
const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();

const money = value => Number(value).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const icon = (symbol, cls="") => `<span class="ui-icon ${cls}" aria-hidden="true">${symbol}</span>`;
const requests = [
  {id:1,kind:"Energia elétrica",title:"Conta de energia",city:"Porto Velho, RO",amount:684.32,desc:"Duas faturas em atraso. A família busca manter o fornecimento de energia.",symbol:"ϟ",tone:"amber",status:"Em análise"},
  {id:2,kind:"Moradia",title:"Aluguel",city:"São Paulo, SP",amount:1200,desc:"Apoio para regularizar dois meses de aluguel.",symbol:"⌂",tone:"blue",status:"Em análise"},
  {id:3,kind:"Saúde",title:"Tratamento médico",city:"Curitiba, PR",amount:3850,desc:"Despesa hospitalar apresentada para avaliação.",symbol:"✚",tone:"rose",status:"Em análise"}
];

function shell(content, active="") {
  main.innerHTML = `
    <div class="app-shell">
      <aside class="app-sidebar">
        <a class="brand" href="#" data-screen="home"><span class="brand-mark">♥</span><span>Paga<span>Ai</span></span></a>
        <div class="sidebar-label">MENU PRINCIPAL</div>
        <button class="side-link ${active==="overview"?"active":""}" data-screen="overview">▦ <span>Visão geral</span></button>
        <button class="side-link ${active==="requests"?"active":""}" data-screen="requests">♡ <span>Pedidos de ajuda</span></button>
        <button class="side-link ${active==="donations"?"active":""}" data-screen="donations">↗ <span>Minhas doações</span></button>
        <button class="side-link" data-screen="profile">◉ <span>Meu perfil</span></button>
        <div class="sidebar-bottom"><div class="sidebar-help"> <b>Precisa de ajuda?</b><small>Nosso time está aqui para orientar você.</small></div><button class="side-link" data-screen="home">↩ <span>Voltar ao site</span></button></div>
      </aside>
      <section class="app-main">
        <header class="app-topbar"><button class="mobile-back" data-screen="home">←</button><div><small>ÁREA DO USUÁRIO</small><b>Olá! Que bom ter você aqui.</b></div><div class="avatar">PA</div></header>
        <div class="app-content">${content}</div>
      </section>
    </div>`;
}
function requestCards() {
 return requests.map(r=>`<article class="dashboard-request"><div class="dash-request-icon ${r.tone}">${r.symbol}</div><div class="dash-request-copy"><span class="status status-pending">${r.status}</span><h3>${r.title}</h3><p>${r.city} · ${r.desc}</p><b>${money(r.amount)}</b></div><button class="btn btn-green btn-small" data-contribute="${r.id}">Quero ajudar</button></article>`).join("");
}
function renderOverview() {
 shell(`
  <div class="welcome-row"><div><span class="eyebrow">SEU PAINEL PAGAai</span><h1>Visão geral</h1><p>Acompanhe suas contribuições e encontre pedidos que precisam de apoio.</p></div><button class="btn btn-primary" data-screen="requests">Encontrar pedidos <span>→</span></button></div>
  <div class="dashboard-grid">
   <article class="balance-card"><span>Carteira demonstrativa</span><h2>R$ 5.000,00</h2><p>Valor ilustrativo — não representa saldo real ou disponível para saque.</p><button class="btn btn-white" data-screen="donations">Ver minhas doações</button></article>
   <article class="metric-card"><span class="metric-symbol blue">♡</span><small>Contribuições realizadas</small><strong>08</strong><em>Exemplo demonstrativo</em></article>
   <article class="metric-card"><span class="metric-symbol green">✓</span><small>Histórias apoiadas</small><strong>05</strong><em>Exemplo demonstrativo</em></article>
  </div>
  <div class="content-heading"><div><h2>Pedidos que precisam de você</h2><p>Conheça solicitações em análise.</p></div><button class="text-button" data-screen="requests">Ver todos →</button></div>
  <div class="dashboard-list">${requestCards()}</div>
  <div class="notice-box">🔒 <div><b>Segurança em primeiro lugar</b><p>Antes de uma contribuição real, a plataforma exibirá a comprovação da dívida e o destino do pagamento. Pagamentos ainda não estão habilitados nesta versão.</p></div></div>
 `,"overview");
}
function renderRequests() {
 shell(`<div class="welcome-row"><div><span class="eyebrow">SOLIDARIEDADE EM AÇÃO</span><h1>Pedidos de ajuda</h1><p>Veja solicitações ilustrativas e entenda como a contribuição funcionará.</p></div></div>
 <div class="filter-row"><button class="filter-chip selected">Todas</button><button class="filter-chip">Energia</button><button class="filter-chip">Moradia</button><button class="filter-chip">Saúde</button></div>
 <div class="dashboard-list">${requestCards()}</div><p class="demo-note">Os pedidos desta demonstração não correspondem a beneficiários reais e não aceitam pagamentos.</p>`,"requests");
}
function renderDonations() {
 shell(`<div class="welcome-row"><div><span class="eyebrow">SEU HISTÓRICO</span><h1>Minhas doações</h1><p>Visualize o histórico de contribuições da sua conta.</p></div></div>
 <div class="empty-state surface"><div class="empty-symbol">♡</div><h2>Nenhuma doação registrada</h2><p>Quando o fluxo de pagamentos for ativado, suas contribuições confirmadas aparecerão aqui.</p><button class="btn btn-primary" data-screen="requests">Conhecer pedidos</button></div>`,"donations");
}
function renderProfile() {
 shell(`<div class="welcome-row"><div><span class="eyebrow">DADOS DA CONTA</span><h1>Meu perfil</h1><p>Área demonstrativa. O cadastro e a autenticação serão integrados em etapa própria.</p></div></div>
 <div class="surface profile-panel"><div class="profile-avatar">PA</div><div><h2>Visitante PagaAi</h2><p>Você está visualizando uma demonstração sem conta autenticada.</p><span class="status status-pending">Sessão demonstrativa</span></div></div>`,"profile");
}
function renderBeneficiary() {
 main.innerHTML = `<div class="form-page"><header class="form-page-head"><a class="brand" href="#" data-screen="home"><span class="brand-mark">♥</span><span>Paga<span>Ai</span></span></a><button class="btn btn-light" data-screen="home">Voltar ao início</button></header>
 <div class="debt-layout"><section class="surface debt-form-card"><span class="eyebrow">SOLICITAÇÃO DE APOIO</span><h1>Conte como podemos ajudar</h1><p>Preencha os dados iniciais da dívida. O envio não garante aprovação ou quitação.</p>
 <form id="full-debt-form" class="full-debt-form">
 <label>Nome completo<input class="field" name="applicantName" required maxlength="100" placeholder="Seu nome"></label>
 <div class="form-grid-2"><label>Cidade<input class="field" name="city" required placeholder="Sua cidade"></label><label>Estado<select class="field" name="state" required><option value="">UF</option>${["RO","AC","AM","AP","PA","TO","MT","MS","GO","DF","SP","RJ","MG","ES","PR","SC","RS","BA","SE","AL","PE","PB","RN","CE","PI","MA"].map(s=>`<option>${s}</option>`).join("")}</select></label></div>
 <label>Tipo de dívida<select class="field" name="category" required><option value="">Selecione uma categoria</option><option>Energia Elétrica</option><option>Água</option><option>Aluguel</option><option>Tratamento Médico</option><option>Alimentação</option><option>Educação</option><option>Outro</option></select></label>
 <label>Valor total da dívida<input class="field" name="amount" type="number" min="1" max="1000000" step="0.01" required placeholder="R$ 0,00"></label>
 <label>Descreva sua situação<textarea class="field" name="description" rows="4" maxlength="1200" placeholder="Explique brevemente por que precisa de apoio."></textarea></label>
 <div class="upload-placeholder">☁ <div><b>Comprovante da dívida</b><small>O envio seguro de documentos será habilitado após a implementação do armazenamento privado.</small></div><span class="status status-pending">Em breve</span></div>
 <button class="btn btn-primary btn-full" type="submit">Enviar para análise →</button><p class="privacy-note">🔒 Seus dados devem ser utilizados apenas para análise da solicitação, conforme a política de privacidade e a LGPD.</p><div id="form-feedback" role="status"></div>
 </form></section><aside class="surface security-card"><div class="security-icon">♢</div><h2>Seus dados merecem proteção</h2><p>As informações pessoais e documentos de comprovação exigem acesso restrito, armazenamento seguro e tratamento transparente.</p><ul><li>Uso limitado à análise da solicitação</li><li>Documentos não devem ficar públicos</li><li>Você deve poder solicitar acesso e correção</li></ul></aside></div></div>`;
}
function renderAdmin() {
 main.innerHTML = `<div class="admin-layout"><aside class="admin-sidebar"><a class="admin-brand" href="#" data-screen="home">♥ PagaAi <small>ADMINISTRAÇÃO</small></a><nav><button class="admin-nav active">▦ Dashboard</button><button class="admin-nav">♡ Pedidos de ajuda</button><button class="admin-nav">↗ Doações</button><button class="admin-nav">▣ Pagamentos</button><button class="admin-nav">♙ Usuários</button><button class="admin-nav">▤ Relatórios</button><button class="admin-nav">⚙ Configurações</button></nav><button class="admin-exit" data-screen="home">↩ Voltar ao site</button></aside>
 <section class="admin-main"><header class="admin-header"><div><small>PAINEL ADMINISTRATIVO</small><h1>Dashboard</h1></div><span class="status status-pending">Dados demonstrativos</span></header>
 <div class="admin-metrics"><article><small>Pessoas ajudadas</small><strong>—</strong><em>Aguardando dados reais</em></article><article><small>Dívidas quitadas</small><strong>—</strong><em>Aguardando confirmação</em></article><article><small>Doações realizadas</small><strong>—</strong><em>Aguardando pagamentos</em></article><article><small>Avaliação média</small><strong>—</strong><em>Sem avaliações</em></article></div>
 <div class="admin-panels"><article class="surface admin-chart"><h2>Impacto das doações</h2><p>O gráfico será alimentado por transações confirmadas.</p><div class="chart-placeholder"><span>Sem dados reais para exibir</span><svg viewBox="0 0 600 150" role="img" aria-label="Área reservada para gráfico de impacto"><path d="M10 120H590M10 80H590M10 40H590" stroke="#e5ebf4" stroke-dasharray="4 5" fill="none"/></svg></div></article><article class="surface admin-actions"><h2>Últimas ações</h2><div class="empty-admin">Nenhuma ação registrada.</div></article></div>
 <div class="notice-box">🔐 <div><b>Área administrativa em construção</b><p>Esta tela é apenas uma prévia visual. O painel real precisa de login, controle de permissões, auditoria e endpoints protegidos no servidor antes de ser disponibilizado.</p></div></div></section></div>`;
}
function showSuccess() {
 main.innerHTML = `<div class="success-page"><div class="success-card surface"><div class="success-check">✓</div><span class="eyebrow">PAGAAI AGRADECE</span><h1>Obrigado por querer ajudar!</h1><p>Você chegou à etapa de confirmação. A contribuição financeira ainda não está habilitada nesta versão demonstrativa.</p><div class="success-summary"><span>Próximo passo</span><b>Integração segura com o meio de pagamento</b><small>Nenhum valor foi cobrado.</small></div><button class="btn btn-primary" data-screen="home">Voltar ao início</button></div></div>`;
}
function goHome() { main.innerHTML = originalMain; const y=document.getElementById("year"); if(y)y.textContent=new Date().getFullYear(); window.scrollTo(0,0); }
document.addEventListener("click", event => {
 const screen = event.target.closest("[data-screen]");
 if (screen) {
   event.preventDefault();
   const value=screen.dataset.screen;
   if(value==="home") goHome();
   else if(value==="beneficiary") renderBeneficiary();
   else if(value==="admin") renderAdmin();
   else if(value==="requests") renderRequests();
   else if(value==="donations") renderDonations();
   else if(value==="profile") renderProfile();
   else renderOverview();
   window.scrollTo(0,0);
 }
 const role=event.target.closest("[data-role]");
 if(role) {
   if(role.dataset.role==="beneficiary") renderBeneficiary();
   else renderOverview();
   window.scrollTo(0,0);
 }
 const help=event.target.closest("[data-help],[data-contribute]");
 if(help) { showSuccess(); window.scrollTo(0,0); }
 const adminShortcut=event.target.closest("[data-admin-preview]");
 if(adminShortcut) renderAdmin();
});
document.addEventListener("submit", async event=>{
 if(event.target.id!=="full-debt-form") return;
 event.preventDefault();
 const formEl=event.target, feedback=document.getElementById("form-feedback");
 const data=Object.fromEntries(new FormData(formEl).entries());
 data.state=String(data.state||"").toUpperCase(); data.amount=Number(data.amount);
 feedback.textContent="Enviando solicitação...";
 try {
   const response=await fetch("/api/debts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
   const result=await response.json();
   if(!response.ok) throw new Error(result.error||"Não foi possível enviar.");
   feedback.className="success-feedback"; feedback.textContent="Solicitação registrada. Ela ainda precisará passar por análise e verificação documental.";
   formEl.reset();
 } catch(error) {
   feedback.className="error-feedback";
   feedback.textContent=error.message.includes("Failed to fetch")?"Não foi possível conectar à API. Verifique a conexão com o servidor e o MongoDB.":error.message;
 }
});
