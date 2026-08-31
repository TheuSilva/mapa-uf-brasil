// ============================================================================
// DADOS DE DEMONSTRACAO -- inteiramente SINTETICOS
//
// Escreve dados/exemplo.csv no formato que o gerador espera. Nenhum registro
// aqui veio de lugar nenhum: UFs e nomes de local sao inventados a partir de um
// gerador deterministico (mesma semente -> mesmo arquivo), e os tempos saem de
// uma distribuicao com cauda longa, que e' o formato tipico deste tipo de dado.
//
// A demonstracao e' desenhada para EXERCITAR a regra de cor, nao para ser
// bonita: alguns estados sao lentos para todo mundo, uma categoria vai mal so'
// em alguns estados, e ha' estados com pouquissimo caso -- e' assim que se ve se
// o "minimo de casos" e a cor relativa estao funcionando.
//
//   node scripts/gera-demo.js [linhas] [semente]
// ============================================================================
const fs = require('fs');
const path = require('path');

const N = parseInt(process.argv[2] || '26000', 10);
const SEMENTE = parseInt(process.argv[3] || '20260831', 10);

// PRNG proprio (LCG). Math.random tornaria o arquivo diferente a cada execucao,
// e uma demonstracao que muda sozinha e' ruim de conferir e suja o diff do git.
let _s = SEMENTE >>> 0;
const rnd = () => ((_s = (_s * 1664525 + 1013904223) >>> 0) / 4294967296);
const entre = (a, b) => a + rnd() * (b - a);
const escolhe = a => a[Math.floor(rnd() * a.length)];

// peso = quanto do volume cada UF leva; base = mediana tipica dela, em dias.
// Os numeros sao inventados, mas o FORMATO e' realista: um estado concentra o
// volume, e a mediana varia bastante de um lugar para outro.
const UFS = [
  ['SP', 34, 9], ['MG', 10, 20], ['SC', 8, 10], ['PR', 8, 19], ['RJ', 6, 60],
  ['RS', 6, 18], ['GO', 5, 5], ['CE', 4, 24], ['PE', 3, 20], ['DF', 3, 19],
  ['BA', 3, 21], ['MT', 2, 13], ['PA', 2, 15], ['RN', 1.5, 15], ['ES', 1.5, 29],
  ['AL', 1.2, 13], ['MS', 1.2, 7], ['AM', 1.2, 14], ['MA', 1, 14], ['PB', 1, 21],
  ['RO', 0.8, 4], ['PI', 0.7, 52], ['TO', 0.6, 18], ['SE', 0.5, 20],
  ['AC', 0.3, 16], ['AP', 0.2, 7], ['RR', 0.15, 3]
];

// Categorias: o que se compara DENTRO de cada UF. Nomes ficticios de proposito.
const CATS = [
  ['Alfa Financeira', 40], ['Beta Cred', 20], ['Gama Bank', 16],
  ['Delta Leasing', 10], ['Epsilon Pay', 8], ['Zeta Capital', 6], ['Ômega Fomento', 4]
];

// A graca da demonstracao: a Gama Bank e' ~2,5x mais lenta que o resto NESTES
// estados e normal no resto do pais. E' o padrao que o mapa por categoria tem
// de deixar obvio -- e que uma media nacional esconderia.
const CAT_RUIM = 'Gama Bank';
const UF_RUIM = new Set(['BA', 'AL', 'SE', 'MA', 'PI', 'PA', 'RN']);

const PREFIXO = ['SANTA', 'SÃO', 'NOVA', 'BOM', 'ALTO', 'PORTO', 'CAMPO', 'MONTE', 'VILA', 'SERRA'];
const NUCLEO = ['CLARA', 'VERDE', 'ALEGRE', 'GRANDE', 'DO NORTE', 'DAS FLORES', 'FORMOSO',
                'AZUL', 'DO OESTE', 'REDONDA', 'DA MATA', 'BONITA'];

function sorteiaUF() {
  const total = UFS.reduce((s, u) => s + u[1], 0);
  let x = rnd() * total;
  for (const u of UFS) { x -= u[1]; if (x <= 0) return u; }
  return UFS[0];
}
function sorteiaCat() {
  const total = CATS.reduce((s, c) => s + c[1], 0);
  let x = rnd() * total;
  for (const c of CATS) { x -= c[1]; if (x <= 0) return c[0]; }
  return CATS[0][0];
}

// Locais: cada UF ganha um punhado de nomes proprios, sorteados uma vez so'.
const locais = {};
for (const [sg] of UFS) {
  const quantos = Math.max(3, Math.round(entre(4, 26)));
  const s = new Set();
  while (s.size < quantos) s.add(escolhe(PREFIXO) + ' ' + escolhe(NUCLEO));
  locais[sg] = [...s];
}

// Tempo: log-normal simplificada. Cauda longa e' o que torna mediana e media
// diferentes -- justamente o ponto que o seletor de metrica do mapa mostra.
function tempo(base) {
  const u1 = Math.max(1e-9, rnd()), u2 = rnd();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(base * Math.exp(0.75 * z - 0.28)));
}

const D0 = Date.UTC(2025, 8, 1), D1 = Date.UTC(2026, 7, 31);
const iso = ms => new Date(ms).toISOString().slice(0, 10);

const linhas = ['UF;LOCAL;CATEGORIA;DT_INICIO;DT_FIM'];
for (let i = 0; i < N; i++) {
  const [sg, , base] = sorteiaUF();
  const cat = sorteiaCat();
  const fator = (cat === CAT_RUIM && UF_RUIM.has(sg)) ? 2.5 : 1;
  const dias = tempo(base * fator);
  const fim = D0 + rnd() * (D1 - D0);
  const ini = fim - dias * 86400000;
  linhas.push([sg, escolhe(locais[sg]), cat, iso(ini), iso(fim)].join(';'));
}

const dest = path.join(__dirname, '..', 'dados', 'exemplo.csv');
fs.writeFileSync(dest, linhas.join('\n') + '\n', 'utf8');
console.log('gravado: ' + dest);
console.log('  ' + N.toLocaleString('pt-BR') + ' linhas sinteticas, semente ' + SEMENTE +
            ' (mesma semente = mesmo arquivo)');
console.log('  ' + UFS.length + ' UFs, ' + CATS.length + ' categorias, ' +
            Object.values(locais).reduce((s, a) => s + a.length, 0) + ' locais');
console.log('  armadilha plantada: "' + CAT_RUIM + '" e ~2,5x mais lenta em ' +
            [...UF_RUIM].join(', ') + ' e normal no resto');
