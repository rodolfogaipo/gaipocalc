# GAIPO CALC

Calculadora que **resolve e ensina passo a passo**, do ensino fundamental à faculdade.
Desenvolvido por **GAIPO Intelligent Engineering**.

| Jeito de perguntar | Sem internet | Com internet |
|---|---|---|
| ⌨️ Teclado matemático (fração, raiz, potência, ∫, d/dx, lim, sistemas…) | ✅ | ✅ |
| 🎤 Voz (“dois x mais três igual a sete”) | ✅ se o Android tiver voz offline | ✅ |
| 🖊️ Caneta / dedo no papel de caderno | — | ✅ (IA lê a letra) |
| 📷 Foto da questão | — | ✅ (IA lê a foto) |
| 📚 Passo a passo | ✅ motor do aparelho | ✅ + “Explicar com IA” |

O que o motor offline resolve com passo a passo: contas e frações (MMC), potências, raízes,
porcentagem, fatorial, trigonometria (ângulos notáveis), logaritmos, simplificação e fatoração,
equações do 1º e 2º grau (Bhaskara), polinomiais (Briot-Ruffini), exponenciais, logarítmicas,
modulares e irracionais, inequações (estudo do sinal), sistemas lineares, MMC/MDC/fatoração em
primos, derivadas (todas as regras), integrais (tabela, substituição, por partes, definidas) e
limites (fatoração, L'Hôpital, infinito). Quando a IA responde, o app **confere** a resposta com
o motor do aparelho e avisa se houver diferença.

## Como gerar o APK

1. Envie este código para o repositório `gaipocalc` no GitHub (branch `main`).
2. O GitHub Actions roda os testes e gera o APK sozinho.
3. Baixe em **Releases → GAIPO-CALC.apk** e instale no celular.

## Como ligar a IA (uma vez só)

A IA roda num servidor grátis da Cloudflare, que guarda a sua chave da Anthropic.
A chave **não** fica dentro do APK.

1. Crie uma chave da API em <https://console.anthropic.com> (é pago por uso).
2. Crie uma conta grátis em <https://dash.cloudflare.com> e gere um *API Token* com o modelo
   “Edit Cloudflare Workers”. Anote também o seu *Account ID*.
3. No GitHub: **Settings → Secrets and variables → Actions**:
   - *Secrets*: `ANTHROPIC_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
     `GAIPO_CHAVE_APP` (uma senha qualquer que você inventar, ex.: 20 letras e números).
4. Em **Actions → Publicar servidor da IA → Run workflow**. No final aparece o endereço,
   algo como `https://gaipocalc-ia.SEU-USUARIO.workers.dev`.
5. Ainda em *Secrets and variables → Variables*, crie `GAIPO_SERVIDOR` com esse endereço.
6. Em **Actions → Gerar APK do GAIPO CALC → Run workflow**. O novo APK já vem com a IA ligada.

## Estrutura

```
index.html, css/, js/app.js   interface
js/motor/                      motor de cálculo offline (passo a passo)
js/voz.js                      fala em português → conta
js/ia.js                       conversa com o servidor da IA
vendor/                        MathLive (teclado) e nerdamer (apoio simbólico)
servidor/                      servidor da IA (Cloudflare Worker)
apk/montar.sh                  montagem do APK (Capacitor)
testes/                        testes do motor: node testes/motor.test.mjs
```

## Licenças de terceiros

MathLive (MIT) — `vendor/mathlive/LICENSE.txt`; nerdamer (Apache-2.0) — `vendor/nerdamer-LICENSE.md`.
