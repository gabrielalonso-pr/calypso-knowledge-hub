/**
 * Lógica de la página de gestión (manage.html): diccionario, glosario,
 * fichas de producto y plantillas para generación asistida por IA.
 * Todo se persiste vía DataService (localStorage hoy, API en el futuro).
 */
const Manage = (() => {

  const MODULE_OPTIONS = [
    { value: 'forward_fx',          label: 'Forward FX' },
    { value: 'static_data',         label: 'Static Data' },
    { value: 'pricing_environment', label: 'Pricing Environment' },
    { value: 'front_office',        label: 'Front Office' },
    { value: 'post_trade',          label: 'Post-Trade' },
  ];

  /* ── Tabs ───────────────────────────────────────────────────────────────── */
  function initTabs() {
    const tabs   = document.querySelectorAll('.mgmt-tab');
    const panels = document.querySelectorAll('.mgmt-panel');

    function activate(name) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      panels.forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
      localStorage.setItem('mgmt_active_tab', name);
      history.replaceState(null, '', '#' + name);
    }

    tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.tab)));

    const fromHash  = location.hash.replace('#', '');
    const fromQuery = new URLSearchParams(location.search).get('tab');
    const fromStore = localStorage.getItem('mgmt_active_tab');
    const initial   = fromQuery || fromHash || fromStore || 'dictionary';
    activate(document.querySelector(`.mgmt-tab[data-tab="${initial}"]`) ? initial : 'dictionary');
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * PESTAÑA 1 — DICCIONARIO (propuestas)
   * ══════════════════════════════════════════════════════════════════════════ */
  async function initDictionaryTab() {
    const select = document.getElementById('dp-modulo');
    select.innerHTML = MODULE_OPTIONS.map(m => `<option value="${m.value}">${m.label}</option>`).join('');

    let entries   = await DataService.getDictionaryProposals();
    let editingId = null;

    const form = document.getElementById('dp-form');

    function render() {
      const list = document.getElementById('dp-list');
      const empty = document.getElementById('dp-empty');
      list.innerHTML = '';
      empty.classList.toggle('hidden', entries.length > 0);

      entries.forEach(entry => {
        const modLabel = MODULE_OPTIONS.find(m => m.value === entry.modulo)?.label || entry.modulo;
        const catLabel = entry.categoria === 'transferible' ? 'Transferible' : 'Específico Calypso';
        const card = document.createElement('div');
        card.className = 'dict-entry glos-card';
        card.innerHTML = `
          <div class="entry-header">
            <span class="entry-term">${entry.termino}</span>
            <div style="display:flex; align-items:center; gap:.5rem; flex-wrap:wrap;">
              <span class="tooltip-cat tooltip-cat--${entry.categoria}">${catLabel}</span>
              <span class="glos-date">${modLabel}</span>
              <button class="glos-action-btn" data-action="edit" data-id="${entry.id}" type="button" title="Editar">✏</button>
              <button class="glos-action-btn glos-action-btn--delete" data-action="delete" data-id="${entry.id}" type="button" title="Eliminar">✕</button>
            </div>
          </div>
          <p class="entry-def">${entry.definicion}</p>
          ${entry.formula ? `<div class="entry-detail"><span class="entry-detail-label">Fórmula</span><code>${entry.formula}</code></div>` : ''}
          ${entry.origen  ? `<div class="entry-detail"><span class="entry-detail-label">Origen</span><span>${entry.origen}</span></div>` : ''}
        `;
        list.appendChild(card);
      });
    }

    function resetForm() {
      editingId = null;
      form.reset();
      document.getElementById('dp-submit').textContent = 'Agregar propuesta';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const termino    = document.getElementById('dp-termino').value.trim();
      const definicion = document.getElementById('dp-definicion').value.trim();
      const errorEl    = document.getElementById('dp-error');
      if (!termino || !definicion) { errorEl.classList.remove('hidden'); return; }
      errorEl.classList.add('hidden');

      const payload = {
        id:         editingId || undefined,
        modulo:     document.getElementById('dp-modulo').value,
        termino,
        definicion,
        formula:    document.getElementById('dp-formula').value.trim(),
        origen:     document.getElementById('dp-origen').value.trim(),
        categoria:  document.getElementById('dp-categoria').value,
      };

      const saved = await DataService.saveDictionaryProposal(payload);
      entries = editingId ? entries.map(e => e.id === editingId ? saved : e) : [...entries, saved];
      render();
      resetForm();
    });

    document.getElementById('dp-cancel').addEventListener('click', resetForm);

    document.getElementById('dp-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;

      if (action === 'edit') {
        const entry = entries.find(x => x.id === id);
        if (!entry) return;
        editingId = id;
        document.getElementById('dp-modulo').value     = entry.modulo;
        document.getElementById('dp-termino').value    = entry.termino;
        document.getElementById('dp-definicion').value = entry.definicion;
        document.getElementById('dp-formula').value    = entry.formula;
        document.getElementById('dp-origen').value     = entry.origen;
        document.getElementById('dp-categoria').value  = entry.categoria;
        document.getElementById('dp-submit').textContent = 'Guardar cambios';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      if (action === 'delete') {
        if (!confirm(`¿Eliminar la propuesta "${entries.find(x => x.id === id)?.termino}"?`)) return;
        await DataService.deleteDictionaryProposal(id);
        entries = entries.filter(x => x.id !== id);
        render();
      }
    });

    document.getElementById('dp-export').addEventListener('click', async () => {
      const json = await DataService.exportDictionaryProposals();
      downloadFile(json, `propuestas-diccionario-${todayStamp()}.json`);
    });

    render();
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * PESTAÑA 2 — MI GLOSARIO (mismo modelo que glossary.html)
   * ══════════════════════════════════════════════════════════════════════════ */
  async function initGlossaryTab() {
    let entries   = await DataService.getGlossary();
    let editingId = null;
    const form = document.getElementById('gl-form');

    function render() {
      const list  = document.getElementById('gl-list');
      const empty = document.getElementById('gl-empty');
      list.innerHTML = '';
      empty.classList.toggle('hidden', entries.length > 0);

      entries.forEach(entry => {
        const catLabel = { transferible: 'Transferible', especifico_calypso: 'Específico Calypso', personal: 'Personal' }[entry.categoria] || entry.categoria;
        const card = document.createElement('div');
        card.className = 'dict-entry glos-card';
        card.innerHTML = `
          <div class="entry-header">
            <span class="entry-term">${entry.termino}</span>
            <div style="display:flex; align-items:center; gap:.5rem; flex-wrap:wrap;">
              <span class="tooltip-cat tooltip-cat--${entry.categoria === 'personal' ? 'personal' : entry.categoria}">${catLabel}</span>
              <button class="glos-action-btn" data-action="edit" data-id="${entry.id}" type="button" title="Editar">✏</button>
              <button class="glos-action-btn glos-action-btn--delete" data-action="delete" data-id="${entry.id}" type="button" title="Eliminar">✕</button>
            </div>
          </div>
          <p class="entry-def">${entry.definicion}</p>
          ${entry.formula ? `<div class="entry-detail"><span class="entry-detail-label">Fórmula</span><code>${entry.formula}</code></div>` : ''}
          ${entry.origen  ? `<div class="entry-detail"><span class="entry-detail-label">Origen</span><span>${entry.origen}</span></div>` : ''}
        `;
        list.appendChild(card);
      });
    }

    function resetForm() {
      editingId = null;
      form.reset();
      document.getElementById('gl-submit').textContent = 'Agregar término';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const termino    = document.getElementById('gl-termino').value.trim();
      const definicion = document.getElementById('gl-definicion').value.trim();
      const errorEl     = document.getElementById('gl-error');
      if (!termino || !definicion) { errorEl.classList.remove('hidden'); return; }
      errorEl.classList.add('hidden');

      const payload = {
        id:         editingId || undefined,
        termino,
        definicion,
        formula:    document.getElementById('gl-formula').value.trim(),
        origen:     document.getElementById('gl-origen').value.trim(),
        categoria:  document.getElementById('gl-categoria').value,
      };

      const saved = await DataService.saveGlossaryEntry(payload);
      entries = editingId ? entries.map(e => e.id === editingId ? saved : e) : [...entries, saved];
      render();
      resetForm();
    });

    document.getElementById('gl-cancel').addEventListener('click', resetForm);

    document.getElementById('gl-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;

      if (action === 'edit') {
        const entry = entries.find(x => x.id === id);
        if (!entry) return;
        editingId = id;
        document.getElementById('gl-termino').value    = entry.termino;
        document.getElementById('gl-definicion').value = entry.definicion;
        document.getElementById('gl-formula').value    = entry.formula;
        document.getElementById('gl-origen').value     = entry.origen;
        document.getElementById('gl-categoria').value  = entry.categoria;
        document.getElementById('gl-submit').textContent = 'Guardar cambios';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      if (action === 'delete') {
        if (!confirm(`¿Eliminar "${entries.find(x => x.id === id)?.termino}"?`)) return;
        await DataService.deleteGlossaryEntry(id);
        entries = entries.filter(x => x.id !== id);
        render();
      }
    });

    document.getElementById('gl-export').addEventListener('click', async () => {
      const json = await DataService.exportGlossary();
      downloadFile(json, `mi-glosario-${todayStamp()}.json`);
    });

    render();
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * PESTAÑA 3 — FICHAS DE PRODUCTO (borradores)
   * ══════════════════════════════════════════════════════════════════════════ */
  async function initProductsTab() {
    let drafts    = await DataService.getProductDrafts();
    let editingId = null;
    const form = document.getElementById('pd-form');

    function render() {
      const list  = document.getElementById('pd-list');
      const empty = document.getElementById('pd-empty');
      list.innerHTML = '';
      empty.classList.toggle('hidden', drafts.length > 0);

      drafts.forEach(d => {
        const pairs = Array.isArray(d.config?.currencyPairs) ? d.config.currencyPairs.length : 0;
        const card = document.createElement('div');
        card.className = 'dict-entry glos-card';
        card.innerHTML = `
          <div class="entry-header">
            <span class="entry-term">${d.config?.name || d.productId}</span>
            <div style="display:flex; align-items:center; gap:.5rem; flex-wrap:wrap;">
              <span class="glos-date">${pairs} par${pairs === 1 ? '' : 'es'} de divisas</span>
              <button class="glos-action-btn" data-action="edit"   data-id="${d.id}" type="button" title="Editar">✏</button>
              <button class="glos-action-btn" data-action="export" data-id="${d.id}" type="button" title="Exportar JSON">⬇</button>
              <button class="glos-action-btn glos-action-btn--delete" data-action="delete" data-id="${d.id}" type="button" title="Eliminar">✕</button>
            </div>
          </div>
          <div class="entry-detail"><span class="entry-detail-label">id</span><code>${d.productId}</code></div>
        `;
        list.appendChild(card);
      });
    }

    function resetForm() {
      editingId = null;
      form.reset();
      document.getElementById('pd-submit').textContent = 'Agregar ficha';
      document.getElementById('pd-error').classList.add('hidden');
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw      = document.getElementById('pd-json').value.trim();
      const errorEl  = document.getElementById('pd-error');

      let config;
      try {
        config = JSON.parse(raw);
      } catch {
        errorEl.textContent = 'El JSON no es válido. Revisa la sintaxis.';
        errorEl.classList.remove('hidden');
        return;
      }

      const issues = validateProductConfig(config);
      if (issues.length) {
        errorEl.textContent = 'Faltan campos: ' + issues.join(', ');
        errorEl.classList.remove('hidden');
        return;
      }
      errorEl.classList.add('hidden');

      const saved = await DataService.saveProductDraft({ id: editingId || undefined, productId: config.id, config });
      drafts = editingId ? drafts.map(d => d.id === editingId ? saved : d) : [...drafts, saved];
      render();
      resetForm();
    });

    document.getElementById('pd-cancel').addEventListener('click', resetForm);

    document.getElementById('pd-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;

      if (action === 'edit') {
        const draft = drafts.find(x => x.id === id);
        if (!draft) return;
        editingId = id;
        document.getElementById('pd-json').value = JSON.stringify(draft.config, null, 2);
        document.getElementById('pd-submit').textContent = 'Guardar cambios';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      if (action === 'export') {
        const json = await DataService.exportProductDraft(id);
        const draft = drafts.find(x => x.id === id);
        downloadFile(json, `${draft?.productId || 'producto'}.json`);
      }

      if (action === 'delete') {
        if (!confirm('¿Eliminar esta ficha de producto?')) return;
        await DataService.deleteProductDraft(id);
        drafts = drafts.filter(x => x.id !== id);
        render();
      }
    });

    render();
  }

  function validateProductConfig(config) {
    const issues = [];
    if (!config.id)   issues.push('id');
    if (!config.name) issues.push('name');
    if (!Array.isArray(config.currencyPairs) || config.currencyPairs.length === 0) {
      issues.push('currencyPairs (debe ser un array con al menos un par)');
    } else {
      config.currencyPairs.forEach((p, i) => {
        if (!p.id || !p.base || !p.quote || typeof p.spotDefault !== 'number') {
          issues.push(`currencyPairs[${i}] incompleto (id/base/quote/spotDefault)`);
        }
      });
    }
    return issues;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * PESTAÑA 4 — PLANTILLAS PARA IA + IMPORTADOR
   * ══════════════════════════════════════════════════════════════════════════ */
  const TEMPLATES = {
    dictionary:
`// Pega esto en tu IA externa: "Genera un array de objetos con este formato exacto
// para los siguientes conceptos: <lista de conceptos>". Luego importa el resultado abajo.
[
  {
    "modulo": "forward_fx",
    "termino": "Nombre del concepto",
    "definicion": "Explicación simple, sin asumir conocimiento financiero previo",
    "formula": "Fórmula estándar de la industria (deja vacío si no aplica)",
    "origen": "Fuente reconocida: curso Calypso, Hull, CFA Institute, ISDA, etc.",
    "categoria": "transferible | especifico_calypso"
  }
]`,
    glossary:
`{
  "termino": "Nombre del concepto",
  "definicion": "Tu propia explicación del concepto",
  "formula": "Opcional",
  "origen": "Opcional",
  "categoria": "personal"
}`,
    product:
`{
  "id": "product-id-unico",
  "name": "Nombre visible en el simulador",
  "dayCountOptions": [360, 365],
  "currencyPairs": [
    {
      "id": "USDMXN", "base": "USD", "quote": "MXN",
      "spotDefault": 17.00, "rateBaseDefault": 5.00, "rateQuoteDefault": 11.00,
      "products": ["forward", "spot"], "settleCcy": "USD"
    }
  ],
  "defaults": {
    "currencyPair": "USDMXN", "direction": "buy",
    "notionalBase": 1000000, "days": 90, "dayCount": 360
  }
}`,
  };

  function initTemplatesTab() {
    Object.keys(TEMPLATES).forEach(key => {
      document.getElementById(`tpl-${key}`).textContent = TEMPLATES[key];
    });

    document.querySelectorAll('[data-copy-tpl]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(TEMPLATES[btn.dataset.copyTpl]);
        const original = btn.textContent;
        btn.textContent = '¡Copiado!';
        setTimeout(() => btn.textContent = original, 1400);
      });
    });

    document.getElementById('imp-validate').addEventListener('click', () => runImportPreview());
    document.getElementById('imp-confirm').addEventListener('click', () => runImport());
  }

  let _importPreviewData = null;

  function runImportPreview() {
    const raw       = document.getElementById('imp-json').value.trim();
    const resultBox = document.getElementById('imp-result');
    const confirmBtn = document.getElementById('imp-confirm');
    _importPreviewData = null;
    confirmBtn.disabled = true;

    if (!raw) {
      resultBox.innerHTML = '<p class="mgmt-preview-empty">Pega un JSON arriba para validarlo.</p>';
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      resultBox.innerHTML = `<p class="mgmt-preview-empty">JSON inválido: ${err.message}</p>`;
      return;
    }

    const items = Array.isArray(data) ? data : [data];
    const report = items.map((item, i) => {
      if (item && Array.isArray(item.currencyPairs)) {
        const issues = validateProductConfig(item);
        return { kind: 'product', item, issues, label: item.name || item.id || `#${i + 1}` };
      }
      if (item && typeof item.termino === 'string') {
        const issues = [];
        if (!item.termino)    issues.push('termino');
        if (!item.definicion) issues.push('definicion');
        return { kind: 'dictionary', item, issues, label: item.termino || `#${i + 1}` };
      }
      return { kind: 'unknown', item, issues: ['formato no reconocido'], label: `#${i + 1}` };
    });

    const validCount = report.filter(r => r.issues.length === 0).length;
    resultBox.innerHTML = report.map(r => `
      <div style="margin-bottom:.5rem;">
        <strong>${r.label}</strong> — ${r.kind === 'unknown' ? 'tipo no reconocido' : (r.kind === 'product' ? 'ficha de producto' : 'entrada de diccionario/glosario')}
        ${r.issues.length
          ? `<ul class="mgmt-issue-list">${r.issues.map(i => `<li>${i}</li>`).join('')}</ul>`
          : ' <span style="color:var(--blue-700); font-size:.78rem;">✓ válido</span>'}
      </div>
    `).join('');

    if (validCount > 0) {
      _importPreviewData = report.filter(r => r.issues.length === 0);
      confirmBtn.disabled = false;
      confirmBtn.textContent = `Importar ${validCount} entrada${validCount === 1 ? '' : 's'} válida${validCount === 1 ? '' : 's'}`;
    } else {
      confirmBtn.textContent = 'Importar';
    }
  }

  async function runImport() {
    if (!_importPreviewData || !_importPreviewData.length) return;
    const destSelect = document.getElementById('imp-dest');

    for (const r of _importPreviewData) {
      if (r.kind === 'product') {
        await DataService.saveProductDraft({ productId: r.item.id, config: r.item });
      } else if (r.kind === 'dictionary') {
        const dest = destSelect.value; // 'dictionary' | 'glossary'
        if (dest === 'glossary') {
          await DataService.saveGlossaryEntry(r.item);
        } else {
          await DataService.saveDictionaryProposal({ ...r.item, modulo: r.item.modulo || 'forward_fx' });
        }
      }
    }

    document.getElementById('imp-json').value = '';
    document.getElementById('imp-result').innerHTML = '<p class="mgmt-preview-empty">Importado. Revisa las pestañas correspondientes.</p>';
    document.getElementById('imp-confirm').disabled = true;
    _importPreviewData = null;

    // Refresca las pestañas afectadas si ya fueron inicializadas
    if (document.getElementById('dp-list')) await initDictionaryTab();
    if (document.getElementById('gl-list')) await initGlossaryTab();
    if (document.getElementById('pd-list')) await initProductsTab();
  }

  /* ── Utilidades ─────────────────────────────────────────────────────────── */
  function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function todayStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  async function init() {
    initTabs();
    await initDictionaryTab();
    await initGlossaryTab();
    await initProductsTab();
    initTemplatesTab();
  }

  return { init };
})();
