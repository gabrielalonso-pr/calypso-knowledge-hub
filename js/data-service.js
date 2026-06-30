/**
 * DataService — capa de abstracción de datos.
 *
 * Hoy resuelve en: JSON estático (diccionario Calypso) + localStorage (Mi Glosario).
 * Para conectar a una base de datos en el futuro: reemplaza los métodos internos
 * _fetchDictionary() y _persistGlossary() con llamadas a tu API REST.
 * La interfaz pública (Promise-based) queda idéntica; la UI no cambia.
 *
 * Interfaz pública:
 *   DataService.getDictionary()           → Promise<Object>   entradas del diccionario Calypso
 *   DataService.getGlossary()             → Promise<Array>    entradas de Mi Glosario
 *   DataService.saveGlossaryEntry(entry)  → Promise<Object>   guarda/actualiza entrada
 *   DataService.deleteGlossaryEntry(id)   → Promise<void>     elimina entrada por id
 *   DataService.exportGlossary()          → Promise<string>   JSON exportable
 *   DataService.getDictionaryProposals()        → Promise<Array>
 *   DataService.saveDictionaryProposal(entry)   → Promise<Object>
 *   DataService.deleteDictionaryProposal(id)    → Promise<void>
 *   DataService.exportDictionaryProposals()     → Promise<string>  JSON agrupado por módulo, listo para fusionar en data/dictionary.json
 *   DataService.getProductDrafts()              → Promise<Array>
 *   DataService.saveProductDraft(draft)         → Promise<Object>
 *   DataService.deleteProductDraft(id)          → Promise<void>
 *   DataService.exportProductDraft(id)          → Promise<string>  JSON listo para subir a config/products/
 */
const DataService = (() => {

  /* ── Configuración ─────────────────────────────────────────────────────── */
  const DICTIONARY_URL        = 'data/dictionary.json';
  const GLOSSARY_KEY          = 'calypso_glossary_v1';
  const DICT_PROPOSALS_KEY    = 'calypso_dictionary_proposals_v1';
  const PRODUCT_DRAFTS_KEY    = 'calypso_product_drafts_v1';

  /* ── Caché en memoria ──────────────────────────────────────────────────── */
  let _dictionaryCache = null;

  /* ══════════════════════════════════════════════════════════════════════════
   * DICCIONARIO CALYPSO (fuente: JSON estático → futura API)
   * ══════════════════════════════════════════════════════════════════════════ */

  /**
   * Carga el diccionario desde la fuente de datos.
   * PUNTO DE EXTENSIÓN: reemplaza fetch() con una llamada a tu API.
   *   Ejemplo futuro: return fetch('/api/dictionary').then(r => r.json())
   */
  async function _fetchDictionary() {
    const response = await fetch(DICTIONARY_URL);
    if (!response.ok) throw new Error(`Error cargando diccionario: ${response.status}`);
    return response.json();
  }

  /**
   * Retorna todas las entradas del diccionario Calypso.
   * Usa caché en memoria para evitar múltiples fetches.
   */
  async function getDictionary() {
    if (!_dictionaryCache) {
      _dictionaryCache = await _fetchDictionary();
    }
    return _dictionaryCache;
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * MI GLOSARIO (fuente: localStorage → futura API/DB)
   * ══════════════════════════════════════════════════════════════════════════ */

  /**
   * Lee las entradas del glosario desde localStorage.
   * PUNTO DE EXTENSIÓN: reemplaza con GET /api/glossary
   */
  function _readGlossary() {
    try {
      const raw = localStorage.getItem(GLOSSARY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Escribe las entradas del glosario en localStorage.
   * PUNTO DE EXTENSIÓN: reemplaza con POST/PUT /api/glossary
   */
  function _writeGlossary(entries) {
    localStorage.setItem(GLOSSARY_KEY, JSON.stringify(entries));
  }

  /**
   * Retorna todas las entradas de Mi Glosario como un array.
   * Devuelve Promise para consistencia con la futura API.
   */
  function getGlossary() {
    return Promise.resolve(_readGlossary());
  }

  /**
   * Guarda o actualiza una entrada en Mi Glosario.
   * Si entry.id existe y coincide con una entrada existente, la actualiza.
   * Si no, crea una nueva entrada con id generado y timestamp.
   *
   * PUNTO DE EXTENSIÓN: reemplaza con POST /api/glossary o PUT /api/glossary/:id
   *
   * @param {Object} entry  { id?, termino, definicion, formula?, origen?, categoria? }
   * @returns {Promise<Object>} la entrada guardada con id y timestamps
   */
  function saveGlossaryEntry(entry) {
    const entries = _readGlossary();
    const now = new Date().toISOString();

    if (entry.id) {
      const idx = entries.findIndex(e => e.id === entry.id);
      if (idx !== -1) {
        entries[idx] = { ...entries[idx], ...entry, updatedAt: now };
        _writeGlossary(entries);
        return Promise.resolve(entries[idx]);
      }
    }

    const newEntry = {
      id: `glos_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      termino:    entry.termino    || '',
      definicion: entry.definicion || '',
      formula:    entry.formula    || '',
      origen:     entry.origen     || '',
      categoria:  entry.categoria  || 'personal',
      createdAt:  now,
      updatedAt:  now,
    };

    entries.push(newEntry);
    _writeGlossary(entries);
    return Promise.resolve(newEntry);
  }

  /**
   * Elimina una entrada de Mi Glosario por su id.
   * PUNTO DE EXTENSIÓN: reemplaza con DELETE /api/glossary/:id
   */
  function deleteGlossaryEntry(id) {
    const entries = _readGlossary().filter(e => e.id !== id);
    _writeGlossary(entries);
    return Promise.resolve();
  }

  /**
   * Exporta Mi Glosario como string JSON, listo para importar a una DB.
   * El formato es un array de objetos con todos los campos de cada entrada.
   */
  function exportGlossary() {
    const entries = _readGlossary();
    return Promise.resolve(JSON.stringify(entries, null, 2));
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * PROPUESTAS DE DICCIONARIO (fuente: localStorage → futura API)
   * Términos sugeridos para el diccionario Calypso oficial. No se escriben
   * directamente en data/dictionary.json (sitio estático, sin backend);
   * se exportan como JSON para que el dueño del repo las fusione a mano.
   * ══════════════════════════════════════════════════════════════════════════ */

  function _readDictProposals() {
    try {
      const raw = localStorage.getItem(DICT_PROPOSALS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function _writeDictProposals(entries) {
    localStorage.setItem(DICT_PROPOSALS_KEY, JSON.stringify(entries));
  }

  function getDictionaryProposals() {
    return Promise.resolve(_readDictProposals());
  }

  /**
   * @param {Object} entry { id?, modulo, termino, definicion, formula?, origen?, categoria? }
   */
  function saveDictionaryProposal(entry) {
    const entries = _readDictProposals();
    const now = new Date().toISOString();

    if (entry.id) {
      const idx = entries.findIndex(e => e.id === entry.id);
      if (idx !== -1) {
        entries[idx] = { ...entries[idx], ...entry, updatedAt: now };
        _writeDictProposals(entries);
        return Promise.resolve(entries[idx]);
      }
    }

    const newEntry = {
      id:         `propdict_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      modulo:     entry.modulo     || 'forward_fx',
      termino:    entry.termino    || '',
      definicion: entry.definicion || '',
      formula:    entry.formula    || '',
      origen:     entry.origen     || '',
      categoria:  entry.categoria  || 'transferible',
      createdAt:  now,
      updatedAt:  now,
    };

    entries.push(newEntry);
    _writeDictProposals(entries);
    return Promise.resolve(newEntry);
  }

  function deleteDictionaryProposal(id) {
    const entries = _readDictProposals().filter(e => e.id !== id);
    _writeDictProposals(entries);
    return Promise.resolve();
  }

  /** Slugifica un término a una clave válida tipo snake_case (sin acentos). */
  function _slugify(text) {
    return text
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'termino';
  }

  /** Agrupa las propuestas por módulo, en el mismo formato que data/dictionary.json. */
  function exportDictionaryProposals() {
    const entries = _readDictProposals();
    const grouped = {};

    entries.forEach(e => {
      const modKey = e.modulo || 'forward_fx';
      if (!grouped[modKey]) grouped[modKey] = {};
      const entryKey = _slugify(e.termino);
      grouped[modKey][entryKey] = {
        termino:    e.termino,
        definicion: e.definicion,
        formula:    e.formula || '',
        origen:     e.origen || '',
        categoria:  e.categoria || 'transferible',
      };
    });

    return Promise.resolve(JSON.stringify(grouped, null, 2));
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * FICHAS DE PRODUCTO — borradores (fuente: localStorage → futura API)
   * Se exportan como JSON para subir manualmente a config/products/.
   * ══════════════════════════════════════════════════════════════════════════ */

  function _readProductDrafts() {
    try {
      const raw = localStorage.getItem(PRODUCT_DRAFTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function _writeProductDrafts(drafts) {
    localStorage.setItem(PRODUCT_DRAFTS_KEY, JSON.stringify(drafts));
  }

  function getProductDrafts() {
    return Promise.resolve(_readProductDrafts());
  }

  /**
   * @param {Object} draft { id?, productId, config: Object }
   *   config sigue el esquema de config/products/*.json
   */
  function saveProductDraft(draft) {
    const drafts = _readProductDrafts();
    const now = new Date().toISOString();

    if (draft.id) {
      const idx = drafts.findIndex(d => d.id === draft.id);
      if (idx !== -1) {
        drafts[idx] = { ...drafts[idx], ...draft, updatedAt: now };
        _writeProductDrafts(drafts);
        return Promise.resolve(drafts[idx]);
      }
    }

    const newDraft = {
      id:        `proddraft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      productId: draft.productId || '',
      config:    draft.config || {},
      createdAt: now,
      updatedAt: now,
    };

    drafts.push(newDraft);
    _writeProductDrafts(drafts);
    return Promise.resolve(newDraft);
  }

  function deleteProductDraft(id) {
    const drafts = _readProductDrafts().filter(d => d.id !== id);
    _writeProductDrafts(drafts);
    return Promise.resolve();
  }

  function exportProductDraft(id) {
    const draft = _readProductDrafts().find(d => d.id === id);
    return Promise.resolve(draft ? JSON.stringify(draft.config, null, 2) : '{}');
  }

  /* ── API pública ───────────────────────────────────────────────────────── */
  return {
    getDictionary,
    getGlossary,
    saveGlossaryEntry,
    deleteGlossaryEntry,
    exportGlossary,
    getDictionaryProposals,
    saveDictionaryProposal,
    deleteDictionaryProposal,
    exportDictionaryProposals,
    getProductDrafts,
    saveProductDraft,
    deleteProductDraft,
    exportProductDraft,
  };

})();
