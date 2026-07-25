require('dotenv').config();
const pool = require('./config/db');
const nodemailer = require('nodemailer');
const { runForecaster } = require('./services/aiForecasterService');
const { runFinancial  } = require('./services/aiFinancialService');
const { runAuditor    } = require('./services/aiAuditorService');
const { generateForecasterAlert, generateFinancialSummary, generateAuditorAlert } = require('./services/geminiService');

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
        icon:         '📦',
        badge:        'Supply Chain Intelligence',
        headline:     'Inventory Analysis Ready',
        body:         'Your AI-powered supply chain engine has completed its burn rate analysis. Upcoming restock requirements and demand forecasts are ready for review.',
        accentColor:  '#1d4ed8',
        accentLight:  '#dbeafe',
    },
    financial: {
        icon:         '📊',
        badge:        'CFO Financial Report',
        headline:     'Executive Financial Briefing Ready',
        body:         'Your weekly financial analysis has been completed. Revenue trends, margin analysis, and expense breakdowns are ready in the dashboard.',
        accentColor:  '#7c3aed',
        accentLight:  '#ede9fe',
    },
    auditor: {
        icon:         '🛡️',
        badge:        'Loss Prevention Audit',
        headline:     'Nightly Security Audit Complete',
        body:         'The nightly loss prevention audit has finished running. Variance analysis and anomaly detection results are available for your review.',
        accentColor:  '#dc2626',
        accentLight:  '#fee2e2',
    },
};

/**
 * sendEmailAlert — sends a sleek, generalized HTML notification email.
 *
 * @param {string} subject    Email subject line suffix (used in <title> and preview)
 * @param {string} _text      [IGNORED] Raw AI-generated text — kept for API compatibility only
 * @param {object} opts       Optional metadata: { reportType, itemCount }
 *   reportType  'forecaster' | 'financial' | 'auditor'
 *   itemCount   Number of items that require attention (shows a badge if > 0)
 */
async function sendEmailAlert(subject, _text, opts = {}) {
    if (!process.env.ADMIN_EMAIL) {
        return console.log("⚠️ No ADMIN_EMAIL set. Skipping email.");
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
               <div style="display:inline-block;background:${cfg.accentLight};color:${cfg.accentColor};border:1.5px solid ${cfg.accentColor};border-radius:8px;padding:12px 24px;font-size:14px;font-weight:700;line-height:1.4;">
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
            from:    `"DuoSync AI" <${process.env.EMAIL_USER}>`,
            to:      process.env.ADMIN_EMAIL,
            subject: `🤖 DuoSync: ${subject}`,
            html:    htmlTemplate,
        });
        console.log(`✉️  Email sent: [${subject}]`);
    } catch (error) {
        console.error('🚨 Email failed to send:', error);
    }
}

// ── Main runner ───────────────────────────────────────────────────────────────
async function forceAILive() {
    const db = pool;

    console.log('🤖 Forcing all DuoSync AI Engines to run LIVE...\n');

    try {
        // ── 1. Forecaster ──────────────────────────────────────────────────────
        console.log('1️⃣  Running AI Forecaster...');
        const inventoryData  = await runForecaster(db, { days: 30 });
        const forecastText   = await generateForecasterAlert(inventoryData);
        if (forecastText) {
            await db.promise().query(
                `INSERT INTO ai_insights (insight_type, report_text) VALUES (?, ?)`,
                ['forecaster', forecastText]
            );
            const urgentCount = (inventoryData?.summary?.critical || 0)
                              + (inventoryData?.summary?.warning  || 0);
            await sendEmailAlert(
                'Urgent: Restock Required',
                forecastText,
                { reportType: 'forecaster', itemCount: urgentCount }
            );
        }

        // ── 2. Financial CFO ───────────────────────────────────────────────────
        console.log('2️⃣  Running AI Financial CFO...');
        const financialData  = await runFinancial(db);
        const financialText  = await generateFinancialSummary(financialData);
        if (financialText) {
            await db.promise().query(
                `INSERT INTO ai_insights (insight_type, report_text) VALUES (?, ?)`,
                ['financial', financialText]
            );
            await sendEmailAlert(
                'Weekly Executive Financial Briefing',
                financialText,
                { reportType: 'financial' }
            );
        }

        // ── 3. Auditor ─────────────────────────────────────────────────────────
        console.log('3️⃣  Running AI Nightly Auditor (Loss Prevention)...');
        const auditorData    = await runAuditor(db);
        const auditorText    = await generateAuditorAlert(auditorData);
        if (auditorText) {
            await db.promise().query(
                `INSERT INTO ai_insights (insight_type, report_text) VALUES (?, ?)`,
                ['auditor', auditorText]
            );
            await sendEmailAlert(
                'Security Alert: Loss Prevention',
                auditorText,
                { reportType: 'auditor' }
            );
        }

        console.log('\n✅ SUCCESS! All AI analyses complete, saved, and emailed.');
    } catch (error) {
        console.error('\n🚨 Error running AI:', error);
    } finally {
        if (db && db.end) db.end(() => process.exit(0));
        else process.exit(0);
    }
}

forceAILive();
