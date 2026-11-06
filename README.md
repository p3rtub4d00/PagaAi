# PagaAi

**Quem pode, ajuda. Quem precisa, recebe.**

Plataforma em desenvolvimento para conectar pessoas que desejam contribuir com a quitação de dívidas essenciais a pessoas que precisam de apoio.

## Stack
- Node.js 20+
- Express
- MongoDB Atlas / Mongoose
- HTML, CSS e JavaScript responsivos

## Executar localmente
1. Instale Node.js 20 ou superior.
2. Execute `npm install`.
3. Copie `.env.example` para `.env` e configure `MONGODB_URI`.
4. Execute `npm start`.
5. Acesse `http://localhost:3000`.

## Deploy no Render
- Tipo: Web Service
- Build command: `npm install`
- Start command: `npm start`
- Variável: `MONGODB_URI` com a URL do banco MongoDB Atlas.
- Health check: `/api/health`

## Estado do projeto
Primeira base visual e técnica. A interface pública e o formulário inicial estão implementados. Ainda precisam ser desenvolvidos antes de uso real:
- autenticação, recuperação de senha e perfis;
- painel do beneficiário e painel do doador;
- upload privado e validação de documentos;
- fluxo de revisão/moderação e status de dívida verificada;
- integração de pagamentos e repasse direto ao credor;
- painel administrativo protegido, auditoria e relatórios;
- termos, política de privacidade, controles LGPD e antifraude.

**Importante:** os números e pedidos exibidos na interface são dados ilustrativos. Não há recebimento de doações ou pagamento de dívidas nesta versão.
