// ============================================================
// app.js — BondSim Logic & UI Controller
// ============================================================

// ── Particle Canvas ──────────────────────────────────────────
(function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas.getContext('2d');
  let particles = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.5 + 0.3,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.4 + 0.1,
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(167, 139, 250, ${p.alpha})`;
      ctx.fill();
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

// ── Element Lookup ────────────────────────────────────────────
function findElement(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // By atomic number
  const num = parseInt(q);
  if (!isNaN(num) && num >= 1 && num <= 118) {
    return ELEMENTS.find(e => e.z === num) || null;
  }

  // Exact symbol match (case-insensitive)
  const bySymbol = ELEMENTS.find(e => e.sym.toLowerCase() === q);
  if (bySymbol) return bySymbol;

  // Exact name match
  const byName = ELEMENTS.find(
    e => e.es.toLowerCase() === q || e.en.toLowerCase() === q
  );
  if (byName) return byName;

  return null;
}

function searchElements(query) {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 1) return [];

  const num = parseInt(q);
  if (!isNaN(num)) {
    return ELEMENTS.filter(e => String(e.z).startsWith(q)).slice(0, 6);
  }

  return ELEMENTS.filter(e =>
    e.sym.toLowerCase().startsWith(q) ||
    e.es.toLowerCase().startsWith(q) ||
    e.en.toLowerCase().startsWith(q) ||
    e.es.toLowerCase().includes(q) ||
    e.en.toLowerCase().includes(q)
  ).slice(0, 6);
}

// ── Category Helpers ──────────────────────────────────────────
function isMetal(elem) {
  return CAT_META[elem.cat]?.isMetal === true;
}

function isNonMetal(elem) {
  return CAT_META[elem.cat]?.isNonMetal === true || CAT_META[elem.cat]?.isSemi === true;
}

function isNobleGas(elem) {
  return elem.cat === 'noble_gas';
}

// ── Bond Analysis ─────────────────────────────────────────────
function analyzeBond(e1, e2) {
  // Noble gas cannot bond (except very rare cases we ignore)
  if (isNobleGas(e1) || isNobleGas(e2)) {
    return {
      type: 'none',
      reason: `Los gases nobles (${e1.cat === 'noble_gas' ? e1.sym : e2.sym}) tienen capa de valencia completa y no forman enlaces estables bajo condiciones normales.`,
    };
  }

  const metal1 = isMetal(e1);
  const metal2 = isMetal(e2);

  // Both metals → metallic bond
  if (metal1 && metal2) {
    return { type: 'metallic', e1, e2 };
  }

  const en1 = e1.en_val;
  const en2 = e2.en_val;

  // Missing electronegativities for superheavy elements
  if (en1 === null || en2 === null) {
    const heavyElem = en1 === null ? e1 : e2;
    return {
      type: 'unknown',
      reason: `La electronegatividad de ${heavyElem.es} (${heavyElem.sym}) no está bien establecida por ser un elemento superpesado o sintético. No es posible determinar el tipo de enlace con certeza.`,
    };
  }

  const diff = Math.abs(en1 - en2);

  // Metal + nonmetal → ionic (if diff > 1.7)
  if ((metal1 !== metal2) && diff > 1.7) {
    return { type: 'ionic', e1, e2, diff };
  }

  // Metal + nonmetal with small diff (some polar covalent / e.g. AlCl3 border cases)
  // For simplicity: if one is metal with diff ≤ 1.7, treat as ionic-polar
  if (metal1 !== metal2 && diff <= 1.7) {
    return { type: 'ionic', e1, e2, diff, polar: true };
  }

  // Both nonmetals → covalent
  if (!metal1 && !metal2) {
    const semiType = classifySemiconductor(e1, e2);
    return { type: 'covalent', e1, e2, diff, semiType };
  }

  return {
    type: 'none',
    reason: 'No se pudo determinar el tipo de enlace con la información disponible.',
  };
}

// ── Semiconductor Classification ──────────────────────────────
/*
 * Intrinsic:  Both group 14 (C, Si, Ge, Sn)
 *             III-V compounds (grp13 + grp15)
 *             II-VI compounds (grp2/12 + grp16)
 * Type N:     Group 14 + Group 15 (donor dopant)
 * Type P:     Group 14 + Group 13 (acceptor dopant)
 * Pure covalent (no semiconductor behavior): other cases
 */
function classifySemiconductor(e1, e2) {
  const g1 = e1.grp;
  const g2 = e2.grp;

  const semiconductorGroups = [14]; // Group 14: C, Si, Ge, Sn, Pb

  // Both in group 14 → Intrinsic
  if (semiconductorGroups.includes(g1) && semiconductorGroups.includes(g2)) {
    return {
      kind: 'intrinsic',
      label: 'Semiconductor Intrínseco',
      desc: `Ambos elementos pertenecen al Grupo 14. Comparten 4 electrones de valencia formando una red cristalina pura. El gap de banda lo determina la naturaleza del material (${e1.sym}–${e2.sym}).`,
    };
  }

  // Group 14 + Group 15 → Extrinsic N-type
  if ((g1 === 14 && g2 === 15) || (g1 === 15 && g2 === 14)) {
    const semi = g1 === 14 ? e1 : e2;
    const dopant = g1 === 15 ? e1 : e2;
    return {
      kind: 'n-type',
      label: 'Semiconductor Extrínseco Tipo N',
      desc: `${dopant.es} (Grupo 15) aporta un electrón extra al semiconductor ${semi.es} (Grupo 14). El electrón donado actúa como portador mayoritario negativo, desplazando el nivel de Fermi hacia la banda de conducción.`,
    };
  }

  // Group 14 + Group 13 → Extrinsic P-type
  if ((g1 === 14 && g2 === 13) || (g1 === 13 && g2 === 14)) {
    const semi = g1 === 14 ? e1 : e2;
    const dopant = g1 === 13 ? e1 : e2;
    return {
      kind: 'p-type',
      label: 'Semiconductor Extrínseco Tipo P',
      desc: `${dopant.es} (Grupo 13) tiene un electrón menos, generando un "hueco" en la red del semiconductor ${semi.es} (Grupo 14). Los huecos actúan como portadores mayoritarios positivos, desplazando el nivel de Fermi hacia la banda de valencia.`,
    };
  }

  // III-V compound (group 13 + group 15) → Intrinsic compound semiconductor
  if ((g1 === 13 && g2 === 15) || (g1 === 15 && g2 === 13)) {
    return {
      kind: 'intrinsic',
      label: 'Semiconductor Intrínseco (Compuesto III-V)',
      desc: `Los compuestos III-V (Grupo 13 + Grupo 15) como GaAs, InP, GaN son semiconductores intrínsecos con propiedades optoelectrónicas excepcionales. El promedio de electrones de valencia equivale a 4 por átomo.`,
    };
  }

  // II-VI compound (group 2/12 + group 16) → Intrinsic compound
  if (([2,12].includes(g1) && g2 === 16) || (g1 === 16 && [2,12].includes(g2))) {
    return {
      kind: 'intrinsic',
      label: 'Semiconductor Intrínseco (Compuesto II-VI)',
      desc: `Los compuestos II-VI como CdS, ZnSe, CdTe son semiconductores compuestos con amplia aplicación en celdas solares y LEDs. Presentan un semiconductor intrínseco con banda prohibida directa.`,
    };
  }

  // General covalent – no semiconductor classification
  return {
    kind: 'molecular',
    label: 'Enlace Covalente Molecular',
    desc: `El compuesto formado es covalente pero no se clasifica como semiconductor convencional. Puede ser un material aislante, molecular o de propiedades especiales según la estructura cristalina.`,
  };
}

// ── Result Themes ──────────────────────────────────────────────
const THEMES = {
  ionic: {
    bg: 'rgba(249,115,22,0.06)',
    border: 'rgba(249,115,22,0.25)',
    accent: 'linear-gradient(90deg,#f97316,#fb923c)',
    glow: '#f97316',
    color: '#fb923c',
    badgeBg: 'rgba(249,115,22,0.15)',
    icon: '⚡',
    title: 'Enlace Iónico',
  },
  metallic: {
    bg: 'rgba(34,211,238,0.06)',
    border: 'rgba(34,211,238,0.25)',
    accent: 'linear-gradient(90deg,#22d3ee,#38bdf8)',
    glow: '#22d3ee',
    color: '#22d3ee',
    badgeBg: 'rgba(34,211,238,0.15)',
    icon: '🔗',
    title: 'Enlace Metálico',
  },
  covalent: {
    bg: 'rgba(167,139,250,0.06)',
    border: 'rgba(167,139,250,0.25)',
    accent: 'linear-gradient(90deg,#7c3aed,#a78bfa)',
    glow: '#a78bfa',
    color: '#a78bfa',
    badgeBg: 'rgba(167,139,250,0.15)',
    icon: '🔬',
    title: 'Enlace Covalente',
  },
};

const SEMI_THEMES = {
  intrinsic: { color: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)', icon: '💎' },
  'n-type':  { color: '#38bdf8', bg: 'rgba(56,189,248,0.1)', border: 'rgba(56,189,248,0.3)', icon: '⬇️' },
  'p-type':  { color: '#f472b6', bg: 'rgba(244,114,182,0.1)', border: 'rgba(244,114,182,0.3)', icon: '⬆️' },
  molecular: { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)', icon: '🔗' },
};

// ── Explanations ───────────────────────────────────────────────
function getExplanation(result) {
  const { type, e1, e2, diff, semiType, polar } = result;

  if (type === 'ionic') {
    const metal = isMetal(e1) ? e1 : e2;
    const nonmetal = isMetal(e1) ? e2 : e1;
    return `${metal.es} (${metal.sym}) cede electrones a ${nonmetal.es} (${nonmetal.sym}), formando iones con carga opuesta que se atraen electrostáticamente. Con una diferencia de electronegatividad de ${diff.toFixed(2)}, la transferencia electrónica es ${diff > 2.0 ? 'prácticamente completa' : 'significativa'}. Este enlace produce sales cristalinas con alto punto de fusión y alta conductividad iónica en solución.`;
  }
  if (type === 'metallic') {
    return `Ambos son metales: ${e1.es} (${e1.sym}) y ${e2.es} (${e2.sym}). Sus átomos ceden electrones al "mar de electrones" colectivo. Este enlace explica la maleabilidad, ductilidad, conductividad eléctrica y térmica características de los metales. La aleación resultante puede tener propiedades distintas a los metales puros.`;
  }
  if (type === 'covalent') {
    return `${e1.es} (${e1.sym}) y ${e2.es} (${e2.sym}) comparten pares de electrones para completar su capa de valencia. Con una diferencia de electronegatividad de ${diff.toFixed(2)}, el enlace es ${diff < 0.5 ? 'apolar' : diff < 1.7 ? 'polar' : 'altamente polar'}. El compuesto formado tiene propiedades que dependen de su estructura cristalina o molecular.`;
  }
  return '';
}

// ── Render Result ──────────────────────────────────────────────
function renderResult(result) {
  const container = document.getElementById('resultContent');
  const section = document.getElementById('resultSection');

  if (result.type === 'none' || result.type === 'unknown') {
    container.innerHTML = `
      <div class="no-bond-card">
        <div class="no-bond-icon">🚫</div>
        <div class="no-bond-title">${result.type === 'unknown' ? 'Enlace Indeterminado' : 'Enlace No Posible'}</div>
        <div class="no-bond-text">${result.reason}</div>
      </div>`;
    section.style.display = 'block';
    return;
  }

  const theme = THEMES[result.type];
  const { e1, e2, diff, semiType } = result;
  const en1 = e1.en_val?.toFixed(2) ?? 'N/D';
  const en2 = e2.en_val?.toFixed(2) ?? 'N/D';
  const diffStr = diff !== undefined ? diff.toFixed(2) : '—';

  let semiHTML = '';
  if (result.type === 'covalent' && semiType) {
    const st = SEMI_THEMES[semiType.kind];
    semiHTML = `
      <div class="result-explanation">
        <div class="explanation-title">Tipo de Material</div>
        <div style="margin-bottom:14px">
          <div class="semi-badge" style="--semi-color:${st.color};--semi-bg:${st.bg};--semi-border:${st.border}">
            <div class="semi-badge-dot"></div>
            ${st.icon} ${semiType.label}
          </div>
        </div>
        <div class="explanation-text">${semiType.desc}</div>
      </div>`;
  }

  const catMeta1 = CAT_META[e1.cat] || {};
  const catMeta2 = CAT_META[e2.cat] || {};

  container.innerHTML = `
    <div class="result-card" style="
      --result-bg:${theme.bg};
      --result-border:${theme.border};
      --result-accent:${theme.accent};
      --result-glow:${theme.glow};
      --result-color:${theme.color};
      --result-badge-bg:${theme.badgeBg};
    ">
      <div class="result-glow"></div>
      <div class="result-header">
        <div class="result-badge">${theme.icon}</div>
        <div class="result-title-block">
          <div class="result-type">Tipo de Enlace</div>
          <div class="result-title">${theme.title}</div>
          <div class="result-subtitle">${e1.sym} – ${e2.sym} · ${e1.es} con ${e2.es}</div>
        </div>
      </div>

      <div class="result-grid">
        <div class="result-stat">
          <div class="stat-label">EN de ${e1.sym}</div>
          <div class="stat-value">${en1}</div>
          <div class="stat-sub">Pauling</div>
        </div>
        <div class="result-stat">
          <div class="stat-label">EN de ${e2.sym}</div>
          <div class="stat-value">${en2}</div>
          <div class="stat-sub">Pauling</div>
        </div>
        <div class="result-stat">
          <div class="stat-label">Diferencia ΔEN</div>
          <div class="stat-value">${diffStr}</div>
          <div class="stat-sub">${result.type === 'metallic' ? 'Metales' : diff > 1.7 ? 'Iónico' : diff > 0.4 ? 'Polar' : 'Apolar'}</div>
        </div>
      </div>

      <div class="result-explanation">
        <div class="explanation-title">Explicación</div>
        <div class="explanation-text">${getExplanation(result)}</div>
      </div>

      ${semiHTML}
    </div>`;

  section.style.display = 'block';
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Element Preview ────────────────────────────────────────────
function getCatColor(cat) {
  const colorMap = {
    alkali_metal:     ['#4a1d96', '#1e1b4b'],
    alkaline_earth:   ['#14532d', '#052e16'],
    transition_metal: ['#1e3a5f', '#0c1f35'],
    post_transition:  ['#1e4040', '#0c2020'],
    metalloid:        ['#4a0d6e', '#200530'],
    nonmetal:         ['#064e3b', '#022c22'],
    halogen:          ['#701a41', '#400d24'],
    noble_gas:        ['#1e1b4b', '#0c0a2a'],
    lanthanide:       ['#3d3000', '#1e1800'],
    actinide:         ['#3d1500', '#1e0a00'],
  };
  return colorMap[cat] || ['#1a1a2e', '#0d0d1e'];
}

function renderPreview(previewEl, elem) {
  if (!elem) {
    previewEl.innerHTML = `
      <div class="preview-empty">
        <div class="preview-empty-icon">?</div>
        <span>Sin elemento</span>
      </div>`;
    return;
  }
  const [c1, c2] = getCatColor(elem.cat);
  const catLabel = CAT_META[elem.cat]?.label || elem.cat;
  const enStr = elem.en_val != null ? `EN: ${elem.en_val}` : 'EN: N/D';

  previewEl.innerHTML = `
    <div class="elem-display" style="--card-color1:${c1};--card-color2:${c2}">
      <div class="elem-number">Z = ${elem.z}</div>
      <div class="elem-symbol">${elem.sym}</div>
      <div class="elem-name">${elem.es}</div>
      <div class="elem-meta">
        <span class="elem-chip">Gpo ${elem.grp}</span>
        <span class="elem-chip">Per ${elem.per}</span>
        <span class="elem-en">${enStr}</span>
      </div>
      <div class="elem-meta" style="margin-top:6px">
        <span class="elem-chip" style="background:rgba(167,139,250,0.15);color:#c4b5fd">${catLabel}</span>
      </div>
    </div>`;
}

// ── Suggestion Dropdown ────────────────────────────────────────
function renderSuggestions(listEl, results, onSelect) {
  if (!results.length) {
    listEl.classList.remove('visible');
    return;
  }
  listEl.innerHTML = results.map((e, i) =>
    `<div class="suggestion-item" data-idx="${i}">
      <div class="sug-symbol">${e.sym}</div>
      <div class="sug-info">
        <div class="sug-name">${e.es}</div>
        <div class="sug-z">Z=${e.z} · ${e.en_val != null ? 'EN:'+e.en_val : 'sin EN'}</div>
      </div>
      <div class="sug-cat">${CAT_META[e.cat]?.label || ''}</div>
    </div>`
  ).join('');

  listEl.querySelectorAll('.suggestion-item').forEach((item, i) => {
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      onSelect(results[i]);
      listEl.classList.remove('visible');
    });
  });
  listEl.classList.add('visible');
}

// ── Controller ─────────────────────────────────────────────────
(function initApp() {
  let selected = [null, null];

  const inputs = [
    document.getElementById('element1'),
    document.getElementById('element2'),
  ];
  const previews = [
    document.getElementById('preview1'),
    document.getElementById('preview2'),
  ];
  const cards = [
    document.getElementById('card1'),
    document.getElementById('card2'),
  ];
  const sugLists = [
    document.getElementById('suggestions1'),
    document.getElementById('suggestions2'),
  ];
  const analyzeBtn = document.getElementById('analyzeBtn');

  function updateBtn() {
    analyzeBtn.disabled = !(selected[0] && selected[1]);
  }

  function selectElement(idx, elem) {
    selected[idx] = elem;
    renderPreview(previews[idx], elem);
    if (elem) {
      inputs[idx].value = `${elem.sym} – ${elem.es}`;
      cards[idx].classList.add('has-element');
    } else {
      cards[idx].classList.remove('has-element');
    }
    sugLists[idx].classList.remove('visible');
    updateBtn();
  }

  inputs.forEach((input, idx) => {
    input.addEventListener('input', () => {
      const q = input.value;
      selected[idx] = null;
      cards[idx].classList.remove('has-element');
      renderPreview(previews[idx], null);
      updateBtn();

      const results = searchElements(q);
      renderSuggestions(sugLists[idx], results, (elem) => selectElement(idx, elem));

      // Auto-select on exact match
      if (q.length > 0) {
        const exact = findElement(q);
        if (exact) {
          selectElement(idx, exact);
        }
      }
    });

    input.addEventListener('focus', () => {
      const q = input.value;
      if (q && !selected[idx]) {
        const results = searchElements(q);
        renderSuggestions(sugLists[idx], results, (elem) => selectElement(idx, elem));
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => sugLists[idx].classList.remove('visible'), 150);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const exact = findElement(input.value);
        if (exact) selectElement(idx, exact);
        sugLists[idx].classList.remove('visible');
      }
      if (e.key === 'Escape') {
        sugLists[idx].classList.remove('visible');
      }
    });
  });

  analyzeBtn.addEventListener('click', () => {
    if (!selected[0] || !selected[1]) return;
    const result = analyzeBond(selected[0], selected[1]);
    renderResult(result);
  });
})();
