// ============================================================================
// TESTE -- roda o codigo do cliente DE VERDADE, sem navegador.
//
//   node teste/testa.js [caminho/do/mapa.html]
//
// Um arreio de DOM minimo (stubs de document/window + vm.runInContext) executa o
// mesmo script que vai para a pagina. Nao pega layout -- pega o que importa:
// regra de cor, referencia, ordenacao e os rotulos que descrevem a cor.
//
// Por que existe: os tres defeitos mais caros deste projeto nao eram de calculo,
// eram de ROTULO -- a tela dizia "vs. Brasil" enquanto media contra a UF. Numero
// certo com legenda errada parece certo, e e' o pior tipo de defeito de painel.
// ============================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ALVO = process.argv[2] || path.join(__dirname, '..', 'site', 'mapa.html');
if (!fs.existsSync(ALVO)) {
  console.error('nao achei ' + ALVO + '\ngere antes com:  npm start');
  process.exit(1);
}
const cliente = [...fs.readFileSync(ALVO, 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).pop();

// ---------------------------------------------------------------- stubs
const els = {};
function elo(id) {
  if (els[id]) return els[id];
  const e = {
    id, innerHTML: '', textContent: '', value: '', dataset: {}, attrs: {}, cls: new Set(), style: {},
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    classList: { toggle(c, on) { on ? e.cls.add(c) : e.cls.delete(c); },
                 add(c) { e.cls.add(c); }, remove(c) { e.cls.delete(c); },
                 contains(c) { return e.cls.has(c); } },
    parentNode: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 950 }) },
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) }),
    getScreenCTM: () => ({ inverse: () => ({}) })
  };
  els[id] = e;
  return e;
}
const ctx = {
  console,
  document: { getElementById: elo, querySelectorAll: () => [], addEventListener() {},
              documentElement: { setAttribute() {}, getAttribute: () => null } },
  window: { addEventListener() {} },
  matchMedia: () => ({ matches: false }),
  JSON, Math, Date, Intl, Number, String, Array, Map, Set, Object
};
vm.createContext(ctx);
vm.runInContext(cliente + '\n;globalThis.__t = { S, getA: () => A, setH: v => { H = v }, tudo, ' +
  'leituraUf, metricaDe, med, faixaDe, refDe, painel, MULTI, D, SGS, UIDX, R };', ctx);
const T = ctx.__t;

let falhas = 0, total = 0;
const ok = (c, m) => { total++; console.log((c ? '  ok    ' : '  FALHA ') + m); if (!c) falhas++; };
const H = id => els[id] ? els[id].innerHTML : '';
const soTexto = s => s.replace(/<[^>]*>/g, ' ');
const tudoNaJanela = () => { T.S.de = '2000-01-01'; T.S.ate = T.D.hoje; T.tudo(); };

// ---------------------------------------------------------------- montagem
console.log('\nMONTAGEM DO SVG');
const mapa = H('cam');
ok([...mapa.matchAll(/<use class="uf" id="u_\w\w"/g)].length === 27, 'as 27 UFs entram no mapa');
ok(mapa.indexOf('id="aro"') > mapa.lastIndexOf('<use class="uf"'),
   'o aro do selecionado e desenhado DEPOIS dos poligonos, senao some sob o vizinho');
const chips = [...mapa.matchAll(/<g class="chip" data-sg="(\w\w)"/g)].map(m => m[1]);
ok(chips.length === 8 && chips.includes('DF'),
   'as UFs pequenas ganham etiqueta fora do desenho: ' + chips.join(' '));
ok([...H('defs').matchAll(/<path id="g_/g)].length === 27,
   'a geometria fica no <defs> uma vez so (os mini-mapas so referenciam)');
ok(/semdado/.test(H('defs')), 'existe a hachura de "sem dado"');

// ---------------------------------------------------------------- regra de cor
console.log('\nA REGRA DE COR');
tudoNaJanela();
ok(T.faixaDe(5, 5) === 3 && T.faixaDe(6, 5) === 4 && T.faixaDe(10, 5) === 8,
   'com referencia 5: 5 e verde fraco, 6 vira amarelo e 10 (o dobro) e vermelho');
ok(T.faixaDe(1, 5) === 0 && T.faixaDe(9, 5) === 7,
   'os extremos: 1 e verde forte, 9 e amarelo forte');
ok(T.faixaDe(10, 0) === null, 'sem referencia confiavel nao pinta -- devolve null, nao uma cor qualquer');
const A = T.getA();
const comCor = T.SGS.map(sg => T.leituraUf(sg)).filter(x => x.f != null).length;
ok(comCor >= 20, comCor + ' das 27 UFs recebem cor com o minimo padrao de casos');
const rj = T.leituraUf('RJ');
ok(rj.f != null && els['u_RJ'].attrs.fill === 'var(--h' + rj.f + ')',
   'o que a funcao decide e o que o SVG recebe sao a MESMA faixa (RJ: h' + rj.f + ')');
ok(els['v_RJ'].textContent !== '' && els['v_RJ'].textContent !== '-',
   'o numero fica escrito junto da cor (RJ: ' + els['v_RJ'].textContent + ')');

// ---------------------------------------------------------------- referencia
console.log('\nA REFERENCIA MUDA COM A CATEGORIA ESCOLHIDA');
const uRJ = T.UIDX.get('RJ');
const nTudo = T.getA().tot.length;
ok(Math.abs(T.refDe(uRJ) - T.metricaDe(T.getA().tot)) < 0.01,
   'sem categoria, a referencia de uma UF e o BRASIL (' + T.refDe(uRJ) + ')');
T.S.cat = '0'; T.tudo();
ok(Math.abs(T.refDe(uRJ) - T.metricaDe(T.getA().uf.get(uRJ))) < 0.01,
   'com categoria, a referencia passa a ser a PROPRIA UF (' + T.refDe(uRJ) + ')');
ok(T.getA().tot.length === nTudo,
   'e o recorte NAO foi filtrado: os ' + nTudo.toLocaleString('pt-BR') +
   ' registros continuam sustentando a referencia');
T.S.cat = ''; T.tudo();

// ---------------------------------------------------------------- rotulos
console.log('\nOS ROTULOS ACOMPANHAM A REGRA (o defeito que motivou este teste)');
T.setH(null); T.tudo();
const refSem = /refer[êe]ncia ([\d.,]+)/i.exec(soTexto(H('painel')));
T.S.cat = '0'; T.tudo();
const pc = H('painel');
const refCom = /refer[êe]ncia ([\d.,]+)/i.exec(soTexto(pc));
ok(refSem && refCom && refSem[1] === refCom[1],
   'escolher uma categoria NAO muda a referencia da tabela (' + (refCom && refCom[1]) + ')');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const linhaSel = new RegExp('<td class="esq">' + esc(T.D.cats[0]) +
                            '</td>[\\s\\S]*?</td><td class="n">([\\d,]+)').exec(pc);
const espRazao = T.metricaDe(T.getA().ct.get(0)) / T.metricaDe(T.getA().tot);
ok(linhaSel && Math.abs(parseFloat(linhaSel[1].replace(',', '.')) - espRazao) < 0.011,
   'a razao da categoria confere com a conta contra o Brasil: tela ' +
   (linhaSel && linhaSel[1]) + ' x calculo ' + (Math.round(espRazao*100)/100).toFixed(2).replace('.',','));
ok(/vs\. a UF/i.test(pc), 'e o cabecalho passa a dizer "vs. a UF" em vez de "vs. Brasil"');
ok(/comparada com ela mesma/i.test(H('cards')),
   'o cartao para de anunciar "referencia da cor" quando ela deixou de ser');
T.S.cat = ''; T.tudo();
ok(/vs\. Brasil/i.test(H('painel')), 'e volta a dizer "vs. Brasil" ao limpar a categoria');

// ---------------------------------------------------------------- painel
console.log('\nO PAINEL');
ok(/Ranking das UFs/i.test(soTexto(H('painel'))), 'sem UF em foco, o painel mostra o ranking');
const algumaUf = T.SGS.find(sg => T.leituraUf(sg).n > 50);
T.setH(algumaUf); T.painel();
const p = H('painel');
ok(new RegExp(algumaUf).test(p), 'com o mouse numa UF o painel troca de cabeca (' + algumaUf + ')');
const cats = [...p.matchAll(/onclick="escolheCat\((\d+)\)"/g)].length;
ok(cats >= 3, 'lista ' + cats + ' categorias do lugar, cada uma clicavel');
ok(new RegExp(T.R.locais, 'i').test(p), 'e a lista de ' + T.R.locais.toLowerCase() + ' do estado');
const vals = [...p.matchAll(/class="pill"[^>]*>([\d.,]+)</g)]
  .map(m => parseFloat(m[1].replace('.', '').replace(',', '.')));
ok(vals.slice(0, 4).every((v, i) => i === 0 || vals[i - 1] >= v),
   'os piores vem primeiro (' + vals.slice(0, 4).join(' > ') + ')');
T.setH(null); T.tudo();

// ---------------------------------------------------------------- metricas
console.log('\nAS METRICAS');
const medBr = T.metricaDe(T.getA().tot);
T.S.metrica = 'avg'; T.tudo();
ok(T.metricaDe(T.getA().tot) > medBr,
   'a media (' + Math.round(T.metricaDe(T.getA().tot) * 10) / 10 + ') fica acima da mediana (' +
   medBr + '): a cauda longa aparece');
T.S.metrica = 'meta'; T.tudo();
ok(/%/.test(els['v_SP'].textContent), 'na metrica de meta o mapa passa a mostrar % (SP: ' +
   els['v_SP'].textContent + ')');
ok(/absoluta/i.test(soTexto(H('capcor'))),
   'e o paragrafo da cor se reescreve para a regua absoluta');
const bons = T.SGS.map(sg => T.leituraUf(sg)).filter(x => x.f != null);
const melhor = bons.reduce((a, b) => (a.v > b.v ? a : b));
ok(melhor.f <= 1, 'nesta metrica MAIOR e MELHOR: quem tem a maior taxa fica na faixa verde');
T.S.metrica = 'med'; T.tudo();

// ---------------------------------------------------------------- minimo
console.log('\nO MINIMO DE CASOS');
const antes = T.SGS.filter(sg => T.leituraUf(sg).f == null).length;
T.S.minN = 100000; T.tudo();
const depois = T.SGS.filter(sg => T.leituraUf(sg).f == null).length;
ok(depois === 27 && depois > antes,
   'com o minimo absurdo NENHUMA UF recebe cor (' + antes + ' -> ' + depois +
   '), em vez de colorir contra pouco caso');
T.S.minN = 5; T.tudo();

// ---------------------------------------------------------------- ponta a ponta
// So' vale para a base de demonstracao, que planta um padrao conhecido.
if (/exemplo/i.test(ALVO) || T.D.cats.some(c => /Gama/.test(c))) {
  console.log('\nPONTA A PONTA (o padrao plantado na demonstracao)');
  const iGama = T.D.cats.findIndex(c => /Gama/.test(c));
  T.S.cat = String(iGama); tudoNaJanela();
  const alvos = ['BA', 'AL', 'SE', 'MA', 'PI', 'PA', 'RN'].map(sg => T.leituraUf(sg));
  const acesos = alvos.filter(x => x.r >= 1.5).length;
  ok(acesos >= 5, acesos + ' dos 7 estados onde a demo plantou a lentidao aparecem acima de 1,5x');
  const limpos = ['SP', 'RS', 'PR', 'SC'].map(sg => T.leituraUf(sg)).filter(x => x.r < 1.3).length;
  ok(limpos >= 3, limpos + ' dos 4 estados sem o padrao ficam abaixo de 1,3x -- o sinal e local, ' +
     'nao um viés da categoria inteira');
  T.S.cat = ''; T.tudo();
}

console.log('\n' + (falhas ? falhas + ' FALHA(S) de ' + total : 'todas as ' + total + ' verificacoes passaram'));
process.exit(falhas ? 1 : 0);
