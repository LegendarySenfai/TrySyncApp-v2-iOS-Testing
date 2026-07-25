'use strict';

// ── Part 1, Role 1: The Nightly Auditor (Loss Prevention) ──
async function runAuditor(db) {
    // 1. Fetch yesterday's voided transactions
    const [voids] = await db.promise().query(`
        SELECT id, category, amount, details, timestamp 
        FROM sales_log 
        WHERE is_voided = 1 
        AND DATE(timestamp) = CURDATE() - INTERVAL 1 DAY
    `);

    // 2. Fetch yesterday's shift audits (looking for variances matching your actual DB schema)
    const [audits] = await db.promise().query(`
        SELECT id, staff_name, expected_cash, actual_cash, cash_variance AS variance, audit_details
        FROM shift_audits
        WHERE DATE(audit_date) = CURDATE() - INTERVAL 1 DAY
    `);

    // Calculate total missing money (Loss Prevention)
    let totalVarianceLoss = 0;
    audits.forEach(a => {
        if (parseFloat(a.variance) < 0) totalVarianceLoss += Math.abs(parseFloat(a.variance));
    });

    return {
        audit_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
        total_voids: voids.length,
        voided_items: voids,
        total_variance_loss: totalVarianceLoss,
        shift_audits: audits
    };
}

module.exports = { runAuditor };
