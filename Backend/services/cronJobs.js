/**
 * ============================================================
 * DuoSync Cron Job Foundation & Notification Engine
 * services/cronJobs.js
 * ============================================================
 */

'use strict';

const cron       = require('node-cron');
const nodemailer = require('nodemailer');

// ── Internal service imports ──────────────────────────────────────────────────
const { runForecaster } = require('./aiForecasterService');
const { runFinancial  } = require('./aiFinancialService');
const { runAuditor    } = require('./aiAuditorService');
const { generateForecasterAlert, generateFinancialSummary, generateAuditorAlert } = require('./geminiService');

// ── Email Transport ───────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// ── Report Type Configuration ─────────────────────────────────────────────────
const REPORT_CONFIG = {
    forecaster: {
        icon:        '📦',
        badge:       'Supply Chain Intelligence',
        headline:    'Inventory Analysis Ready',
        body:        'Your AI-powered supply chain engine has completed its burn rate analysis. Upcoming restock requirements and demand forecasts are ready for review.',
        accentColor: '#1d4ed8',
        accentLight: '#dbeafe',
    },
    financial: {
        icon:        '📊',
        badge:       'CFO Financial Report',
        headline:    'Executive Financial Briefing Ready',
        body:        'Your weekly financial analysis has been completed. Revenue trends, margin analysis, and expense breakdowns are ready in the dashboard.',
        accentColor: '#7c3aed',
        accentLight: '#ede9fe',
    },
    auditor: {
        icon:        '🛡️',
        badge:       'Loss Prevention Audit',
        headline:    'Nightly Security Audit Complete',
        body:        'The nightly loss prevention audit has finished running. Variance analysis and anomaly detection results are available for your review.',
        accentColor: '#dc2626',
        accentLight: '#fee2e2',
    },
};

/**
 * sendEmailAlert — sends a sleek, generalized HTML notification email.
 *
 * IMPORTANT: The raw AI-generated `_text` parameter is intentionally
 * NOT included in the email body. Sensitive operational data is kept
 * inside the dashboard only, behind authenticated access.
 *
 * @param {string} subject    Email subject line suffix
 * @param {string} _text      [IGNORED] Raw AI text — kept for API compatibility
 * @param {object} opts       { reportType: 'forecaster'|'financial'|'auditor', itemCount?: number }
 */
async function sendEmailAlert(subject, _text, opts = {}) {
    if (!process.env.ADMIN_EMAIL) {
        return console.log('[Email] ⚠️ No ADMIN_EMAIL set in .env. Skipping email.');
    }

    const { reportType = 'forecaster', itemCount } = opts;
    const cfg = REPORT_CONFIG[reportType] || REPORT_CONFIG.forecaster;

    const now = new Date().toLocaleString('en-PH', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila',
    });

    const urgencyBadge = (itemCount && itemCount > 0)
        ? `<tr>
             <td align="center" style="padding:0 40px 24px;">
               <div style="display:inline-block;background:${cfg.accentLight};color:${cfg.accentColor};
                           border:1.5px solid ${cfg.accentColor};border-radius:8px;
                           padding:12px 24px;font-size:14px;font-weight:700;line-height:1.4;">
                 ⚠️&nbsp; ${itemCount} item${itemCount !== 1 ? 's' : ''} require${itemCount === 1 ? 's' : ''} your immediate attention.
               </div>
             </td>
           </tr>`
        : '';

    const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>DuoSync AI — ${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:48px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;
                      box-shadow:0 8px 40px rgba(0,0,0,0.10);">

          <!-- ── Header ─────────────────────────────────────────── -->
          <tr>
            <td style="background:linear-gradient(145deg,#050d1f 0%,#0d1f3c 55%,#0f2a50 100%);
                       padding:40px 40px 36px;text-align:center;">
              <div style="font-size:40px;margin-bottom:14px;line-height:1;">${cfg.icon}</div>
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;">
                DuoSync AI
              </h1>
              <div style="display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);
                          color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;
                          padding:5px 16px;border-radius:20px;margin-top:12px;">
                ${cfg.badge}
              </div>
            </td>
          </tr>

          <!-- ── Headline ───────────────────────────────────────── -->
          <tr>
            <td style="padding:40px 40px 12px;text-align:center;">
              <h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:0 0 14px;letter-spacing:-0.3px;">
                ${cfg.headline}
              </h2>
              <p style="color:#64748b;font-size:14px;line-height:1.85;margin:0 auto 28px;max-width:440px;">
                ${cfg.body}
              </p>
            </td>
          </tr>

          <!-- ── Urgency Badge (conditional) ───────────────────── -->
          ${urgencyBadge}

          <!-- ── CTA Button ─────────────────────────────────────── -->
          <tr>
            <td align="center" style="padding:0 40px 40px;">
              <a href="https://duo-sync-app.vercel.app"
                 style="display:inline-block;background:linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%);
                        color:#ffffff;text-decoration:none;padding:15px 40px;border-radius:12px;
                        font-weight:800;font-size:15px;letter-spacing:0.2px;
                        box-shadow:0 6px 20px rgba(59,130,246,0.40);">
                Login to Dashboard &rarr;
              </a>
            </td>
          </tr>

          <!-- ── Divider ────────────────────────────────────────── -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;background:#e2e8f0;"></div>
            </td>
          </tr>

          <!-- ── Footer ─────────────────────────────────────────── -->
          <tr>
            <td style="background:#f8fafc;padding:22px 40px;text-align:center;border-radius:0 0 20px 20px;">
              <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.7;">
                This is an automated intelligence report from the <strong>DuoSync AI Engine</strong>.<br>
                Generated on ${now}. &nbsp;|&nbsp; Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
        await transporter.sendMail({
            from:    `"DuoSync AI Engine" <${process.env.EMAIL_USER}>`,
            to:      process.env.ADMIN_EMAIL,
            subject: `🤖 DuoSync: ${subject}`,
            html:    htmlTemplate,
        });
        console.log(`[Email] ✅ Alert sent to ${process.env.ADMIN_EMAIL} — [${subject}]`);
    } catch (err) {
        console.error(`[Email] ❌ Failed to send:`, err.message);
    }
}

// ── Helper: persist an AI insight row to the database ────────────────────────
async function saveInsight(db, type, reportText) {
    const [result] = await db.promise().query(
        `INSERT INTO ai_insights (insight_type, report_text) VALUES (?, ?)`,
        [type, reportText]
    );
    return result.insertId;
}

// ── Main export ───────────────────────────────────────────────────────────────
module.exports = function initCronJobs(db) {

    // ── Task 1: The Nightly Auditor (Loss Prevention) ────────────────────────
    // Schedule: 0 2 * * * → Every day at 02:00 AM
    cron.schedule('0 2 * * *', async () => {
        console.log('\n[CronJob] ─────────────────────────────────────────────');
        console.log('[CronJob] Task 1 — Nightly Loss Prevention Auditor running…');
        console.log('[CronJob] ─────────────────────────────────────────────');

        try {
            const auditorData = await runAuditor(db);
            const alert       = await generateAuditorAlert(auditorData);

            if (alert) {
                const insertId = await saveInsight(db, 'auditor', alert);
                console.log(`[CronJob] ✅ Auditor alert saved (id=${insertId}).`);
                await sendEmailAlert(
                    'URGENT: Loss Prevention Alert',
                    alert,
                    { reportType: 'auditor' }
                );
            } else {
                console.log('[CronJob] ✅ No theft/variance detected. Clean shift.');
            }
        } catch (err) {
            console.error('🚨 [CronJob] Auditor Error:', err.message);
        }
    });

    // ── Task 2: Supply Chain Forecaster Check ────────────────────────────────
    // Schedule: 15 2 * * * → Every day at 02:15 AM
    cron.schedule('15 2 * * *', async () => {
        console.log('\n[CronJob] ─────────────────────────────────────────────');
        console.log('[CronJob] Task 2 — Supply Chain Forecaster running…');
        console.log('[CronJob] ─────────────────────────────────────────────');

        try {
            const inventoryData = await runForecaster(db, { days: 30 });
            const alert         = await generateForecasterAlert(inventoryData);

            if (alert) {
                const insertId    = await saveInsight(db, 'forecaster', alert);
                const urgentCount = (inventoryData?.summary?.critical || 0)
                                  + (inventoryData?.summary?.warning  || 0);
                console.log(`[CronJob] ✅ Forecaster alert saved (id=${insertId}). Urgent items: ${urgentCount}`);
                await sendEmailAlert(
                    'Critical Restock Required',
                    alert,
                    { reportType: 'forecaster', itemCount: urgentCount }
                );
            } else {
                console.log('[CronJob] ✅ No urgent restock needed.');
            }
        } catch (err) {
            console.error('🚨 [CronJob] Forecaster Error:', err.message);
        }
    });

    // ── Task 3: Weekly AI Financial Check (CFO) ──────────────────────────────
    // Schedule: 59 23 * * 0 → Every Sunday at 11:59 PM
    cron.schedule('59 23 * * 0', async () => {
        console.log('\n[CronJob] ─────────────────────────────────────────────');
        console.log('[CronJob] Task 3 — Weekly AI Financial check running…');
        console.log('[CronJob] ─────────────────────────────────────────────');

        try {
            const financialData = await runFinancial(db);
            const summary       = await generateFinancialSummary(financialData);

            if (summary) {
                const insertId = await saveInsight(db, 'financial', summary);
                console.log(`[CronJob] ✅ Financial summary saved (id=${insertId}).`);
                await sendEmailAlert(
                    'Weekly Executive Financial Briefing',
                    summary,
                    { reportType: 'financial' }
                );
            } else {
                console.log('[CronJob] ⚠️ Gemini returned no summary.');
            }
        } catch (err) {
            console.error('🚨 [CronJob] Financial Error:', err.message);
        }
    });

    // ── Registration confirmation ─────────────────────────────────────────────
    console.log('[CronJobs] 🕒 DuoSync AI Automation Engine initialized:');
    console.log('  ✓  Task 1 — Nightly Auditor     →  daily    @ 02:00 AM  (0 2 * * *)');
    console.log('  ✓  Task 2 — Nightly Forecaster  →  daily    @ 02:15 AM  (15 2 * * *)');
    console.log('  ✓  Task 3 — Weekly Financial    →  Sundays  @ 11:59 PM  (59 23 * * 0)');
};
