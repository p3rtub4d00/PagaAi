(() => {
const main=document.querySelector("main"); if(!main)return;
const originalMain=main.innerHTML; let currentUser=null; const adminPath=/^\/admin\/?$/i.test(location.pathname);
let deferredInstallPrompt = null;
let phoneVerificationPoll = null;
let pwaRegistration = null;
let adminNotificationPoll = null;

function base64ToUint8Array(base64) {
 const padding = "=".repeat((4 - base64.length % 4) % 4);
 const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
 return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
}
async function setupPwa() {
 if (!("serviceWorker" in navigator)) return;
 try { pwaRegistration = await navigator.serviceWorker.register("/sw.js", { scope: "/" }); }
 catch (error) { console.warn("PWA/service worker:", error.message); }
}
function hideInstallPopup() {
 document.querySelectorAll("[data-install-popup]").forEach(popup => popup.hidden = true);
}
window.addEventListener("beforeinstallprompt", event => {
 event.preventDefault();
 deferredInstallPrompt = event;
 if (sessionStorage.getItem("pagaai-install-dismissed") !== "1") {
   document.querySelectorAll("[data-install-popup]").forEach(popup => popup.hidden = false);
 }
});
window.addEventListener("appinstalled", () => {
 deferredInstallPrompt = null;
 hideInstallPopup();
 sessionStorage.removeItem("pagaai-install-dismissed");
});
async function installPwa() {
 if (!deferredInstallPrompt) {
   alert("No celular, abra o menu do navegador e escolha “Adicionar à tela inicial” ou “Instalar app”.");
   return;
 }
 const promptEvent = deferredInstallPrompt;
 deferredInstallPrompt = null;
 await promptEvent.prompt();
 await promptEvent.userChoice;
 hideInstallPopup();
}
async function sharePagaAi() {
 const shareData = { title: "PagaAi", text: "Conheça o PagaAi: uma rede de apoio para ajudar pessoas a superar dívidas essenciais.", url: location.origin + "/" };
 const whatsappUrl = "https://wa.me/?text=" + encodeURIComponent(shareData.text + " " + shareData.url);
 window.open(whatsappUrl, "_blank", "noopener,noreferrer");
}
async function setupAdminPushStatus() {
 const button = document.querySelector("[data-admin-push]");
 if (!button || !currentUser || currentUser.role !== "admin") return;
 if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
   button.textContent = "Notificações não suportadas";
   button.disabled = true;
   return;
 }
 try {
   const permission = Notification.permission;
   const registration = pwaRegistration || await navigator.serviceWorker.ready;
   const subscription = await registration.pushManager.getSubscription();
   if (permission === "granted" && subscription) {
     button.textContent = "Notificações ativadas neste celular";
     button.classList.add("pa-push-enabled");
     return;
   }
   button.textContent = permission === "denied" ? "Notificações bloqueadas" : "Ativar notificações neste celular";
 } catch (error) { button.textContent = "Ativar notificações neste celular"; }
}
async function enableAdminPush() {
 const button = document.querySelector("[data-admin-push]");
 if (!button) return;
 button.disabled = true;
 button.textContent = "Ativando notificações...";
 try {
   const key = await api("/api/push/public-key");
   if (!("Notification" in window) || !("PushManager" in window)) throw Error("Seu navegador não oferece notificações push.");
   const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
   if (permission !== "granted") throw Error("A permissão para notificações não foi concedida.");
   const registration = pwaRegistration || await navigator.serviceWorker.ready;
   let subscription = await registration.pushManager.getSubscription();
   if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8Array(key.publicKey) });
   await api("/api/push/admin-subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON() }) });
   button.textContent = "Notificações ativadas neste celular";
   button.classList.add("pa-push-enabled");
   alert("Pronto. Este celular receberá um aviso quando um beneficiário solicitar a confirmação do telefone.");
 } catch (error) {
   button.textContent = "Ativar notificações neste celular";
   alert(error.message);
 } finally { button.disabled = false; }
}
const topbar=document.querySelector(".topbar");
const nav=document.querySelector(".topbar nav");

const states="AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const categories=["Energia Elétrica","Água","Aluguel","Tratamento Médico","Alimentação","Educação","Outro"];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const status=s=>({pending_review:"Aguardando análise",needs_more_info:"Precisa de complemento",approved:"Recebendo contribuições",goal_reached:"Meta alcançada",awaiting_payment:"Aguardando pagamento",rejected:"Não aprovado",paid:"Dívida quitada"}[s]||s);
async function api(url,opts){const r=await fetch(url,Object.assign({credentials:"same-origin"},opts||{}));const j=(r.headers.get("content-type")||"").includes("application/json")?await r.json():null;if(!r.ok)throw Error(j&&j.error||"Não foi possível concluir.");return j;}
function setAppView(active){document.body.classList.toggle("pa-app-mode",!!active);if(topbar)topbar.hidden=!!active;}
function updateLandingActions(){
 const enter=topbar?.querySelector('[data-screen="overview"]');
 const help=topbar?.querySelector('[data-role="beneficiary"]');
 if(enter)enter.textContent=currentUser?"Minha conta":"Entrar";
 if(help)help.textContent=currentUser?"Minhas solicitações":"Criar conta";
}
function auth(mode,admin){
 setAppView(true);
 const reg=mode==="register"&&!admin;
 let h='<div class="pa-auth-page"><a class="brand" href="/" data-home><span class="brand-mark" aria-hidden="true">P</span><span>Paga<span>Ai</span></span></a><section class="pa-auth-card"><span class="eyebrow">'+(admin?"ACESSO RESTRITO":"ÁREA SEGURA DO PAGAAI")+'</span><h1>'+(admin?"Acesso administrativo":reg?"Crie sua conta":"Acesse sua conta")+'</h1><p>'+(admin?"Entre com suas credenciais administrativas.":"Seus dados serão usados para proteger e acompanhar sua solicitação.")+'</p>';
 if(!admin)h+='<div class="pa-tabs"><button class="'+(reg?"active":"")+'" data-auth-mode="register">Criar conta</button><button class="'+(!reg?"active":"")+'" data-auth-mode="login">Entrar</button></div>';
 h+='<form id="pa-auth-form" class="pa-form">';
 if(reg)h+='<label>Nome completo<input name="fullName" required minlength="5" maxlength="120" autocomplete="name"></label><label>CPF<input name="cpf" required inputmode="numeric" maxlength="14" placeholder="000.000.000-00"></label><label>Telefone com DDD<input name="phone" required inputmode="tel" maxlength="16" placeholder="(69) 99999-9999"></label><label class="pa-consent"><input type="checkbox" name="termsAccepted" value="true" required> Li e aceito os <a href="/termos.html" target="_blank" rel="noopener">Termos de Uso</a> e o <a href="/privacidade.html" target="_blank" rel="noopener">Aviso de Privacidade</a>, inclusive o tratamento dos dados e documentos para análise.</label><div class="pa-two"><label>Cidade<input name="city" required maxlength="80"></label><label>UF<select name="state" required><option value="">UF</option>'+states.map(s=>'<option>'+s+'</option>').join("")+'</select></label></div>';
 if(!reg)h+='<label>CPF<input name="cpf" required inputmode="numeric" maxlength="14" placeholder="Seu CPF"></label>';h+='<label>Senha<input name="password" type="password" required minlength="'+(reg?10:1)+'" autocomplete="'+(reg?"new-password":"current-password")+'" placeholder="'+(reg?"Mínimo de 10 caracteres":"Sua senha")+'"></label><button class="pa-btn pa-primary pa-full" type="submit">'+(reg?"Criar conta e continuar":"Entrar")+'</button><div id="pa-feedback" role="status"></div></form>';
 if(reg)h+='<p class="pa-privacy">O CPF é validado matematicamente, mas isso não confirma a identidade na Receita Federal. O telefone precisa de confirmação antes da aprovação final.</p>';
 main.innerHTML=h+'</section></div>';
}
function frame(title,body){setAppView(true);main.innerHTML='<div class="pa-app"><header class="pa-head"><a class="brand" href="/" data-home><span class="brand-mark" aria-hidden="true">P</span><span>Paga<span>Ai</span></span></a><div class="pa-head-right">'+(currentUser?'<button class="pa-btn pa-light" data-dashboard>Minha conta</button>':"")+'<button class="pa-btn pa-light" data-home>Início</button><span>'+esc(currentUser&&currentUser.fullName||"PagaAi")+'</span>'+(currentUser?'<button class="pa-btn pa-light" data-logout>Sair</button>':"")+'</div></header><div class="pa-wrap"><div class="pa-page-title"><span class="eyebrow">PAGAAI · '+esc(title.toUpperCase())+'</span><h1>'+esc(title)+'</h1></div>'+body+'</div></div>';}
function closeDebtModal(){const modal=document.getElementById("pa-debt-modal");if(modal)modal.remove();document.body.classList.remove("pa-debt-modal-open");}
function debtForm(){
 if(!currentUser?.phoneVerified){alert("Confirme seu telefone antes de cadastrar uma dívida.");return;}
 if(document.getElementById("pa-debt-modal"))return;
 document.body.insertAdjacentHTML("beforeend",'<div class="pa-debt-modal-backdrop" id="pa-debt-modal" data-close-debt-backdrop><section class="pa-debt-modal" role="dialog" aria-modal="true" aria-labelledby="pa-debt-modal-title"><button type="button" class="pa-debt-modal-close" data-close-debt aria-label="Fechar formulário">×</button><span class="eyebrow">PAGAAI · NOVA SOLICITAÇÃO</span><h2 id="pa-debt-modal-title">Conte como podemos ajudar</h2><p class="pa-debt-modal-intro">Preencha os dados da dívida e anexe um comprovante para nossa equipe analisar.</p><form id="pa-debt-form" class="pa-form" enctype="multipart/form-data"><label>Tipo de dívida<select name="category" required><option value="">Selecione</option>'+categories.map(c=>'<option>'+c+'</option>').join("")+'</select></label><label>Credor ou empresa (opcional)<input name="creditor" maxlength="120" placeholder="Ex.: concessionária, escola, clínica"></label><div class="pa-two"><label>Valor total (R$)<input name="amount" type="number" min="1" max="1000000" step="0.01" required></label><label>Vencimento (se houver)<input name="dueDate" type="date"></label></div><label>Explique sua situação<textarea name="description" rows="4" maxlength="1200" placeholder="Descreva brevemente sua situação..."></textarea></label><label class="pa-upload">Comprovante obrigatório<input type="file" name="document" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required><small>PDF, JPG ou PNG · até 5 MB. Envie fatura, boleto ou documento emitido pelo credor.</small></label><div class="pa-alert">O documento será privado e ficará acessível apenas à equipe autorizada para conferência.</div><button class="pa-btn pa-primary pa-full" type="submit">Enviar para análise</button><div id="pa-feedback" role="status"></div></form></section></div>');
 document.body.classList.add("pa-debt-modal-open");
 const first=document.querySelector("#pa-debt-modal select");if(first)first.focus();
}
async function myRequests(){
 frame("Minhas solicitações",'<section class="pa-panel"><div class="pa-panel-head"><div><h2>Acompanhe seus pedidos</h2><p>Suas campanhas ficam organizadas por etapa, sem misturar pedidos em andamento e dívidas quitadas.</p></div>'+(currentUser?.phoneVerified?'<button class="pa-btn pa-primary" data-new-request>Novo pedido</button>':'<span class="pa-status needs_more_info">Confirme o celular para cadastrar</span>')+'</div><div id="pa-my-list">Carregando...</div></section>');
 try{
  const items=await api("/api/my/debts"),el=document.getElementById("pa-my-list");
  const render=x=>'<article class="pa-request-row pa-my-request"><div><span class="pa-status '+esc(x.status)+'">'+esc(status(x.status))+'</span><h3>'+esc(x.category)+'</h3><small>Enviado em '+new Date(x.createdAt).toLocaleDateString("pt-BR")+'</small>'+((["approved","goal_reached","awaiting_payment","paid"].includes(x.status))?'<div class="pa-progress-block"><div class="pa-progress-label"><b>'+money(x.raisedAmount)+' arrecadados</b><span>Meta: '+money(x.amount)+'</span></div><div class="pa-progress-track"><i style="width:'+Math.min(100,Math.round((x.raisedAmount||0)/x.amount*100))+'%"></i></div><small>Faltam '+money(x.remainingAmount)+'</small></div>':"")+(x.status==="goal_reached"?'<form class="pa-complement-form" data-updated-bill="'+esc(x.id)+'" enctype="multipart/form-data"><b>Meta atingida! Envie o boleto atualizado para a equipe pagar a dívida.</b><label>Boleto atualizado (PDF, JPG ou PNG) <input type="file" name="document" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required></label><button class="pa-btn pa-primary" type="submit">Enviar boleto atualizado</button></form>':"")+(x.status==="awaiting_payment"?'<p class="pa-admin-note">Boleto atualizado recebido. A equipe está conferindo os dados para realizar o pagamento.</p>':"")+(x.status==="paid"&&x.hasPublicProof?'<p><a href="/api/public/debts/'+esc(x.id)+'/payment-proof" target="_blank" rel="noopener">Ver comprovante público da quitação</a></p><form class="pa-testimonial-form" data-testimonial-form="'+esc(x.id)+'"><b>Conte como essa ajuda fez diferença</b><textarea name="message" rows="3" minlength="8" maxlength="600" required placeholder="Seu agradecimento (8 a 600 caracteres)"></textarea><label class="pa-anon-option"><input type="checkbox" name="anonymous" value="true"> Publicar meu nome como anônimo</label><button class="pa-btn pa-green" type="submit">Enviar agradecimento</button><small>Seu texto será revisado antes de aparecer no mural.</small></form>':"")+(x.adminNote?'<p class="pa-admin-note">Orientação: '+esc(x.adminNote)+'</p>':"")+(x.status==="needs_more_info"?'<form class="pa-complement-form" data-complement-form="'+esc(x.id)+'" enctype="multipart/form-data"><label>Novo comprovante <input type="file" name="document" accept=".pdf,.jpg,.jpeg,.png" required></label><button class="pa-btn pa-primary" type="submit">Enviar complemento</button></form>':"")+'</div><strong>'+money(x.amount)+'</strong></article>';
  const groups=[
   {id:"my-active",title:"Campanhas ativas",desc:"Pedidos aprovados que continuam recebendo contribuições.",items:items.filter(x=>x.status==="approved")},
   {id:"my-processing",title:"Em processo de quitação",desc:"Meta alcançada ou boleto em conferência pela equipe.",items:items.filter(x=>["goal_reached","awaiting_payment"].includes(x.status))},
   {id:"my-finished",title:"Campanhas finalizadas",desc:"Dívidas quitadas e comprovantes publicados.",items:items.filter(x=>x.status==="paid")},
   {id:"my-review",title:"Análise e outras solicitações",desc:"Pedidos aguardando análise, complemento ou com decisão administrativa.",items:items.filter(x=>["pending_review","needs_more_info","rejected"].includes(x.status))}
  ];
  el.innerHTML=items.length?groups.map(g=>'<section class="pa-campaign-group pa-my-campaign-group"><div class="pa-campaign-heading"><div><h3>'+g.title+'</h3><p>'+g.desc+'</p></div><span class="pa-campaign-count">'+g.items.length+'</span></div>'+(g.items.length?'<div class="pa-request-list">'+g.items.map(render).join("")+'</div>':'<div class="pa-empty pa-compact-empty">Nenhuma solicitação nesta etapa.</div>')+'</section>').join(""):'<div class="pa-empty"><h3>Nenhuma solicitação cadastrada</h3>'+(currentUser?.phoneVerified?'<button class="pa-btn pa-primary" data-new-request>Cadastrar primeira dívida</button>':'<p>Confirme seu telefone para liberar o cadastro de uma dívida.</p>')+'</div>';
 }catch(e){const el=document.getElementById("pa-my-list");if(el)el.textContent=e.message;}
}
function dashboard(){
 if(phoneVerificationPoll){clearInterval(phoneVerificationPoll);phoneVerificationPoll=null;}
 const verification=currentUser.phoneVerified
  ? '<div class="pa-phone-verified"><span class="pa-status approved">Telefone confirmado</span><p>Seu número foi confirmado. A equipe pode continuar a análise da sua solicitação.</p></div>'
  : currentUser.phoneVerificationStatus==="code_sent"
   ? '<p>A equipe enviou um código para o WhatsApp cadastrado: <b>'+esc(currentUser.phone)+'</b>. O código expira em 10 minutos.</p><form class="pa-form pa-phone-code-form" id="pa-phone-code-form"><label>Código de 6 números<input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required placeholder="000000"></label><button class="pa-btn pa-primary pa-full" type="submit">Confirmar telefone</button><div id="pa-phone-feedback" role="status"></div></form>'
   : currentUser.phoneVerificationStatus==="requested"
    ? '<span class="pa-status needs_more_info">Solicitação enviada à equipe</span><p>Estamos aguardando a equipe gerar e enviar seu código pelo WhatsApp para <b>'+esc(currentUser.phone)+'</b>. Assim que o código for gerado, o campo para informá-lo aparecerá automaticamente aqui.</p><button class="pa-btn pa-light" data-phone-refresh type="button">Verificar se o código chegou</button><small class="pa-phone-refresh-note" aria-live="polite">Esta tela verifica o status automaticamente.</small>'
    : '<p>Para proteger sua conta, precisamos confirmar que você tem acesso ao número informado no cadastro: <b>'+esc(currentUser.phone)+'</b>.</p><button class="pa-btn pa-primary" data-phone-request>Solicitar código pelo WhatsApp</button>';
 frame("Área do beneficiário",'<div class="pa-dashboard-cards"><article class="pa-panel"><span class="eyebrow">SUA CONTA</span><h2>Olá, '+esc((currentUser.fullName||"").split(" ")[0])+'</h2><p>Cadastre uma dívida, anexe o comprovante e acompanhe a análise.</p>'+ (currentUser.phoneVerified?'<button class="pa-btn pa-primary" data-new-request>Cadastrar uma dívida</button>':'<div class="pa-debt-locked"><span class="pa-status needs_more_info">Cadastro bloqueado</span><p>O cadastro de dívidas será liberado assim que seu celular for confirmado.</p></div>')+'</article><article class="pa-panel pa-phone-verification"><span class="eyebrow">SEGURANÇA DA CONTA</span><h2>Confirmar telefone</h2><p>Telefone cadastrado: <b>'+esc(currentUser.phone)+'</b></p>'+verification+'</article></div><section class="pa-panel"><div class="pa-panel-head"><div><h2>Seus pedidos</h2><p>Consulte status e eventuais orientações.</p></div><button class="pa-btn pa-light" data-my-requests>Ver solicitações</button></div></section>');
 if(!currentUser.phoneVerified && currentUser.phoneVerificationStatus==="requested"){
  phoneVerificationPoll=setInterval(async()=>{
   if(!currentUser || currentUser.role!=="beneficiary" || !document.querySelector(".pa-phone-verification")){clearInterval(phoneVerificationPoll);phoneVerificationPoll=null;return;}
   try{
    const me=await api("/api/auth/me");
    if(me.user && (me.user.phoneVerificationStatus!==currentUser.phoneVerificationStatus || me.user.phoneVerified!==currentUser.phoneVerified)){
     currentUser=me.user;
     dashboard();
    }
   }catch(error){console.warn("Atualização da confirmação do telefone:",error.message);}
  },5000);
 }
}
function setupAdminMobileNavigation(){
 const app=document.querySelector(".pa-app");
 const dashboard=document.querySelector(".pa-admin-dashboard");
 if(!app||!dashboard||document.querySelector(".pa-admin-mobile-nav"))return;
 document.body.classList.add("pa-master-mode");
 const targets=[["pa-admin-stats","Visão","▦"],["pa-admin-phone-verifications","Telefone","☎"],["pa-admin-pending","Pedidos","☷"],["pa-admin-active","Campanhas","♡"],["pa-admin-users","Pessoas","♙"]];
 targets.forEach(([id])=>{const node=document.getElementById(id);const section=node?.closest("section");if(section)section.id="mobile-"+id;else if(node){const dashboard=node.closest(".pa-admin-dashboard");if(dashboard)dashboard.id="mobile-"+id;}});
 const nav=document.createElement("nav");nav.className="pa-admin-mobile-nav";nav.setAttribute("aria-label","Navegação do painel Master");
 nav.innerHTML=targets.map(([id,label,icon],i)=>'<a href="#mobile-'+id+'" '+(i===0?'class="active"':'')+'><span aria-hidden="true">'+icon+'</span><small>'+label+'</small></a>').join("");
 app.appendChild(nav);
 nav.addEventListener("click",event=>{const link=event.target.closest("a");if(!link)return;nav.querySelectorAll("a").forEach(item=>item.classList.toggle("active",item===link));});
}
async function admin(){
 if(adminNotificationPoll){clearInterval(adminNotificationPoll);adminNotificationPoll=null;}
 frame("Central de gestão",'<div class="pa-admin-dashboard"><div class="pa-admin-welcome"><div><span class="eyebrow">PAGAAI · ADMINISTRAÇÃO</span><h2>Visão geral da rede</h2><p>Acompanhe cadastros, Pix recebidos, apoio à plataforma, boletos e quitações.</p></div><div class="pa-admin-actions"><div class="pa-notification-wrap"><button class="pa-btn pa-light pa-notification-bell" data-notifications-toggle type="button" aria-expanded="false" aria-controls="pa-notifications-panel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span>Sino</span><b id="pa-notification-count" hidden>0</b></button><div class="pa-notification-panel" id="pa-notifications-panel" hidden><div class="pa-notification-panel-head"><strong>Notificações</strong><button type="button" data-notifications-read-all>Marcar todas como lidas</button></div><div id="pa-notification-list"><p class="pa-notification-empty">Carregando notificações...</p></div></div></div><button class="pa-btn pa-light" data-admin-push>Ativar notificações neste celular</button><button class="pa-btn pa-light" data-admin-refresh>↻ Atualizar dados</button></div></div><div id="pa-admin-stats" class="pa-admin-stats"><div class="pa-stat-card">Carregando indicadores...</div></div><section class="pa-panel"><div class="pa-panel-head"><div><h2>Confirmação de telefones</h2><p>Solicitações dos beneficiários. Gere o código e envie manualmente pelo WhatsApp cadastrado.</p></div><span id="pa-phone-verification-count" class="pa-status">Carregando</span></div><div id="pa-admin-phone-verifications">Carregando solicitações...</div></section><section class="pa-panel"><div class="pa-panel-head"><div><h2>Fila de análise e pagamento</h2><p>Pedidos pendentes, metas atingidas e boletos aguardando pagamento.</p></div><span id="pa-pending-count" class="pa-status">Carregando</span></div><div id="pa-admin-pending">Carregando solicitações...</div></section><section class="pa-panel"><div class="pa-panel-head"><div><h2>Campanhas ativas</h2><p>Pedidos aprovados e publicados que ainda recebem contribuições.</p></div><span id="pa-admin-active-count" class="pa-status">Carregando</span></div><div id="pa-admin-active">Carregando campanhas...</div></section><section class="pa-panel"><div class="pa-panel-head"><div><h2>Campanhas finalizadas</h2><p>Dívidas quitadas, com histórico e comprovante de quitação.</p></div><span id="pa-admin-finished-count" class="pa-status">Carregando</span></div><div id="pa-admin-finished">Carregando campanhas...</div></section><section class="pa-panel"><div class="pa-panel-head"><div><h2>Solicitações recusadas</h2><p>Histórico de pedidos que não foram aprovados.</p></div><span id="pa-admin-history-count" class="pa-status">Carregando</span></div><div id="pa-admin-history">Carregando histórico...</div></section><section class="pa-panel"><div class="pa-panel-head"><div><h2>Moderação do mural de agradecimentos</h2><p>Mensagens só aparecem publicamente depois da aprovação da equipe.</p></div><span id="pa-comments-count" class="pa-status">Carregando</span></div><div id="pa-admin-comments">Carregando mensagens...</div></section><section class="pa-panel"><div class="pa-panel-head"><div><h2>Configuração do custo operacional</h2><p>Defina o valor cobrado por Pix para cobrir a tarifa da conta Asaas. Confira a tarifa atual no próprio Asaas.</p></div><span class="pa-status">CONFIGURAÇÃO</span></div><form id="pa-payment-settings-form" class="pa-contribute-form"><label>Custo operacional por Pix (R$)<input name="asaasPixProcessingFee" type="number" min="0" max="100" step="0.01" required value="1.99"></label><small>Informe o valor exato da tarifa da sua conta. R$ 0,00 desativa o repasse. O valor será exibido ao doador antes de gerar o Pix e não entra na arrecadação da campanha.</small><button class="pa-btn pa-primary" type="submit">Salvar custo operacional</button><div id="pa-payment-settings-feedback" role="status"></div></form></section><section class="pa-panel"><div class="pa-panel-head"><div><h2>Contribuições registradas</h2><p>Registro de cobranças Pix e pagamentos confirmados pelo Asaas.</p></div><span class="pa-status">PIX · ASAAS</span></div><div id="pa-admin-contributions">Carregando contribuições...</div></section><section class="pa-panel"><div class="pa-panel-head"><div><h2>Apoio voluntário à PagaAi</h2><p>Valores separados das campanhas e contabilizados somente após confirmação do Asaas.</p></div></div><div class="pa-table-wrap" id="pa-admin-supports">Carregando apoios...</div></section><section class="pa-panel"><div class="pa-panel-head"><div><h2>Pessoas cadastradas</h2><p>Dados pessoais visíveis exclusivamente para a administração.</p></div><span id="pa-users-count" class="pa-status">Carregando</span></div><div class="pa-table-wrap" id="pa-admin-users">Carregando cadastros...</div></section><section class="pa-panel pa-reset-panel"><div><span class="pa-reset-kicker">AÇÃO IRREVERSÍVEL</span><h2>Zerar todos os dados do sistema</h2><p>Apaga cadastros de beneficiários, pedidos, documentos, boletos atualizados, comprovantes de quitação, contribuições, apoios voluntários e mensagens do mural. O administrador e as configurações do sistema serão preservados.</p><ul><li>Os dados apagados não poderão ser recuperados pelo painel.</li><li>Esta ação não altera as variáveis de ambiente nem a conexão do banco.</li><li>Use somente quando quiser iniciar uma nova fase de testes ou operação.</li></ul><button class="pa-btn pa-danger" data-reset-system>Apagar todos os cadastros e pedidos</button></div></section></div>');

 setupAdminMobileNavigation();
 setupAdminPushStatus();
 loadAdminNotifications();
 adminNotificationPoll=setInterval(loadAdminNotifications,15000);
 try{
  const results=await Promise.allSettled([api("/api/admin/overview"),api("/api/admin/requests"),api("/api/admin/users"),api("/api/admin/contributions"),api("/api/admin/comments"),api("/api/admin/platform-support"),api("/api/admin/phone-verifications"),api("/api/admin/payment-settings")]);
  const failed=[];
  const readResult=(index,fallback,target)=>{const result=results[index];if(result.status==="fulfilled")return result.value;failed.push({target,message:result.reason?.message||"Falha ao consultar esta área."});return fallback;};
  const stats=readResult(0,{users:0,pending:0,approved:0,peopleHelped:0,amountHelped:0,paidRequests:0,receivedAmount:0,processingFeesReceived:0,platformSupportAmount:0},"pa-admin-stats");
  const requests=readResult(1,[],"pa-admin-pending");
  const users=readResult(2,[],"pa-admin-users");
  const contributions=readResult(3,[],"pa-admin-contributions");
  const comments=readResult(4,[],"pa-admin-comments");
  const supports=readResult(5,[],"pa-admin-supports");
  const phoneVerifications=readResult(6,[],"pa-admin-phone-verifications");
  const paymentSettings=readResult(7,{asaasPixProcessingFee:1.99},"pa-payment-settings-feedback");
  const feeInput=document.querySelector("#pa-payment-settings-form [name=asaasPixProcessingFee]");if(feeInput)feeInput.value=Number(paymentSettings.asaasPixProcessingFee||0).toFixed(2);
  document.getElementById("pa-admin-stats").innerHTML=[["Pessoas cadastradas",stats.users,"Cadastros de beneficiários"],["Pedidos pendentes",stats.pending,"Aguardando análise"],["Pedidos aprovados",stats.approved,"Liberados para divulgação"],["Pessoas ajudadas",stats.peopleHelped,"Com quitação confirmada"],["Valor confirmado",money(stats.amountHelped),"Dívidas marcadas como quitadas"],["Quitações",stats.paidRequests,"Solicitações concluídas"],["Arrecadação recebida",money(stats.receivedAmount),"Pix de campanhas confirmados pelo Asaas"],["Custos operacionais recebidos",money(stats.processingFeesReceived),"Valores separados para cobrir a tarifa Pix"],["Apoio voluntário à PagaAi",money(stats.platformSupportAmount),"Valores recebidos para manutenção da plataforma"]].map(x=>'<article class="pa-stat-card"><span>'+x[0]+'</span><strong>'+x[1]+'</strong><small>'+x[2]+'</small></article>').join("");
  document.getElementById("pa-phone-verification-count").textContent=phoneVerifications.length+" solicitações";
  document.getElementById("pa-admin-phone-verifications").innerHTML=phoneVerifications.length?'<div class="pa-admin-list">'+phoneVerifications.map(v=>'<article class="pa-admin-item"><div class="pa-admin-top"><div><span class="pa-status '+(v.status==="code_sent"?"approved":"needs_more_info")+'">'+(v.status==="code_sent"?"Código gerado · aguardando confirmação":"Aguardando geração do código")+'</span><h3>'+esc(v.fullName)+'</h3><small>WhatsApp: '+esc(v.phone)+' · Solicitado em '+new Date(v.requestedAt||v.createdAt).toLocaleString("pt-BR")+'</small></div></div><div class="pa-admin-actions"><button class="pa-btn pa-primary" data-generate-phone-code="'+esc(v.id)+'">'+(v.status==="code_sent"?"Gerar novo código":"Gerar código de 6 números")+'</button></div><div id="pa-phone-code-result-'+esc(v.id)+'"></div></article>').join("")+'</div>':'<div class="pa-empty">Nenhuma solicitação de confirmação pendente.</div>';
  document.getElementById("pa-pending-count").textContent=stats.pending+" pendentes";
  document.getElementById("pa-comments-count").textContent=comments.length+" aguardando";
  document.getElementById("pa-admin-comments").innerHTML=comments.length?'<div class="pa-admin-list">'+comments.map(c=>'<article class="pa-admin-item"><div class="pa-admin-top"><div><span class="pa-status '+(c.status==="hidden"?"rejected":"needs_more_info")+'">'+(c.status==="hidden"?"Mensagem ocultada · ":"")+(c.type==="testimonial"?"Agradecimento do beneficiário":"Comentário de apoiador")+'</span><h3>'+esc(c.author)+' · '+esc(c.category)+'</h3><small>'+new Date(c.createdAt).toLocaleString("pt-BR")+'</small></div></div><p class="pa-comment-message">'+esc(c.message)+'</p><div class="pa-admin-actions"><button class="pa-btn pa-green" data-comment-action="approved" data-comment-id="'+esc(c.id)+'">Aprovar e publicar</button>'+(c.status==="pending"?'<button class="pa-btn pa-warn" data-comment-action="hidden" data-comment-id="'+esc(c.id)+'">Ocultar</button>':"")+'<button class="pa-btn pa-danger" data-comment-delete data-comment-id="'+esc(c.id)+'">Excluir</button></div></article>').join("")+'</div>':'<div class="pa-empty">Nenhuma mensagem aguardando moderação.</div>';
  document.getElementById("pa-users-count").textContent=users.length+" cadastros";
  const renderRequest=x=>'<article class="pa-admin-item"><div class="pa-admin-top"><div><span class="pa-status '+esc(x.status)+'">'+esc(status(x.status))+'</span><h3>'+esc(x.fullName)+'</h3><small>'+esc(x.city)+' · '+esc(x.state)+' · '+esc(x.phone)+'</small></div><strong>'+money(x.amount)+'</strong></div><div class="pa-admin-meta"><span>CPF: '+esc(x.cpf||"Não disponível")+'</span><span>'+esc(x.category)+'</span>'+(x.creditor?'<span>Credor: '+esc(x.creditor)+'</span>':"")+'<span>Recebido: '+new Date(x.createdAt).toLocaleString("pt-BR")+'</span><span>Telefone: '+(x.phoneVerified?"Confirmado":"Não confirmado")+'</span></div><p>'+esc(x.description||"Sem descrição complementar.")+'</p>'+((["approved","goal_reached","awaiting_payment","paid"].includes(x.status))?'<div class="pa-progress-block"><div class="pa-progress-label"><b>Arrecadado: '+money(x.raisedAmount)+'</b><span>Meta: '+money(x.amount)+'</span></div><div class="pa-progress-track"><i style="width:'+Math.min(100,Math.round((x.raisedAmount||0)/x.amount*100))+'%"></i></div><small>Falta: '+money(x.remainingAmount)+'</small></div>':"")+'<div class="pa-admin-actions"><button class="pa-btn pa-light" data-document="'+esc(x.documentId)+'">Abrir documento / boleto</button></div>'+(x.status==="awaiting_payment"?'<form class="pa-settlement-form" data-mark-paid="'+esc(x.id)+'" enctype="multipart/form-data"><b>Registrar pagamento e publicar comprovante</b><p>Envie somente a cópia já rasurada. Oculte CPF, endereço, código de barras/linha digitável, conta bancária, QR Code Pix e dados de terceiros.</p><label>Comprovante de pagamento com dados sensíveis ocultados <input type="file" name="proof" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required></label><button class="pa-btn pa-green" type="submit">Confirmar quitação e publicar</button></form>':"")+'<label class="pa-admin-note-field">Observação para o solicitante<textarea rows="2" data-note="'+esc(x.id)+'">'+esc(x.adminNote||"")+'</textarea></label><div class="pa-admin-actions">'+((["pending_review","needs_more_info","rejected"].includes(x.status))?'<button class="pa-btn pa-green" data-review="'+esc(x.id)+'" data-status="approved">Aprovar e publicar</button>':"")+(["pending_review","approved"].includes(x.status)?'<button class="pa-btn pa-warn" data-review="'+esc(x.id)+'" data-status="needs_more_info">Solicitar complemento</button>':"")+(["pending_review","needs_more_info","approved"].includes(x.status)?'<button class="pa-btn pa-danger" data-review="'+esc(x.id)+'" data-status="rejected">Reprovar</button>':"")+'</div></article>';
  const pending=requests.filter(x=>["pending_review","needs_more_info","goal_reached","awaiting_payment"].includes(x.status));
  const active=requests.filter(x=>x.status==="approved");
  const finished=requests.filter(x=>x.status==="paid");
  const history=requests.filter(x=>x.status==="rejected");
  document.getElementById("pa-admin-pending").innerHTML=pending.length?'<div class="pa-admin-list">'+pending.map(renderRequest).join("")+'</div>':'<div class="pa-empty"><h3>Nenhum pedido aguardando análise ou pagamento</h3><p>Novas solicitações aparecerão aqui.</p></div>';
  document.getElementById("pa-admin-active-count").textContent=active.length+" ativas";
  document.getElementById("pa-admin-finished-count").textContent=finished.length+" finalizadas";
  document.getElementById("pa-admin-history-count").textContent=history.length+" recusadas";
  document.getElementById("pa-admin-active").innerHTML=active.length?'<div class="pa-admin-list">'+active.map(renderRequest).join("")+'</div>':'<div class="pa-empty">Nenhuma campanha ativa no momento.</div>';
  document.getElementById("pa-admin-finished").innerHTML=finished.length?'<div class="pa-admin-list">'+finished.map(renderRequest).join("")+'</div>':'<div class="pa-empty">Nenhuma campanha finalizada ainda.</div>';
  document.getElementById("pa-admin-history").innerHTML=history.length?'<div class="pa-admin-list">'+history.map(renderRequest).join("")+'</div>':'<div class="pa-empty">Nenhuma solicitação recusada.</div>';
  document.getElementById("pa-admin-supports").textContent=supports.length+" apoios registrados. Total recebido: "+money(stats.platformSupportAmount);document.getElementById("pa-admin-contributions").innerHTML=contributions.length?'<div class="pa-table-wrap"><table class="pa-users-table"><thead><tr><th>Data</th><th>Pedido</th><th>Contribuição</th><th>Custo Pix</th><th>Identificação</th><th>Status</th><th>Asaas</th></tr></thead><tbody>'+contributions.map(c=>'<tr><td>'+new Date(c.createdAt).toLocaleString("pt-BR")+'</td><td>'+esc(c.category)+'</td><td>'+money(c.amount)+'</td><td>'+money(c.processingFee||0)+'</td><td>'+esc(c.donorName)+(c.donorType==="company"?" · Empresa":"")+'</td><td>'+esc(c.status)+'</td><td>'+esc(c.asaasPaymentId||"—")+'</td></tr>').join("")+'</tbody></table></div>':'<div class="pa-empty">Nenhuma contribuição registrada até o momento.</div>';
  document.getElementById("pa-admin-users").innerHTML=users.length?'<table class="pa-users-table"><thead><tr><th>Nome completo</th><th>CPF</th><th>Telefone</th><th>Localidade</th><th>Cadastro</th><th>Telefone</th></tr></thead><tbody>'+users.map(u=>'<tr><td>'+esc(u.fullName)+'</td><td>'+esc(u.cpf)+'</td><td>'+esc(u.phone)+'</td><td>'+esc(u.city)+' / '+esc(u.state)+'</td><td>'+new Date(u.createdAt).toLocaleDateString("pt-BR")+'</td><td>'+(u.phoneVerified?"Confirmado":"Pendente")+'</td></tr>').join("")+'</tbody></table>':'<div class="pa-empty">Nenhuma pessoa cadastrada.</div>';
  failed.forEach(item=>{const target=document.getElementById(item.target);if(target)target.innerHTML='<div class="pa-error">Não foi possível carregar esta área: '+esc(item.message)+'. As demais informações continuam disponíveis.</div>';});
 }catch(e){const message=esc(e.message||"Erro inesperado ao montar o painel.");["pa-admin-stats","pa-admin-phone-verifications","pa-admin-pending","pa-admin-active","pa-admin-finished","pa-admin-history","pa-admin-comments","pa-admin-contributions","pa-admin-supports","pa-admin-users"].forEach(id=>{const node=document.getElementById(id);if(node&&/Carregando|loading/i.test(node.textContent))node.innerHTML='<div class="pa-error">Não foi possível carregar esta área: '+message+'</div>';});}
}async function loadAdminNotifications(){
 const list=document.getElementById("pa-notification-list"),count=document.getElementById("pa-notification-count");
 if(!list||!currentUser||currentUser.role!=="admin")return;
 try{
  const result=await api("/api/admin/notifications");
  if(count){count.textContent=String(result.unread||0);count.hidden=!(result.unread>0);}
  if(!result.items?.length){list.innerHTML='<p class="pa-notification-empty">Nenhuma notificação por enquanto.</p>';return;}
  list.innerHTML=result.items.map(item=>'<article class="pa-notification-item '+(item.read?'is-read':'is-unread')+'"><div><strong>'+esc(item.title)+'</strong><p>'+esc(item.body)+'</p><small>'+new Date(item.createdAt).toLocaleString("pt-BR")+'</small></div><button type="button" data-notification-read="'+esc(item.id)+'" aria-label="Marcar como lida">✓</button></article>').join("");
 }catch(error){if(list)list.innerHTML='<p class="pa-notification-empty">Não foi possível carregar as notificações: '+esc(error.message)+'</p>';}
}
function donorInfo(){frame("Escolha um pedido para ajudar",'<section class="pa-panel pa-donor-info"><span class="eyebrow">CONTRIBUIÇÕES · PIX VIA ASAAS</span><h2>Ajude a completar uma meta</h2><p>Você não precisa criar conta. Escolha um pedido, informe quanto deseja contribuir e gere seu Pix.</p><div class="pa-simulation-alert">PIX REAL — o valor só será somado à campanha após a confirmação do pagamento pelo Asaas. Você também pode apoiar voluntariamente a manutenção da PagaAi.</div><div id="pa-donor-list">Carregando pedidos...</div><button class="pa-btn pa-light" data-home>Voltar ao início</button></section>');loadDonorRequests();}
function home(){main.innerHTML=originalMain;setAppView(false);updateLandingActions();const y=document.getElementById("year");if(y)y.textContent=new Date().getFullYear();loadPublicRequests();}
function closePixModal(){const modal=document.getElementById("pa-pix-modal");if(modal)modal.remove();document.body.classList.remove("pa-modal-open");}
function openPixModal(pix,message){
 if(!pix||!pix.qrCode||!pix.payload){alert("O Asaas não retornou o QR Code Pix. Nenhuma confirmação de pagamento foi registrada.");return;}
 closePixModal();
 const breakdown='<div class="pa-pix-breakdown"><div><span>Para a campanha</span><b>'+money(pix.campaignAmount)+'</b></div>'+(Number(pix.supportAmount)>0?'<div><span>Apoio voluntário à PagaAi</span><b>'+money(pix.supportAmount)+'</b></div>':'')+(Number(pix.processingFee)>0?'<div><span>Custo operacional do Pix</span><b>'+money(pix.processingFee)+'</b></div>':'')+'<div class="pa-pix-total"><span>Total do Pix</span><strong>'+money(pix.amount)+'</strong></div></div>';
 document.body.insertAdjacentHTML("beforeend",'<div class="pa-pix-modal-backdrop" id="pa-pix-modal" role="dialog" aria-modal="true" aria-labelledby="pa-pix-modal-title"><section class="pa-pix-modal"><button type="button" class="pa-pix-modal-close" data-close-pix aria-label="Fechar">×</button><span class="eyebrow">PAGAAI · PAGAMENTO SEGURO</span><h2 id="pa-pix-modal-title">Seu Pix está pronto</h2><p class="pa-pix-modal-message">'+esc(message||"Pague o valor total usando o QR Code ou o código Pix.")+'</p>'+breakdown+'<div class="pa-pix-qr-wrap"><img alt="QR Code Pix no valor de '+esc(money(pix.amount))+'" src="data:image/png;base64,'+pix.qrCode+'"></div><label class="pa-pix-code-label">Pix copia e cola<textarea readonly rows="3" id="pa-pix-copy">'+esc(pix.payload)+'</textarea></label><button type="button" class="pa-btn pa-primary pa-full" data-copy-pix="'+esc(pix.payload)+'">Copiar código Pix</button><small class="pa-pix-expiry">Vencimento: '+esc(pix.expirationDate||"consulte no aplicativo do banco")+'</small><p class="pa-pix-modal-foot">O valor da campanha, o apoio voluntário e o custo operacional estão discriminados separadamente. O custo operacional não reduz o valor escolhido para a campanha.</p></section></div>');
 document.body.classList.add("pa-modal-open");
}
document.addEventListener("input",e=>{const form=e.target.closest("[data-contribute-form]");if(form)updatePixEstimate(form);});
document.addEventListener("click",async e=>{const t=e.target.closest("button,a");if(!t)return;
 if(t.hasAttribute("data-dismiss-install")){hideInstallPopup();sessionStorage.setItem("pagaai-install-dismissed","1");return;} if(t.hasAttribute("data-install-pwa")){installPwa();return;} if(t.hasAttribute("data-share-app")){sharePagaAi();return;} if(t.hasAttribute("data-admin-push")){enableAdminPush();return;} if(t.hasAttribute("data-notifications-toggle")){const panel=document.getElementById("pa-notifications-panel"),open=panel?.hidden===false;if(panel)panel.hidden=open;t.setAttribute("aria-expanded",String(!open));if(!open)loadAdminNotifications();return;} if(t.hasAttribute("data-notifications-read-all")){try{await api("/api/admin/notifications/read-all",{method:"POST"});loadAdminNotifications();}catch(err){alert(err.message);}return;} if(t.hasAttribute("data-notification-read")){try{await api("/api/admin/notifications/"+encodeURIComponent(t.dataset.notificationRead)+"/read",{method:"PATCH"});loadAdminNotifications();}catch(err){alert(err.message);}return;} if(t.hasAttribute("data-close-pix")){closePixModal();return;}
 if(t.hasAttribute("data-home")){e.preventDefault();home();return;}
 if(t.dataset.screen==="overview"){e.preventDefault();if(currentUser){currentUser.role==="admin"?admin():dashboard();}else auth("login",false);return;}
 if(t.hasAttribute("data-dashboard")){e.preventDefault();if(currentUser){currentUser.role==="admin"?admin():dashboard();}else auth("login",false);return;}
 if(t.hasAttribute("data-role")){e.preventDefault();if(t.dataset.role==="donor"){donorInfo();}else if(currentUser){currentUser.role==="admin"?admin():dashboard();}else auth("register",false);return;}
 if(t.dataset.authMode){auth(t.dataset.authMode,false);return;}
 if(t.hasAttribute("data-generate-phone-code")){
  const id=t.dataset.generatePhoneCode,box=document.getElementById("pa-phone-code-result-"+id);
  t.disabled=true;t.textContent="Gerando código...";
  try{
   const r=await api("/api/admin/users/"+encodeURIComponent(id)+"/phone-verification-code",{method:"POST"});
   const digits="55"+String(r.phone||"").replace(/\D/g,"");
   const msg="Olá, "+r.fullName+". Seu código de verificação do PagaAi é "+r.code+". Ele expira em 10 minutos. Não compartilhe este código com outras pessoas.";
   const wa="https://wa.me/"+digits+"?text="+encodeURIComponent(msg);
   box.innerHTML='<div class="pa-phone-code-result"><p>Código: <strong>'+esc(r.code)+'</strong> · válido por 10 minutos</p><button type="button" class="pa-btn pa-light" data-copy-phone-code="'+esc(r.code)+'">Copiar código</button> <a class="pa-btn pa-green" href="'+wa+'" target="_blank" rel="noopener">Abrir WhatsApp</a></div>';
   t.textContent="Gerar novo código";t.disabled=false;
  }catch(err){alert(err.message);t.textContent="Gerar código";t.disabled=false;}
  return;
 }
 if(t.hasAttribute("data-copy-phone-code")){try{await navigator.clipboard.writeText(t.dataset.copyPhoneCode);t.textContent="Código copiado";}catch{alert("Não foi possível copiar automaticamente. Selecione o código e copie.");}return;}
 if(t.hasAttribute("data-phone-refresh")){
  t.disabled=true;t.textContent="Consultando...";
  try{const me=await api("/api/auth/me");currentUser=me.user;dashboard();}
  catch(err){alert(err.message);t.disabled=false;t.textContent="Verificar se o código chegou";}
  return;
 }
 if(t.hasAttribute("data-phone-request")){
  t.disabled=true;t.textContent="Enviando solicitação...";
  try{const r=await api("/api/my/phone-verification/request",{method:"POST"});alert(r.message);const me=await api("/api/auth/me");currentUser=me.user;dashboard();}
  catch(err){alert(err.message);t.disabled=false;t.textContent="Solicitar código pelo WhatsApp";}
  return;
 }
 if(t.hasAttribute("data-close-contribution")){closeContributionModal();return;}if(t.hasAttribute("data-close-contribution-backdrop")&&e.target===t){closeContributionModal();return;}if(t.hasAttribute("data-open-contribution")){openContributionModal(t.dataset.openContribution);return;}
 if(t.hasAttribute("data-close-debt")){closeDebtModal();return;}if(t.hasAttribute("data-close-debt-backdrop")&&e.target===t){closeDebtModal();return;}if(t.hasAttribute("data-new-request")){if(!currentUser?.phoneVerified){alert("Confirme seu telefone antes de cadastrar uma dívida.");return;}debtForm();return;}
 if(t.hasAttribute("data-my-requests")){myRequests();return;}
 if(t.hasAttribute("data-logout")){try{await api("/api/auth/logout",{method:"POST"});}catch{}currentUser=null;updateLandingActions();auth("login",adminPath);return;}
 if(t.hasAttribute("data-admin-refresh")){admin();return;}if(t.hasAttribute("data-copy-pix")){try{await navigator.clipboard.writeText(t.dataset.copyPix);t.textContent="Código copiado";}catch{alert("Não foi possível copiar automaticamente. Selecione e copie o código Pix.");}return;}
 if(t.hasAttribute("data-reset-system")){
  if(!confirm("ATENÇÃO: esta ação apagará todos os cadastros de beneficiários, pedidos, documentos, comprovantes, contribuições e comentários. O administrador será preservado. Deseja continuar?"))return;
  const typed=prompt('Para confirmar a limpeza definitiva, digite exatamente: ZERAR PAGAAI');
  if(typed!=="ZERAR PAGAAI"){if(typed!==null)alert("Texto diferente. Nenhum dado foi apagado.");return;}
  t.disabled=true;t.textContent="Limpando dados...";
  try{
   const result=await api("/api/admin/reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirmation:typed})});
   alert(result.message+"\\n\\nCadastros removidos: "+result.deleted.beneficiaries+"\\nPedidos removidos: "+result.deleted.requests+"\\nDocumentos removidos: "+result.deleted.documents+"\\nComprovantes removidos: "+result.deleted.publicProofs+"\\nContribuições removidas: "+result.deleted.contributions+"\\nComentários removidos: "+result.deleted.comments+"\\nAdministradores preservados: "+result.administratorsKept);
   admin();
  }catch(err){alert(err.message);t.disabled=false;t.textContent="Apagar todos os cadastros e pedidos";}
  return;
 }
 if(t.dataset.commentAction){try{await api("/api/admin/comments/"+encodeURIComponent(t.dataset.commentId),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:t.dataset.commentAction})});admin();}catch(err){alert(err.message);}return;}
 if(t.hasAttribute("data-comment-delete")){if(!confirm("Excluir definitivamente esta mensagem?"))return;try{await api("/api/admin/comments/"+encodeURIComponent(t.dataset.commentId),{method:"DELETE"});admin();}catch(err){alert(err.message);}return;}
 if(t.dataset.document){window.open("/api/admin/documents/"+encodeURIComponent(t.dataset.document),"_blank","noopener");return;}
 if(t.dataset.phoneUser){try{await api("/api/admin/users/"+encodeURIComponent(t.dataset.phoneUser)+"/phone-verification",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({verified:t.dataset.verified==="true"})});admin();}catch(err){alert(err.message);}return;}
 if(t.dataset.review){const id=t.dataset.review,note=document.querySelector('[data-note="'+CSS.escape(id)+'"]')?.value||"";if(!confirm("Confirmar: "+status(t.dataset.status)+"?"))return;try{await api("/api/admin/requests/"+encodeURIComponent(id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:t.dataset.status,note})});admin();}catch(err){alert(err.message);}return;}
});
document.addEventListener("click",e=>{if(e.target.id==="pa-pix-modal")closePixModal();if(e.target.id==="pa-contribution-modal")closeContributionModal();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closePixModal();closeContributionModal();}});
document.addEventListener("submit",async e=>{if(e.target.id==="pa-payment-settings-form"){e.preventDefault();const form=e.target,button=form.querySelector("button"),feedback=document.getElementById("pa-payment-settings-feedback");button.disabled=true;button.textContent="Salvando...";try{const fee=Number(form.elements.asaasPixProcessingFee.value);const result=await api("/api/admin/payment-settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({asaasPixProcessingFee:fee})});feedback.className="pa-success";feedback.textContent=result.message;button.textContent="Salvo";button.disabled=false;publicPaymentSettings.asaasPixProcessingFee=fee;}catch(err){feedback.className="pa-error";feedback.textContent=err.message;button.disabled=false;button.textContent="Salvar custo operacional";}return;}if(e.target.id==="pa-auth-form"){e.preventDefault();const f=e.target,d=Object.fromEntries(new FormData(f).entries()),reg=!!f.querySelector('[name="fullName"]'),feedback=document.getElementById("pa-feedback");feedback.textContent="Processando...";try{const r=await api(reg?"/api/auth/register":(adminPath?"/api/admin/login":"/api/auth/login"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)});currentUser=r.user;updateLandingActions();if(currentUser.role==="admin")admin();else if(adminPath){currentUser=null;feedback.className="pa-error";feedback.textContent="Esta conta não possui acesso administrativo.";return;}else dashboard();}catch(err){feedback.className="pa-error";feedback.textContent=err.message;}}
 if(e.target.id==="pa-phone-code-form"){
  e.preventDefault();const f=e.target,feedback=document.getElementById("pa-phone-feedback"),button=f.querySelector("button");
  button.disabled=true;button.textContent="Conferindo código...";feedback.textContent="";
  try{const r=await api("/api/my/phone-verification/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:f.elements.code.value})});alert(r.message);const me=await api("/api/auth/me");currentUser=me.user;dashboard();}
  catch(err){feedback.className="pa-error";feedback.textContent=err.message;button.disabled=false;button.textContent="Confirmar telefone";}
 }
 if(e.target.matches("[data-complement-form]")){e.preventDefault();const f=e.target,id=f.dataset.complementForm,fd=new FormData(f);const b=f.querySelector("button");b.disabled=true;b.textContent="Enviando...";try{await api("/api/my/debts/"+encodeURIComponent(id)+"/complement",{method:"POST",body:fd});myRequests();}catch(err){b.disabled=false;b.textContent="Enviar complemento";alert(err.message);}}
 if(e.target.matches("[data-testimonial-form]")){e.preventDefault();const f=e.target,button=f.querySelector("button"),payload=Object.fromEntries(new FormData(f).entries());payload.anonymous=f.elements.anonymous?.checked===true;button.disabled=true;button.textContent="Enviando agradecimento...";try{const result=await api("/api/my/debts/"+encodeURIComponent(f.dataset.testimonialForm)+"/testimonial",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});alert(result.message);myRequests();}catch(err){alert(err.message);button.disabled=false;button.textContent="Enviar agradecimento";}}if(e.target.matches("[data-contribute-form]")){e.preventDefault();const f=e.target,id=f.dataset.contributeForm,button=f.querySelector("button"),fd=new FormData(f);const raw=String(fd.get("amount")||"").trim().replace(/R\$\s?/gi,"").replace(/\s/g,"");const normalized=raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw;const amount=Number(normalized);if(!Number.isFinite(amount)||amount<1){alert("Informe um valor válido de pelo menos R$ 1,00. Ex.: 50,00");return;}const donorName=String(fd.get("donorName")||"").trim();const legalName=String(fd.get("legalName")||"").trim();const donorType=f.elements.donorType?.value||"person";const cpfCnpj=donorType==="company"?String(fd.get("cpfCnpj")||"").toUpperCase().replace(/[^A-Z0-9]/g,""):String(fd.get("cpfCnpj")||"").replace(/\D/g,"");const anonymous=f.elements.anonymous?.checked===true;if(legalName.length<3){alert("Informe o nome completo ou razão social do pagador.");return;}if((donorType==="company"&&cpfCnpj.length!==14)||(donorType!=="company"&&cpfCnpj.length!==11)){alert(donorType==="company"?"Informe um CNPJ com 14 números.":"Informe um CPF com 11 números.");return;}if(!anonymous&&!donorName){alert("Informe como deseja ser identificado ou marque a opção de contribuir anonimamente.");return;}const rawSupport=String(fd.get("supportAmount")||"").trim().replace(/R\$\s?/gi,"").replace(/\s/g,"");const normalizedSupport=rawSupport.includes(",")?rawSupport.replace(/\./g,"").replace(",","."):rawSupport;const supportAmount=Number(normalizedSupport||0);if(!Number.isFinite(supportAmount)||supportAmount<0||(supportAmount>0&&supportAmount<1)){alert("O apoio voluntário deve ser zero ou de pelo menos R$ 1,00.");return;}button.disabled=true;button.textContent="Conectando ao Asaas...";try{const result=await api("/api/public/debts/"+encodeURIComponent(id)+"/contributions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount,supportAmount,donorName,legalName,cpfCnpj,donorType,anonymous})});closeContributionModal();openPixModal(result.pix,result.message);button.textContent="Pix gerado";button.disabled=true;}catch(err){alert(err.message);button.disabled=false;button.textContent="Gerar Pix";}}if(e.target.matches("[data-updated-bill]")){e.preventDefault();const f=e.target,id=f.dataset.updatedBill,button=f.querySelector("button");button.disabled=true;button.textContent="Enviando boleto...";try{await api("/api/my/debts/"+encodeURIComponent(id)+"/updated-bill",{method:"POST",body:new FormData(f)});myRequests();}catch(err){alert(err.message);button.disabled=false;button.textContent="Enviar boleto atualizado";}}
 if(e.target.matches("[data-mark-paid]")){e.preventDefault();const f=e.target,id=f.dataset.markPaid,button=f.querySelector("button");if(!confirm("Confirma que a dívida foi efetivamente paga e que o arquivo anexado já está com os dados sensíveis ocultados?"))return;button.disabled=true;button.textContent="Registrando quitação...";try{await api("/api/admin/requests/"+encodeURIComponent(id)+"/mark-paid",{method:"POST",body:new FormData(f)});admin();}catch(err){alert(err.message);button.disabled=false;button.textContent="Confirmar quitação e publicar";}}
 if(e.target.id==="pa-debt-form"){e.preventDefault();const f=e.target,feedback=document.getElementById("pa-feedback");feedback.textContent="Enviando e armazenando o comprovante...";try{const r=await api("/api/debts",{method:"POST",body:new FormData(f)});feedback.className="pa-success";feedback.textContent=r.message;f.reset();setTimeout(()=>{closeDebtModal();myRequests();},900);}catch(err){feedback.className="pa-error";feedback.textContent=err.message;}}});
function closeContributionModal(){const modal=document.getElementById("pa-contribution-modal");if(modal)modal.remove();document.body.classList.remove("pa-contribution-modal-open");}
function openContributionModal(id){
 const campaign=[...document.querySelectorAll(".pa-public-request")].find(card=>card.querySelector('[data-open-contribution="'+CSS.escape(id)+'"]'));
 const title=campaign?.querySelector(".request-info h3")?.textContent||"esta campanha";
 if(document.getElementById("pa-contribution-modal"))closeContributionModal();
 document.body.insertAdjacentHTML("beforeend",'<div class="pa-contribution-modal-backdrop" id="pa-contribution-modal" data-close-contribution-backdrop><section class="pa-contribution-modal" role="dialog" aria-modal="true" aria-labelledby="pa-contribution-modal-title"><button type="button" class="pa-contribution-modal-close" data-close-contribution aria-label="Fechar">×</button><span class="eyebrow">PAGAAI · CONTRIBUIÇÃO</span><h2 id="pa-contribution-modal-title">Ajude esta campanha</h2><p class="pa-contribution-modal-intro">Você está contribuindo para: <strong>'+esc(title)+'</strong>. Preencha os dados para gerar seu Pix.</p>'+contributionForm(id)+'</section></div>');
 document.body.classList.add("pa-contribution-modal-open");
  updatePixEstimate(document.querySelector("#pa-contribution-modal [data-contribute-form]"));
 const first=document.querySelector("#pa-contribution-modal input[name=amount]");if(first)first.focus();
}
let publicPaymentSettings={asaasPixProcessingFee:1.99};
 api("/api/public/payment-settings").then(settings=>{publicPaymentSettings=settings;const form=document.querySelector("#pa-contribution-modal [data-contribute-form]");if(form)updatePixEstimate(form);}).catch(()=>{});
 function parseMoneyField(value){const raw=String(value||"").trim().replace("R$","").replace(/\s/g,"");const normalized=raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw;const amount=Number(normalized);return Number.isFinite(amount)&&amount>0?amount:0;}
 function updatePixEstimate(form){if(!form)return;const campaign=parseMoneyField(form.elements.amount?.value),support=parseMoneyField(form.elements.supportAmount?.value),fee=Number(publicPaymentSettings.asaasPixProcessingFee)||0;const put=(selector,value)=>{const el=form.querySelector(selector);if(el)el.textContent=money(value);};put("[data-estimate-campaign]",campaign);put("[data-estimate-support]",support);put("[data-estimate-fee]",fee);put("[data-estimate-total]",campaign+support+fee);const row=form.querySelector("[data-estimate-support-row]");if(row)row.hidden=support<=0;}
 function contributionForm(id){return '<form class="pa-contribute-form" data-contribute-form="'+esc(id)+'"><b>Quanto deseja ajudar?</b><label>Valor para a dívida (R$)<input type="text" name="amount" inputmode="decimal" autocomplete="off" maxlength="12" placeholder="Ex.: 50,00" required></label><label>Apoio voluntário à PagaAi (opcional)<input type="text" name="supportAmount" inputmode="decimal" autocomplete="off" maxlength="12" placeholder="R$ 0,00"></label><small>Esse apoio é separado e não entra na arrecadação da campanha. Deixe em branco ou informe um valor a partir de R$ 1,00.</small><div class="pa-pix-estimate" data-pix-estimate><div><span>Valor para a campanha</span><b data-estimate-campaign>R$ 0,00</b></div><div data-estimate-support-row hidden><span>Apoio voluntário à PagaAi</span><b data-estimate-support>R$ 0,00</b></div><div><span>Custo operacional do Pix</span><b data-estimate-fee>R$ 1,99</b></div><div class="pa-pix-estimate-total"><span>Total a pagar</span><strong data-estimate-total>R$ 1,99</strong></div><small>O custo operacional é informado antes do pagamento e não será descontado do valor escolhido para a campanha.</small></div><label>Nome completo ou razão social do pagador<input name="legalName" required minlength="3" maxlength="120" autocomplete="name" placeholder="Nome que consta no documento"></label><label>CPF ou CNPJ do pagador<input name="cpfCnpj" required inputmode="text" maxlength="18" autocomplete="off" placeholder="CPF numérico ou CNPJ (pode conter letras)"><small>Necessário para cadastrar o pagador e gerar a cobrança Pix no Asaas. Pessoa física: CPF. Empresa: CNPJ.</small></label><label>Nome para identificação pública (opcional)<input name="donorName" maxlength="100" placeholder="Nome ou empresa que deseja exibir"></label><div class="pa-donor-options"><label>Tipo de titular<select name="donorType"><option value="person">Pessoa física · CPF</option><option value="company">Pessoa jurídica · CNPJ</option></select></label><label class="pa-anon-option"><input type="checkbox" name="anonymous" value="true" checked> Contribuir anonimamente</label></div><button class="pa-btn pa-primary pa-full" type="submit">Gerar Pix</button><div class="pa-pix-result" data-pix-result hidden></div><small>O progresso só será atualizado depois da confirmação do pagamento.</small></form>';}
function publicCard(x){const progress=Math.min(100,Math.round((x.raisedAmount||0)/x.amount*100));return '<article class="request-card pa-public-request"><div class="request-top"><span class="verified">'+(x.status==="paid"?"Dívida quitada":x.status==="awaiting_payment"?"Aguardando pagamento":x.status==="goal_reached"?"Meta alcançada":"Pedido verificado")+'</span><span class="location">'+esc(x.city)+' · '+esc(x.state)+'</span></div><div class="request-body"><div class="request-info"><h3>'+esc(x.category)+'</h3><strong>'+money(x.amount)+'</strong><small>Meta de arrecadação</small></div></div><p class="public-request-description">'+esc(x.description||"Solicitação analisada pela equipe PagaAi.")+'</p><div class="pa-progress-block"><div class="pa-progress-label"><b>'+money(x.raisedAmount)+' arrecadados</b><span>'+progress+'%</span></div><div class="pa-progress-track"><i style="width:'+progress+'%"></i></div><div class="pa-progress-label"><small>Faltam '+money(x.remainingAmount)+'</small><small>Meta: '+money(x.amount)+'</small></div></div>'+(x.status==="approved"?'<button type="button" class="pa-btn pa-primary pa-full pa-open-contribution" data-open-contribution="'+esc(x.id)+'">Ajudar esta campanha</button>':x.status==="paid"&&x.hasPublicProof?'<a class="pa-btn pa-light pa-proof-link" href="/api/public/debts/'+esc(x.id)+'/payment-proof" target="_blank" rel="noopener">Ver comprovante de quitação</a><section class="pa-comments" data-comments-section="'+esc(x.id)+'"><div class="pa-comments-heading"><h4>Mural de agradecimentos</h4><span>Mensagens revisadas pela equipe</span></div><div id="pa-comments-list-'+esc(x.id)+'" class="pa-comments-list">Carregando mensagens...</div></section>':'<p class="pa-admin-note">'+(x.status==="goal_reached"?"Meta completa. Aguardando o boleto atualizado do beneficiário.":x.status==="awaiting_payment"?"Boleto atualizado recebido. A equipe está realizando a conferência para pagamento.":"Dívida quitada pela equipe PagaAi.")+'</p>')+'<small class="public-request-date">Publicado em '+new Date(x.createdAt).toLocaleDateString("pt-BR")+'</small></article>';}
async function loadComments(id){const target=document.getElementById("pa-comments-list-"+id);if(!target)return;try{const items=await api("/api/public/debts/"+encodeURIComponent(id)+"/comments");target.innerHTML=items.length?items.map(c=>'<article class="pa-comment"><div><b>'+esc(c.author)+'</b><span>'+"Agradecimento do beneficiário"+' · '+new Date(c.createdAt).toLocaleDateString("pt-BR")+'</span></div><p>'+esc(c.message)+'</p></article>').join(""):'<p class="pa-comments-empty">O beneficiário ainda não publicou um agradecimento.</p>';}catch(e){target.textContent=e.message;}}
async function loadDonorRequests(){const target=document.getElementById("pa-donor-list");if(!target)return;try{const items=(await api("/api/debts")).filter(x=>x.status==="approved");target.innerHTML=items.length?'<div class="request-grid">'+items.map(publicCard).join("")+'</div>':'<div class="pa-empty"><h3>Nenhuma campanha ativa disponível</h3><p>As campanhas finalizadas e as que aguardam quitação não recebem novas contribuições.</p></div>';}catch(e){target.innerHTML='<div class="pa-error">'+esc(e.message)+'</div>';}}
async function loadPublicRequests(){
 const grid=document.getElementById("request-grid");if(!grid)return;
 try{const impact=await api("/api/public/impact");const people=document.getElementById("pa-public-people"),value=document.getElementById("pa-public-value"),paid=document.getElementById("pa-public-paid");if(people)people.textContent=impact.peopleHelped;if(value)value.textContent=money(impact.amountHelped);if(paid)paid.textContent=impact.paidRequests;}catch{}
 const section=document.querySelector(".requests-section");
 try{
  const items=await api("/api/debts");
  const heading=section&&section.querySelector(".section-heading h2");
  if(heading)heading.textContent="Acompanhe nossas campanhas";
  const preview=section&&section.querySelector(".preview-label");if(preview)preview.hidden=true;
  const note=section&&section.querySelector(".demo-note");
  const active=items.filter(x=>x.status==="approved");
  const processing=items.filter(x=>["goal_reached","awaiting_payment"].includes(x.status));
  const finished=items.filter(x=>x.status==="paid");
  const activeCount=document.getElementById("pa-active-count");
  if(activeCount)activeCount.textContent=String(active.length);
  grid.innerHTML=active.length?active.map(publicCard).join(""):'<div class="pa-empty"><h3>Nenhuma campanha ativa neste momento</h3><p>Novos pedidos aparecerão aqui depois da análise e aprovação.</p></div>';
  const processingSection=document.getElementById("pa-processing-section"),processingGrid=document.getElementById("pa-processing-grid"),processingCount=document.getElementById("pa-processing-count");
  if(processingSection)processingSection.hidden=!processing.length;
  if(processingGrid)processingGrid.innerHTML=processing.map(publicCard).join("");
  if(processingCount)processingCount.textContent=String(processing.length);
  const finishedSection=document.getElementById("pa-finished-section"),finishedGrid=document.getElementById("pa-finished-grid"),finishedCount=document.getElementById("pa-finished-count");
  if(finishedSection)finishedSection.hidden=!finished.length;
  if(finishedGrid)finishedGrid.innerHTML=finished.map(publicCard).join("");
  if(finishedCount)finishedCount.textContent=String(finished.length);
  finished.forEach(x=>loadComments(x.id));
  if(note)note.hidden=true;
 }catch{grid.innerHTML='<div class="pa-empty"><h3>Não foi possível carregar as campanhas</h3><p>Tente novamente em instantes.</p></div>';}
}
async function boot(){if(adminPath){auth("login",true);return;}try{const r=await api("/api/auth/me");currentUser=r.user;updateLandingActions();if(currentUser.role==="admin")admin();else dashboard();}catch{updateLandingActions();loadPublicRequests();}}
setupPwa();
boot();
// A atualização é manual: a página não recarrega nem substitui formulários automaticamente.
})();