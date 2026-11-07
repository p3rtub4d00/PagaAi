# PagaAi — PWA e notificações push

## Variáveis necessárias no Render

Para ativar as notificações push do painel Master, configure estas variáveis privadas:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` — por exemplo: `mailto:admin@seudominio.com`

Gere o par VAPID uma única vez:

```bash
npx web-push generate-vapid-keys
```

Copie a chave pública para `VAPID_PUBLIC_KEY` e a privada para `VAPID_PRIVATE_KEY`. Nunca publique a chave privada no GitHub.

## Como funciona

1. O PagaAi registra o Service Worker.
2. O administrador instala o PWA no celular.
3. No painel Master, toca em **Ativar notificações neste celular** e autoriza as notificações.
4. O navegador cria uma assinatura push, que é armazenada no MongoDB vinculada ao administrador.
5. Quando um beneficiário solicita a confirmação do telefone, o servidor envia um Web Push para os dispositivos administrativos cadastrados.
6. A notificação abre diretamente o `/admin`.

As notificações dependem de HTTPS e da permissão do usuário. O PWA e o push não substituem a fila de confirmação existente: eles apenas avisam a equipe em tempo real.
