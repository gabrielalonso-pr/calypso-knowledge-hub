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
 */
const DataService = (() => {

  /* ── Configuración ─────────────────────────────────────────────────────── */
  const DICTIONARY_URL   = 'data/dictionary.json';
  const GLOSSARY_KEY     = 'calypso_glossary_v1';

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

  /* ── API pública ───────────────────────────────────────────────────────── */
  return {
    getDictionary,
    getGlossary,
    saveGlossaryEntry,
    deleteGlossaryEntry,
    exportGlossary,
  };

})();
