/* ── XML Trade Editor ─────────────────────────────────────────────────── */

let rootTag = '';
let tradeTag = '';
let fieldSchema = []; // [{path, tag, value, children: [...]}]
let savedRecords = []; // array of {fieldPath: value}

// ── Parse XML into schema tree ─────────────────────────────────────────
function parseXML(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('XML inválido: ' + parseError.textContent);

  const root = doc.documentElement;
  rootTag = root.tagName;

  const tradeEl = root.children[0];
  if (!tradeEl) throw new Error('El XML no tiene elementos de segundo nivel.');
  tradeTag = tradeEl.tagName;

  fieldSchema = extractFields(tradeEl, '');
  return fieldSchema;
}

function extractFields(el, parentPath) {
  const fields = [];
  for (const child of el.children) {
    const path = parentPath ? parentPath + '.' + child.tagName : child.tagName;
    if (child.children.length === 0) {
      fields.push({ path, tag: child.tagName, value: child.textContent, children: null });
    } else {
      fields.push({
        path,
        tag: child.tagName,
        value: null,
        children: extractFields(child, path)
      });
    }
  }
  return fields;
}

// ── Get current form values as flat object ─────────────────────────────
function getFormValues() {
  const values = {};
  const inputs = document.querySelectorAll('#trade-form [data-path]');
  inputs.forEach(input => { values[input.dataset.path] = input.value; });
  return values;
}

// ── Set form values from flat object ──────────────────────────────────
function setFormValues(values) {
  const inputs = document.querySelectorAll('#trade-form [data-path]');
  inputs.forEach(input => {
    input.value = values[input.dataset.path] ?? '';
  });
}

// ── Render form ────────────────────────────────────────────────────────
function renderForm(fields) {
  const form = document.getElementById('trade-form');
  form.innerHTML = '';
  fields.forEach(field => {
    form.appendChild(renderField(field, 0));
  });
}

function renderField(field, depth) {
  if (field.children) {
    return renderGroup(field, depth);
  }
  const row = document.createElement('div');
  row.className = 'xe-field-row';
  row.style.paddingLeft = (depth * 1.2) + 'rem';

  const label = document.createElement('label');
  label.textContent = field.tag;
  label.htmlFor = 'field-' + field.path;

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'field-' + field.path;
  input.dataset.path = field.path;
  input.value = field.value ?? '';
  input.placeholder = '(vacío)';

  row.appendChild(label);
  row.appendChild(input);
  return row;
}

function renderGroup(field, depth) {
  const section = document.createElement('div');
  section.className = 'xe-group';
  section.style.marginLeft = (depth * 1.2) + 'rem';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'xe-group-header';
  header.innerHTML = `<span class="xe-group-arrow">▾</span> <span>${field.tag}</span>`;

  const body = document.createElement('div');
  body.className = 'xe-group-body';

  header.addEventListener('click', () => {
    const collapsed = body.classList.toggle('xe-collapsed');
    header.querySelector('.xe-group-arrow').textContent = collapsed ? '▸' : '▾';
  });

  field.children.forEach(child => {
    body.appendChild(renderField(child, 0));
  });

  section.appendChild(header);
  section.appendChild(body);
  return section;
}

// ── Build XML string from records ──────────────────────────────────────
function buildXML(records) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="iso-8859-1"?>');
  lines.push(`<${rootTag}>`);
  records.forEach(record => {
    lines.push(`   <${tradeTag}>`);
    lines.push(...buildFieldLines(fieldSchema, record, '      '));
    lines.push(`   </${tradeTag}>`);
  });
  lines.push(`</${rootTag}>`);
  return lines.join('\n');
}

function buildFieldLines(schema, values, indent) {
  const lines = [];
  schema.forEach(field => {
    if (field.children) {
      lines.push(`${indent}<${field.tag}>`);
      lines.push(...buildFieldLines(field.children, values, indent + '   '));
      lines.push(`${indent}</${field.tag}>`);
    } else {
      const val = values[field.path] ?? '';
      const escaped = escapeXML(val);
      lines.push(`${indent}<${field.tag}>${escaped}</${field.tag}>`);
    }
  });
  return lines;
}

function escapeXML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Update records sidebar ─────────────────────────────────────────────
function updateRecordsSidebar() {
  const list = document.getElementById('records-list');
  const count = document.getElementById('records-count');
  count.textContent = savedRecords.length;
  list.innerHTML = '';

  if (savedRecords.length === 0) {
    list.innerHTML = '<li class="xe-no-records">Ningún registro guardado aún.</li>';
    return;
  }

  savedRecords.forEach((rec, idx) => {
    const li = document.createElement('li');
    li.className = 'xe-record-item';

    const firstLeaf = Object.entries(rec).find(([, v]) => v !== '');
    const preview = firstLeaf ? `${firstLeaf[0].split('.').pop()}: ${firstLeaf[1]}` : `Trade ${idx + 1}`;

    li.innerHTML = `
      <span class="xe-record-label">#${idx + 1} — ${preview}</span>
      <div class="xe-record-actions">
        <button type="button" class="xe-rec-btn xe-rec-load" data-idx="${idx}" title="Cargar en formulario">↩</button>
        <button type="button" class="xe-rec-btn xe-rec-del" data-idx="${idx}" title="Eliminar registro">✕</button>
      </div>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('.xe-rec-load').forEach(btn => {
    btn.addEventListener('click', () => {
      setFormValues(savedRecords[parseInt(btn.dataset.idx)]);
    });
  });
  list.querySelectorAll('.xe-rec-del').forEach(btn => {
    btn.addEventListener('click', () => {
      savedRecords.splice(parseInt(btn.dataset.idx), 1);
      updateRecordsSidebar();
    });
  });
}

// ── Download XML file ──────────────────────────────────────────────────
function downloadXML(xmlString) {
  const blob = new Blob([xmlString], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'CDUF_export.xml';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Wire up events after DOM ready ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const dropZone    = document.getElementById('drop-zone');
  const fileInput   = document.getElementById('file-input');
  const editorArea  = document.getElementById('editor-area');
  const btnClear    = document.getElementById('btn-clear');
  const btnAdd      = document.getElementById('btn-add-record');
  const btnExport   = document.getElementById('btn-export');
  const modal       = document.getElementById('export-modal');
  const modalMsg    = document.getElementById('modal-message');
  const btnConfirm  = document.getElementById('modal-confirm');
  const btnCancel   = document.getElementById('modal-cancel');
  const errorBanner = document.getElementById('error-banner');

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
    setTimeout(() => errorBanner.classList.add('hidden'), 5000);
  }

  function loadFile(file) {
    if (!file || !file.name.endsWith('.xml')) {
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
        editorArea.classList.remove('hidden');
        dropZone.classList.add('hidden');
        document.getElementById('editor-filename').textContent = file.name;
      } catch (err) {
        showError(err.message);
      }
    };
    reader.readAsText(file);
  }

  // File input
  fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));

  // Drop zone click
  dropZone.addEventListener('click', () => fileInput.click());

  // Drag & drop
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('xe-drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('xe-drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('xe-drag-over');
    loadFile(e.dataTransfer.files[0]);
  });

  // Cargar otro archivo
  document.getElementById('btn-change-file').addEventListener('click', () => {
    editorArea.classList.add('hidden');
    dropZone.classList.remove('hidden');
    fileInput.value = '';
    savedRecords = [];
    fieldSchema = [];
  });

  // Limpiar valores
  btnClear.addEventListener('click', () => {
    document.querySelectorAll('#trade-form [data-path]').forEach(input => { input.value = ''; });
  });

  // Agregar registro
  btnAdd.addEventListener('click', () => {
    const values = getFormValues();
    savedRecords.push({ ...values });
    updateRecordsSidebar();
    const badge = document.getElementById('records-count');
    badge.classList.add('xe-badge-flash');
    setTimeout(() => badge.classList.remove('xe-badge-flash'), 600);
  });

  // Exportar — mostrar modal de confirmación siempre
  btnExport.addEventListener('click', () => {
    if (savedRecords.length === 0) {
      modalMsg.innerHTML =
        '<span class="xe-modal-warn">⚠ No se han guardado registros.</span><br>' +
        'Solo se exportará <strong>1 trade</strong> con los datos actuales de la pantalla.<br><br>' +
        '¿Desea continuar con la exportación?';
    } else {
      modalMsg.innerHTML =
        `Se exportarán <strong>${savedRecords.length} trade${savedRecords.length > 1 ? 's' : ''}</strong> guardados en memoria.<br><br>` +
        '¿Está seguro que desea exportar el archivo XML?';
    }
    modal.classList.remove('hidden');
  });

  btnCancel.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

  btnConfirm.addEventListener('click', () => {
    modal.classList.add('hidden');
    const records = savedRecords.length > 0 ? savedRecords : [getFormValues()];
    downloadXML(buildXML(records));
  });
});
