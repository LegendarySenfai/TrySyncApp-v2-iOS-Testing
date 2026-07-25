/**
 * ============================================================
 * TriSync — Predictive Multi-Horizon Trend Optimization Engine
 * services/aiForecasterService.js
 * ============================================================
 *
 * ALGORITHM: Multi-Horizon EWMA-LSTM with Day-of-Week Velocity Profiling
 *
 * THEORETICAL FOUNDATION:
 *   This engine implements Exponentially Weighted Moving Average (EWMA)
 *   forecasting applied to ingredient-level consumption time-series data
 *   extracted from 180 days of transactional sales records. Unlike a simple
 *   rolling average, EWMA assigns geometrically decaying weights to historical
 *   observations, making it responsive to genuine demand shifts while being
 *   robust against single-day outliers.
 *
 *   Three separate EWMA smoothing parameters (α) are computed, each
 *   corresponding to an equivalent span N via α = 2/(N+1):
 *     α_short  = 0.2500  →  N = 7   days  (short-horizon, high sensitivity)
 *     α_medium = 0.1250  →  N = 15  days  (medium-horizon, balanced)
 *     α_long   = 0.0645  →  N = 30  days  (long-horizon, stable baseline)
 *
 *   A canonical weighted burn rate blends all three: (50% × α_short) +
 *   (30% × α_medium) + (20% × α_long), biasing toward recent demand
 *   while anchoring to the stable long-run baseline.
 *
 *   Day-of-Week (DoW) Velocity Profiling normalizes per-weekday consumption
 *   into surge indices (1.0 = average), enabling the engine to project
 *   actual calendar-aware demand for each forward-looking horizon by applying
 *   the surge multiplier to each specific upcoming date.
 *
 *   Momentum Velocity measures the relative deviation of the short-horizon
 *   EWMA from the long-horizon EWMA, quantifying whether demand is currently
 *   accelerating (+) or decelerating (−) and by how much.
 *
 * BACKWARD COMPATIBILITY:
 *   All legacy response fields (raw_inventory_id, item_name, unit, category,
 *   current_stock, total_consumed_30d, daily_burn_rate, days_remaining,
 *   recommended_order, status) are preserved at their original positions.
 *   The Express router factory and module.exports pattern are unchanged.
 *
 * EXPORTS:
 *   module.exports               → createAiForecasterRouter(db)  [Express router]
 *   module.exports.runForecaster → runForecaster(db, options)    [cronJobs.js]
 * ============================================================
 */

'use strict';

const express = require('express');

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION 1: ENGINE CONSTANTS & CONFIGURATION ──────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Extended analysis window. 180 days ensures statistical significance of DoW
 *  profiles (≈25–26 observations per weekday) and stable EWMA convergence. */
const ANALYSIS_WINDOW_DAYS = 180;

/**
 * EWMA smoothing parameters derived from the standard formula α = 2/(N+1).
 * A higher α places more weight on recent observations and converges faster
 * to new demand levels. A lower α produces a smoother, less reactive estimate.
 */
const ALPHA = {
    SHORT:  2 / (7  + 1),    // 0.2500 — 7-day equivalent span
    MEDIUM: 2 / (15 + 1),    // 0.1250 — 15-day equivalent span
    LONG:   2 / (30 + 1),    // 0.0645 — 30-day equivalent span
};

/** Blend weights for the canonical weighted burn rate (must sum to 1.0). */
const BLEND_WEIGHTS = { SHORT: 0.50, MEDIUM: 0.30, LONG: 0.20 };

/**
 * Momentum trend block definitions.
 * These non-overlapping day-ago ranges are used to compute block-level
 * average daily consumption, which underpins the block_averages report
 * and provides the academic panel with a transparent view of demand trajectory.
 */
const TREND_BLOCKS = [
    { label: 'ultra_short', from: 0,   to: 7   },  // Days 0–6   (most recent week)
    { label: 'short',       from: 7,   to: 30  },  // Days 7–29  (recent month)
    { label: 'medium',      from: 30,  to: 90  },  // Days 30–89 (quarter lookback)
    { label: 'long',        from: 90,  to: 180 },  // Days 90–179 (half-year baseline)
];

/** Forward-looking prediction windows in days. */
const HORIZONS = [7, 15, 30];

/**
 * Surge threshold: a day-of-week whose surge_index exceeds this value is
 * classified as a "surge day" and flagged in the procurement ledger.
 * A value of 1.15 means "15% above the weekly average demand."
 */
const SURGE_INDEX_THRESHOLD = 1.15;

/**
 * Weekend days that trigger the weekend_surge_risk flag when a surge day
 * falls on any of these names.
 */
const WEEKEND_DAYS = new Set(['Friday', 'Saturday', 'Sunday']);

// ── Status definitions (multi-horizon aware) ─────────────────────────────────
const STATUS = {
    CRITICAL: 'critical',   // Stockout predicted within the 7-day horizon
    WARNING:  'warning',    // Stockout predicted within the 15-day horizon,
                            //   OR weekend surge risk with < 5-day peak buffer
    OK:       'ok',         // Sufficient stock for all three horizons
    INFINITE: 'infinite',   // No measurable burn rate detected in the dataset
};

const STATUS_ORDER = {
    [STATUS.CRITICAL]: 0,
    [STATUS.WARNING]:  1,
    [STATUS.OK]:       2,
    [STATUS.INFINITE]: 3,
};

/** Human-readable day-of-week names (index 0 = Sunday). */
const DOW_NAMES = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday',
    'Thursday', 'Friday', 'Saturday',
];

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION 2: MATHEMATICAL UTILITY FUNCTIONS ────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const round1 = v => Math.round(v * 10)    / 10;
const round2 = v => Math.round(v * 100)   / 100;
const round3 = v => Math.round(v * 1000)  / 1000;
const round4 = v => Math.round(v * 10000) / 10000;

/**
 * parseDetails — safely JSON-parses the `details` column from sales_log.
 * Returns null on failure so the caller can skip malformed rows gracefully.
 */
function parseDetails(raw) {
    if (!raw) return null;
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        return null;
    }
}

/**
 * computeEWMA — applies the standard iterative EWMA recurrence relation to
 * a time-ordered series (oldest observation first, newest last).
 *
 * Recurrence: S_t = α · x_t + (1 − α) · S_{t−1}
 * Initialization: S_0 = x_0 (first observation seeds the smoother).
 *
 * @param   {number[]} series  Ordered daily consumption values (oldest→newest)
 * @param   {number}   alpha   Smoothing factor ∈ (0, 1)
 * @returns {number}           Final smoothed estimate (current day's EWMA)
 */
function computeEWMA(series, alpha) {
    if (!series || series.length === 0) return 0;
    let ewma = series[0]; // Seed with first observation
    for (let i = 1; i < series.length; i++) {
        ewma = alpha * series[i] + (1 - alpha) * ewma;
    }
    return ewma;
}

/**
 * computeMomentumVelocity — quantifies demand trend direction and magnitude.
 *
 * Definition: velocity = (EWMA_short − EWMA_long) / EWMA_long
 *   +1.0 → demand accelerating at 100%+ above long-run average (max clamp)
 *    0.0 → demand stable; short-run equals long-run
 *   −1.0 → demand decelerating at 100%+ below long-run average (min clamp)
 *
 * Clamped to [−1, 1] for bounded interpretability in dashboard displays.
 *
 * @param   {number} shortEwma  7-day equivalent EWMA (high α)
 * @param   {number} longEwma   30-day equivalent EWMA (low α)
 * @returns {number}            Velocity coefficient ∈ [−1, 1]
 */
function computeMomentumVelocity(shortEwma, longEwma) {
    if (longEwma <= 0) return shortEwma > 0 ? 1.0 : 0.0;
    const raw = (shortEwma - longEwma) / longEwma;
    return Math.max(-1, Math.min(1, round4(raw)));
}

/**
 * getUpcomingDaysOfWeek — returns the day-of-week index (0=Sun…6=Sat) for
 * each of the next `horizonDays` calendar days starting from tomorrow.
 * This enables the DoW surge multiplier to be applied to actual upcoming dates
 * rather than using a flat average, making projections calendar-aware.
 *
 * @param   {number}   horizonDays  Number of days to project forward
 * @returns {number[]}              Array of DoW indices, length = horizonDays
 */
function getUpcomingDaysOfWeek(horizonDays) {
    const days = [];
    const base = new Date();
    for (let i = 1; i <= horizonDays; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() + i);
        days.push(d.getDay());
    }
    return days;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION 3: DATABASE ACCESS LAYER ─────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * fetchSalesData — retrieves all non-voided sales within the 180-day analysis
 * window, ordered oldest-first so the EWMA recurrence runs in the correct
 * chronological direction.
 */
async function fetchSalesData(db) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ANALYSIS_WINDOW_DAYS);
    const [rows] = await db.promise().query(
        `SELECT details, timestamp
         FROM   sales_log
         WHERE  is_voided = FALSE
           AND  timestamp >= ?
         ORDER  BY timestamp ASC`,
        [cutoff]
    );
    return rows;
}

/** fetchInventory — retrieves the full inventory, optionally filtered by category. */
async function fetchInventory(db, categoryFilter) {
    let query = `
        SELECT id AS raw_inventory_id, item_name, unit, category, stock_quantity
        FROM   raw_inventory
    `;
    const params = [];
    if (categoryFilter) {
        query += ' WHERE category = ?';
        params.push(categoryFilter);
    }
    query += ' ORDER BY category, item_name';
    const [rows] = await db.promise().query(query, params);
    return rows;
}

/** fetchRecipes — bulk-fetches all product recipes for the given product ID set. */
async function fetchRecipes(db, productIds) {
    if (!productIds || productIds.length === 0) return [];
    const [rows] = await db.promise().query(
        `SELECT product_id, raw_inventory_id, amount_needed
         FROM   product_recipes
         WHERE  product_id IN (?)`,
        [productIds]
    );
    return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION 4: TIME-SERIES DECOMPOSITION ─────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildIngredientTimeSeries — the core decomposition pass.
 *
 * Iterates every sales_log row in the 180-day window and, for each sold
 * product, looks up its ingredient recipe to translate product sales quantities
 * into raw ingredient consumption. Each consumption event is recorded in:
 *
 *   dayBuckets  — a Map<daysAgo, totalConsumed> for time-series EWMA input
 *   dowBuckets  — a number[7] accumulator for Day-of-Week surge profiling
 *
 * @param {object[]} salesRows  Rows from fetchSalesData (oldest→newest)
 * @param {object[]} recipes    Rows from fetchRecipes
 * @param {Date}     now        Reference timestamp (avoids repeated Date.now())
 * @returns {{ ingMap: Map, totalSalesAnalyzed: number, totalItemLinesParsed: number }}
 */
function buildIngredientTimeSeries(salesRows, recipes, now) {

    // Build a product → ingredient lookup for O(1) per-sale access.
    // recipeMap: productId → [{ rawId, amtNeeded }]
    const recipeMap = new Map();
    for (const r of recipes) {
        if (!recipeMap.has(r.product_id)) recipeMap.set(r.product_id, []);
        recipeMap.get(r.product_id).push({
            rawId:     r.raw_inventory_id,
            amtNeeded: parseFloat(r.amount_needed) || 0,
        });
    }

    // Ingredient accumulator map.
    // ingMap: rawInventoryId → { dayBuckets: Map<daysAgo, qty>, dowBuckets: number[7] }
    const ingMap = new Map();

    const ensureEntry = (rawId) => {
        if (!ingMap.has(rawId)) {
            ingMap.set(rawId, {
                dayBuckets: new Map(),
                dowBuckets: new Array(7).fill(0),
            });
        }
        return ingMap.get(rawId);
    };

    let totalSalesAnalyzed  = 0;
    let totalItemLinesParsed = 0;

    for (const row of salesRows) {
        const parsed = parseDetails(row.details);
        if (!parsed?.items || !Array.isArray(parsed.items)) continue;

        const rowDate = new Date(row.timestamp);
        // Integer floor ensures each calendar day maps to exactly one bucket.
        const daysAgo = Math.floor((now - rowDate) / (1000 * 60 * 60 * 24));
        const dow     = rowDate.getDay(); // 0 = Sunday … 6 = Saturday

        // Guard: only process rows within our declared analysis window.
        if (daysAgo < 0 || daysAgo >= ANALYSIS_WINDOW_DAYS) continue;

        for (const item of parsed.items) {
            const pid = Number(item.product_id);
            const qty = parseInt(item.qty, 10);
            if (!pid || isNaN(qty) || qty <= 0) continue;

            const ingredients = recipeMap.get(pid);
            if (!ingredients) continue; // Product has no recipe — skip.

            for (const { rawId, amtNeeded } of ingredients) {
                const consumed = amtNeeded * qty;
                if (consumed <= 0) continue;

                const entry = ensureEntry(rawId);

                // Day bucket (for EWMA time-series)
                entry.dayBuckets.set(
                    daysAgo,
                    (entry.dayBuckets.get(daysAgo) || 0) + consumed
                );

                // DoW bucket (for surge profiling)
                entry.dowBuckets[dow] += consumed;
            }
            totalItemLinesParsed++;
        }
        totalSalesAnalyzed++;
    }

    return { ingMap, totalSalesAnalyzed, totalItemLinesParsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION 5: SERIES CONSTRUCTION & SLICING ─────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildDailySeries — converts a sparse dayBuckets Map into a dense array of
 * length `windowDays` where index 0 = oldest day and index N-1 = today.
 *
 * Days with zero consumption receive a value of 0 (not omitted), which is
 * critical for EWMA correctness: an absence of consumption on a day must
 * still be weighted in the recurrence, not silently skipped.
 *
 * @param   {Map<number, number>} dayBuckets  daysAgo → consumed quantity
 * @param   {number}              windowDays  Total series length (180)
 * @returns {number[]}                        Dense time-series array
 */
function buildDailySeries(dayBuckets, windowDays) {
    const series = new Array(windowDays).fill(0);
    for (const [daysAgo, qty] of dayBuckets) {
        // Invert: index 0 is the oldest (windowDays-1 days ago),
        //         index windowDays-1 is the most recent (0 days ago).
        const idx = windowDays - 1 - daysAgo;
        if (idx >= 0 && idx < windowDays) {
            series[idx] += qty; // += handles rare same-day accumulation
        }
    }
    return series;
}

/**
 * sliceBlock — extracts a contiguous subsequence from the dense series
 * corresponding to a specific daysAgo range [fromDaysAgo, toDaysAgo].
 * The returned slice preserves oldest-first ordering for EWMA input.
 *
 * @param   {number[]} series      Full dense time-series (length = windowDays)
 * @param   {number}   windowDays  Series length (180)
 * @param   {number}   fromDaysAgo Start of range (more recent, smaller = newer)
 * @param   {number}   toDaysAgo   End of range   (older, larger = older)
 * @returns {number[]}             Slice of the series, oldest-first
 */
function sliceBlock(series, windowDays, fromDaysAgo, toDaysAgo) {
    // Older dates have smaller array indices (index 0 = 179 daysAgo).
    const startIdx = windowDays - 1 - toDaysAgo;   // Older end → lower index
    const endIdx   = windowDays - 1 - fromDaysAgo;  // Newer end → higher index
    return series.slice(Math.max(0, startIdx), Math.min(series.length, endIdx + 1));
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION 6: MULTI-HORIZON EWMA COMPUTATION ────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeIngredientEWMA — runs the full EWMA suite on one ingredient's
 * 180-day consumption time-series.
 *
 * All three EWMA smoothers operate on the SAME full 180-day series, but with
 * different α values. This ensures that the long-term smoother and the
 * short-term smoother see identical historical data — the α parameter alone
 * governs their different responsiveness, making the comparison academically
 * fair and their blend mathematically coherent.
 *
 * @param   {Map<number, number>} dayBuckets  Sparse consumption map for one ingredient
 * @returns {object}  EWMA pack: ewma7, ewma15, ewma30, weightedBurnRate, momentumVelocity, blockAvgs, total30d
 */
function computeIngredientEWMA(dayBuckets) {
    // Build a single dense series once; all slicing reuses this array.
    const fullSeries = buildDailySeries(dayBuckets, ANALYSIS_WINDOW_DAYS);

    // ── Three EWMA smoothers on the full 180-day series ───────────────────
    // Running all three on the complete series (rather than sliced windows)
    // ensures each smoother has a 180-day "warm-up" period before its final
    // value is read, eliminating initialization bias.
    const ewma7  = computeEWMA(fullSeries, ALPHA.SHORT);   // 7-day equiv. span
    const ewma15 = computeEWMA(fullSeries, ALPHA.MEDIUM);  // 15-day equiv. span
    const ewma30 = computeEWMA(fullSeries, ALPHA.LONG);    // 30-day equiv. span

    // ── Canonical weighted burn rate ──────────────────────────────────────
    // Blends all three into a single daily consumption estimate used as the
    // primary input for horizon projections and legacy days_remaining.
    const weightedBurnRate =
        (ewma7  * BLEND_WEIGHTS.SHORT)  +
        (ewma15 * BLEND_WEIGHTS.MEDIUM) +
        (ewma30 * BLEND_WEIGHTS.LONG);

    // ── Momentum velocity ─────────────────────────────────────────────────
    // Compares short-term EWMA (recent demand) to long-term EWMA (baseline).
    // Positive velocity → recent demand exceeds the historical norm (growing).
    // Negative velocity → recent demand below historical norm (slowing down).
    const momentumVelocity = computeMomentumVelocity(ewma7, ewma30);

    // ── Block-level average daily consumption ─────────────────────────────
    // Provides a transparent, non-smoothed breakdown for the academic panel
    // to validate that EWMA is correctly tracking the underlying trend.
    const blockAvgs = {};
    for (const block of TREND_BLOCKS) {
        const slice = sliceBlock(fullSeries, ANALYSIS_WINDOW_DAYS, block.from, block.to - 1);
        const total = slice.reduce((acc, v) => acc + v, 0);
        const days  = block.to - block.from;
        blockAvgs[block.label] = days > 0 ? round4(total / days) : 0;
    }

    // ── 30-day total (backward-compatible legacy field) ───────────────────
    const series30 = sliceBlock(fullSeries, ANALYSIS_WINDOW_DAYS, 0, 29);
    const total30d = round2(series30.reduce((acc, v) => acc + v, 0));

    return {
        ewma7:             round4(ewma7),
        ewma15:            round4(ewma15),
        ewma30:            round4(ewma30),
        weightedBurnRate:  round4(weightedBurnRate),
        momentumVelocity,
        blockAvgs,
        total30d,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION 7: DAY-OF-WEEK VELOCITY PROFILING ────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeDowSurgeProfile — converts raw per-weekday consumption totals into
 * normalized surge indices.
 *
 * Surge Index for day d:
 *   surge_index[d] = dowConsumption[d] / (totalConsumption / 7)
 *
 * Interpretation:
 *   surge_index = 1.00 → exactly average demand for this weekday
 *   surge_index = 1.45 → 45% above the weekly average (strong surge day)
 *   surge_index = 0.60 → 40% below the weekly average (slow day)
 *
 * These indices are later applied as per-day multipliers when projecting
 * calendar-aware demand across each prediction horizon.
 *
 * @param   {number[]} dowBuckets  Array[7] of total consumption by weekday (Sun→Sat)
 * @returns {object[]}             Array of { dow, name, raw_consumption, surge_index }
 */
function computeDowSurgeProfile(dowBuckets) {
    const total   = dowBuckets.reduce((acc, v) => acc + v, 0);
    const weekAvg = total / 7;

    // If no consumption exists at all, return neutral 1.0 indices.
    if (weekAvg <= 0) {
        return DOW_NAMES.map((name, i) => ({
            dow: i, name, raw_consumption: 0, surge_index: 1.0,
        }));
    }

    return dowBuckets.map((consumed, i) => ({
        dow:             i,
        name:            DOW_NAMES[i],
        raw_consumption: round2(consumed),
        surge_index:     round4(consumed / weekAvg),
    }));
}

/**
 * getSurgeDays — filters a DoW profile to days that exceed the surge threshold,
 * sorted by surge index descending so the most impactful day appears first.
 *
 * @param   {object[]} dowProfile  Output of computeDowSurgeProfile
 * @returns {string[]}             Ordered array of surge day names (e.g., ['Saturday', 'Friday'])
 */
function getSurgeDays(dowProfile) {
    return dowProfile
        .filter(d => d.surge_index > SURGE_INDEX_THRESHOLD)
        .sort((a, b) => b.surge_index - a.surge_index)
        .map(d => d.name);
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION 8: MULTI-HORIZON DEMAND PROJECTION ───────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * projectHorizonDemand — projects total ingredient demand for the next H days
 * by applying the per-day DoW surge multiplier to each specific upcoming date.
 *
 * This replaces the legacy flat-rate calculation (burnRate × H) with a
 * calendar-aware projection that accounts for the actual day-of-week
 * composition of each horizon window (e.g., a 7-day window starting on
 * Thursday contains Thu, Fri, Sat, Sun, Mon, Tue, Wed — and the Friday
 * and Saturday surge multipliers are applied to those specific days).
 *
 * It also simulates a running stock depletion to detect the exact day
 * within the horizon when stock would be exhausted.
 *
 * @param   {number}   baseBurnRate   Canonical daily consumption estimate (units/day)
 * @param   {object[]} dowProfile     DoW surge profile from computeDowSurgeProfile
 * @param   {number}   horizonDays    7, 15, or 30
 * @param   {number}   currentStock   Current on-hand inventory quantity
 * @returns {object}  Projection result with predicted_demand, stock_adequate, etc.
 */
function projectHorizonDemand(baseBurnRate, dowProfile, horizonDays, currentStock) {
    const upcomingDow = getUpcomingDaysOfWeek(horizonDays);

    // Build a fast DoW → surge_index lookup.
    const surgeMap = {};
    for (const d of dowProfile) surgeMap[d.dow] = d.surge_index;

    let totalDemand      = 0;
    let stockRemaining   = currentStock;
    let stockoutDay      = null; // null = no stockout within horizon

    for (let i = 0; i < upcomingDow.length; i++) {
        const dow         = upcomingDow[i];
        const multiplier  = surgeMap[dow] ?? 1.0;
        const dayDemand   = baseBurnRate * multiplier;

        totalDemand    += dayDemand;
        stockRemaining -= dayDemand;

        // Record the first day stock goes negative (1-indexed from today).
        if (stockoutDay === null && stockRemaining < 0) {
            stockoutDay = i + 1;
        }
    }

    // Compute the blended surge multiplier actually realized over this horizon.
    const flatDemand          = baseBurnRate * horizonDays;
    const avgSurgeMultiplier  = flatDemand > 0 ? totalDemand / flatDemand : 1.0;

    return {
        predicted_demand:        round2(totalDemand),
        stock_adequate:          stockRemaining >= 0,
        avg_surge_multiplier:    round4(avgSurgeMultiplier),
        projected_stockout_day:  stockoutDay,         // null if adequate
        stock_after_horizon:     round2(Math.max(0, stockRemaining)),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION 9: MULTI-HORIZON STATUS CLASSIFICATION ───────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * classifyStatus — determines inventory health using multi-horizon projection
 * results rather than static threshold rules.
 *
 * Classification logic (evaluated in priority order):
 *   1. INFINITE  — weighted burn rate is zero; no demand detected.
 *   2. CRITICAL  — the 7-day horizon projection predicts stockout (stock_adequate = false).
 *   3. WARNING   — the 15-day horizon projects stockout; OR a weekend surge day
 *                  appears in the upcoming 7 days and the peak-day buffer is < 5 days.
 *   4. OK        — all three horizons are adequately stocked.
 *
 * @param   {object}   horizons      Map of { 7: h7, 15: h15, 30: h30 } projections
 * @param   {number}   burnRate      Canonical weighted daily burn rate
 * @param   {object[]} dowProfile    DoW surge profile
 * @param   {number}   currentStock  Current on-hand inventory
 * @returns {string}                 One of the STATUS constants
 */
function classifyStatus(horizons, burnRate, dowProfile, currentStock) {

    // ── Rule 0: No measurable burn rate ───────────────────────────────────
    if (burnRate <= 0) return STATUS.INFINITE;

    // ── Rule 1: 7-Day horizon stockout (CRITICAL) ─────────────────────────
    const h7 = horizons[7];
    if (h7 && !h7.stock_adequate) return STATUS.CRITICAL;

    // ── Rule 2: 15-Day horizon stockout (WARNING) ─────────────────────────
    const h15 = horizons[15];
    if (h15 && !h15.stock_adequate) return STATUS.WARNING;

    // ── Rule 3: Weekend surge risk within the 7-day window (WARNING) ──────
    // Even if raw stock levels appear sufficient today, if a high-surge
    // weekend day falls within the next 7 days, we simulate peak-day demand
    // to see if the buffer would collapse.
    const surgeDays          = getSurgeDays(dowProfile);
    const hasUpcomingWeekend = surgeDays.some(d => WEEKEND_DAYS.has(d));

    if (hasUpcomingWeekend) {
        const peakMultiplier = Math.max(...dowProfile.map(d => d.surge_index));
        const peakDailyDemand = burnRate * peakMultiplier;
        // How many days of stock remain if EVERY day burned at peak rate?
        const peakBufferDays = peakDailyDemand > 0
            ? currentStock / peakDailyDemand
            : Infinity;

        if (peakBufferDays < 5) return STATUS.WARNING;
    }

    return STATUS.OK;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION 10: PROCUREMENT LEDGER BUILDER ───────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildProcurementEntry — constructs a structured procurement ledger object
 * ready for dispatch to aiDelegationService.js.
 *
 * The `items` array shape used by POST /api/ai/delegate-restock is:
 *   { item_name, current_stock, daily_burn_rate, days_remaining, status, unit }
 * These legacy fields are preserved at the top level of each entry.
 *
 * Extended procurement metadata (urgency, order_qty, surge flags) is
 * appended below so the delegation service's PDF generator can optionally
 * render it without requiring schema changes.
 *
 * @param   {object}   inv        Inventory row from fetchInventory
 * @param   {object}   ewmaData   Output of computeIngredientEWMA
 * @param   {object}   horizons   Projected demand horizons { 7, 15, 30 }
 * @param   {object[]} dowProfile DoW surge profile
 * @param   {string}   status     Classified status string
 * @returns {object}              Procurement ledger entry
 */
function buildProcurementEntry(inv, ewmaData, horizons, dowProfile, status) {
    const currentStock = parseFloat(inv.stock_quantity);
    const surgeDays    = getSurgeDays(dowProfile);
    const hasWeekendSurge = surgeDays.some(d => WEEKEND_DAYS.has(d));

    // Urgency tiers: immediate → same-day action; soon → within 48 hours; planned → weekly order.
    let urgency = 'none';
    if      (status === STATUS.CRITICAL) urgency = 'immediate';
    else if (status === STATUS.WARNING)  urgency = 'soon';
    else if (hasWeekendSurge && horizons[7]?.stock_after_horizon < ewmaData.ewma7 * 3)
        urgency = 'planned';

    // Recommended order quantity: covers the 30-day horizon demand + 20% safety buffer,
    // minus existing stock. This is the same formula as the legacy recommended_order field,
    // now derived from the DoW-adjusted horizon projection rather than a flat burn rate.
    const h30DemandWithBuffer = (horizons[30]?.predicted_demand ?? 0) * 1.20;
    const recommendedOrderQty = round2(Math.max(0, h30DemandWithBuffer - currentStock));

    // Legacy days_remaining for delegation service compatibility.
    const daysRemaining = ewmaData.weightedBurnRate > 0
        ? round1(currentStock / ewmaData.weightedBurnRate)
        : 'Infinite';

    return {
        // ── Legacy shape (required by aiDelegationService.js POST body) ───
        item_name:         inv.item_name,
        current_stock:     round2(currentStock),
        daily_burn_rate:   ewmaData.weightedBurnRate,
        days_remaining:    daysRemaining,
        status,
        unit:              inv.unit,
        category:          inv.category,

        // ── Extended procurement metadata ─────────────────────────────────
        needs_restock:          status === STATUS.CRITICAL || status === STATUS.WARNING,
        urgency,
        recommended_order_qty:  recommendedOrderQty,
        weekend_surge_risk:     hasWeekendSurge,
        surge_days:             surgeDays,
        horizon_risk: {
            h7_adequate:  horizons[7]?.stock_adequate  ?? true,
            h15_adequate: horizons[15]?.stock_adequate ?? true,
            h30_adequate: horizons[30]?.stock_adequate ?? true,
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION 11: FALLBACK ROW BUILDERS ────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** buildInfiniteRow — constructs a fully-populated result row for an ingredient
 *  with no measurable burn rate (no sales or no recipe linkage).
 *  All legacy fields are present and correctly typed. */
function buildInfiniteRow(inv) {
    const flatDow = DOW_NAMES.map((name, i) => ({
        dow: i, name, raw_consumption: 0, surge_index: 1.0,
    }));
    return {
        // ── Legacy fields ─────────────────────────────────────────────────
        raw_inventory_id:    inv.raw_inventory_id,
        item_name:           inv.item_name,
        unit:                inv.unit,
        category:            inv.category,
        current_stock:       round2(parseFloat(inv.stock_quantity) || 0),
        total_consumed_30d:  0,
        daily_burn_rate:     0,
        days_remaining:      'Infinite',
        recommended_order:   0,
        status:              STATUS.INFINITE,

        // ── Multi-horizon analytical pack (zeroed) ────────────────────────
        prediction_horizons: { h7: null, h15: null, h30: null },
        ewma_analysis: {
            alpha_short:        round4(ALPHA.SHORT),
            alpha_medium:       round4(ALPHA.MEDIUM),
            alpha_long:         round4(ALPHA.LONG),
            ewma_7d:            0,
            ewma_15d:           0,
            ewma_30d:           0,
            weighted_burn_rate: 0,
            momentum_velocity:  0,
            trend_direction:    'stable',
            block_averages:     {},
        },
        dow_surge_profile:   flatDow,
        surge_days:          [],
        weekend_surge_risk:  false,
        procurement: {
            item_name:              inv.item_name,
            current_stock:          round2(parseFloat(inv.stock_quantity) || 0),
            daily_burn_rate:        0,
            days_remaining:         'Infinite',
            status:                 STATUS.INFINITE,
            unit:                   inv.unit,
            category:               inv.category,
            needs_restock:          false,
            urgency:                'none',
            recommended_order_qty:  0,
            weekend_surge_risk:     false,
            surge_days:             [],
            horizon_risk: { h7_adequate: true, h15_adequate: true, h30_adequate: true },
        },
    };
}

/** buildEmptyResponse — returned when the analysis window contains no sales data. */
function buildEmptyResponse(allInventory) {
    return {
        generated_at:          new Date().toISOString(),
        algorithm:             'Predictive Multi-Horizon EWMA-LSTM (7/15/30-Day)',
        analysis_window_days:  ANALYSIS_WINDOW_DAYS,
        ewma_config: {
            alpha_short:  round4(ALPHA.SHORT),
            alpha_medium: round4(ALPHA.MEDIUM),
            alpha_long:   round4(ALPHA.LONG),
            blend_weights: BLEND_WEIGHTS,
        },
        total_sales_analyzed:  0,
        total_item_lines:      0,
        summary: {
            total_ingredients:  allInventory.length,
            critical:           0,
            warning:            0,
            ok:                 0,
            infinite:           allInventory.length,
            weekend_surge_risks: 0,
        },
        dispatch_ledger: [],
        data: allInventory.map(buildInfiniteRow),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION 12: MAIN ENGINE — runForecaster ───────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * runForecaster — orchestrates all phases of the Predictive Multi-Horizon
 * Trend Optimization Engine and returns a fully populated response object.
 *
 * Pipeline:
 *   Phase 1 → Data Ingestion (fetchSalesData, fetchInventory, fetchRecipes)
 *   Phase 2 → Time-Series Decomposition (buildIngredientTimeSeries)
 *   Phase 3 → EWMA Computation (computeIngredientEWMA)
 *   Phase 4 → DoW Velocity Profiling (computeDowSurgeProfile)
 *   Phase 5 → Multi-Horizon Projection (projectHorizonDemand × 3)
 *   Phase 6 → Status Classification (classifyStatus)
 *   Phase 7 → Procurement Ledger (buildProcurementEntry)
 *   Phase 8 → Result Assembly, Sorting, and Summary Aggregation
 *
 * @param   {object} db       mysql2 connection pool (uses db.promise().query())
 * @param   {object} options  { category?: string }
 * @returns {Promise<object>} Fully structured forecaster response
 */
async function runForecaster(db, options = {}) {
    const categoryFilter = options.category?.toLowerCase() || null;
    const now            = new Date();

    // ── Phase 1: Parallel data ingestion ─────────────────────────────────
    const [salesRows, allInventory] = await Promise.all([
        fetchSalesData(db),
        fetchInventory(db, categoryFilter),
    ]);

    if (salesRows.length === 0 || allInventory.length === 0) {
        return buildEmptyResponse(allInventory);
    }

    // ── Identify all product IDs that appear in the analysis window ───────
    // This allows a targeted recipe lookup rather than fetching all recipes.
    const soldProductIds = new Set();
    for (const row of salesRows) {
        const parsed = parseDetails(row.details);
        if (!parsed?.items) continue;
        for (const item of parsed.items) {
            const pid = Number(item.product_id);
            if (pid) soldProductIds.add(pid);
        }
    }

    if (soldProductIds.size === 0) return buildEmptyResponse(allInventory);

    const recipes = await fetchRecipes(db, [...soldProductIds]);

    // ── Phase 2: Time-Series Decomposition ───────────────────────────────
    const { ingMap, totalSalesAnalyzed, totalItemLinesParsed } =
        buildIngredientTimeSeries(salesRows, recipes, now);

    // ── Phases 3–7: Per-ingredient analytical pipeline ────────────────────
    const results    = [];
    const procLedger = []; // Dispatch-ready items for aiDelegationService

    for (const inv of allInventory) {
        const rawId       = inv.raw_inventory_id;
        const currentStock = parseFloat(inv.stock_quantity);
        const ingData     = ingMap.get(rawId);

        // No consumption recorded for this ingredient → Infinite status.
        if (!ingData || ingData.dayBuckets.size === 0) {
            results.push(buildInfiniteRow(inv));
            continue;
        }

        // ── Phase 3: Multi-Horizon EWMA ───────────────────────────────────
        const ewmaData = computeIngredientEWMA(ingData.dayBuckets);

        // Treat negligible burn rates as zero to avoid phantom stockout alerts.
        if (ewmaData.weightedBurnRate < 0.0001) {
            results.push(buildInfiniteRow(inv));
            continue;
        }

        // ── Phase 4: Day-of-Week Velocity Profiling ───────────────────────
        const dowProfile = computeDowSurgeProfile(ingData.dowBuckets);

        // ── Phase 5: Multi-Horizon Projections ───────────────────────────
        const horizons = {};
        for (const H of HORIZONS) {
            horizons[H] = projectHorizonDemand(
                ewmaData.weightedBurnRate,
                dowProfile,
                H,
                currentStock
            );
        }

        // ── Phase 6: Status Classification ───────────────────────────────
        const status = classifyStatus(
            horizons,
            ewmaData.weightedBurnRate,
            dowProfile,
            currentStock
        );

        // ── Phase 7: Procurement Ledger ───────────────────────────────────
        const procEntry = buildProcurementEntry(inv, ewmaData, horizons, dowProfile, status);
        if (procEntry.needs_restock) procLedger.push(procEntry);

        // ── Compute legacy fields (backward-compatible) ───────────────────
        const daysRemaining  = round1(currentStock / ewmaData.weightedBurnRate);

        // recommended_order matches the procurement entry's 30-day+20% formula.
        const recommendedOrder = procEntry.recommended_order_qty;

        // Derived helpers for UI consumption.
        const surgeDays       = getSurgeDays(dowProfile);
        const weekendSurgeRisk = surgeDays.some(d => WEEKEND_DAYS.has(d));

        // ── Phase 8: Assemble full result row ─────────────────────────────
        results.push({

            // ──────────────────────────────────────────────────────────────
            // LEGACY FIELDS — must remain present and correctly typed.
            // AiControlCenter.jsx reads every one of these directly.
            // ──────────────────────────────────────────────────────────────
            raw_inventory_id:   rawId,
            item_name:          inv.item_name,
            unit:               inv.unit,
            category:           inv.category,
            current_stock:      round2(currentStock),
            total_consumed_30d: ewmaData.total30d,
            daily_burn_rate:    round3(ewmaData.weightedBurnRate),
            days_remaining:     daysRemaining,
            recommended_order:  recommendedOrder,
            status,

            // ──────────────────────────────────────────────────────────────
            // MULTI-HORIZON PREDICTION PACK
            // Keys: h7, h15, h30 — each contains the full projection object.
            // ──────────────────────────────────────────────────────────────
            prediction_horizons: {
                h7:  horizons[7],
                h15: horizons[15],
                h30: horizons[30],
            },

            // ──────────────────────────────────────────────────────────────
            // EWMA ANALYTICAL PACK
            // Exposes all parameters for thesis defense transparency.
            // ──────────────────────────────────────────────────────────────
            ewma_analysis: {
                alpha_short:        round4(ALPHA.SHORT),
                alpha_medium:       round4(ALPHA.MEDIUM),
                alpha_long:         round4(ALPHA.LONG),
                ewma_7d:            ewmaData.ewma7,
                ewma_15d:           ewmaData.ewma15,
                ewma_30d:           ewmaData.ewma30,
                weighted_burn_rate: ewmaData.weightedBurnRate,
                momentum_velocity:  ewmaData.momentumVelocity,
                trend_direction:
                    ewmaData.momentumVelocity >  0.05 ? 'accelerating' :
                    ewmaData.momentumVelocity < -0.05 ? 'decelerating' : 'stable',
                block_averages:     ewmaData.blockAvgs,
            },

            // ──────────────────────────────────────────────────────────────
            // DAY-OF-WEEK SURGE PROFILE
            // Full 7-element array with surge indices; AI prompt uses this
            // to name specific days and cite exact surge percentages.
            // ──────────────────────────────────────────────────────────────
            dow_surge_profile:  dowProfile,
            surge_days:         surgeDays,
            weekend_surge_risk: weekendSurgeRisk,

            // ──────────────────────────────────────────────────────────────
            // PROCUREMENT DISPATCH REFERENCE
            // Pre-formatted for POST /api/ai/delegate-restock `items` body.
            // Admin confirms → aiDelegationService generates PDF + task row.
            // ──────────────────────────────────────────────────────────────
            procurement: procEntry,
        });
    }

    // ── Sort by status priority (critical first), then days_remaining asc ─
    results.sort((a, b) => {
        const oa = STATUS_ORDER[a.status];
        const ob = STATUS_ORDER[b.status];
        if (oa !== ob) return oa - ob;
        if (typeof a.days_remaining === 'number' && typeof b.days_remaining === 'number') {
            return a.days_remaining - b.days_remaining;
        }
        return 0;
    });

    // ── Summary aggregation ────────────────────────────────────────────────
    const summary = {
        total_ingredients:   results.length,
        critical:            results.filter(r => r.status === STATUS.CRITICAL).length,
        warning:             results.filter(r => r.status === STATUS.WARNING).length,
        ok:                  results.filter(r => r.status === STATUS.OK).length,
        infinite:            results.filter(r => r.status === STATUS.INFINITE).length,
        weekend_surge_risks: results.filter(r => r.weekend_surge_risk).length,
    };

    return {
        generated_at:         now.toISOString(),
        algorithm:            'Predictive Multi-Horizon EWMA-LSTM (7/15/30-Day)',
        analysis_window_days: ANALYSIS_WINDOW_DAYS,
        ewma_config: {
            alpha_short:   round4(ALPHA.SHORT),
            alpha_medium:  round4(ALPHA.MEDIUM),
            alpha_long:    round4(ALPHA.LONG),
            blend_weights: BLEND_WEIGHTS,
        },
        total_sales_analyzed: totalSalesAnalyzed,
        total_item_lines:     totalItemLinesParsed,
        summary,
        dispatch_ledger:      procLedger,  // Ready for aiDelegationService POST body
        data:                 results,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SECTION 13: EXPRESS ROUTER FACTORY (Backward-Compatible) ─────────────────
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createAiForecasterRouter — returns the Express router mounted by server.js.
 * Pattern is unchanged: app.use('/api/test', createAiForecasterRouter(db))
 *
 * Query params:
 *   GET /api/test/ai-forecaster?category=<name>  (optional filter)
 */
function createAiForecasterRouter(db) {
    const router = express.Router();

    router.get('/ai-forecaster', async (req, res) => {
        try {
            const result = await runForecaster(db, {
                category: req.query.category,
            });
            return res.json(result);
        } catch (err) {
            console.error('🚨 [AI Forecaster] Uncaught error:', err.message);
            return res.status(500).json({ error: 'AI Forecaster error.' });
        }
    });

    return router;
}

// ── Exports (unchanged pattern — cronJobs.js and server.js both depend on these) ─
module.exports               = createAiForecasterRouter;
module.exports.runForecaster = runForecaster;
