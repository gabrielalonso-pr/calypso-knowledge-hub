/* ── XML Trade Editor v2 ─────────────────────────────────────────────── */

let rootTag = '';
let tradeTag = '';
let savedRecords = []; // array of schema trees

// ── Parse XML into schema tree ─────────────────────────────────────────
// Schema node:
//   simple: { tag, isGroup: false, values: string[] }
//   group:  { tag, isGroup: true,  instances: Node[][] }

function parseXML(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  if (doc.querySelector('parsererror'))
    throw new Error('XML inválido — verificá que el archivo esté bien formado.');

  const root = doc.documentElement;
  rootTag = root.tagName;
  const tradeEl = root.children[0];
  if (!tradeEl) throw new Error('El XML no tiene elementos de segundo nivel.');
  tradeTag = tradeEl.tagName;
  return parseChildren(tradeEl);
}

function parseChildren(el) {
  const nodes = [];
  const processed = new Set();
  for (const child of el.children) {
    if (processed.has(child.tagName)) continue;
    processed.add(child.tagName);
    const siblings = [...el.children].filter(c => c.tagName === child.tagName);
    const isGroup = child.children.length > 0;
    if (!isGroup) {
      nodes.push({ tag: child.tagName, isGroup: false, values: siblings.map(s => s.textContent) });
    } else {
      nodes.push({ tag: child.tagName, isGroup: true, instances: siblings.map(s => parseChildren(s)) });
    }
  }
  return nodes;
}

// ── Render form from schema ────────────────────────────────────────────
function renderForm(schema) {
  const form = document.getElementById('trade-form');
  form.innerHTML = '';
  renderNodes(schema, form, 0);
}

function renderNodes(nodes, container, depth) {
  nodes.forEach(node => container.appendChild(renderNode(node, depth)));
}

function renderNode(node, depth) {
  const group = document.createElement('div');
  group.className = 'xe-field-group';
  group.dataset.tag = node.tag;
  group.dataset.isGroup = node.isGroup;

  if (!node.isGroup) {
    const unit = document.createElement('div');
    unit.className = 'xe-field-unit';

    const label = document.createElement('label');
    label.className = 'xe-field-label';
    label.textContent = node.tag;

    const valuesList = document.createElement('div');
    valuesList.className = 'xe-values-list';
    node.values.forEach((val, idx) => valuesList.appendChild(makeValueRow(val, idx === 0)));

    unit.appendChild(label);
    unit.appendChild(valuesList);
    group.appendChild(unit);
  } else {
    node.instances.forEach((children, idx) =>
      group.appendChild(makeGroupInstance(node.tag, children, depth, idx === 0))
    );
  }
  return group;
}

function makeValueRow(value, isFirst) {
  const row = document.createElement('div');
  row.className = 'xe-value-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'xe-value-input';
  input.value = value;
  input.placeholder = '(vacío)';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'xe-val-btn xe-val-add';
  addBtn.title = 'Agregar otro valor para este campo';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', () => {
    const newRow = makeValueRow('', false);
    row.parentElement.insertBefore(newRow, row.nextSibling);
    newRow.querySelector('input').focus();
  });

  row.appendChild(input);

  if (!isFirst) {
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'xe-val-btn xe-val-del';
    delBtn.title = 'Eliminar este valor';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => row.remove());
    row.appendChild(delBtn);
  }

  row.appendChild(addBtn);
  return row;
}

function makeGroupInstance(tag, children, depth, isFirst) {
  const d = Math.min(depth, 2); // cap visual depth at 2 for styling
  const instance = document.createElement('div');
  instance.className = `xe-group-instance xe-group-instance--d${d}`;

  const header = document.createElement('div');
  header.className = `xe-group-header xe-group-header--d${d}`;

  const left = document.createElement('div');
  left.className = 'xe-group-header-left';

  const arrow = document.createElement('button');
  arrow.type = 'button';
  arrow.className = 'xe-collapse-btn';
  arrow.setAttribute('aria-label', 'Colapsar sección');
  arrow.textContent = '▾';

  const title = document.createElement('span');
  title.className = 'xe-group-title';
  title.textContent = tag;

  left.appendChild(arrow);
  left.appendChild(title);

  const right = document.createElement('div');
  right.className = 'xe-group-header-right';

  const dupBtn = document.createElement('button');
  dupBtn.type = 'button';
  dupBtn.className = 'xe-dup-btn';
  dupBtn.title = 'Duplicar este bloque con sus valores actuales';
  dupBtn.textContent = '⊕ Duplicar';

  right.appendChild(dupBtn);

  if (!isFirst) {
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'xe-del-instance-btn';
    delBtn.title = 'Eliminar esta instancia del bloque';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => instance.remove());
    right.appendChild(delBtn);
  }

  header.appendChild(left);
  header.appendChild(right);

  const body = document.createElement('div');
  body.className = 'xe-group-body';
  renderNodes(children, body, depth + 1);

  arrow.addEventListener('click', () => {
    const collapsed = body.classList.toggle('xe-collapsed');
    arrow.textContent = collapsed ? '▸' : '▾';
    arrow.setAttribute('aria-label', collapsed ? 'Expandir sección' : 'Colapsar sección');
  });

  dupBtn.addEventListener('click', () => {
    const clonedChildren = deepClone(collectSchema(body));
    const newInstance = makeGroupInstance(tag, clonedChildren, depth, false);
    instance.parentElement.insertBefore(newInstance, instance.nextSibling);
  });

  instance.appendChild(header);
  instance.appendChild(body);
  return instance;
}

// ── Collect schema tree from DOM ───────────────────────────────────────
function collectSchema(containerEl) {
  const nodes = [];
  for (const fg of containerEl.children) {
    if (!fg.classList.contains('xe-field-group')) continue;
    const tag = fg.dataset.tag;
    const isGroup = fg.dataset.isGroup === 'true';
    if (!isGroup) {
      nodes.push({ tag, isGroup: false, values: [...fg.querySelectorAll('.xe-value-input')].map(i => i.value) });
    } else {
      const instances = [...fg.querySelectorAll(':scope > .xe-group-instance')]
        .map(inst => collectSchema(inst.querySelector('.xe-group-body')));
      nodes.push({ tag, isGroup: true, instances });
    }
  }
  return nodes;
}

function getFormSchema() {
  return collectSchema(document.getElementById('trade-form'));
}

// ── Clear all values (keeps structure) ────────────────────────────────
function clearValues() {
  document.getElementById('trade-form').querySelectorAll('.xe-value-input').forEach(i => { i.value = ''; });
}

// ── Build XML string from array of schema trees ────────────────────────
function buildXML(records) {
  const lines = ['<?xml version="1.0" encoding="iso-8859-1"?>', `<${rootTag}>`];
  records.forEach(schema => {
    lines.push(`   <${tradeTag}>`);
    buildNodes(schema, '      ').forEach(l => lines.push(l));
    lines.push(`   </${tradeTag}>`);
  });
  lines.push(`</${rootTag}>`);
  return lines.join('\n');
}

function buildNodes(nodes, indent) {
  const lines = [];
  for (const node of nodes) {
    if (!node.isGroup) {
      node.values.forEach(val => lines.push(`${indent}<${node.tag}>${escapeXML(val)}</${node.tag}>`));
    } else {
      node.instances.forEach(inst => {
        lines.push(`${indent}<${node.tag}>`);
        buildNodes(inst, indent + '   ').forEach(l => lines.push(l));
        lines.push(`${indent}</${node.tag}>`);
      });
    }
  }
  return lines;
}

function escapeXML(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ── Records sidebar ────────────────────────────────────────────────────
function updateRecordsSidebar() {
  const list  = document.getElementById('records-list');
  const count = document.getElementById('records-count');
  count.textContent = savedRecords.length;
  list.innerHTML = '';

  if (savedRecords.length === 0) {
    list.innerHTML = '<li class="xe-no-records">Ningún registro guardado aún.</li>';
    return;
  }

  savedRecords.forEach((schema, idx) => {
    const li = document.createElement('li');
    li.className = 'xe-record-item';
    const first = schema.find(n => !n.isGroup && n.values[0]);
    const preview = first ? `${first.tag}: ${first.values[0]}` : `Trade ${idx + 1}`;

    li.innerHTML = `
      <span class="xe-record-label">#${idx + 1} — ${preview}</span>
      <div class="xe-record-actions">
        <button type="button" class="xe-rec-btn xe-rec-load" data-idx="${idx}" title="Cargar en formulario">↩</button>
        <button type="button" class="xe-rec-btn xe-rec-del"  data-idx="${idx}" title="Eliminar registro">✕</button>
      </div>`;
    list.appendChild(li);
  });

  list.querySelectorAll('.xe-rec-load').forEach(btn =>
    btn.addEventListener('click', () => renderForm(deepClone(savedRecords[+btn.dataset.idx])))
  );
  list.querySelectorAll('.xe-rec-del').forEach(btn =>
    btn.addEventListener('click', () => { savedRecords.splice(+btn.dataset.idx, 1); updateRecordsSidebar(); })
  );
}

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

// ── Download file ──────────────────────────────────────────────────────
function downloadXML(xmlString) {
  const blob = new Blob([xmlString], { type: 'application/xml' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'CDUF_export.xml' });
  a.click();
  URL.revokeObjectURL(url);
}

// ── Boot ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const dropZone    = document.getElementById('drop-zone');
  const fileInput   = document.getElementById('file-input');
  const editorArea  = document.getElementById('editor-area');
  const modal       = document.getElementById('export-modal');
  const modalMsg    = document.getElementById('modal-message');
  const errorBanner = document.getElementById('error-banner');

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
    setTimeout(() => errorBanner.classList.add('hidden'), 6000);
  }

  const dropWrapper = document.getElementById('drop-wrapper');
  const topbar      = document.getElementById('xe-topbar');
  const lblTradeTag = document.getElementById('lbl-trade-tag');

  function showEditor() {
    dropWrapper.classList.add('hidden');
    topbar.classList.remove('hidden');
    editorArea.classList.remove('hidden');
  }

  function showDropZone() {
    editorArea.classList.add('hidden');
    topbar.classList.add('hidden');
    dropWrapper.classList.remove('hidden');
    dropZone.classList.remove('hidden');
  }

  function loadFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.xml')) {
      showError('Por favor selecciona un archivo .xml válido.');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const schema = parseXML(e.target.result);
        savedRecords = [];
        renderForm(schema);
        updateRecordsSidebar();
        document.getElementById('editor-filename').textContent = file.name;
        lblTradeTag.textContent = tradeTag;
        showEditor();
      } catch (err) { showError(err.message); }
    };
    reader.readAsText(file);
  }

  fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('xe-drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('xe-drag-over'));
  dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('xe-drag-over'); loadFile(e.dataTransfer.files[0]); });

  document.getElementById('btn-change-file').addEventListener('click', () => {
    fileInput.value = '';
    savedRecords = [];
    showDropZone();
  });

  document.getElementById('btn-clear').addEventListener('click', clearValues);

  document.getElementById('btn-add-record').addEventListener('click', () => {
    savedRecords.push(deepClone(getFormSchema()));
    updateRecordsSidebar();
    const badge = document.getElementById('records-count');
    badge.classList.add('xe-badge-flash');
    setTimeout(() => badge.classList.remove('xe-badge-flash'), 600);
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    modalMsg.innerHTML = savedRecords.length === 0
      ? '<span class="xe-modal-warn">⚠ No se han guardado registros.</span><br>Solo se exportará <strong>1 trade</strong> con los datos actuales de la pantalla.<br><br>¿Desea continuar con la exportación?'
      : `Se exportarán <strong>${savedRecords.length} trade${savedRecords.length > 1 ? 's' : ''}</strong> guardados en memoria.<br><br>¿Está seguro que desea exportar el archivo XML?`;
    modal.classList.remove('hidden');
  });

  document.getElementById('modal-cancel').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
  document.getElementById('modal-confirm').addEventListener('click', () => {
    modal.classList.add('hidden');
    downloadXML(buildXML(savedRecords.length > 0 ? savedRecords : [getFormSchema()]));
  });
});
