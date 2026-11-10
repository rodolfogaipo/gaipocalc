// Exporta a solução em PDF (gerado no próprio celular) e abre para salvar/compartilhar.
const Cap = window.Capacitor;
const nativo = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const plugin = (n) => (nativo && Cap.Plugins && Cap.Plugins[n]) || null;

// monta uma folha "de impressão" com o conteúdo da solução
function montarFolha({ titulo, tipo, questaoHTML, respostaHTML, decimal, conjuntoHTML, aviso, passosHTML, graficoURL }) {
  const f = document.createElement('div');
  f.className = 'folha-pdf';
  const data = new Date().toLocaleString('pt-BR');
  f.innerHTML = `
    <div class="pdf-topo"><img src="img/simbolo.png" alt=""><div><b>GAIPO <span>CALC</span></b><small>${data}</small></div></div>
    <div class="pdf-tag">${tipo || titulo || 'Solução'}</div>
    <h3>Questão</h3><div class="pdf-mat">${questaoHTML}</div>
    <div class="pdf-resp"><h3>Resposta</h3><div class="pdf-mat grande">${respostaHTML}</div>${decimal ? `<div class="pdf-dec">${decimal}</div>` : ''}${conjuntoHTML ? `<div class="pdf-mat">${conjuntoHTML}</div>` : ''}</div>
    ${aviso ? `<div class="pdf-aviso">${aviso}</div>` : ''}
    ${graficoURL ? `<h3>Gráfico</h3><img class="pdf-graf" src="${graficoURL}">` : ''}
    ${passosHTML ? `<h3>Passo a passo</h3><ol class="pdf-passos">${passosHTML}</ol>` : ''}
    <div class="pdf-rodape">Resolvido com GAIPO CALC · GAIPO Intelligent Engineering</div>`;
  return f;
}

export async function exportarPDF(dados) {
  if (!window.jspdf || !window.html2canvas) throw new Error('O gerador de PDF ainda está carregando. Tente de novo em instantes.');
  const folha = montarFolha(dados);
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;z-index:-1';
  caixa.append(folha);
  document.body.append(caixa);
  try {
    await Promise.all([...folha.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    if (document.fonts?.ready) await document.fonts.ready;
    const tela = await window.html2canvas(folha, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const larg = 210, alt = 297, margem = 0;
    const pxPorMm = tela.width / larg;
    const altPagPx = Math.floor(alt * pxPorMm);
    // corta em páginas, evitando cortar no meio de uma linha de texto (procura faixa branca)
    let y = 0, pag = 0;
    const ctx = tela.getContext('2d');
    while (y < tela.height) {
      let fim = Math.min(tela.height, y + altPagPx);
      if (fim < tela.height) {
        for (let k = fim; k > y + altPagPx * 0.7; k -= 2) {
          const linha = ctx.getImageData(0, k, tela.width, 1).data;
          let branca = true;
          for (let p = 0; p < linha.length; p += 16) if (linha[p] < 245) { branca = false; break; }
          if (branca) { fim = k; break; }
        }
      }
      const parte = document.createElement('canvas');
      parte.width = tela.width; parte.height = fim - y;
      parte.getContext('2d').drawImage(tela, 0, y, tela.width, fim - y, 0, 0, tela.width, fim - y);
      if (pag) pdf.addPage();
      pdf.addImage(parte.toDataURL('image/jpeg', 0.92), 'JPEG', margem, 0, larg, (fim - y) / pxPorMm);
      y = fim; pag++;
    }
    const nome = `GAIPO-CALC-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.pdf`;
    const fs = plugin('Filesystem'), share = plugin('Share');
    if (fs && share) {
      const base64 = pdf.output('datauristring').split(',')[1];
      const r = await fs.writeFile({ path: nome, data: base64, directory: 'CACHE' });
      await share.share({ title: 'Solução GAIPO CALC', text: dados.titulo || 'Solução', files: [r.uri], dialogTitle: 'Salvar ou enviar o PDF' });
      return 'compartilhado';
    }
    pdf.save(nome);
    return 'baixado';
  } finally {
    caixa.remove();
  }
}
