/**
 * ============================================================
 * TriSync — Gemini AI Co-Pilot Service (Humanized Consultant)
 * services/geminiService.js
 * ============================================================
 */

'use strict';

const { GoogleGenAI } = require('@google/genai');

if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  [GeminiService] GEMINI_API_KEY is not set.');
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
const MODEL = 'gemini-2.5-flash';

async function callGemini(prompt) {
    if (!process.env.GEMINI_API_KEY) return null;
    try {
        const response = await ai.models.generateContent({
            model: MODEL,
            contents: prompt,
        });
        const text = response?.text ?? null;
        return typeof text === 'string' && text.trim().length > 0 ? text.trim() : null;
    } catch (err) {
        console.error('🚨 [GeminiService] API call failed:', err.message);
        return null;
    }
}

function buildIngredientProfile(item) {
    const ewma = item.ewma_analysis || {};
    const proc = item.procurement   || {};
    const ph   = item.prediction_horizons || {};
    const dow  = Array.isArray(item.dow_surge_profile) ? item.dow_surge_profile : [];

    const ewma7d    = ewma.ewma_7d ?? 0;
    const ewma30d   = ewma.ewma_30d ?? 0;
    const momentum  = ewma.momentum_velocity ?? 0;
    const burnRate  = ewma.weighted_burn_rate ?? item.daily_burn_rate ?? 0;

    const h7Demand  = ph.h7?.predicted_demand ?? 0;
    const stockoutDay7 = ph.h7?.projected_stockout_day;

    const surgeDayLines = (item.surge_days || [])
        .map(dayName => {
            const profile = dow.find(d => d.name === dayName);
            return profile ? `${dayName} (${((profile.surge_index - 1) * 100).toFixed(0)}% spike)` : dayName;
        }).join(', ') || 'None';

    return (
        `[Ingredient: ${item.item_name}] | Status: ${item.status.toUpperCase()} | Stock: ${item.current_stock} ${item.unit}\n` +
        `Current Burn Rate: ${burnRate.toFixed(2)}/day (7-day trend: ${ewma7d.toFixed(2)}, 30-day baseline: ${ewma30d.toFixed(2)})\n` +
        `Demand Momentum: ${(momentum * 100).toFixed(1)}%\n` +
        `Weekend Surge Risk: ${item.weekend_surge_risk ? 'YES' : 'NO'} | Surge Days: ${surgeDayLines}\n` +
        `Projected 7-Day Demand: ${h7Demand.toFixed(2)} | Stockout Expected: ${stockoutDay7 ? 'Day ' + stockoutDay7 : 'Not this week'}\n` +
        `Recommended Order: ${(proc.recommended_order_qty ?? item.recommended_order ?? 0).toFixed(2)} ${item.unit}\n`
    );
}

// ── EXPORT 1: generateForecasterAlert (Humanized) ──────────────────────────────
async function generateForecasterAlert(inventoryData) {
    const urgentItems = (inventoryData?.data ?? []).filter(item => item.status === 'critical' || item.status === 'warning');
    if (urgentItems.length === 0) return null;

    const criticalCount = urgentItems.filter(i => i.status === 'critical').length;
    const warningCount  = urgentItems.filter(i => i.status === 'warning').length;
    const ingredientProfiles = urgentItems.map(item => buildIngredientProfile(item)).join('\n');

    const prompt =
        `You are the TriSync Supply Chain Director writing an executive email to the business owner. ` +
        `You just analyzed 180 days of historical data using an AI Exponentially Weighted Moving Average (EWMA) model. ` +
        `Your tone must be highly professional, strategic, and conversational. DO NOT sound like a robot dumping raw data. ` +
        `Translate the math into clear business insights.\n\n` +
        
        `Structure the email EXACTLY with these sections (Use plain text, NO asterisks, NO markdown):\n\n` +
        
        `EXECUTIVE SUMMARY:\n` +
        `Write a warm but urgent 2-sentence opening. Mention that the AI analyzed the latest data and found ${criticalCount} critical items and ${warningCount} items at risk of running out soon.\n\n` +
        
        `STRATEGIC INVENTORY INSIGHTS:\n` +
        `Review the data below. Pick the 2 or 3 most important items to talk about. Explain *why* they are running out naturally. ` +
        `For example, instead of saying "Momentum is +22% and Saturday surge is 45%", say: ` +
        `"We are seeing a 22% upward trend in Tapioca Pearls. Combined with our usual Saturday rush, our current stock won't survive the weekend."\n\n` +
        
        `PROCUREMENT ACTION PLAN:\n` +
        `List the exact items that need to be ordered and the exact Recommended Order quantity provided in the data. ` +
        `Keep it clean and easy for the owner to read so they can just approve the purchase.\n\n` +

        `DATA TO ANALYZE:\n${ingredientProfiles}`;

    return await callGemini(prompt);
}

// ── EXPORT 2: generateFinancialSummary (Humanized) ────────────────────────────
async function generateFinancialSummary(financialData) {
    if (!financialData) return null;

    const metricsDigest = JSON.stringify({
        period: financialData.timeframe_label,
        current: financialData.current_period,
        past: financialData.past_period,
        changes: financialData.percentage_changes,
    }, null, 2);

    const prompt =
        `You are the TriSync Chief Financial Officer (CFO) writing a weekly financial update to the business owner. ` +
        `Your tone should be professional, encouraging, and advisory. Speak to the owner like a trusted business partner.\n\n` +
        `Structure your response EXACTLY with these sections (Use plain text, NO asterisks, NO markdown):\n\n` +
        
        `FINANCIAL OVERVIEW:\n` +
        `Summarize the Net Profit and Gross Sales in 2-3 sentences. Celebrate growth or gently explain dips.\n\n` +
        
        `MARGIN HEALTH:\n` +
        `Calculate the Food Cost Margin (COGS / Gross Sales). Explain in plain English if the spending on ingredients is efficient (healthy is 30-35%).\n\n` +
        
        `CASH LEAKS & EXPENSES:\n` +
        `Mention the store expenses and any Z-Reading cash variances. Tell the owner if this is a normal cost of doing business or a red flag.\n\n` +
        
        `CFO RECOMMENDATION:\n` +
        `Give one friendly, highly strategic piece of advice for the upcoming week based on these numbers.\n\n` +
        `DATA:\n${metricsDigest}`;

    return await callGemini(prompt);
}

// ── EXPORT 3: generateAuditorAlert (Humanized) ────────────────────────────────
async function generateAuditorAlert(auditorData) {
    if (auditorData.total_voids === 0 && auditorData.total_variance_loss === 0) return null;

    const prompt =
        `You are the TriSync Loss Prevention Manager writing a security brief to the business owner. ` +
        `Be respectful but firm. You are reporting suspicious cashier activity from yesterday.\n\n` +
        `Data: Total Voids: ${auditorData.total_voids}. Cash Variance (Missing): ₱${auditorData.total_variance_loss}.\n` +
        `Details: ${JSON.stringify(auditorData.voided_items)}\n\n` +
        `Rules (Plain text only, NO markdown):\n` +
        `Write a short, professional paragraph summarizing the total voids and missing cash. ` +
        `Then, give a clear recommendation on what the owner should do today (e.g., review CCTV at a specific time, talk to the staff on duty).`;

    return await callGemini(prompt);
}

module.exports = { generateForecasterAlert, generateFinancialSummary, generateAuditorAlert };
