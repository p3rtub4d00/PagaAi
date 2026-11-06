# PagaAi — Design System

## Marca
- Nome oficial: **PagaAi**
- Assinatura: **Quem pode, ajuda. Quem precisa, recebe.**
- Não utilizar a marca “Quita” em telas, metadados ou materiais.

## Fundamentos visuais
| Token | Valor | Aplicação |
|---|---|---|
| brand-900 | #172554 | Títulos e textos de alta ênfase |
| brand-700 | #1E40AF | Azul institucional |
| brand-600 | #2563EB | Ações primárias e links |
| success-500 | #10B981 | Ajuda, sucesso e status positivo |
| canvas | #F8FAFC | Fundo de páginas |
| surface | #FFFFFF | Cards e superfícies |
| text | #0F172A | Texto principal |
| muted | #64748B | Texto secundário |
| border | #E2E8F0 | Bordas e divisores |

## Tipografia
- Família: Inter (preferencial); DM Sans/Manrope podem permanecer na versão legada até a migração controlada.
- Títulos: 700–800.
- Texto de interface: 400–600.
- Números financeiros: 700–800, alinhamento tabular recomendado.

## Componentes
- Botão primário: azul institucional, texto branco, raio 12–14 px.
- Botão de ajuda: verde #10B981, texto branco.
- Cards: branco, borda #E2E8F0, raio 18–22 px, sombra discreta.
- Campos: altura mínima 44 px, borda neutra, foco azul com anel de contraste.
- Status verificado: fundo verde claro e texto verde escuro.
- Status pendente: âmbar claro; rejeitado: vermelho claro; quitado: verde.

## Layout responsivo
- Conteúdo máximo: 1160–1280 px.
- Desktop: grids de 2 a 4 colunas conforme densidade.
- Tablet: 2 colunas quando houver espaço.
- Mobile: coluna única, botões com área de toque mínima de 44 px.
- Não distorcer fotografias: usar proporção definida e `object-fit: cover` somente quando o recorte for intencional; para retratos recortados, ajustar `object-position`.

## Telas do produto
1. Landing page: proposta de valor, ações de entrada, impacto e pedidos demonstrativos.
2. Escolha de perfil: doador ou beneficiário.
3. Dashboard do doador: saldo/carteira, histórico e pedidos verificados.
4. Cadastro de dívida: categoria, valor, descrição e envio privado de comprovantes.
5. Confirmação: resumo da contribuição e impacto confirmado.
6. Administração: métricas, pedidos, doações, pagamentos, usuários, relatórios e configurações.

## Regras de integridade
- Estatísticas sem fonte real devem ser rotuladas como demonstrativas ou removidas.
- Um pedido só pode receber o selo “verificado” após revisão documentada.
- Um pedido só pode aparecer como “quitado” após confirmação do pagamento pelo provedor/credor.
- Não exibir saldo fictício como dinheiro disponível.
- Painel administrativo exige autenticação e autorização no servidor; ocultar um link no front-end não é controle de acesso.
- Comprovantes e documentos pessoais não devem ser armazenados em diretório público.
- A LGPD exige finalidade, minimização, controle de acesso, retenção e canal para exercício de direitos.
- Pagamentos reais exigem integração autenticada, conciliação, idempotência, trilha de auditoria e política de estorno.
