/**
 * ============================================================
 * TriSync AI Financial Engine (Multi-Timeframe Upgraded)
 * services/aiFinancialService.js
 * ============================================================
 */

'use strict';
const express = require('express');

// ── Helper: generate date boundaries based on days ago ───────────────────────
function windowBounds(endDaysAgo, startDaysAgo) {
    const now   = new Date();
    const end   = new Date(now);
    const start = new Date(now);
    end.setDate(end.getDate()     - endDaysAgo);
    start.setDate(start.getDate() - startDaysAgo);
    return { start, end };
}

const num  = v => parseFloat(v) || 0;
const int  = v => parseInt(v, 10) || 0;
const round2 = v => Math.round(v * 100) / 100;

function pctChange(current, past) {
    if (past === 0) return current === 0 ? 0 : null;
    return round2(((current - past) / past) * 100);
}

// ── Core logic: Now supports 'daily', 'weekly', 'monthly' ───────────────────
async function runFinancial(db, timeframe = 'weekly') {
    let currentDays, pastDays;
    let labelCurrent, labelPast, timeframeLabel;

    if (timeframe === 'daily') {
        currentDays = 1; pastDays = 2;
        labelCurrent = 'Today'; labelPast = 'Yesterday';
        timeframeLabel = 'Today vs Yesterday';
    } else if (timeframe === 'monthly') {
        currentDays = 30; pastDays = 60;
        labelCurrent = 'This Month'; labelPast = 'Last Month';
        timeframeLabel = 'This Month vs Last Month';
    } else {
        currentDays = 7; pastDays = 14;
        labelCurrent = 'This Week'; labelPast = 'Last Week';
        timeframeLabel = 'This Week vs Last Week';
    }

    const currentPeriod = windowBounds(0, currentDays);
    const pastPeriod    = windowBounds(currentDays, pastDays);

    const [
        [currSalesRows], [currExpenseRows], [currAuditRows], [currVoidRows],
        [pastSalesRows], [pastExpenseRows], [pastAuditRows], [pastVoidRows],
    ] = await Promise.all([
        db.promise().query(`SELECT COALESCE(SUM(amount), 0) AS gross_sales, COALESCE(SUM(total_cogs), 0) AS cogs FROM sales_log WHERE is_voided = FALSE AND timestamp >= ? AND timestamp < ?`, [currentPeriod.start, currentPeriod.end]),
        db.promise().query(`SELECT COALESCE(SUM(amount), 0) AS store_expenses FROM store_expenses WHERE timestamp >= ? AND timestamp < ?`, [currentPeriod.start, currentPeriod.end]),
        db.promise().query(`SELECT COALESCE(SUM(total_loss), 0) AS total_inventory_loss, COALESCE(SUM(ABS(cash_variance)), 0) AS total_cash_shortage FROM shift_audits WHERE cash_variance < 0 AND audit_date >= ? AND audit_date < ?`, [currentPeriod.start, currentPeriod.end]),
        db.promise().query(`SELECT COUNT(*) AS void_count FROM sales_log WHERE is_voided = TRUE AND timestamp >= ? AND timestamp < ?`, [currentPeriod.start, currentPeriod.end]),
        
        db.promise().query(`SELECT COALESCE(SUM(amount), 0) AS gross_sales, COALESCE(SUM(total_cogs), 0) AS cogs FROM sales_log WHERE is_voided = FALSE AND timestamp >= ? AND timestamp < ?`, [pastPeriod.start, pastPeriod.end]),
        db.promise().query(`SELECT COALESCE(SUM(amount), 0) AS store_expenses FROM store_expenses WHERE timestamp >= ? AND timestamp < ?`, [pastPeriod.start, pastPeriod.end]),
        db.promise().query(`SELECT COALESCE(SUM(total_loss), 0) AS total_inventory_loss, COALESCE(SUM(ABS(cash_variance)), 0) AS total_cash_shortage FROM shift_audits WHERE cash_variance < 0 AND audit_date >= ? AND audit_date < ?`, [pastPeriod.start, pastPeriod.end]),
        db.promise().query(`SELECT COUNT(*) AS void_count FROM sales_log WHERE is_voided = TRUE AND timestamp >= ? AND timestamp < ?`, [pastPeriod.start, pastPeriod.end]),
    ]);

    const curr = {
        gross_sales:    round2(num(currSalesRows[0].gross_sales)),
        cogs:           round2(num(currSalesRows[0].cogs)),
        store_expenses: round2(num(currExpenseRows[0].store_expenses)),
        variance_loss:  round2(num(currAuditRows[0].total_inventory_loss) + num(currAuditRows[0].total_cash_shortage)),
        void_count:     int(currVoidRows[0].void_count),
    };
    curr.net_profit = round2(curr.gross_sales - curr.cogs - curr.store_expenses);

    const past = {
        gross_sales:    round2(num(pastSalesRows[0].gross_sales)),
        cogs:           round2(num(pastSalesRows[0].cogs)),
        store_expenses: round2(num(pastExpenseRows[0].store_expenses)),
        variance_loss:  round2(num(pastAuditRows[0].total_inventory_loss) + num(pastAuditRows[0].total_cash_shortage)),
        void_count:     int(pastVoidRows[0].void_count),
    };
    past.net_profit = round2(past.gross_sales - past.cogs - past.store_expenses);

    const changes = {
        gross_sales:    pctChange(curr.gross_sales, past.gross_sales),
        cogs:           pctChange(curr.cogs, past.cogs),
        net_profit:     pctChange(curr.net_profit, past.net_profit),
        variance_loss:  pctChange(curr.variance_loss, past.variance_loss),
    };

    return {
        generated_at: new Date().toISOString(),
        timeframe_label: timeframeLabel,
        current_period: curr,
        past_period: past,
        percentage_changes: changes,
    };
}

function createAiFinancialRouter(db) {
    const router = express.Router();
    router.get('/ai-financial', async (req, res) => {
        try {
            const timeframe = req.query.timeframe || 'weekly'; // Can pass ?timeframe=monthly in API
            const result = await runFinancial(db, timeframe);
            return res.json(result);
        } catch (err) {
            console.error('🚨 [AI Financial] Error:', err.message);
            return res.status(500).json({ error: 'AI Financial service error.' });
        }
    });
    return router;
}

module.exports = createAiFinancialRouter;
module.exports.runFinancial = runFinancial;
