# GAIPO CALC

Calculadora que **resolve e ensina passo a passo**, do ensino fundamental à faculdade.
Desenvolvido por **GAIPO Intelligent Engineering**.

**100% grátis e 100% offline.** Nada de servidor, assinatura ou chave de API.

| Jeito de perguntar | Como funciona |
|---|---|
| ⌨️ Teclado matemático (fração, raiz, potência, ∫, d/dx, lim, sistemas…) | motor de cálculo próprio |
| 🖊️ Caneta / dedo no papel de caderno | leitor de letra à mão que roda no celular (modelo aberto CoMER, projeto [ink-on](https://github.com/kimseungdae/ink-on)) |
| 📷 Foto da conta (marque a conta arrastando o dedo) | mesmo leitor, com limpeza da foto (sombra, linhas do caderno) |
| 🎤 Voz (“dois x mais três igual a sete”) | reconhecimento de voz do próprio Android + tradutor de fala para conta |
| 📚 Passo a passo | explicação em português de cada etapa |
| 📈 Gráficos | várias funções, zoom com dois dedos, toque para ver o valor, raízes e vértice marcados |
| 📊 Estatística | média, mediana, moda, variância, desvio padrão, quartis, histograma e gráfico de caixa |
| 🧰 Ferramentas | porcentagem, regra de três, juros simples/compostos, combinatória, matrizes, geometria, conversões |
| 📄 PDF | exporta a solução (questão, resposta, gráfico e passo a passo) para salvar ou compartilhar |

O que é lido pela caneta, foto ou voz aparece no teclado para você **conferir e corrigir** antes de confiar no resultado.

O motor resolve com passo a passo: contas e frações (MMC), potências, raízes,
porcentagem, fatorial, trigonometria (ângulos notáveis), logaritmos, simplificação e fatoração,
equações do 1º e 2º grau (Bhaskara), polinomiais (Briot-Ruffini), exponenciais, logarítmicas,
modulares e irracionais, inequações (estudo do sinal), sistemas lineares, MMC/MDC/fatoração em
primos, derivadas (todas as regras), integrais (tabela, substituição, por partes, definidas) e
limites (fatoração, L'Hôpital, infinito), funções (domínio, derivadas parciais, parábola com
vértice e imagem) e estatística (`media(4; 7; 7; 10)`, `mediana(…)`, `moda(…)`, `desvio(…)`,
`comb(5; 2)`, `arranjo(5; 2)`, `perm(4)`).

## Como gerar o APK

1. Envie este código para o repositório `gaipocalc` no GitHub (branch `main`).
2. O GitHub Actions roda os testes e gera o APK sozinho.
3. Baixe em **Releases → GAIPO-CALC.apk** e instale no celular.

## Estrutura

```
index.html, css/, js/app.js   interface
js/motor/                      motor de cálculo offline (passo a passo)
js/voz.js                      fala em português → conta
js/leitor.js                   leitura de letra à mão/foto no aparelho
vendor/                        MathLive (teclado), nerdamer (apoio simbólico), tinta/ (leitor offline)
apk/montar.sh                  montagem do APK (Capacitor)
testes/                        testes do motor: node testes/motor.test.mjs
```

## Licenças de terceiros

MathLive (MIT) — `vendor/mathlive/LICENSE.txt`; nerdamer (Apache-2.0) — `vendor/nerdamer-LICENSE.md`;
ink-on (Apache-2.0) — `vendor/tinta/LICENSE-ink-on.txt`; jsPDF e html2canvas (MIT) — `vendor/pdf/`;
fonte Nunito (OFL) — `vendor/fonte/`; ONNX Runtime Web (MIT) — `vendor/tinta/LICENSE-onnxruntime.txt`.
