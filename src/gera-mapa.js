// ============================================================================
// MAPA DE CALOR DO BRASIL POR UF -> um HTML autonomo
//
//   node src/gera-mapa.js <entrada.csv> [saida.html]
//
// Entrada: CSV separado por ";", UTF-8, com cabecalho. Colunas exigidas
// (a ordem nao importa, o nome sim):
//
//   UF          sigla de 2 letras
//   LOCAL       municipio, comarca, filial -- o nivel abaixo da UF
//   CATEGORIA   o que se compara DENTRO da UF (banco, transportadora, produto)
//   DT_INICIO   AAAA-MM-DD
//   DT_FIM      AAAA-MM-DD
//
// O valor medido e' a distancia em dias entre DT_INICIO e DT_FIM. Linha que
// comeca com "--" e' ignorada (muito extrator carimba um comentario no topo).
//
// Saida: um unico .html, sem dependencia externa, que funciona por file:// e
// carrega UMA LINHA POR REGISTRO -- nao agregados. Mediana nao se agrega, e a
// tela precisa recalcular a cada combinacao de filtro.
//
// ⚠ Nunca usar crase em comentario dentro dos blocos de template literal daqui
//   (CSS e script do cliente): ela fecha a string e o erro aponta para a
//   abertura do bloco, centenas de linhas acima. Aspas sempre.
// ============================================================================
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ENTRADA = process.argv[2];
const SAIDA = process.argv[3] || path.join(RAIZ, 'site', 'mapa.html');
if (!ENTRADA) {
  console.error('uso: node src/gera-mapa.js <entrada.csv> [saida.html]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// VOCABULARIO
// O motor nao sabe do que voce esta falando: ele mede o tempo entre duas datas e
// compara categorias dentro de cada UF. O config.json so' troca as palavras.
// ---------------------------------------------------------------------------
const PADRAO = {
  titulo: 'Mapa de calor por UF', subtitulo: 'Tempo entre duas datas, por UF e por categoria',
  entidade: 'Categoria', entidades: 'Categorias', local: 'Local', locais: 'Locais',
  fato: 'casos', fatoCurto: 'Casos', unidade: 'dias',
  // ⚠ Portugues tem genero, e concatenar "todas as " + entidade produz "todas as
  //   bancos". Estes tres rotulos existem para a tela nao errar concordancia
  //   quando alguem trocar o vocabulario no config.json.
  todos: 'todas as categorias', todosCurto: 'Todas', doArtigo: 'da categoria',
  dataInicio: 'de inicio', dataFim: 'de fim',
  meta: { limite: 18, alvo: 95 }
};
let R = PADRAO;
const cfgPath = path.join(RAIZ, 'config.json');
if (fs.existsSync(cfgPath)) {
  const c = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  R = { ...PADRAO, ...c, meta: { ...PADRAO.meta, ...(c.meta || {}) } };
}

const GEO = JSON.parse(fs.readFileSync(path.join(RAIZ, 'dados', 'br-uf-paths.json'), 'utf8'));

// ⚠ ANCORA EM 2000, e a razao vale para qualquer projeto que empacote datas como
//   numero: o -1 marca "sem data", entao a ancora precisa ficar ANTES de toda
//   data possivel. Com a ancora em 2020, todo registro anterior virava numero
//   negativo, indistinguivel do -1, e sumia calado.
const EPOCH = Date.UTC(2000, 0, 1);
const dia = s => Math.round((Date.parse(s + 'T00:00:00Z') - EPOCH) / 86400000);
const iso = n => new Date(EPOCH + n * 86400000).toISOString().slice(0, 10);
const p2 = n => String(n).padStart(2, '0');
const carimbo = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
                     ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());

// ---------------------------------------------------------------------------
// LEITURA
// ---------------------------------------------------------------------------
const EXIGIDAS = ['UF', 'LOCAL', 'CATEGORIA', 'DT_INICIO', 'DT_FIM'];
const DATA_OK = /^\d{4}-\d{2}-\d{2}$/;

function ler(arq) {
  const linhas = fs.readFileSync(arq, 'utf8').split(/\r?\n/)
    .filter(l => l.trim() && !l.startsWith('--'));
  if (!linhas.length) throw new Error('arquivo vazio: ' + arq);
  const cab = linhas[0].split(';').map(s => s.trim());
  const faltam = EXIGIDAS.filter(c => !cab.includes(c));
  if (faltam.length) throw new Error('faltam colunas no CSV: ' + faltam.join(', ') +
                                     '  (achei: ' + cab.join(', ') + ')');
  const pos = {};
  EXIGIDAS.forEach(c => pos[c] = cab.indexOf(c));

  const regs = [];
  let malFormadas = 0, semData = 0, negativas = 0;
  for (const l of linhas.slice(1)) {
    const c = l.split(';');
    if (c.length !== cab.length) { malFormadas++; continue; }
    const v = {};
    for (const k of EXIGIDAS) v[k] = (c[pos[k]] || '').trim();
    if (!DATA_OK.test(v.DT_INICIO) || !DATA_OK.test(v.DT_FIM)) { semData++; continue; }
    const ini = dia(v.DT_INICIO);
    const d = dia(v.DT_FIM) - ini;
    if (d < 0) { negativas++; continue; }      // fim antes do inicio: dado sujo
    regs.push({ uf: (v.UF || 'ND').toUpperCase(), local: v.LOCAL || '(sem ' + R.local + ')',
                cat: v.CATEGORIA || '(sem ' + R.entidade + ')', ini, d });
  }
  return { regs, malFormadas, semData, negativas, total: linhas.length - 1 };
}

console.log('lendo ' + ENTRADA + ' ...');
const L = ler(ENTRADA);
console.log('  ' + L.regs.length.toLocaleString('pt-BR') + ' registros de ' +
            L.total.toLocaleString('pt-BR'));
if (L.malFormadas) console.log('  ⚠ ' + L.malFormadas + ' linha(s) com numero de campos diferente do cabecalho');
if (L.semData) console.log('  ⚠ ' + L.semData + ' linha(s) com data ausente ou fora de AAAA-MM-DD');
if (L.negativas) console.log('  ⚠ ' + L.negativas + ' linha(s) com DT_FIM anterior a DT_INICIO');

// ---------------------------------------------------------------------------
// PACOTE
// Indices em vez de texto repetido: o nome do local aparece uma vez so', e cada
// registro leva um numero. Num arquivo de 100 mil linhas isso vale megabytes.
// ---------------------------------------------------------------------------
const ufs = [], locais = [], cats = [];
const iUf = new Map(), iLoc = new Map(), iCat = new Map();

const col = { lo: [], ct: [], ini: [], d: [] };
for (const x of L.regs) {
  let u = iUf.get(x.uf);
  if (u === undefined) { u = ufs.length; ufs.push(x.uf); iUf.set(x.uf, u); }
  // ⚠ O local e' indexado DENTRO da UF: ha' nome de municipio repetido entre
  //   estados, e uma chave global juntaria lugares diferentes na mesma linha.
  const chaveLoc = x.uf + '|' + x.local;
  let l = iLoc.get(chaveLoc);
  if (l === undefined) { l = locais.length; locais.push([u, x.local]); iLoc.set(chaveLoc, l); }
  let c = iCat.get(x.cat);
  if (c === undefined) { c = cats.length; cats.push(x.cat); iCat.set(x.cat, c); }
  col.lo.push(l); col.ct.push(c); col.ini.push(x.ini); col.d.push(x.d);
}

const HOJE = iso(Math.max(...col.ini.map((v, i) => v + col.d[i])));
const emp = a => a.map(v => v.toString(36)).join(',');
const DADOS = {
  extraido: carimbo(new Date(fs.statSync(ENTRADA).mtimeMs)),
  hoje: HOJE, epoch: '2000-01-01', n: L.regs.length,
  ufs, locais, cats,
  lo: emp(col.lo), ct: emp(col.ct), ini: emp(col.ini), d: emp(col.d)
};
console.log('UFs ' + ufs.length + ' | ' + R.locais.toLowerCase() + ' ' + locais.length +
            ' | ' + R.entidades.toLowerCase() + ' ' + cats.length + ' | ultima data ' + HOJE);

// ---------------------------------------------------------------------------
// Callout das UFs pequenas. Rotulo dentro do poligono so' funciona onde cabe: o
// DF tem 327 unidades de area contra 83.078 do AM. Estas oito ganham etiqueta
// fora do desenho, ligada por uma linha fina.
// ---------------------------------------------------------------------------
const CALLOUT = {
  RN: [1064, 258], PB: [1064, 300], PE: [1064, 342], AL: [1064, 384],
  SE: [1064, 426], ES: [962, 648], RJ: [936, 748], DF: [748, 486]
};
const REGIAO = {
  N: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  NE: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  CO: ['DF', 'GO', 'MT', 'MS'], SE: ['ES', 'MG', 'RJ', 'SP'], S: ['PR', 'RS', 'SC']
};
const REG_DE = {};
for (const r in REGIAO) for (const s of REGIAO[r]) REG_DE[s] = r;
const NOME_REG = { N: 'Norte', NE: 'Nordeste', CO: 'Centro-Oeste', SE: 'Sudeste', S: 'Sul' };

const CSS = `
:root{
  --bg:#faf9f7; --surf:#fff; --surf2:#f4f2ef; --ink:#1a1a19; --ink2:#54534e;
  --ink3:#84837c; --linha:#e3e1dc; --linha2:#cfcdc7; --ac:#256abf; --ac2:#1c5cab;
  --aviso:#fab219;
  /* Semaforo de nove tons. h0-h3 verde forte -> fraco (ate a referencia),
     h4-h7 amarelo fraco -> forte (entre 1x e 2x) e h8 vermelho (o alerta).
     hi* e' a cor do TEXTO sobre cada fundo -- calculada uma vez, para o numero
     continuar legivel nas duas pontas da escala e nos dois temas. */
  --h0:#3f9e56; --h1:#74bd7e; --h2:#a9d9ab; --h3:#d7f0d0;
  --h4:#fdefb4; --h5:#ffe08a; --h6:#ffc85e; --h7:#f59f2b; --h8:#c62828;
  --hi0:#fff; --hi1:#102c17; --hi2:#102c17; --hi3:#14301a;
  --hi4:#40340a; --hi5:#3d2f06; --hi6:#3d2a03; --hi7:#351c00; --hi8:#fff;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#111110; --surf:#1a1a19; --surf2:#232322; --ink:#f2f0ec; --ink2:#b5b3ac;
    --ink3:#84837c; --linha:#333331; --linha2:#454542; --ac:#6da7ec; --ac2:#86b6ef;
    --h0:#2e8b4a; --h1:#26663a; --h2:#204d2d; --h3:#1b3823;
    --h4:#453a14; --h5:#665218; --h6:#8a6a15; --h7:#a87d18; --h8:#b32b2b;
    --hi0:#eafaee; --hi1:#dcefd8; --hi2:#cfe6cc; --hi3:#cfe6cc;
    --hi4:#f2ead2; --hi5:#f7ecd4; --hi6:#fbf1da; --hi7:#fff6e2; --hi8:#ffe0e0;
  }
}
:root[data-theme="dark"]{
  --bg:#111110; --surf:#1a1a19; --surf2:#232322; --ink:#f2f0ec; --ink2:#b5b3ac;
  --ink3:#84837c; --linha:#333331; --linha2:#454542; --ac:#6da7ec; --ac2:#86b6ef;
  --h0:#2e8b4a; --h1:#26663a; --h2:#204d2d; --h3:#1b3823;
  --h4:#453a14; --h5:#665218; --h6:#8a6a15; --h7:#a87d18; --h8:#b32b2b;
  --hi0:#eafaee; --hi1:#dcefd8; --hi2:#cfe6cc; --hi3:#cfe6cc;
  --hi4:#f2ead2; --hi5:#f7ecd4; --hi6:#fbf1da; --hi7:#fff6e2; --hi8:#ffe0e0;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:13px/1.5 "Geist","Inter",-apple-system,"Segoe UI",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:1560px;margin:0 auto;padding:22px 26px 70px}
h1{font-size:22px;font-weight:650;letter-spacing:-.02em;margin:0 0 4px}
h2{font-size:15px;font-weight:600;letter-spacing:-.01em;margin:0 0 3px}
h3{font-size:11px;font-weight:600;letter-spacing:.05em;margin:14px 0 6px;color:var(--ink3);
  text-transform:uppercase}
.sub{color:var(--ink2);font-size:12.5px;margin:0 0 18px}
.secao{margin-top:16px;background:var(--surf);border:1px solid var(--linha);border-radius:10px;
  padding:16px 18px}
.cap{color:var(--ink2);font-size:12px;margin:0 0 12px;text-align:justify;max-width:105ch}
.topo{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
button.tema{background:var(--surf);color:var(--ink2);border:1px solid var(--linha2);border-radius:7px;
  padding:6px 11px;font:inherit;font-size:12px;cursor:pointer}
button.tema:hover{border-color:var(--ac)}
.filtros{position:sticky;top:0;z-index:20;background:var(--surf);border:1px solid var(--linha);
  border-radius:10px;padding:11px 14px;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;
  box-shadow:0 1px 3px rgba(0,0,0,.05)}
.f{display:flex;flex-direction:column;gap:4px}
.f label{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3);font-weight:600}
.f select,.f input{background:var(--bg);color:var(--ink);border:1px solid var(--linha2);border-radius:6px;
  padding:5px 8px;font:inherit;font-size:12.5px;min-width:92px}
.f select:focus,.f input:focus{outline:2px solid var(--ac);outline-offset:-1px}
.atalhos{display:flex;gap:5px}
.atalhos button{background:var(--surf2);color:var(--ink2);border:1px solid var(--linha);border-radius:6px;
  padding:5px 9px;font:inherit;font-size:11.5px;cursor:pointer}
.atalhos button:hover{border-color:var(--ac);color:var(--ink)}
.atalhos button[aria-pressed="true"]{background:var(--ac);border-color:var(--ac);color:#fff}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:14px}
.card{background:var(--surf);border:1px solid var(--linha);border-radius:10px;padding:13px 15px}
.card .rot{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3);font-weight:600}
.card .val{font-size:26px;font-weight:650;letter-spacing:-.02em;margin-top:5px;font-variant-numeric:tabular-nums}
.card .val small{font-size:13px;font-weight:500;color:var(--ink2);letter-spacing:0}
.card .pe{font-size:11.5px;color:var(--ink2);margin-top:3px}

/* ---- o mapa ---- */
.palco{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(330px,.9fr);gap:18px;align-items:start}
@media(max-width:1080px){.palco{grid-template-columns:1fr}}
.mapabox{position:relative;background:var(--surf2);border:1px solid var(--linha);border-radius:10px;
  overflow:hidden}
svg.br{width:100%;height:auto;display:block;cursor:grab;touch-action:none}
svg.br.arrasta{cursor:grabbing}
.uf{stroke:var(--surf);stroke-width:1.2;stroke-linejoin:round;cursor:pointer}
.uf.apaga{opacity:.3}
.aro{fill:none;stroke:var(--ink);stroke-width:2.6;pointer-events:none}
text.sg{font-size:14px;font-weight:700;text-anchor:middle;letter-spacing:-.02em}
text.vl{font-size:12px;font-weight:600;text-anchor:middle;font-variant-numeric:tabular-nums}
.rot,.chip{cursor:pointer}
/* ⚠ A etiqueta do DF cai DENTRO do mapa, sobre os vizinhos -- e eles caem na
   mesma faixa de cor que ele com frequencia. Com a borda branca dos outros
   chips a etiqueta sumia no fundo. Contorno em --ink3 e' o que garante que ela
   se leia como etiqueta seja qual for a cor debaixo. */
.chip rect{stroke:var(--ink3);stroke-width:1.3}
.lider{stroke:var(--linha2);stroke-width:1.1;fill:none;pointer-events:none}
.ferramentas{position:absolute;top:9px;right:9px;display:flex;flex-direction:column;gap:4px;z-index:3}
.ferramentas button{width:27px;height:27px;background:var(--surf);color:var(--ink2);
  border:1px solid var(--linha2);border-radius:6px;font:inherit;font-size:14px;line-height:1;
  cursor:pointer;padding:0}
.ferramentas button:hover{border-color:var(--ac);color:var(--ac)}
.dica{position:absolute;pointer-events:none;z-index:5;background:var(--surf);border:1px solid var(--linha2);
  border-radius:7px;padding:7px 10px;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.16);
  max-width:260px;display:none}
.dica b{font-size:12.5px}
.dica .l{color:var(--ink2);font-size:11.5px;margin-top:1px}
.dica table{margin-top:5px;font-size:11.5px}
.dica td{padding:1px 0 1px 8px;border:0}
.dica td.esq{padding-left:0;color:var(--ink2)}

/* ---- painel lateral ---- */
.painel{background:var(--surf);border:1px solid var(--linha);border-radius:10px;padding:14px 16px}
.painel .cabeca{display:flex;justify-content:space-between;align-items:center;gap:8px}
.painel .cabeca b{font-size:16px;font-weight:650;letter-spacing:-.01em}
.painel .cabeca span.reg{font-size:11.5px;color:var(--ink3);font-weight:400}
.fix{font-size:10.5px;color:var(--ac);border:1px solid var(--ac);border-radius:20px;
  padding:1px 8px;cursor:pointer;white-space:nowrap}
.fix.off{color:var(--ink3);border-color:var(--linha2)}
.resumo{display:flex;gap:16px;margin:10px 0 2px;flex-wrap:wrap}
.resumo div{font-size:11px;color:var(--ink3);text-transform:uppercase;letter-spacing:.04em}
.resumo b{display:block;font-size:20px;color:var(--ink);font-weight:650;letter-spacing:-.02em;
  font-variant-numeric:tabular-nums;text-transform:none}
table{border-collapse:separate;border-spacing:0;width:100%;font-size:12.5px}
th,td{text-align:right;padding:4px 6px;border-bottom:1px solid var(--linha)}
thead th{font-size:10.5px;font-weight:600;color:var(--ink3);text-transform:uppercase;
  letter-spacing:.04em;border-bottom:1px solid var(--linha2);white-space:nowrap}
th.esq,td.esq{text-align:left}
.n{font-variant-numeric:tabular-nums}
tbody tr.cl{cursor:pointer}
tbody tr.cl:hover td{background:var(--surf2)}
tbody tr.at td{background:var(--surf2)}
tbody tr.at td.esq{font-weight:650}
tbody tr.fraca{opacity:.45}
/* A tabela de categorias cabe inteira; cortar a ultima linha ao meio faz
   parecer que falta dado. So' o ranking das 27 UFs rola. */
.rolo{max-height:none}
.rolo.rola{max-height:430px;overflow:auto}
.pill{display:inline-block;min-width:50px;padding:2px 7px;border-radius:5px;font-weight:600;
  font-variant-numeric:tabular-nums;font-size:12px;text-align:center}
.pill.vazia{background:none;border:1px dashed var(--linha2);color:var(--ink3);font-weight:400}
.leg{display:flex;align-items:center;flex-wrap:wrap;margin:10px 0 0;font-size:11px;color:var(--ink2)}
.leg i{display:inline-block;width:30px;height:14px;border-radius:3px}
.leg span{padding:0 6px 0 4px}
.leg .sd{width:16px;border:1px dashed var(--linha2);background:none}
.nota{font-size:11.5px;color:var(--ink3);margin-top:10px;text-align:justify}
.nota b{color:var(--ink2);font-weight:600}
.aviso{border-left:3px solid var(--aviso);padding-left:11px;margin:12px 0;font-size:12px;
  color:var(--ink2);text-align:justify}

/* ---- pequenos multiplos ---- */
.multi{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:12px;margin-top:4px}
.mini{background:var(--surf2);border:1px solid var(--linha);border-radius:9px;padding:8px 9px 4px;
  cursor:pointer}
.mini:hover{border-color:var(--ac)}
.mini.at{border-color:var(--ac);box-shadow:0 0 0 1px var(--ac) inset}
.mini .tt{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mini .st{font-size:11px;color:var(--ink3);font-variant-numeric:tabular-nums;margin-bottom:2px}
.mini svg{width:100%;height:auto;display:block}
.mini .uf{stroke-width:2.5;stroke:var(--surf2);cursor:pointer}
`;

const P30 = iso(dia(HOJE) - 30), P90 = iso(dia(HOJE) - 90);
const P12M = iso(dia(HOJE) - 365), PANO = HOJE.slice(0, 4) + '-01-01';

const CLIENTE = `
const D = DADOS, G = GEOM, CALL = CALLOUT, REGDE = REG_DE, NREG = NOME_REG, R = ROTULOS;
const dec = s => s.length ? s.split(",").map(v => parseInt(v, 36)) : [];
const LO = dec(D.lo), CT = dec(D.ct), INI = dec(D.ini), DIAS = dec(D.d);
const N = LO.length;
/* As datas viajam como numero de dias desde a ancora (D.epoch), nao como texto:
   comparar inteiro e' o que deixa o filtro de periodo instantaneo em 100 mil
   linhas. A ancora vem do pacote para o cliente nao precisar saber dela. */
const EPOCH = Date.parse(D.epoch + "T00:00:00Z");
const dia = s => Math.round((Date.parse(s + "T00:00:00Z") - EPOCH) / 86400000);
const UFDE = i => D.locais[i][0];
const UIDX = new Map(); D.ufs.forEach((s, i) => UIDX.set(s, i));

const S = { de:"${P90}", ate:D.hoje, ancora:"fim", metrica:"med", minN:5,
            cat:"", sel:null, fixo:false };
let H = null;                          // UF sob o mouse
const foco = () => H !== null ? H : S.sel;

/* ---------- estatistica ---------- */
const ord = a => a.slice().sort((x, y) => x - y);
function med(a){ if(!a.length) return null; const s=ord(a), m=s.length>>1;
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2; }
function pct(a,p){ if(!a.length) return null; const s=ord(a);
  return s[Math.min(s.length-1, Math.floor(p/100*s.length))]; }
const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null;
/* ⚠ "meta" e a UNICA metrica em que MAIOR e MELHOR. Cor, ordem e titulo tem de
   perguntar por MAIOR_MELHOR() antes de decidir o sentido. Esquecer isso deixa
   a tela ordenando ao contrario sem nenhum sintoma obvio. */
const LIMITE = R.meta.limite, ALVO = R.meta.alvo;
const MAIOR_MELHOR = () => S.metrica === "meta";
function metricaDe(a){
  if(!a.length) return null;
  if(S.metrica==="med") return med(a);
  if(S.metrica==="avg") return avg(a);
  if(S.metrica==="meta") return 100 * a.filter(v => v <= LIMITE).length / a.length;
  return pct(a,75);
}
const fmt  = v => v==null ? "" : (Math.round(v*10)/10).toLocaleString("pt-BR");
const fmtN = v => v==null ? "" : Math.round(v).toLocaleString("pt-BR");
const fmtP = v => v==null ? "" : (Math.round(v*10)/10).toLocaleString("pt-BR") + "%";
const fmtM = v => v==null ? "" : (MAIOR_MELHOR() ? fmtP(v) : fmt(v));
const fmtR = r => r==null ? "" : (Math.round(r*100)/100).toLocaleString("pt-BR",
                  {minimumFractionDigits:2}) + "\\u00d7";
const ROT_METRICA = { med:"mediana", avg:"m\\u00e9dia", p75:"P75",
                      meta:"% em " + LIMITE + " " + R.unidade };

/* ---------- A REGRA DE COR ----------
   A cor sai da RAZAO entre o valor e uma referencia, nunca do valor absoluto.
   - Com todas as categorias, a referencia de cada UF e' o BRASIL. Sem essa
     excecao toda UF se compararia consigo mesma e ficaria no verde mais fraco:
     o mapa perderia justamente a leitura de "onde e' lento".
   - Com uma categoria escolhida, a referencia passa a ser a mediana da PROPRIA
     UF com TODAS as categorias. A pergunta muda de "isto e' rapido?" para
     "isto esta fora do ritmo daqui?" -- e e' a segunda que interessa quando se
     compara um fornecedor com os outros no mesmo lugar.
   Consequencia assumida: a MESMA quantidade de dias pode sair verde num estado
   e vermelha em outro. Por isso o numero fica sempre escrito na tela, e duas
   telas com filtros diferentes nao se comparam pela cor -- so' pelo numero.  */
const CORTES_R = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75];
/* ⚠ A regua da metrica de meta e' ABSOLUTA, ancorada no alvo. Porcentagem
   comparada com a taxa da propria linha viraria "o dobro da taxa", que nao quer
   dizer nada num numero que para em 100. */
const CORTES_META = [ALVO, 90, 85, 80, 70, 60, 50, 40];
function faixaDe(v, ref){
  if(MAIOR_MELHOR()){
    for(let i=0;i<CORTES_META.length;i++) if(v >= CORTES_META[i]) return i;
    return 8;
  }
  if(!(ref > 0)) return null;                 // sem referencia confiavel, sem cor
  const r = v / ref;
  if(r >= 2) return 8;                        // o alerta
  for(let i=0;i<CORTES_R.length;i++) if(r <= CORTES_R[i]) return i;
  return 7;
}
const ROTCOR_T = ["&le; &frac14;","&frac14;-&frac12;","&frac12;-&frac34;","&frac34;-1&times;",
                  "1-1,25&times;","1,25-1,5&times;","1,5-1,75&times;","1,75-2&times;",
                  "&ge; 2&times; alerta"];
const rotCor = () => MAIOR_MELHOR()
  ? ["&ge; " + ALVO + "% alvo","90-95","85-90","80-85","70-80","60-70","50-60","40-50","&lt; 40%"]
  : ROTCOR_T;

/* ---------- agregacao ----------
   ⚠ O filtro de CATEGORIA nao entra aqui, de proposito. A cor de uma UF com
   categoria escolhida e' a razao contra a mediana da UF INTEIRA; se o recorte
   ja' viesse filtrado, a referencia seria a propria categoria e toda UF sairia
   em 1,00x -- o mapa ficaria uniformemente verde e pareceria funcionar.      */
let A = null;
function agrega(){
  const d0 = dia(S.de), d1 = dia(S.ate);
  const tot = [], uf = new Map(), ufc = new Map(), ct = new Map(), loc = new Map(), locc = new Map();
  const poe = (m,k,v) => { let a = m.get(k); if(!a){ a = []; m.set(k,a); } a.push(v); };
  for(let i=0;i<N;i++){
    const ini = INI[i], d = DIAS[i];
    /* ancora "fim": o registro entra pela data de FIM (mede o que saiu).
       ancora "ini": entra pela data de INICIO (coorte, e sofre censura -- o que
       comecou e ainda nao terminou nao aparece).                              */
    const q = S.ancora === "fim" ? ini + d : ini;
    if(q < d0 || q > d1) continue;
    const l = LO[i], u = UFDE(l), c = CT[i];
    tot.push(d); poe(uf,u,d); poe(ct,c,d); poe(ufc,u+"|"+c,d);
    poe(loc,l,d); poe(locc,l+"|"+c,d);
  }
  A = { tot, uf, ufc, ct, loc, locc, ref: metricaDe(tot) };
}
const serie = u => S.cat === "" ? (A.uf.get(u)||[]) : (A.ufc.get(u+"|"+S.cat)||[]);
/* A referencia tambem exige o minimo de casos: colorir contra um numero frouxo
   e' pior que nao colorir. */
function refDe(u){
  if(S.cat === "") return A.tot.length >= S.minN ? A.ref : 0;
  const a = A.uf.get(u) || [];
  return a.length >= S.minN ? metricaDe(a) : 0;
}
function leituraUf(sg){
  const u = UIDX.get(sg);
  if(u === undefined) return { n:0, v:null, f:null, r:null, ref:0, arr:[] };
  const arr = serie(u), ref = refDe(u), v = metricaDe(arr);
  const f = (!arr.length || arr.length < S.minN) ? null : faixaDe(v, ref);
  return { u, arr, n:arr.length, v, ref, f, r: (v!=null && ref>0) ? v/ref : null };
}
const estilo = f => f==null ? "" : "background:var(--h"+f+");color:var(--hi"+f+")";
function pill(v, f){
  if(v == null) return '<span class="pill vazia">-</span>';
  return '<span class="pill" style="'+(f==null ? "border:1px dashed var(--linha2)" : estilo(f))+'">'+
         fmtM(v)+'</span>';
}

/* ---------- o desenho (montado UMA vez, repintado a cada filtro) ---------- */
const svg = document.getElementById("mapa");
const cam = document.getElementById("cam");
const SGS = Object.keys(G.ufs);
function montaMapa(){
  let defs = '<pattern id="semdado" width="8" height="8" patternUnits="userSpaceOnUse" ' +
             'patternTransform="rotate(45)"><rect width="8" height="8" fill="var(--surf)"/>' +
             '<line x1="0" y1="0" x2="0" y2="8" stroke="var(--linha2)" stroke-width="2.5"/></pattern>';
  /* ⚠ A geometria vai para o <defs> UMA vez e todo mundo referencia com <use>.
     Repetir o "d" de 27 poligonos em 12 mini-mapas seriam ~150 mil pontos no
     DOM, e a pagina passa a engasgar em cada repintura. */
  for(const sg of SGS) defs += '<path id="g_'+sg+'" d="'+G.ufs[sg].d+'"/>';
  let corpo = "", rots = "", lider = "";
  for(const sg of SGS){
    corpo += '<use class="uf" id="u_'+sg+'" href="#g_'+sg+'" data-sg="'+sg+'"></use>';
    const g = G.ufs[sg], c = CALL[sg];
    if(c){
      lider += '<line class="lider" x1="'+g.cx+'" y1="'+g.cy+'" x2="'+(c[0]-34)+'" y2="'+c[1]+'"></line>';
      rots += '<g class="chip" data-sg="'+sg+'" data-x="'+c[0]+'" data-y="'+c[1]+'" ' +
              'transform="translate('+c[0]+','+c[1]+')">' +
              '<rect id="r_'+sg+'" x="-34" y="-15" width="68" height="30" rx="5"></rect>' +
              '<text class="sg" id="s_'+sg+'" x="0" y="-1">'+sg+'</text>' +
              '<text class="vl" id="v_'+sg+'" x="0" y="12"></text></g>';
    } else {
      rots += '<g class="rot" data-sg="'+sg+'" data-x="'+g.cx+'" data-y="'+g.cy+'" ' +
              'transform="translate('+g.cx+','+g.cy+')">' +
              '<text class="sg" id="s_'+sg+'" x="0" y="-1">'+sg+'</text>' +
              '<text class="vl" id="v_'+sg+'" x="0" y="13"></text></g>';
    }
  }
  cam.innerHTML = corpo + lider +
    '<use class="aro" id="aro" href="#g_SP" style="display:none"></use>' + rots;
  document.getElementById("defs").innerHTML = defs;
  cam.querySelectorAll("[data-sg]").forEach(el => {
    const sg = el.dataset.sg;
    el.addEventListener("mouseenter", () => { H = sg; realca(); painel(); });
    el.addEventListener("mouseleave", () => { H = null; realca(); painel(); });
    el.addEventListener("click", ev => { ev.stopPropagation(); escolheUf(sg); });
  });
}
function pintaMapa(){
  for(const sg of SGS){
    const L = leituraUf(sg), el = document.getElementById("u_"+sg);
    el.setAttribute("fill", L.f==null ? "url(#semdado)" : "var(--h"+L.f+")");
    const cor = L.f==null ? "var(--ink3)" : "var(--hi"+L.f+")";
    const s = document.getElementById("s_"+sg), v = document.getElementById("v_"+sg);
    s.setAttribute("fill", cor); v.setAttribute("fill", cor);
    v.textContent = L.v==null ? "-" : fmtM(L.v);
    const r = document.getElementById("r_"+sg);
    if(r) r.setAttribute("fill", L.f==null ? "var(--surf)" : "var(--h"+L.f+")");
  }
}
/* O aro do selecionado vai DEPOIS dos poligonos: uma borda desenhada no meio da
   pilha some debaixo do vizinho que for pintado em seguida. */
function realca(){
  const alvo = foco(), aro = document.getElementById("aro");
  if(alvo){ aro.setAttribute("href", "#g_"+alvo); aro.style.display = ""; }
  else aro.style.display = "none";
  for(const sg of SGS)
    document.getElementById("u_"+sg).classList.toggle("apaga", !!alvo && sg !== alvo);
}

/* ---------- camera ----------
   Os rotulos ficam DENTRO da camera com escala 1/k, entao o texto nao cresce
   junto com o zoom -- um "SP" de 14px viraria 84px em 6x. */
let Z = { k:1, x:0, y:0 };
function aplicaCam(){
  cam.setAttribute("transform", "translate("+Z.x+","+Z.y+") scale("+Z.k+")");
  cam.querySelectorAll(".rot,.chip").forEach(g => {
    g.setAttribute("transform", "translate("+g.dataset.x+","+g.dataset.y+") scale("+(1/Z.k)+")");
  });
  document.getElementById("zreset").style.visibility = Z.k > 1.001 ? "visible" : "hidden";
}
function pontoDe(ev){
  const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
function zoom(fator, p){
  const k2 = Math.min(8, Math.max(1, Z.k * fator));
  Z.x = p.x - (p.x - Z.x) * (k2 / Z.k);
  Z.y = p.y - (p.y - Z.y) * (k2 / Z.k);
  Z.k = k2;
  if(Z.k <= 1.001){ Z.k = 1; Z.x = 0; Z.y = 0; }
  aplicaCam();
}
svg.addEventListener("wheel", ev => { ev.preventDefault();
  zoom(ev.deltaY < 0 ? 1.2 : 1/1.2, pontoDe(ev)); }, { passive:false });
let arrasto = null;
svg.addEventListener("mousedown", ev => { arrasto = pontoDe(ev); svg.classList.add("arrasta"); });
window.addEventListener("mouseup", () => { arrasto = null; svg.classList.remove("arrasta"); });
svg.addEventListener("mousemove", ev => {
  dica(ev);
  if(!arrasto) return;
  const p = pontoDe(ev);
  Z.x += p.x - arrasto.x; Z.y += p.y - arrasto.y;
  arrasto = p; aplicaCam();
});
svg.addEventListener("mouseleave", () => { document.getElementById("dica").style.display = "none"; });
svg.addEventListener("click", () => { if(S.fixo){ S.fixo = false; S.sel = null; tudo(); } });

/* ---------- a caixinha que segue o mouse ---------- */
function dica(ev){
  const cx = document.getElementById("dica");
  if(H === null){ cx.style.display = "none"; return; }
  const L = leituraUf(H), box = svg.parentNode.getBoundingClientRect();
  let h = '<b>'+H+' &middot; '+G.ufs[H].nome+'</b>' +
          '<div class="l">'+NREG[REGDE[H]]+(S.cat==="" ? "" : " &middot; "+D.cats[+S.cat])+'</div>';
  if(!L.n) h += '<div class="l">sem registro no recorte</div>';
  else {
    h += '<table><tr><td class="esq">'+R.fatoCurto+'</td><td class="n">'+fmtN(L.n)+'</td></tr>' +
         '<tr><td class="esq">'+ROT_METRICA[S.metrica]+'</td><td class="n">'+fmtM(L.v)+
         (MAIOR_MELHOR() ? "" : " "+R.unidade)+'</td></tr>';
    if(!MAIOR_MELHOR() && L.r != null)
      h += '<tr><td class="esq">'+(S.cat==="" ? "vs. Brasil" : "vs. a UF")+
           '</td><td class="n">'+fmtR(L.r)+'</td></tr>';
    h += '</table>';
    if(L.n < S.minN) h += '<div class="l">abaixo do m\\u00ednimo de '+S.minN+' casos - sem cor</div>';
  }
  cx.innerHTML = h;
  cx.style.display = "block";
  const x = ev.clientX - box.left, y = ev.clientY - box.top;
  cx.style.left = Math.min(x + 14, box.width - cx.offsetWidth - 6) + "px";
  cx.style.top  = Math.max(6, Math.min(y + 14, box.height - cx.offsetHeight - 6)) + "px";
}

/* ---------- painel ---------- */
function escolheUf(sg){
  if(S.sel === sg && S.fixo){ S.sel = null; S.fixo = false; }
  else { S.sel = sg; S.fixo = true; }
  tudo();
}
function escolheCat(c){
  S.cat = (String(S.cat) === String(c)) ? "" : String(c);
  document.getElementById("fcat").value = S.cat;
  tudo();
}
function painel(){
  const alvo = foco(), el = document.getElementById("painel");
  const naUf = alvo !== null && alvo !== undefined;
  const L = naUf ? leituraUf(alvo) : null;
  /* ⚠ DUAS series diferentes, e confundi-las e' o erro facil de cometer aqui:
     - "arr" e' o DESTAQUE, o mesmo que o mapa esta mostrando (a categoria
       escolhida, se houver), e alimenta o resumo de cima;
     - "ref" e' a referencia do LUGAR, sempre com TODAS as categorias, e e'
       contra ela que cada linha das tabelas recebe cor e razao.
     Usar o destaque como referencia faz a categoria escolhida virar 1,00x e
     todas as outras serem medidas contra ela: a tabela muda de significado no
     clique, e continua parecendo certa. */
  const totLugar = naUf ? (A.uf.get(L.u) || []) : A.tot;
  const arr = naUf ? L.arr : (S.cat === "" ? A.tot : (A.ct.get(+S.cat) || []));
  const v = metricaDe(arr);
  const ref = totLugar.length >= S.minN ? metricaDe(totLugar) : 0;
  const rotVs = S.cat === "" ? "vs. Brasil" : "vs. a UF";
  let h = '<div class="cabeca"><b>' + (naUf ? alvo + ' <span class="reg">' + G.ufs[alvo].nome +
          '</span>' : 'Brasil') + '</b>' +
          (naUf ? '<span class="fix'+(S.fixo?'':' off')+'" onclick="escolheUf(\\''+alvo+'\\')">' +
                  (S.fixo ? 'fixado - clique para soltar' : 'clique no mapa para fixar') + '</span>'
                : '<span class="fix off">passe o mouse no mapa</span>') + '</div>';
  h += '<div class="resumo"><div>'+R.fatoCurto+'<b>'+fmtN(arr.length)+'</b></div>' +
       '<div>'+ROT_METRICA[S.metrica]+'<b>'+(v==null?"-":fmtM(v))+'</b></div>' +
       (naUf && !MAIOR_MELHOR() && L.r!=null
          ? '<div>'+rotVs+'<b>'+fmtR(L.r)+'</b></div>' : "") +
       (S.cat !== "" ? '<div>'+R.entidade+'<b style="font-size:14px">'+D.cats[+S.cat]+'</b></div>' : "") +
       '</div>';

  h += '<h3>' + R.entidades + ' ' + (naUf ? 'em ' + alvo : 'no Brasil') +
       ' &middot; refer\\u00eancia ' + (ref ? fmtM(metricaDe(totLugar)) : "-") + '</h3>';
  const linhas = [];
  for(let c = 0; c < D.cats.length; c++){
    const a = naUf ? (A.ufc.get(L.u + "|" + c) || []) : (A.ct.get(c) || []);
    if(!a.length) continue;
    const vc = metricaDe(a);
    const f = a.length < S.minN ? null : faixaDe(vc, ref);
    linhas.push({ c, n:a.length, v:vc, f, r: (ref>0 ? vc/ref : null), fraca: a.length < S.minN });
  }
  /* Piores primeiro (e' a leitura acionavel). Quem esta abaixo do minimo nao
     disputa: vai para o fim, esmaecido -- senao uma categoria de 2 casos vira a
     "pior do estado" e a tela mente com cara de certa. */
  const sinal = MAIOR_MELHOR() ? 1 : -1;
  linhas.sort((x,y) => (x.fraca-y.fraca) || sinal*(x.v-y.v) || (y.n-x.n));
  h += '<div class="rolo"><table><thead><tr><th class="esq">'+R.entidade+'</th><th>'+R.fatoCurto+'</th>' +
       '<th>'+ROT_METRICA[S.metrica]+'</th><th>vs. o lugar</th></tr></thead><tbody>';
  for(const l of linhas)
    h += '<tr class="cl'+(String(S.cat)===String(l.c)?" at":"")+(l.fraca?" fraca":"")+
         '" onclick="escolheCat('+l.c+')">' +
         '<td class="esq">'+D.cats[l.c]+'</td><td class="n">'+fmtN(l.n)+'</td>' +
         '<td>'+pill(l.v, l.f)+'</td><td class="n">'+(MAIOR_MELHOR()?"":fmtR(l.r))+'</td></tr>';
  if(!linhas.length) h += '<tr><td class="esq" colspan="4">Sem registro no recorte.</td></tr>';
  h += '</tbody></table></div>';

  if(naUf){
    /* O local acompanha a categoria escolhida -- se o mapa mostra uma categoria
       e a lista de locais mostrar todas, as duas metades da tela contam
       historias diferentes. A referencia continua sendo a UF inteira. */
    const cs = [];
    for(const [k, aTot] of A.loc){
      if(D.locais[k][0] !== L.u) continue;
      const a = S.cat === "" ? aTot : (A.locc.get(k + "|" + S.cat) || []);
      if(a.length < S.minN) continue;
      const vc = metricaDe(a);
      cs.push({ nome:D.locais[k][1], n:a.length, v:vc, f:faixaDe(vc, ref),
                r: ref>0 ? vc/ref : null });
    }
    cs.sort((x,y) => sinal*(x.v-y.v) || (y.n-x.n));
    if(cs.length){
      h += '<h3>' + R.locais + ' ' + (MAIOR_MELHOR() ? "com pior taxa" : "mais lentos") +
           ' &middot; ' + cs.length + ' com ' + S.minN + '+ casos</h3>';
      h += '<div class="rolo"><table><thead><tr><th class="esq">'+R.local+'</th><th>'+R.fatoCurto+'</th>' +
           '<th>'+ROT_METRICA[S.metrica]+'</th><th>vs. a UF</th></tr></thead><tbody>';
      for(const c of cs.slice(0, 12))
        h += '<tr><td class="esq">'+c.nome+'</td><td class="n">'+fmtN(c.n)+'</td>' +
             '<td>'+pill(c.v, c.f)+'</td><td class="n">'+(MAIOR_MELHOR()?"":fmtR(c.r))+'</td></tr>';
      h += '</tbody></table></div>';
    }
  } else {
    /* ⚠ O cabecalho tem de dizer contra QUEM e' a razao: com uma categoria
       escolhida ela deixa de ser contra o Brasil e passa a ser contra a UF. */
    h += '<h3>Ranking das UFs</h3>';
    const us = SGS.map(sg => ({ sg, ...leituraUf(sg) }));
    us.sort((x,y) => ((x.f==null)-(y.f==null)) || sinal*((x.v==null?0:x.v)-(y.v==null?0:y.v)) ||
                     (y.n - x.n));
    h += '<div class="rolo rola"><table><thead><tr><th class="esq">UF</th><th>'+R.fatoCurto+'</th>' +
         '<th>'+ROT_METRICA[S.metrica]+'</th><th>'+rotVs+'</th></tr></thead><tbody>';
    for(const u of us)
      h += '<tr class="cl'+(u.f==null?" fraca":"")+'" onclick="escolheUf(\\''+u.sg+'\\')">' +
           '<td class="esq">'+u.sg+'</td><td class="n">'+fmtN(u.n)+'</td>' +
           '<td>'+pill(u.v, u.f)+'</td><td class="n">'+(MAIOR_MELHOR()?"":fmtR(u.r))+'</td></tr>';
    h += '</tbody></table></div>';
  }
  el.innerHTML = h;
}

/* ---------- pequenos multiplos ---------- */
let MULTI = [];
function montaMulti(){
  const cont = document.getElementById("multi");
  const lista = [...A.ct.entries()].filter(x => x[1].length >= 20)
                 .sort((a,b) => b[1].length - a[1].length).slice(0, 12);
  MULTI = lista.map(x => x[0]);
  let h = "";
  for(const c of MULTI){
    let ps = "";
    for(const sg of SGS) ps += '<use class="uf" id="m'+c+'_'+sg+'" href="#g_'+sg+'" data-sg="'+sg+'"></use>';
    h += '<div class="mini" id="mini_'+c+'" onclick="escolheCat('+c+')" title="'+D.cats[c]+'">' +
         '<div class="tt">'+D.cats[c]+'</div><div class="st" id="mst_'+c+'"></div>' +
         '<svg viewBox="0 0 1000 1050">'+ps+'</svg></div>';
  }
  cont.innerHTML = h;
}
function pintaMulti(){
  for(const c of MULTI){
    const a = A.ct.get(c) || [];
    document.getElementById("mst_"+c).textContent =
      fmtN(a.length) + " \\u00b7 " + fmtM(metricaDe(a));
    document.getElementById("mini_"+c).classList.toggle("at", String(S.cat) === String(c));
    for(const sg of SGS){
      const u = UIDX.get(sg);
      const arr = u === undefined ? [] : (A.ufc.get(u + "|" + c) || []);
      const ref = u === undefined ? 0 : refUf(u);
      const f = arr.length < S.minN ? null : faixaDe(metricaDe(arr), ref);
      document.getElementById("m"+c+"_"+sg)
        .setAttribute("fill", f==null ? "url(#semdado)" : "var(--h"+f+")");
    }
  }
}
/* Nos mini-mapas a referencia e' SEMPRE a UF inteira -- eles existem justamente
   para comparar cada categoria com o ritmo do lugar. */
function refUf(u){ const a = A.uf.get(u) || []; return a.length >= S.minN ? metricaDe(a) : 0; }

/* ---------- cartoes e legenda ---------- */
function cards(){
  const us = SGS.map(sg => ({ sg, ...leituraUf(sg) })).filter(x => x.f != null);
  const sinal = MAIOR_MELHOR() ? 1 : -1;
  const ord2 = us.slice().sort((x,y) => sinal*(x.v - y.v));
  const pior = ord2[0], melhor = ord2[ord2.length-1];
  const alerta = MAIOR_MELHOR() ? us.filter(x => x.v < 50) : us.filter(x => x.r >= 2);
  const base = S.cat === "" ? A.tot : (A.ct.get(+S.cat) || []);
  const c = [
    [R.fato[0].toUpperCase() + R.fato.slice(1) + " no recorte", fmtN(base.length),
     (S.cat === "" ? R.todos : D.cats[+S.cat]) + " &middot; " +
     (S.ancora === "fim" ? "pela data " + R.dataFim : "pela data " + R.dataInicio)],
    /* ⚠ Com uma categoria escolhida este numero NAO e' mais a referencia da cor:
       cada UF passa a ser comparada com ela mesma. Dizer "referencia da cor"
       aqui seria explicacao errada com cara de certa. */
    [ROT_METRICA[S.metrica] + " " + (S.cat === "" ? "do Brasil" : R.doArtigo),
     fmtM(metricaDe(base)) + (MAIOR_MELHOR() ? "" : "<small> " + R.unidade + "</small>"),
     S.cat === "" ? "refer\\u00eancia da cor no mapa"
                  : "no mapa, cada UF \\u00e9 comparada com ela mesma"],
    [MAIOR_MELHOR() ? "UFs abaixo de 50%" : "UFs em alerta (2&times;+)", fmtN(alerta.length),
     alerta.length ? alerta.map(x=>x.sg).slice(0,8).join(", ") : "nenhuma no recorte"],
    ["Pior UF", pior ? pior.sg + " <small>" + fmtM(pior.v) + "</small>" : "-",
     pior ? fmtN(pior.n) + " " + R.fato + (MAIOR_MELHOR()?"":" &middot; " + fmtR(pior.r) + " a refer\\u00eancia") : ""],
    ["Melhor UF", melhor ? melhor.sg + " <small>" + fmtM(melhor.v) + "</small>" : "-",
     melhor ? fmtN(melhor.n) + " " + R.fato : ""]
  ];
  document.getElementById("cards").innerHTML = c.map(x =>
    '<div class="card"><div class="rot">'+x[0]+'</div><div class="val">'+x[1]+
    '</div><div class="pe">'+x[2]+'</div></div>').join("");
}
function legenda(){
  document.getElementById("leg").innerHTML =
    rotCor().map((t,i) => '<i style="background:var(--h'+i+')"></i><span>'+t+'</span>').join("") +
    '<i class="sd"></i><span>menos de '+S.minN+' casos</span>';
  const alvoCor = S.cat === "" ? "a mediana do <b>Brasil</b>"
                               : "a mediana da <b>pr\\u00f3pria UF</b>, com todas as " +
                                 R.entidades.toLowerCase();
  /* ⚠ O paragrafo que explica a cor e' reescrito pela tela. Deixa-lo estatico
     faz ele dizer "o dobro da mediana" enquanto a tela mostra porcentagem --
     explicacao errada e' pior que nenhuma, porque parece certa. */
  document.getElementById("capcor").innerHTML = MAIOR_MELHOR()
    ? 'A cor segue o alvo de <b>' + ALVO + '%</b> dentro de ' + LIMITE + ' ' + R.unidade +
      ', e aqui <b>maior \\u00e9 melhor</b>: verde \\u00e9 quem cumpre, vermelho quem n\\u00e3o cumpre. ' +
      'A r\\u00e9gua desta m\\u00e9trica \\u00e9 absoluta, n\\u00e3o comparativa.'
    : 'A cor \\u00e9 a <b>raz\\u00e3o</b> entre o valor da UF e ' + alvoCor + ': verde at\\u00e9 a ' +
      'refer\\u00eancia, amarelo entre 1&times; e 2&times;, e <b>vermelho a partir do dobro</b>. ' +
      'Passe o mouse por um estado para ver ' + (R.entidades.toLowerCase()) + ' dele no painel ao lado.';
}

/* ---------- ciclo ---------- */
function tudo(){ agrega(); cards(); pintaMapa(); realca(); pintaMulti(); painel(); legenda(); }

/* ---------- filtros ---------- */
const pega = id => document.getElementById(id);
function liga(id, campo, num){
  pega(id).addEventListener("change", e => {
    S[campo] = num ? +e.target.value : e.target.value;
    if(campo === "de" || campo === "ate") marcaPreset();
    tudo();
  });
}
liga("fde","de"); liga("fate","ate"); liga("fancora","ancora");
liga("fmetrica","metrica"); liga("fminN","minN",true);
pega("fcat").addEventListener("change", e => { S.cat = e.target.value; tudo(); });
const PRESETS = { p30:["${P30}", D.hoje], p90:["${P90}", D.hoje],
                  p12:["${P12M}", D.hoje], pano:["${PANO}", D.hoje] };
function marcaPreset(){
  for(const id in PRESETS)
    pega(id).setAttribute("aria-pressed", PRESETS[id][0]===S.de && PRESETS[id][1]===S.ate);
}
for(const id in PRESETS) pega(id).addEventListener("click", () => {
  S.de = PRESETS[id][0]; S.ate = PRESETS[id][1];
  pega("fde").value = S.de; pega("fate").value = S.ate;
  marcaPreset(); tudo();
});
pega("zmais").addEventListener("click", () => zoom(1.5, { x:G.vb[2]/2, y:G.vb[3]/2 }));
pega("zmenos").addEventListener("click", () => zoom(1/1.5, { x:G.vb[2]/2, y:G.vb[3]/2 }));
pega("zreset").addEventListener("click", () => { Z = {k:1,x:0,y:0}; aplicaCam(); });
document.addEventListener("keydown", e => {
  if(e.key === "Escape" && S.fixo){ S.fixo = false; S.sel = null; tudo(); }
});
const bt = pega("btema");
bt.addEventListener("click", () => {
  const escuro = document.documentElement.getAttribute("data-theme") === "dark" ||
    (!document.documentElement.getAttribute("data-theme") &&
     matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", escuro ? "light" : "dark");
  bt.textContent = escuro ? "modo escuro" : "modo claro";
});

/* ---------- partida ---------- */
pega("fcat").innerHTML = '<option value="">' + R.todosCurto + '</option>' +
  D.cats.map((b,i) => [i,b]).sort((a,b) => a[1].localeCompare(b[1],"pt-BR"))
    .map(x => '<option value="'+x[0]+'">'+x[1]+'</option>').join("");
pega("fde").value = S.de; pega("fate").value = S.ate;
montaMapa(); aplicaCam(); agrega(); montaMulti(); marcaPreset(); tudo();
`;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const HTML = `<!doctype html>
<html lang="pt-BR" data-theme="">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(R.titulo)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="topo">
    <div>
      <h1>${esc(R.titulo)}</h1>
      <p class="sub">${esc(R.subtitulo)} &middot;
        ${DADOS.n.toLocaleString('pt-BR')} registros &middot; dados de ${DADOS.extraido}</p>
    </div>
    <button class="tema" id="btema">modo escuro</button>
  </div>

  <div class="filtros">
    <div class="f"><label>Per&iacute;odo</label>
      <div class="atalhos">
        <button id="p30">30 dias</button><button id="p90">90 dias</button>
        <button id="p12">12 meses</button><button id="pano">${HOJE.slice(0, 4)}</button>
      </div>
    </div>
    <div class="f"><label>De</label><input type="date" id="fde"></div>
    <div class="f"><label>At&eacute;</label><input type="date" id="fate"></div>
    <div class="f"><label>Contar pela data</label>
      <select id="fancora">
        <option value="fim">${esc(R.dataFim)}</option>
        <option value="ini">${esc(R.dataInicio)}</option>
      </select></div>
    <div class="f"><label>${esc(R.entidade)}</label><select id="fcat"></select></div>
    <div class="f"><label>M&eacute;trica</label>
      <select id="fmetrica">
        <option value="med">Mediana</option>
        <option value="avg">M&eacute;dia</option>
        <option value="p75">P75</option>
        <option value="meta">% dentro de ${R.meta.limite} ${esc(R.unidade)}</option>
      </select></div>
    <div class="f"><label>M&iacute;n. casos</label>
      <input type="number" id="fminN" value="5" min="1" max="200" step="1" style="min-width:70px"></div>
  </div>

  <div class="cards" id="cards"></div>

  <div class="secao">
    <div class="palco">
      <div>
        <div class="mapabox">
          <div class="ferramentas">
            <button id="zmais" title="aproximar">+</button>
            <button id="zmenos" title="afastar">&minus;</button>
            <button id="zreset" title="enquadrar o Brasil" style="visibility:hidden">&#9634;</button>
          </div>
          <div class="dica" id="dica"></div>
          <svg class="br" id="mapa" viewBox="-8 -8 1128 1074">
            <defs id="defs"></defs>
            <g id="cam"></g>
          </svg>
        </div>
        <div class="leg" id="leg"></div>
        <p class="cap" id="capcor" style="margin-top:9px"></p>
      </div>
      <div class="painel" id="painel"></div>
    </div>
  </div>

  <div class="secao">
    <h2>O mesmo mapa, ${esc(R.entidade.toLowerCase())} a ${esc(R.entidade.toLowerCase())}</h2>
    <p class="cap">Cada mini-mapa colore o estado pela raz&atilde;o entre o valor
      <b>daquela ${esc(R.entidade.toLowerCase())} na UF</b> e a <b>mediana da UF inteira</b>:
      verde &eacute; quem anda no ritmo do lugar, vermelho &eacute; o dobro dele ou mais.
      Estado hachurado n&atilde;o tem casos suficientes. Clique num mini-mapa para lev&aacute;-lo
      ao mapa grande &mdash; clique de novo para voltar a todas.</p>
    <div class="multi" id="multi"></div>
  </div>

  <div class="secao">
    <h2>Como ler</h2>
    <p class="cap"><b>A cor responde &ldquo;isto est&aacute; fora do ritmo?&rdquo;, n&atilde;o
      &ldquo;isto &eacute; alto?&rdquo;</b> Com tudo selecionado, cada UF &eacute; comparada ao
      Brasil; com uma ${esc(R.entidade.toLowerCase())} escolhida, cada UF &eacute; comparada a
      ela mesma com todas as ${esc(R.entidades.toLowerCase())}. Por isso <b>o mesmo n&uacute;mero
      pode sair verde num estado e vermelho em outro</b> &mdash; e duas telas com filtros
      diferentes n&atilde;o se comparam pela cor, s&oacute; pelo n&uacute;mero, que fica sempre
      escrito.</p>
    <p class="cap">C&eacute;lula com menos de <b>M&iacute;n. casos</b> registros n&atilde;o recebe
      cor, e a refer&ecirc;ncia tamb&eacute;m precisa do m&iacute;nimo: colorir contra um
      n&uacute;mero frouxo &eacute; pior que n&atilde;o colorir. No painel, essas linhas ficam
      esmaecidas em vez de sumir.</p>
    <div class="aviso"><b>Roda no mapa</b> aproxima, <b>arrastar</b> move, <b>clique</b> em um
      estado fixa o painel (Esc solta). O painel ao lado acompanha o mouse e mostra, no lugar
      sob o cursor, como cada ${esc(R.entidade.toLowerCase())} vai ali.</div>
    <p class="nota">Malha das UFs: IBGE, servi&ccedil;o de malhas territoriais, qualidade
      intermedi&aacute;ria, proje&ccedil;&atilde;o de Mercator. Ilhas oce&acirc;nicas
      (Fernando de Noronha, Trindade) removidas do enquadramento.</p>
  </div>
</div>
<script>
const DADOS = ${JSON.stringify(DADOS)};
const GEOM = ${JSON.stringify(GEO)};
const CALLOUT = ${JSON.stringify(CALLOUT)};
const REG_DE = ${JSON.stringify(REG_DE)};
const NOME_REG = ${JSON.stringify(NOME_REG)};
const ROTULOS = ${JSON.stringify(R)};
${CLIENTE}
</script>
</body>
</html>`;

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, HTML, 'utf8');
console.log('gerado: ' + SAIDA + '  (' + (fs.statSync(SAIDA).size / 1024).toFixed(0) + ' KB)');
