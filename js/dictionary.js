/**
 * Sistema de tooltips del diccionario interactivo.
 * Usa DataService para cargar entradas; soporta la estructura anidada por módulos.
 */
const Dictionary = (() => {
  let _flat = {};
  let _liveProvider = null;
  let _openKey = null;
  const tooltip = document.getElementById('dict-tooltip');

  /** Registra una función (key) => htmlString|null que genera la fórmula
   *  con los valores actuales del simulador para términos calculados. */
  function setLiveProvider(fn) { _liveProvider = fn; }

  async function load() {
    const data = await DataService.getDictionary();
    _flat = _flattenDictionary(data);
  }

  /** Aplana la estructura { module: { _module, _description, key: entry } } en { key: entry } */
  function _flattenDictionary(data) {
    const flat = {};
    for (const moduleKey of Object.keys(data)) {
      if (moduleKey === '_meta') continue;
      const module = data[moduleKey];
      for (const entryKey of Object.keys(module)) {
        if (entryKey.startsWith('_')) continue;
        flat[entryKey] = module[entryKey];
      }
    }
    return flat;
  }

  function getFlat() { return _flat; }

  function show(key, anchorEl) {
    const entry = _flat[key];
    if (!entry) return;

    document.getElementById('tt-term').textContent = entry.termino;

    const catEl = document.getElementById('tt-cat');
    catEl.textContent = entry.categoria === 'transferible' ? 'Transferible' : 'Específico Calypso';
    catEl.className = 'tooltip-cat tooltip-cat--' + entry.categoria;

    document.getElementById('tt-def').textContent = entry.definicion;

    const formulaRow = document.getElementById('tt-formula-row');
    if (entry.formula) {
      document.getElementById('tt-formula').textContent = entry.formula;
      formulaRow.hidden = false;
    } else {
      formulaRow.hidden = true;
    }

    const originRow = document.getElementById('tt-origin-row');
    if (entry.origen) {
      document.getElementById('tt-origin').textContent = entry.origen;
      originRow.hidden = false;
    } else {
      originRow.hidden = true;
    }

    const liveRow = document.getElementById('tt-live-row');
    const liveHtml = _liveProvider ? _liveProvider(key) : null;
    if (liveHtml) {
      document.getElementById('tt-live').innerHTML = liveHtml;
      liveRow.hidden = false;
    } else {
      liveRow.hidden = true;
    }

    _openKey = key;
    tooltip.removeAttribute('aria-hidden');
    tooltip.classList.remove('hidden');
    positionTooltip(anchorEl);
  }

  function hide() {
    _openKey = null;
    tooltip.setAttribute('aria-hidden', 'true');
    tooltip.classList.add('hidden');
  }

  /** Re-renderiza la fórmula "con tus valores" del tooltip abierto, si aplica. */
  function refreshLive() {
    if (!_openKey || tooltip.classList.contains('hidden')) return;
    const liveHtml = _liveProvider ? _liveProvider(_openKey) : null;
    if (liveHtml) document.getElementById('tt-live').innerHTML = liveHtml;
  }

  function positionTooltip(anchor) {
    const rect = anchor.getBoundingClientRect();
    const scrollY = window.scrollY;
    const ttWidth = 320;
    const margin = 8;

    let left = rect.right + margin;
    if (left + ttWidth > window.innerWidth - margin) {
      left = rect.left - ttWidth - margin;
    }
    if (left < margin) left = margin;

    tooltip.style.left = left + 'px';
    tooltip.style.top  = (rect.top + scrollY) + 'px';
  }

  function init() {
    document.getElementById('tooltip-close').addEventListener('click', hide);

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-dict]');
      if (btn) {
        e.stopPropagation();
        show(btn.dataset.dict, btn);
        return;
      }
      if (!tooltip.contains(e.target)) hide();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    });
  }

  return { load, init, getFlat, setLiveProvider, refreshLive };
})();
