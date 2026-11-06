const modal = document.getElementById("modal");
const title = document.getElementById("modal-title");
const description = document.getElementById("modal-description");
const form = document.getElementById("debt-form");
const options = document.getElementById("modal-content");
const toast = document.getElementById("toast");

document.getElementById("year").textContent = new Date().getFullYear();

function openModal(mode = "choose") {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  form.classList.add("hidden");
  options.classList.remove("hidden");
  toast.textContent = "";
  toast.className = "";
  if (mode === "beneficiary") {
    title.textContent = "Cadastre sua dívida";
    description.textContent = "Preencha os dados iniciais para solicitar apoio.";
    form.classList.remove("hidden");
    options.classList.add("hidden");
  } else if (mode === "donor") {
    title.textContent = "Faça parte dessa corrente";
    description.textContent = "O ambiente de doações será liberado após o cadastro seguro do doador.";
    options.innerHTML = '<button class="btn btn-primary btn-full" id="donor-register">Quero me cadastrar como doador →</button><button class="btn btn-light btn-full" id="donor-login">Já tenho cadastro</button>';
    document.getElementById("donor-register").addEventListener("click", () => {
      title.textContent = "Cadastro de doador";
      description.textContent = "O cadastro com autenticação e carteira de doações será habilitado na próxima etapa.";
      options.innerHTML = '<p class="form-privacy">A plataforma está em fase inicial de implantação. Nenhuma contribuição financeira é recebida nesta demonstração.</p>';
    });
    document.getElementById("donor-login").addEventListener("click", () => {
      title.textContent = "Acesso do doador";
      description.textContent = "O acesso seguro será habilitado após a implementação da autenticação.";
    });
  } else {
    title.textContent = "Como você deseja participar?";
    description.textContent = "Escolha uma opção para continuar.";
    options.innerHTML = '<button class="btn btn-primary btn-full" data-role="donor">Quero ajudar</button><button class="btn btn-green btn-full" data-role="beneficiary">Preciso de ajuda</button>';
  }
}
function closeModal() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}
document.addEventListener("click", event => {
  const role = event.target.closest("[data-role]");
  if (role) openModal(role.dataset.role);
  const login = event.target.closest('[data-open="login"]');
  if (login) openModal("login");
  const signup = event.target.closest('[data-open="signup"]');
  if (signup) openModal("choose");
  const help = event.target.closest("[data-help]");
  if (help) {
    openModal("donor");
    title.textContent = "Apoiar esta solicitação";
    description.textContent = "A contribuição será disponibilizada quando os pagamentos seguros estiverem integrados.";
  }
  const details = event.target.closest("[data-details]");
  if (details) {
    openModal("choose");
    title.textContent = details.dataset.details;
    description.textContent = "Este é um pedido ilustrativo. Na versão completa, você poderá consultar a situação, a comprovação e o destino do pagamento.";
  }
});
document.getElementById("modal-close").addEventListener("click", closeModal);
modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });
document.querySelector(".menu-toggle").addEventListener("click", () => document.querySelector(".topbar").classList.toggle("nav-open"));
document.getElementById("filter-button").addEventListener("click", () => {
  toast.textContent = "Os filtros por categoria serão ativados com os pedidos reais.";
  openModal("choose");
  title.textContent = "Filtros de pedidos";
  description.textContent = "Na próxima etapa, você poderá filtrar por tipo de dívida, valor e localização.";
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  toast.className = "";
  toast.textContent = "Enviando solicitação...";
  const data = Object.fromEntries(new FormData(form).entries());
  data.state = data.state.trim().toUpperCase();
  data.amount = Number(data.amount);
  try {
    const response = await fetch("/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível enviar.");
    toast.textContent = "Solicitação registrada. A análise e a verificação documental serão realizadas em uma próxima etapa.";
    form.reset();
  } catch (error) {
    toast.className = "error";
    toast.textContent = error.message.includes("Failed to fetch")
      ? "A API ainda não está conectada. Configure o MongoDB no Render para receber solicitações."
      : error.message;
  }
});
