/**
 * ============================================================
 * TriSync AI Insights — Latest Reports Endpoint
 * services/aiInsightsService.js
 * ============================================================
 *
 * HOW TO MOUNT IN server.js (ONE LINE, paste just before app.listen):
 *
 *   app.use('/api', require('./services/aiInsightsService')(db));
 *
 * ENDPOINT:
 *   GET /api/ai-insights/latest
 *
 * AUTH:
 *   Add authenticateToken middleware when ready:
 *   router.get('/ai-insights/latest', authenticateToken, async (req, res) => { … })
 *
 * RESPONSE SHAPE:
 *   {
 *     "generated_at": "<ISO timestamp of this response>",
 *     "forecaster": {
 *       "report_text":   "<latest AI restock alert, or null>",
 *       "generated_at":  "<row timestamp, or null>"
 *     },
 *     "financial": {
 *       "report_text":   "<latest AI CFO summary, or null>",
 *       "generated_at":  "<row timestamp, or null>"
 *     }
 *   }
 *
 *   Both inner objects will contain null values when no row of that
 *   type exists yet (e.g. the cron job has never run). The React
 *   dashboard should handle null gracefully and show a "No data yet"
 *   placeholder.
 *
 * TABLE READ (read-only — nothing is ever written here):
 *   ai_insights
 *
 * ISOLATION GUARANTEE:
 *   Factory-function pattern — receives `db`, touches nothing in server.js.
 *   A crash inside this module returns HTTP 500 to the caller only.
 * ============================================================
 */

'use strict';

const express = require('express');

// ── SQL: one query template used twice, once per insight_type ─────────────────
// ORDER BY generated_at DESC LIMIT 1 guarantees we always return the most
// recent row regardless of how many historical rows exist.
const LATEST_QUERY =
    `SELECT report_text, generated_at
     FROM   ai_insights
     WHERE  insight_type = ?
     ORDER  BY generated_at DESC
     LIMIT  1`;

// ── Helper: run LATEST_QUERY and return { report_text, generated_at } | null ──
// Returns null when no row exists yet so the caller never has to inspect
// an empty array — it either gets data or null.
async function fetchLatest(db, insightType) {
    const [rows] = await db.promise().query(LATEST_QUERY, [insightType]);
    if (!rows || rows.length === 0) return null;

    return {
        report_text:  rows[0].report_text,
        generated_at: rows[0].generated_at,
    };
}

// ── Main factory function ─────────────────────────────────────────────────────
module.exports = function createAiInsightsRouter(db) {

    const router = express.Router();

    // ── GET /api/ai-insights/latest ──────────────────────────────────────────
    router.get('/ai-insights/latest', async (req, res) => {
        try {
            // Run both SELECTs concurrently — no need to wait for one before
            // starting the other, since they touch different rows of the same table.
            const [forecaster, financial] = await Promise.all([
                fetchLatest(db, 'forecaster'),
                fetchLatest(db, 'financial'),
            ]);

            return res.json({
                generated_at: new Date().toISOString(),
                forecaster:   forecaster  ?? { report_text: null, generated_at: null },
                financial:    financial   ?? { report_text: null, generated_at: null },
            });

        } catch (err) {
            // ── Isolated failure — never propagates to other routes ───────
            console.error('🚨 [AI Insights] Uncaught error:', err.message);
            return res.status(500).json({
                error:   'AI Insights service encountered an internal error.',
                message: err.message,
                note:    'All other application routes are unaffected.',
            });
        }
    });

    return router;
};
