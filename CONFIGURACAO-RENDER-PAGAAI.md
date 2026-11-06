# Configuração do PagaAi no Render

## Variáveis obrigatórias

Configure em **Render → Web Service → Environment**:

- `MONGODB_URI`: URI privada do MongoDB Atlas.
- `JWT_SECRET`: segredo aleatório forte com pelo menos 32 caracteres. Gere um valor exclusivo para produção (por exemplo, `openssl rand -base64 48`).
- `NODE_ENV`: `production`.

## Primeiro administrador

Configure também:

- `ADMIN_NAME`: nome do administrador.
- `ADMIN_CPF`: CPF válido do administrador, somente para identificar a conta de acesso.
- `ADMIN_PASSWORD`: senha forte com pelo menos 14 caracteres.
- `ADMIN_PHONE`: telefone opcional.

Na primeira inicialização, o sistema cria a conta administrativa se o CPF ainda não existir. Acesse `https://SEU-DOMINIO/admin`. Não coloque credenciais reais no GitHub nem em arquivos versionados.

## Documentos e privacidade

Os comprovantes aceitos são PDF, JPG e PNG, com limite de 5 MB. O conteúdo é guardado em coleção privada no MongoDB, não na pasta pública do site. O download exige sessão administrativa. Configure backups e controles de acesso no MongoDB Atlas; o banco contém dados pessoais e documentos sensíveis.

O cadastro exige aceite do aviso de privacidade. O CPF passa por validação matemática dos dígitos, não por consulta oficial à Receita Federal. O telefone é validado quanto ao formato, mas a confirmação atual é manual: a equipe deve entrar em contato e usar a ação de confirmação no painel antes de aprovar/publicar. Não há envio de SMS/WhatsApp OTP integrado nesta versão.

## Fluxo de análise

1. A pessoa cria conta com nome, CPF, telefone, cidade, UF e senha.
2. Envia uma solicitação com valor, categoria e comprovante.
3. O pedido fica privado em análise.
4. A administração abre o documento, confirma o telefone e aprova, reprova ou solicita complemento.
5. Somente pedidos aprovados são retornados pelo endpoint público.

A aprovação documental não significa quitação da dívida. Pagamentos, arrecadação parcial, repasse direto ao credor, conciliação e recibos ainda precisam de integração financeira e regras operacionais antes de receber contribuições.

## Ponto de atenção

Antes de tratar dados reais, publique uma Política de Privacidade e Termos de Uso completos, defina prazo de retenção/exclusão dos documentos, responsável pelo tratamento, canal para titulares LGPD e procedimento de resposta a incidentes. Recomenda-se revisão jurídica e teste de segurança antes da abertura pública.
