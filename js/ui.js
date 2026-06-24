/**
 * Controlador principal de la UI del simulador Forward FX.
 *
 * Estado central (`state`): fuente única de verdad para todos los valores.
 * Lógica bidireccional: cualquier output puede ser "bloqueado" por el usuario.
 *   Al bloquear un output, recalc() despeja el input que mejor lo explica.
 *
 * Mapa de bloqueos:
 *   forwardRate  bloqueado → despeja rateQuote
 *   forwardPoints bloqueado → convierte a forwardRate → despeja rateQuote
 *   notionalQuote bloqueado → despeja notionalBase
 *   npv          bloqueado → despeja spotMarket
 *   spotMarket   editable libre → recalcula npv directamente (no bloquea)
 */

// ── Utilidades de formato ──────────────────────────────────────────────────

const fmt = (n, dec) => n == null || isNaN(n) ? '' : n.toLocaleString('en-US', {
  minimumFractionDigits: dec,
  maximumFractionDigits: dec,
});
const fmt2 = n => fmt(n, 2);
const fmt4 = n => fmt(n, 4);
const fmt6 = n => fmt(n, 6);
const fmt0 = n => fmt(n, 0);

function parseNum(str) {
  // Acepta comas como separadores de miles
  const clean = String(str).replace(/,/g, '');
  const v = parseFloat(clean);
  return isNaN(v) ? null : v;
}

// ── Estado central ─────────────────────────────────────────────────────────

const state = {
  // Inputs
  direction: 'buy',
  currencyPair: 'USDMXN',
  baseCcy: 'USD',
  quoteCcy: 'MXN',
  notionalBase: 1_000_000,
  tradeDate: Engine.todayStr(),
  valueDate: Engine.addDays(Engine.todayStr(), 90),
  days: 90,
  spot: 17.00,
  rateBase: 5.00,   // almacenado como porcentaje (5.00 = 5%)
  rateQuote: 11.00,
  dayCount: 360,

  // Outputs calculados
  forwardRate: null,
  forwardPoints: null,
  notionalQuote: null,
  spotMarket: 17.00,  // spot para MTM; inicialmente = spot del contrato
  npv: null,

  // Qué outputs están bloqueados (editados manualmente por el usuario)
  locked: new Set(),
};

// ── Referencias DOM ────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const fields = {
  direction:      $('f-direction'),
  currencyPair:   $('f-pair'),
  notionalBase:   $('f-notional-base'),
  tradeDate:      $('f-trade-date'),
  valueDate:      $('f-value-date'),
  days:           $('f-days'),
  spot:           $('f-spot'),
  rateBase:       $('f-rate-base'),
  rateQuote:      $('f-rate-quote'),
  dayCount:       $('f-daycount'),
  // outputs
  forwardRate:    $('f-forward-rate'),
  forwardPoints:  $('f-forward-points'),
  notionalQuote:  $('f-notional-quote'),
  spotMarket:     $('f-spot-market'),
  npv:            $('f-npv'),
};

// ── Lógica de bloqueo / desbloqueo ────────────────────────────────────────

function lock(fieldId) {
  // forwardRate y forwardPoints son mutuamente excluyentes
  if (fieldId === 'forwardRate')   state.locked.delete('forwardPoints');
  if (fieldId === 'forwardPoints') state.locked.delete('forwardRate');

  state.locked.add(fieldId);
  updateLockUI();
}

function unlock(fieldId) {
  state.locked.delete(fieldId);
  // Si se desbloquea un campo de precio, limpiar highlight del input que fue despejado
  if (fieldId === 'forwardRate' || fieldId === 'forwardPoints') {
    clearSolvedHighlight('rateQuote');
    clearSolvedHighlight('f-rate-quote');
  }
  if (fieldId === 'notionalQuote') clearSolvedHighlight('notionalBase');
  if (fieldId === 'npv')           clearSolvedHighlight('spotMarket');
  updateLockUI();
  recalc();
}

function unlockAll() {
  state.locked.clear();
  ['rateQuote', 'notionalBase', 'spotMarket'].forEach(clearSolvedHighlight);
  updateLockUI();
}

function updateLockUI() {
  document.querySelectorAll('.lock-btn').forEach(btn => {
    const key = btn.dataset.lock;
    const isLocked = state.locked.has(key);
    btn.classList.toggle('hidden', !isLocked);
    if (fields[key]) {
      fields[key].classList.toggle('output-input--locked', isLocked);
    }
  });
  // forwardRate y forwardPoints comparten el mismo solve target
  if (state.locked.has('forwardRate') || state.locked.has('forwardPoints')) {
    showSolveHint('forward-rate',   state.locked.has('forwardRate')   ? 'fijado por ti' : '');
    showSolveHint('forward-points', state.locked.has('forwardPoints') ? 'fijado por ti' : '');
  } else {
    showSolveHint('forward-rate', '');
    showSolveHint('forward-points', '');
  }
}

function showSolveHint(fieldSuffix, msg) {
  const el = $('hint-' + fieldSuffix);
  if (el) el.textContent = msg;
}

// ── Highlight de inputs que fueron despejados ─────────────────────────────

function markSolvedInput(inputId, reason) {
  const el = fields[inputId] || $(inputId);
  if (!el) return;
  el.classList.add('input--solved');
  el.title = `Despejado porque "${reason}" está bloqueado`;
}

function clearSolvedHighlight(inputId) {
  const el = fields[inputId] || $(inputId);
  if (!el) return;
  el.classList.remove('input--solved');
  el.title = '';
}

// ── Escritura de valores en el DOM ────────────────────────────────────────

function setField(id, value) {
  const el = fields[id];
  if (!el) return;
  if (el.tagName === 'SELECT') {
    el.value = value;
  } else if (el.type === 'date') {
    el.value = value || '';
  } else {
    el.value = value != null ? value : '';
  }
}

function setOutputDisplay(id, formatted) {
  const el = fields[id];
  if (!el || state.locked.has(id)) return; // no sobreescribir si está bloqueado
  el.value = formatted;
}

// ── Cálculo central (recalc) ──────────────────────────────────────────────

function recalc() {
  const rb = state.rateBase  / 100;
  const rq = state.rateQuote / 100;
  const { spot, days, dayCount, notionalBase, spotMarket, direction } = state;

  // ── Paso 1: determinar Forward Rate ──────────────────────────────────────
  let F;

  if (state.locked.has('forwardRate')) {
    F = state.forwardRate;
    // Despejar rateQuote
    const rq_new = Engine.impliedRateQuote(F, spot, rb, days, dayCount);
    state.rateQuote = rq_new * 100;
    setField('rateQuote', fmt4(state.rateQuote));
    markSolvedInput('rateQuote', 'Forward Rate');
    // Actualizar forwardPoints (no está bloqueado en este caso)
    state.forwardPoints = Engine.forwardPoints(F, spot);
    setOutputDisplay('forwardPoints', fmt6(state.forwardPoints));
    showSolveHint('forward-rate', 'fijado · despeja Tasa ' + state.quoteCcy);

  } else if (state.locked.has('forwardPoints')) {
    F = spot + state.forwardPoints;
    state.forwardRate = F;
    // Despejar rateQuote
    const rq_new = Engine.impliedRateQuote(F, spot, rb, days, dayCount);
    state.rateQuote = rq_new * 100;
    setField('rateQuote', fmt4(state.rateQuote));
    markSolvedInput('rateQuote', 'Forward Points');
    setOutputDisplay('forwardRate', fmt6(state.forwardRate));
    showSolveHint('forward-points', 'fijado · despeja Tasa ' + state.quoteCcy);

  } else {
    // Flujo normal: calcular F desde los inputs
    F = Engine.forwardRate(spot, rb, rq, days, dayCount);
    state.forwardRate   = F;
    state.forwardPoints = Engine.forwardPoints(F, spot);
    setOutputDisplay('forwardRate',   fmt6(state.forwardRate));
    setOutputDisplay('forwardPoints', fmt6(state.forwardPoints));
    clearSolvedHighlight('rateQuote');
    showSolveHint('forward-rate', '');
    showSolveHint('forward-points', '');
  }

  // ── Paso 2: nocionales ───────────────────────────────────────────────────
  let N_base, N_quote;

  if (state.locked.has('notionalQuote')) {
    N_quote = state.notionalQuote;
    N_base  = Engine.notionalBase(N_quote, F);
    state.notionalBase = N_base;
    setField('notionalBase', fmt0(N_base));
    markSolvedInput('notionalBase', 'Nocional ' + state.quoteCcy);
    showSolveHint('notional-quote', 'fijado · despeja Nocional ' + state.baseCcy);
  } else {
    N_base  = notionalBase;
    N_quote = Engine.notionalQuote(N_base, F);
    state.notionalQuote = N_quote;
    setOutputDisplay('notionalQuote', fmt0(N_quote));
    clearSolvedHighlight('notionalBase');
    showSolveHint('notional-quote', '');
  }

  // ── Paso 3: NPV / MTM ────────────────────────────────────────────────────
  if (state.locked.has('npv')) {
    const S_mkt = Engine.impliedSpotMarket(
      state.npv, N_base, F, rb, rq, days, dayCount, direction
    );
    state.spotMarket = S_mkt;
    setOutputDisplay('spotMarket', fmt6(S_mkt));
    markSolvedInput('spotMarket', 'NPV');
    showSolveHint('npv', 'fijado · despeja Spot mercado');
  } else {
    const npv_val = Engine.npv(N_base, state.spotMarket, F, rb, rq, days, dayCount, direction);
    state.npv = npv_val;
    setOutputDisplay('npv', fmt2(npv_val));
    clearSolvedHighlight('spotMarket');
    showSolveHint('npv', '');
  }

  // ── Paso 4: actualizar UI derivada ───────────────────────────────────────
  updateCashflow(F, N_base, N_quote, direction);
  updateFormulaBox(spot, rb, rq, days, dayCount, F);
  updateNPVColor();
}

// ── Cashflow visual ───────────────────────────────────────────────────────

function updateCashflow(F, N_base, N_quote, direction) {
  // direction = 'buy' → compras base (recibes base, pagas quote)
  const isBuy = direction === 'buy';
  const payAmt  = isBuy ? fmt0(N_quote)  : fmt0(N_base);
  const payCcy  = isBuy ? state.quoteCcy : state.baseCcy;
  const recvAmt = isBuy ? fmt0(N_base)   : fmt0(N_quote);
  const recvCcy = isBuy ? state.baseCcy  : state.quoteCcy;

  $('cf-pay-amount').textContent  = payAmt;
  $('cf-pay-ccy').textContent     = payCcy;
  $('cf-recv-amount').textContent = recvAmt;
  $('cf-recv-ccy').textContent    = recvCcy;
}

// ── Fórmula CIP visual ───────────────────────────────────────────────────

function updateFormulaBox(S, rb, rq, d, dc, F) {
  const b = state.baseCcy, q = state.quoteCcy;
  $('formula-math').innerHTML =
    `F = S &times; (1 + r<sub>${q}</sub> &times; d/${dc}) / (1 + r<sub>${b}</sub> &times; d/${dc})`;

  const t = d / dc;
  $('formula-substituted').innerHTML =
    `${fmt4(F)} = ${fmt4(S)} &times; ` +
    `(1 + ${fmt4(rq)} &times; ${d}/${dc}) / ` +
    `(1 + ${fmt4(rb)} &times; ${d}/${dc})` +
    ` = ${fmt4(S)} &times; ${fmt6(1 + rq * t)} / ${fmt6(1 + rb * t)}`;
}

// ── NPV color (verde/rojo) ────────────────────────────────────────────────

function updateNPVColor() {
  const el = fields.npv;
  if (!el) return;
  el.classList.toggle('output-input--positive', state.npv > 0.005);
  el.classList.toggle('output-input--negative', state.npv < -0.005);
}

// ── Sincronizar días ↔ fechas ────────────────────────────────────────────

function syncDatesFromDays(newDays) {
  state.days = Math.round(newDays);
  state.valueDate = Engine.addDays(state.tradeDate, state.days);
  setField('valueDate', state.valueDate);
}

function syncDaysFromDates() {
  const d = Engine.daysBetween(state.tradeDate, state.valueDate);
  if (d > 0) {
    state.days = d;
    setField('days', state.days);
  }
}

// ── Cambio de par de divisas ─────────────────────────────────────────────

function applyPair(pairId) {
  const pair = Loader.getPair(pairId);
  state.baseCcy  = pair.base;
  state.quoteCcy = pair.quote;
  state.spot        = pair.spotDefault;
  state.spotMarket  = pair.spotDefault;
  state.rateBase    = pair.rateBaseDefault;
  state.rateQuote   = pair.rateQuoteDefault;

  setField('spot',      pair.spotDefault);
  setField('rateBase',  pair.rateBaseDefault);
  setField('rateQuote', pair.rateQuoteDefault);

  // Actualizar labels de monedas
  document.querySelectorAll('.dyn-label[id]').forEach(el => {
    if (el.id === 'lbl-base'      || el.id === 'lbl-rate-base') el.textContent = pair.base;
    if (el.id === 'lbl-quote'     || el.id === 'lbl-rate-quote') el.textContent = pair.quote;
    if (el.id === 'lbl-pair-spot') el.textContent = pairId;
    if (el.id === 'lbl-npv-ccy')  el.textContent = pair.quote;
  });
}

// ── Inicialización ────────────────────────────────────────────────────────

async function init() {
  const config = await Loader.load('forward-fx');
  await Dictionary.load();
  Dictionary.init();

  // Rellenar selector de pares
  config.currencyPairs.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.id} (${p.base}/${p.quote})`;
    fields.currencyPair.appendChild(opt);
  });

  // Valores iniciales en DOM
  setField('direction',    state.direction);
  setField('currencyPair', state.currencyPair);
  setField('notionalBase', fmt0(state.notionalBase));
  setField('tradeDate',    state.tradeDate);
  setField('valueDate',    state.valueDate);
  setField('days',         state.days);
  setField('dayCount',     state.dayCount);
  applyPair(state.currencyPair);

  // Primer cálculo
  recalc();

  // ── Event listeners ──────────────────────────────────────────────────────

  // Inputs normales
  fields.direction.addEventListener('change', e => {
    state.direction = e.target.value;
    recalc();
  });

  fields.currencyPair.addEventListener('change', e => {
    state.currencyPair = e.target.value;
    unlockAll();
    applyPair(state.currencyPair);
    recalc();
  });

  fields.notionalBase.addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null && v > 0) { state.notionalBase = v; recalc(); }
  });

  fields.tradeDate.addEventListener('change', e => {
    state.tradeDate = e.target.value;
    syncDaysFromDates();
    recalc();
  });

  fields.valueDate.addEventListener('change', e => {
    state.valueDate = e.target.value;
    syncDaysFromDates();
    recalc();
  });

  fields.days.addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null && v > 0) {
      syncDatesFromDays(v);
      recalc();
    }
  });

  fields.spot.addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null && v > 0) { state.spot = v; recalc(); }
  });

  fields.rateBase.addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null) { state.rateBase = v; recalc(); }
  });

  fields.rateQuote.addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null) { state.rateQuote = v; recalc(); }
  });

  fields.dayCount.addEventListener('change', e => {
    state.dayCount = parseInt(e.target.value, 10);
    recalc();
  });

  // Outputs: detectar edición manual → bloquear y recalcular
  function attachOutputListener(fieldId, parseAndStore) {
    fields[fieldId].addEventListener('focus', () => {
      fields[fieldId].select();
    });
    fields[fieldId].addEventListener('input', e => {
      const v = parseNum(e.target.value);
      if (v == null) return;
      parseAndStore(v);
      lock(fieldId);
      recalc();
    });
  }

  attachOutputListener('forwardRate', v => { state.forwardRate = v; });
  attachOutputListener('forwardPoints', v => { state.forwardPoints = v; });
  attachOutputListener('notionalQuote', v => { state.notionalQuote = v; });
  attachOutputListener('npv', v => { state.npv = v; });

  // spotMarket: editable libre (no bloquea, sólo recalcula NPV)
  fields.spotMarket.addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null && v > 0 && !state.locked.has('npv')) {
      state.spotMarket = v;
      recalc();
    }
  });
  fields.spotMarket.addEventListener('focus', () => fields.spotMarket.select());

  // Botones de desbloqueo
  document.querySelectorAll('.lock-btn').forEach(btn => {
    btn.addEventListener('click', () => unlock(btn.dataset.lock));
  });

  // Resetear todo
  $('btn-reset').addEventListener('click', () => {
    unlockAll();
    applyPair(state.currencyPair);
    state.direction   = config.defaults.direction;
    state.notionalBase = config.defaults.notionalBase;
    state.days        = config.defaults.days;
    state.dayCount    = config.defaults.dayCount;
    state.tradeDate   = Engine.todayStr();
    state.valueDate   = Engine.addDays(state.tradeDate, state.days);
    state.spotMarket  = state.spot;

    setField('direction',    state.direction);
    setField('notionalBase', fmt0(state.notionalBase));
    setField('days',         state.days);
    setField('dayCount',     state.dayCount);
    setField('tradeDate',    state.tradeDate);
    setField('valueDate',    state.valueDate);
    setField('spotMarket',   fmt6(state.spotMarket));

    recalc();
  });
}

// Arrancar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);
