/**
 * Sistema de tooltips del diccionario interactivo.
 * Carga dictionary.json y registra listeners en todos los botones [data-dict].
 */
const Dictionary = (() => {
  let entries = {};
  const tooltip = document.getElementById('dict-tooltip');

  async function load() {
    const res = await fetch('data/dictionary.json');
    entries = await res.json();
  }

  function show(key, anchorEl) {
    const entry = entries[key];
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

    tooltip.removeAttribute('aria-hidden');
    tooltip.classList.remove('hidden');
    positionTooltip(anchorEl);
  }

  function hide() {
    tooltip.setAttribute('aria-hidden', 'true');
    tooltip.classList.add('hidden');
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

  return { load, init };
})();
