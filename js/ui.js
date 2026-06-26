/**
 * Controlador UI — Forward FX Simulator.
 *
 * ESTADO: `state` es la fuente única de verdad.
 * LOCKS:  Cualquier output puede bloquearse; al hacerlo se despeja el input correspondiente.
 *
 *   fwdRate      bloqueado → despeja rateQuote
 *   fwdPoints    bloqueado → convierte a fwdRate → despeja rateQuote
 *   notionalQuote bloqueado → despeja notionalBase
 *   npv          bloqueado → despeja spotMarket
 *
 * GUARDS: Todas las llamadas al Engine verifican null antes de actualizar el DOM.
 */

// ── Formato numérico ───────────────────────────────────────────────────────
// Usamos toFixed para campos input[type=number] (no aceptan comas).
// Usamos toLocaleString solo para spans de display.

function d(n, decimals) {
  if (n == null || isNaN(n)) return '';
  return parseFloat(n.toFixed(decimals)).toString();
}
const d4  = n => d(n, 4);
const d6  = n => d(n, 6);
const d2  = n => d(n, 2);
const d0  = n => n == null || isNaN(n) ? '' : String(Math.round(n));
const loc = n => n == null || isNaN(n) ? '—' :
  Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function parseNum(v) {
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

// ── Estado central ─────────────────────────────────────────────────────────
const state = {
  direction:     'buy',
  currencyPair:  'USDMXN',
  baseCcy:       'USD',
  quoteCcy:      'MXN',
  notionalBase:  1_000_000,
  tradeDate:     Engine.todayStr(),
  valueDate:     null,     // se calcula en init
  days:          90,
  spot:          17.00,
  rateBase:      5.00,     // porcentaje (5.00 = 5%)
  rateQuote:     11.00,
  dayCount:      360,

  // Outputs calculados
  fwdRate:       null,
  fwdPoints:     null,
  notionalQuote: null,
  spotMarket:    17.00,    // spot para MTM, inicialmente = spot del contrato
  npv:           null,

  // Locks activos
  locked: new Set(),
};

// ── Referencias DOM ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Warning / error banner ─────────────────────────────────────────────────
function warn(msg) {
  $('warn-msg').textContent = msg;
  $('warn-banner').classList.remove('hidden');
}
function clearWarn() {
  $('warn-banner').classList.add('hidden');
}

// ── DOM: escribir valor en un campo ────────────────────────────────────────

// Escribe en campos de input normales (siempre)
function setVal(id, v) {
  const el = $(id);
  if (el) el.value = v ?? '';
}

// Escribe en campos output solo si NO están bloqueados
function setOut(id, lockKey, formattedValue) {
  if (state.locked.has(lockKey)) return;
  setVal(id, formattedValue);
}

// ── Solved highlight en inputs que fueron despejados ──────────────────────
function markSolved(id) {
  const el = $(id);
  if (el) el.classList.add('input--solved');
}
function clearSolved(id) {
  const el = $(id);
  if (el) el.classList.remove('input--solved');
}

// Texto de ayuda bajo los outputs
function hint(id, text) {
  const el = $(id);
  if (el) el.textContent = text || '';
}

// ── Locks ──────────────────────────────────────────────────────────────────
// fwdRate y fwdPoints son mutuamente excluyentes (misma ecuación)
const MUTUAL_EXCL = { fwdRate: 'fwdPoints', fwdPoints: 'fwdRate' };

function lock(key) {
  if (MUTUAL_EXCL[key]) state.locked.delete(MUTUAL_EXCL[key]);
  state.locked.add(key);
  updateLockUI();
}

function unlock(key) {
  state.locked.delete(key);
  // Limpiar highlight del campo despejado
  if (key === 'fwdRate' || key === 'fwdPoints') clearSolved('f-rate-quote');
  if (key === 'notionalQuote') clearSolved('f-notional-base');
  if (key === 'npv') clearSolved('f-spot-market');
  updateLockUI();
  recalc();
}

function unlockAll() {
  state.locked.clear();
  ['f-rate-quote', 'f-notional-base', 'f-spot-market'].forEach(clearSolved);
  updateLockUI();
}

function updateLockUI() {
  // Lock buttons: mostrar solo si el campo está bloqueado
  document.querySelectorAll('.lock-btn').forEach(btn => {
    const key = btn.dataset.lock;
    const locked = state.locked.has(key);
    btn.classList.toggle('hidden', !locked);

    // Estilo del output field correspondiente
    const inputId = {
      fwdRate:       'f-fwd-rate',
      fwdPoints:     'f-fwd-points',
      notionalQuote: 'f-notional-quote',
      npv:           'f-npv',
    }[key];
    if (inputId) $(inputId)?.classList.toggle('price-val--locked', locked);
  });

  // spotMarket: readonly si npv está bloqueado
  const smEl = $('f-spot-market');
  if (smEl) smEl.readOnly = state.locked.has('npv');
}

// ── Cálculo central ────────────────────────────────────────────────────────
function recalc() {
  clearWarn();

  const rb = state.rateBase  / 100;
  const rq = state.rateQuote / 100;
  const { spot, days, dayCount, notionalBase, spotMarket, direction } = state;

  // Validaciones básicas
  if (!spot || spot <= 0)           { warn('El Spot Rate debe ser mayor que cero.'); return; }
  if (!days || days <= 0)           { warn('Los días al vencimiento deben ser > 0.'); return; }
  if (!notionalBase || notionalBase <= 0) { warn('El Nocional debe ser mayor que cero.'); return; }

  // ── Paso 1: Forward Rate ─────────────────────────────────────────────────
  let F = null;

  if (state.locked.has('fwdRate')) {
    F = state.fwdRate;
    if (!F || F <= 0) { warn('Forward Rate bloqueado tiene valor inválido.'); return; }

    const rq_new = Engine.impliedRateQuote(F, spot, rb, days, dayCount);
    if (rq_new === null) {
      warn('No se puede despejar la Tasa cotizada con esos valores. Verifica el Forward Rate.');
    } else {
      if (rq_new < -0.5 || rq_new > 5) {
        warn(`Tasa ${state.quoteCcy} implícita (${d2(rq_new * 100)}%) está fuera de rango razonable.`);
      }
      state.rateQuote = rq_new * 100;
      setVal('f-rate-quote', d4(state.rateQuote));
      markSolved('f-rate-quote');
    }
    // Actualizar forward points (no está bloqueado en este caso)
    state.fwdPoints = Engine.forwardPoints(F, spot);
    setOut('f-fwd-points', 'fwdPoints', d4(state.fwdPoints));
    hint('hint-fwd-rate',   `Fijado → despeja Tasa ${state.quoteCcy}`);
    hint('hint-fwd-points', '');

  } else if (state.locked.has('fwdPoints')) {
    if (state.fwdPoints == null) { warn('Forward Points no tiene valor válido.'); return; }
    F = spot + state.fwdPoints;
    state.fwdRate = F;
    if (F <= 0) { warn('Forward Points implica un Forward Rate negativo. Inválido.'); return; }

    const rq_new = Engine.impliedRateQuote(F, spot, rb, days, dayCount);
    if (rq_new === null) {
      warn('No se puede despejar la Tasa cotizada con esos valores.');
    } else {
      if (rq_new < -0.5 || rq_new > 5) {
        warn(`Tasa ${state.quoteCcy} implícita (${d2(rq_new * 100)}%) está fuera de rango razonable.`);
      }
      state.rateQuote = rq_new * 100;
      setVal('f-rate-quote', d4(state.rateQuote));
      markSolved('f-rate-quote');
    }
    setOut('f-fwd-rate', 'fwdRate', d4(state.fwdRate));
    hint('hint-fwd-points', `Fijado → despeja Tasa ${state.quoteCcy}`);
    hint('hint-fwd-rate',   '');

  } else {
    // Flujo normal
    F = Engine.forwardRate(spot, rb, rq, days, dayCount);
    if (F === null) { warn('Error en el cálculo del Forward Rate. Revisa los datos de entrada.'); return; }

    state.fwdRate   = F;
    state.fwdPoints = Engine.forwardPoints(F, spot);
    setVal('f-fwd-rate',   d4(state.fwdRate));
    setVal('f-fwd-points', d4(state.fwdPoints));
    clearSolved('f-rate-quote');
    hint('hint-fwd-rate',   '');
    hint('hint-fwd-points', '');
  }

  // ── Paso 2: Nocionales ───────────────────────────────────────────────────
  let Nb, Nq;

  if (state.locked.has('notionalQuote')) {
    Nq = state.notionalQuote;
    if (!Nq || Nq <= 0) { warn('Nocional cotizado bloqueado tiene valor inválido.'); return; }

    Nb = Engine.notionalBase(Nq, F);
    if (Nb === null) {
      warn('No se puede calcular el Nocional base. Verifica el Forward Rate.');
    } else {
      state.notionalBase = Nb;
      setVal('f-notional-base', d0(Nb));
      markSolved('f-notional-base');
      hint('hint-notional-quote', `Fijado → despeja Nocional ${state.baseCcy}`);
    }
  } else {
    Nb = notionalBase;
    Nq = Engine.notionalQuote(Nb, F);
    state.notionalQuote = Nq;
    setVal('f-notional-quote', d0(Nq));
    clearSolved('f-notional-base');
    hint('hint-notional-quote', '');
  }

  // ── Paso 3: NPV / MTM ────────────────────────────────────────────────────
  if (state.locked.has('npv')) {
    const Smkt = Engine.impliedSpotMarket(
      state.npv, Nb, F, rb, rq, days, dayCount, direction
    );
    if (Smkt === null) {
      warn('El NPV ingresado implica un Spot de mercado imposible (negativo o incalculable).');
    } else {
      state.spotMarket = Smkt;
      setVal('f-spot-market', d4(Smkt));
      markSolved('f-spot-market');
      hint('hint-npv', 'Fijado → despeja Spot mercado');
    }
  } else {
    const SM = state.spotMarket && state.spotMarket > 0 ? state.spotMarket : spot;
    const npv_val = Engine.npv(Nb, SM, F, rb, rq, days, dayCount, direction);
    state.npv = npv_val;
    setVal('f-npv', d2(npv_val));
    clearSolved('f-spot-market');
    hint('hint-npv', '');
  }

  // ── Paso 4: UI derivada ──────────────────────────────────────────────────
  const N_display_base  = Nb  ?? notionalBase;
  const N_display_quote = Nq  ?? Engine.notionalQuote(N_display_base, F) ?? 0;

  updateCashflow(N_display_base, N_display_quote, direction);
  updateFormula(spot, rb, rq, days, dayCount, F);
  updateNPVColor();
}

// ── Cashflow visual ────────────────────────────────────────────────────────
function updateCashflow(Nb, Nq, dir) {
  const isBuy = dir === 'buy';
  const payAmt  = loc(isBuy ? Nq : Nb);
  const payCcy  = isBuy ? state.quoteCcy : state.baseCcy;
  const recvAmt = loc(isBuy ? Nb : Nq);
  const recvCcy = isBuy ? state.baseCcy  : state.quoteCcy;

  $('cf-pay-amount').textContent  = payAmt;
  $('cf-pay-ccy').textContent     = payCcy;
  $('cf-recv-amount').textContent = recvAmt;
  $('cf-recv-ccy').textContent    = recvCcy;
}

// ── Fórmula ────────────────────────────────────────────────────────────────
function updateFormula(S, rb, rq, d, dc, F) {
  const b = state.baseCcy, q = state.quoteCcy;
  $('formula-symbolic').innerHTML =
    `F = S &times; (1 + r<sub>${q}</sub> &times; d/${dc}) / (1 + r<sub>${b}</sub> &times; d/${dc})`;

  const t = d / dc;
  $('formula-numeric').innerHTML =
    `${d4(F)} = ${d4(S)} &times; ` +
    `(1 + ${d4(rq)} &times; ${d}/${dc}) / (1 + ${d4(rb)} &times; ${d}/${dc})` +
    `&nbsp;&nbsp;=&nbsp;&nbsp;` +
    `${d4(S)} &times; ${d6(1 + rq * t)} / ${d6(1 + rb * t)}`;
}

// ── Color NPV ──────────────────────────────────────────────────────────────
function updateNPVColor() {
  const el = $('f-npv');
  if (!el) return;
  el.classList.toggle('price-val--positive', (state.npv ?? 0) > 0.5);
  el.classList.toggle('price-val--negative', (state.npv ?? 0) < -0.5);
}

// ── Sincronización días ↔ fechas ───────────────────────────────────────────
function applyDays(n) {
  state.days = Math.round(n);
  state.valueDate = Engine.addDays(state.tradeDate, state.days);
  setVal('f-value-date', state.valueDate);
}

function applyDatesCalc() {
  const d = Engine.daysBetween(state.tradeDate, state.valueDate);
  if (d !== null && d > 0) {
    state.days = d;
    setVal('f-days', d0(d));
  } else {
    warn('La fecha valor debe ser posterior a la fecha trade.');
  }
}

// ── Aplicar par de divisas ─────────────────────────────────────────────────
function applyPair(pairId) {
  const pair = Loader.getPair(pairId);
  state.baseCcy  = pair.base;
  state.quoteCcy = pair.quote;
  state.spot         = pair.spotDefault;
  state.spotMarket   = pair.spotDefault;
  state.rateBase     = pair.rateBaseDefault;
  state.rateQuote    = pair.rateQuoteDefault;

  setVal('f-spot',        d4(pair.spotDefault));
  setVal('f-spot-market', d4(pair.spotDefault));
  setVal('f-rate-base',   d4(pair.rateBaseDefault));
  setVal('f-rate-quote',  d4(pair.rateQuoteDefault));

  // Actualizar labels de monedas
  document.querySelectorAll('#lbl-base').forEach(el => el.textContent = pair.base);
  document.querySelectorAll('#lbl-quote').forEach(el => el.textContent = pair.quote);
  $('lbl-rate-base').textContent  = pair.base;
  $('lbl-rate-quote').textContent = pair.quote;
  $('lbl-npv-ccy').textContent    = pair.quote;
  $('lbl-pair-inline').textContent = `(${pairId.slice(0,3)}/${pairId.slice(3)})`;
}

// ── Dirección del ticket ───────────────────────────────────────────────────
function applyDirection(dir) {
  state.direction = dir;
  const ticket = $('ticket');
  ticket.classList.toggle('ticket--buy',  dir === 'buy');
  ticket.classList.toggle('ticket--sell', dir === 'sell');
  document.querySelectorAll('.dir-btn').forEach(btn => {
    btn.classList.toggle('dir-btn--active', btn.dataset.dir === dir);
  });
}

// ── Inicialización ─────────────────────────────────────────────────────────
async function init() {
  const config = await Loader.load('forward-fx');
  await Dictionary.load();
  Dictionary.init();

  // Rellenar select de pares
  config.currencyPairs.forEach(p => {
    const opt = document.createElement('option');
    opt.value       = p.id;
    opt.textContent = `${p.id.slice(0,3)}/${p.id.slice(3)}`;
    $('f-pair').appendChild(opt);
  });
  $('f-pair').value = state.currencyPair;

  // Calcular valueDate inicial
  state.valueDate = Engine.addDays(state.tradeDate, state.days);

  // Valores iniciales en DOM
  applyDirection(state.direction);
  applyPair(state.currencyPair);
  setVal('f-notional-base', d0(state.notionalBase));
  setVal('f-trade-date',    state.tradeDate);
  setVal('f-value-date',    state.valueDate);
  setVal('f-days',          d0(state.days));
  setVal('f-daycount',      String(state.dayCount));

  // ⚠️ IMPORTANTE: inicializar spotMarket en DOM explícitamente
  setVal('f-spot-market', d4(state.spotMarket));

  // Primer cálculo
  recalc();

  // ── Event listeners ────────────────────────────────────────────────────

  // Dirección (toggle buttons)
  $('dir-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.dir-btn');
    if (!btn) return;
    applyDirection(btn.dataset.dir);
    recalc();
  });

  // Par de divisas
  $('f-pair').addEventListener('change', e => {
    state.currencyPair = e.target.value;
    unlockAll();
    applyPair(state.currencyPair);
    recalc();
  });

  // Nocional base (INPUT normal)
  $('f-notional-base').addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null && v > 0) { state.notionalBase = v; recalc(); }
  });

  // Fecha trade
  $('f-trade-date').addEventListener('change', e => {
    state.tradeDate = e.target.value;
    applyDatesCalc();
    recalc();
  });

  // Fecha valor
  $('f-value-date').addEventListener('change', e => {
    state.valueDate = e.target.value;
    applyDatesCalc();
    recalc();
  });

  // Días (bidireccional con fecha valor)
  $('f-days').addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null && v > 0) { applyDays(v); recalc(); }
  });

  // Spot
  $('f-spot').addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null && v > 0) { state.spot = v; recalc(); }
  });

  // Tasa base
  $('f-rate-base').addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null) { state.rateBase = v; recalc(); }
  });

  // Tasa cotizada
  $('f-rate-quote').addEventListener('input', e => {
    const v = parseNum(e.target.value);
    if (v != null) { state.rateQuote = v; recalc(); }
  });

  // Convención días
  $('f-daycount').addEventListener('change', e => {
    state.dayCount = parseInt(e.target.value, 10);
    recalc();
  });

  // ── Outputs bloqueables ──────────────────────────────────────────────────
  // Al editar un output → se bloquea y se recalcula

  function bindOutput(id, lockKey, parseAndStore) {
    const el = $(id);
    if (!el) return;
    el.addEventListener('focus', () => el.select?.());
    el.addEventListener('input', e => {
      const v = parseNum(e.target.value);
      if (v == null) return;
      parseAndStore(v);
      lock(lockKey);
      recalc();
    });
  }

  bindOutput('f-fwd-rate',       'fwdRate',       v => { state.fwdRate   = v; });
  bindOutput('f-fwd-points',     'fwdPoints',     v => { state.fwdPoints = v; });
  bindOutput('f-notional-quote', 'notionalQuote', v => { state.notionalQuote = v; });
  bindOutput('f-npv',            'npv',           v => { state.npv = v; });

  // Spot mercado: libre (no bloquea, solo recalcula NPV)
  $('f-spot-market').addEventListener('focus', () => $('f-spot-market').select?.());
  $('f-spot-market').addEventListener('input', e => {
    if (state.locked.has('npv')) return;  // si NPV está bloqueado, ignorar
    const v = parseNum(e.target.value);
    if (v != null && v > 0) { state.spotMarket = v; recalc(); }
  });

  // ── Botones de desbloqueo ────────────────────────────────────────────────
  document.querySelectorAll('.lock-btn').forEach(btn => {
    btn.addEventListener('click', () => unlock(btn.dataset.lock));
  });

  // ── Resetear ─────────────────────────────────────────────────────────────
  $('btn-reset').addEventListener('click', () => {
    unlockAll();
    clearWarn();

    const pair = Loader.getPair(state.currencyPair);
    state.direction    = config.defaults.direction;
    state.notionalBase = config.defaults.notionalBase;
    state.days         = config.defaults.days;
    state.dayCount     = config.defaults.dayCount;
    state.tradeDate    = Engine.todayStr();
    state.valueDate    = Engine.addDays(state.tradeDate, state.days);
    state.spotMarket   = pair.spotDefault;

    applyDirection(state.direction);
    setVal('f-notional-base', d0(state.notionalBase));
    setVal('f-days',          d0(state.days));
    setVal('f-daycount',      String(state.dayCount));
    setVal('f-trade-date',    state.tradeDate);
    setVal('f-value-date',    state.valueDate);
    setVal('f-spot-market',   d4(state.spotMarket));
    applyPair(state.currencyPair);

    recalc();
  });
}

document.addEventListener('DOMContentLoaded', init);
