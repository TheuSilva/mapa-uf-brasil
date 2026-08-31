// ============================================================================
// MALHA DAS UFs -> CAMINHOS SVG
//
// Baixa a malha oficial do IBGE e projeta em Mercator, gravando
// dados/br-uf-paths.json. O arquivo ja' vem pronto no repositorio: este script
// so' e' necessario para atualizar a malha ou trocar a qualidade.
//
//   node scripts/baixa-malha.js [minima|intermediaria|maxima]
// ============================================================================
const fs = require('fs');
const path = require('path');

const QUALIDADE = process.argv[2] || 'intermediaria';
const URL = 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR' +
            '?formato=application/vnd.geo+json&qualidade=' + QUALIDADE + '&intrarregiao=UF';

// O IBGE identifica a UF pelo codigo de 2 digitos, nao pela sigla.
const COD = {
  11: ['RO', 'Rondônia'],       12: ['AC', 'Acre'],        13: ['AM', 'Amazonas'],
  14: ['RR', 'Roraima'],        15: ['PA', 'Pará'],        16: ['AP', 'Amapá'],
  17: ['TO', 'Tocantins'],      21: ['MA', 'Maranhão'],    22: ['PI', 'Piauí'],
  23: ['CE', 'Ceará'],          24: ['RN', 'Rio Grande do Norte'], 25: ['PB', 'Paraíba'],
  26: ['PE', 'Pernambuco'],     27: ['AL', 'Alagoas'],     28: ['SE', 'Sergipe'],
  29: ['BA', 'Bahia'],          31: ['MG', 'Minas Gerais'], 32: ['ES', 'Espírito Santo'],
  33: ['RJ', 'Rio de Janeiro'], 35: ['SP', 'São Paulo'],   41: ['PR', 'Paraná'],
  42: ['SC', 'Santa Catarina'], 43: ['RS', 'Rio Grande do Sul'], 50: ['MS', 'Mato Grosso do Sul'],
  51: ['MT', 'Mato Grosso'],    52: ['GO', 'Goiás'],       53: ['DF', 'Distrito Federal']
};

// Mercator. O y e' invertido na hora de projetar, para o norte ficar em cima no SVG.
const mx = lon => lon;
const my = lat => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * (180 / Math.PI);

const areaDe = r => Math.abs(r.reduce((s, p, i) => {
  const q = r[(i + 1) % r.length];
  return s + (p[0] * q[1] - q[0] * p[1]);
}, 0) / 2);

function aneis(f) {
  const g = f.geometry;
  return g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map(p => p[0]);
}

(async () => {
  console.log('baixando a malha do IBGE (qualidade ' + QUALIDADE + ')...');
  const resp = await fetch(URL);
  if (!resp.ok) throw new Error('IBGE respondeu ' + resp.status);
  const G = await resp.json();
  console.log('  ' + G.features.length + ' unidades da federacao');

  const bruto = {};
  for (const f of G.features) {
    const par = COD[+f.properties.codarea];
    if (!par) throw new Error('codigo de UF desconhecido: ' + f.properties.codarea);
    // ⚠ As ilhas oceanicas esticam o enquadramento e nao dizem nada num mapa de
    //   UF: Fernando de Noronha fica em -32,4 e Trindade em -29,3, enquanto o
    //   ponto mais a leste do continente e' -34,79. Anel com longitude > -34 e'
    //   ilha, e sai. Anel minusculo tambem.
    const rs = aneis(f).filter(r => Math.max(...r.map(p => p[0])) < -34.0 && areaDe(r) > 0.004);
    bruto[par[0]] = { nome: par[1], aneis: rs };
  }

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const sg in bruto) for (const r of bruto[sg].aneis) for (const [lo, la] of r) {
    const X = mx(lo), Y = my(la);
    if (X < x0) x0 = X; if (X > x1) x1 = X;
    if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
  }

  const W = 1000, k = W / (x1 - x0), H = Math.round((y1 - y0) * k);
  const px = lo => (mx(lo) - x0) * k;
  const py = la => (y1 - my(la)) * k;
  const r1 = n => Math.round(n * 10) / 10;

  const out = { vb: [0, 0, W, H], ufs: {} };
  for (const sg in bruto) {
    const b = bruto[sg];
    let d = '', maior = null, aMax = -1, aTot = 0;
    for (const r of b.aneis) {
      // Simplificacao por distancia: ponto a menos de 0,5 unidade do ultimo
      // aceito e' descartado. O ultimo ponto do anel volta sempre, senao o
      // fecho fica torto.
      const pts = r.map(([lo, la]) => [px(lo), py(la)]);
      const fica = [pts[0]];
      for (const p of pts.slice(1, -1)) {
        const q = fica[fica.length - 1];
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= 0.5) fica.push(p);
      }
      if (fica.length < 3) continue;
      d += 'M' + fica.map(p => r1(p[0]) + ' ' + r1(p[1])).join('L') + 'Z';
      const a = areaDe(fica);
      aTot += a;
      if (a > aMax) { aMax = a; maior = fica; }
    }
    // Centroide do MAIOR anel. Media simples dos pontos daria o centro da massa
    // de vertices, que num litoral recortado puxa o rotulo para a costa.
    let cx = 0, cy = 0, s = 0;
    for (let i = 0; i < maior.length; i++) {
      const p = maior[i], q = maior[(i + 1) % maior.length];
      const f = p[0] * q[1] - q[0] * p[1];
      s += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
    }
    s *= 3; cx /= s; cy /= s;
    out.ufs[sg] = { nome: b.nome, d, cx: r1(cx), cy: r1(cy), area: Math.round(aTot) };
  }

  const dest = path.join(__dirname, '..', 'dados', 'br-uf-paths.json');
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log('gravado: ' + dest + '  (' + (fs.statSync(dest).size / 1024).toFixed(0) + ' KB)');

  // Conferencia barata de que a projecao nao saiu espelhada nem torta.
  const e = Object.entries(out.ufs);
  const extremo = (k2, dir) => e.slice().sort((a, b) => dir * (a[1][k2] - b[1][k2]))[0][0];
  console.log('  oeste ' + extremo('cx', 1) + ' | leste ' + extremo('cx', -1) +
              ' | norte ' + extremo('cy', 1) + ' | sul ' + extremo('cy', -1) +
              '   (esperado: AC | AL/RN/PB | RR | RS)');
})();
