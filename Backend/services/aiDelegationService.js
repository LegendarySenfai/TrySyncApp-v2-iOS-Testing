/**
 * ============================================================
 * DuoSync AI Delegation Service
 * services/aiDelegationService.js
 *
 * MOUNT IN server.js (one line, before app.listen):
 *   app.use('/api/ai', require('./services/aiDelegationService')(db, __dirname));
 *
 * REQUIRES: npm install pdfkit
 *
 * Routes:
 *   GET  /api/ai/staff-eligible
 *   POST /api/ai/delegate-restock
 *   GET  /api/ai/mobile-tasks/:username
 *
 * ISOLATION: reads users, staff_tasks tables only.
 *            writes to staff_tasks and /uploads folder.
 *            zero touch on any existing route.
 * ============================================================
 */

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const PDFDocument = require('pdfkit');

// ── Brand constants ──────────────────────────────────────────
const BRAND_DARK  = '#0f172a';
const BRAND_BLUE  = '#3b82f6';
const BRAND_GREEN = '#16a34a';
const BRAND_GRAY  = '#64748b';
const BRAND_LIGHT = '#f8fafc';
const BRAND_LINE  = '#e2e8f0';

// ── Helpers ──────────────────────────────────────────────────
const peso    = (n) => `P${parseFloat(n || 0).toFixed(2)}`;
const pad     = (n) => String(n).padStart(2, '0');
const stamp   = () => {
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
};
const dateStr = () => new Date().toLocaleDateString('en-PH', {
    year:'numeric', month:'long', day:'numeric'
});

// ── PDF Generator ─────────────────────────────────────────────
function generateRestockPDF(items, assignedTo, uploadsDir) {
    return new Promise((resolve, reject) => {
        const filename  = `Restock_Order_${stamp()}.pdf`;
        const filepath  = path.join(uploadsDir, filename);
        const doc       = new PDFDocument({ margin: 50, size: 'A4' });
        const stream    = fs.createWriteStream(filepath);

        doc.pipe(stream);

        // ── Header bar ──────────────────────────────────────
        doc.rect(0, 0, doc.page.width, 90).fill(BRAND_DARK);

        doc.fillColor('white')
           .fontSize(22)
           .font('Helvetica-Bold')
           .text('DuoSync POS System', 50, 22);

        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#94a3b8')
           .text('AI-Generated Restock Delegation Order', 50, 50);

        doc.fillColor('white')
           .fontSize(9)
           .text(`Generated: ${dateStr()}`, doc.page.width - 200, 50, { width: 150, align: 'right' });

        // ── Meta block ───────────────────────────────────────
        doc.moveDown(3);

        doc.roundedRect(50, doc.y, doc.page.width - 100, 62, 6)
           .fill(BRAND_LIGHT);

        const metaY = doc.y + 0;
        doc.fillColor(BRAND_DARK)
           .fontSize(11)
           .font('Helvetica-Bold')
           .text('Assigned To:', 70, metaY + 12);

        doc.fillColor(BRAND_BLUE)
           .font('Helvetica')
           .text(assignedTo, 180, metaY + 12);

        doc.fillColor(BRAND_DARK)
           .font('Helvetica-Bold')
           .text('Order Date:', 70, metaY + 34);

        doc.fillColor(BRAND_GRAY)
           .font('Helvetica')
           .text(dateStr(), 180, metaY + 34);

        doc.moveDown(4.2);

        // ── Section title ────────────────────────────────────
        doc.fillColor(BRAND_DARK)
           .font('Helvetica-Bold')
           .fontSize(13)
           .text('Items Required for Restocking', 50, doc.y);

        doc.moveDown(0.5);

        // ── Table header ─────────────────────────────────────
        const tableTop    = doc.y;
        const colX        = { name: 50, stock: 260, burn: 360, order: 460 };
        const headerH     = 28;

        doc.rect(50, tableTop, doc.page.width - 100, headerH)
           .fill(BRAND_DARK);

        doc.fillColor('white')
           .fontSize(9)
           .font('Helvetica-Bold');

        doc.text('INGREDIENT NAME',  colX.name  + 6, tableTop + 9);
        doc.text('CURRENT STOCK',    colX.stock  + 6, tableTop + 9);
        doc.text('DAILY BURN',       colX.burn   + 6, tableTop + 9);
        doc.text('ORDER QTY (7-Day)', colX.order + 6, tableTop + 9);

        // ── Table rows ───────────────────────────────────────
        let rowY = tableTop + headerH;

        items.forEach((item, idx) => {
            const isEven  = idx % 2 === 0;
            const rowH    = 26;
            const stock   = parseFloat(item.current_stock)   || 0;
            const burn    = parseFloat(item.daily_burn_rate)  || 0;
            const orderQty = Math.max(0, (burn * 7) - stock);

            // Row background
            doc.rect(50, rowY, doc.page.width - 100, rowH)
               .fill(isEven ? '#f8fafc' : 'white');

            // Left border accent for critical items
            if (item.status === 'critical') {
                doc.rect(50, rowY, 4, rowH).fill('#ef4444');
            } else if (item.status === 'warning') {
                doc.rect(50, rowY, 4, rowH).fill('#f59e0b');
            }

            doc.fillColor(BRAND_DARK)
               .fontSize(9)
               .font('Helvetica');

            doc.text(item.item_name || '—',
                colX.name  + 10, rowY + 8, { width: 195, ellipsis: true });
            doc.text(`${stock.toFixed(1)} ${item.unit || ''}`,
                colX.stock  + 6, rowY + 8, { width: 90 });
            doc.text(`${burn.toFixed(2)} / day`,
                colX.burn   + 6, rowY + 8, { width: 90 });

            // Highlight the order qty
            doc.fillColor(orderQty > 0 ? BRAND_BLUE : BRAND_GRAY)
               .font('Helvetica-Bold')
               .text(`${orderQty.toFixed(1)} ${item.unit || ''}`,
                colX.order + 6, rowY + 8, { width: 100 });

            // Row bottom border
            doc.moveTo(50, rowY + rowH)
               .lineTo(doc.page.width - 50, rowY + rowH)
               .strokeColor(BRAND_LINE)
               .lineWidth(0.5)
               .stroke();

            rowY += rowH;

            // Page break guard
            if (rowY > doc.page.height - 100) {
                doc.addPage();
                rowY = 50;
            }
        });

        // ── Legend ───────────────────────────────────────────
        doc.moveDown(1.5);
        doc.rect(50, doc.y, doc.page.width - 100, 44).fill('#fefce8');

        const legY = doc.y;
        doc.fillColor('#92400e').fontSize(8).font('Helvetica-Bold')
           .text('Legend:', 60, legY + 6);

        doc.rect(100, legY + 7, 8, 8).fill('#ef4444');
        doc.fillColor(BRAND_DARK).font('Helvetica')
           .text('Critical (≤3 days)', 112, legY + 6);

        doc.rect(220, legY + 7, 8, 8).fill('#f59e0b');
        doc.text('Warning (≤7 days)', 232, legY + 6);

        doc.fillColor(BRAND_GRAY).fontSize(7)
           .text('Order Qty = (Daily Burn × 7) − Current Stock. Negative values mean no reorder needed.',
               60, legY + 24, { width: doc.page.width - 120 });

        // ── Footer ───────────────────────────────────────────
        doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill(BRAND_DARK);
        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
           .text(
               `DuoSync POS — AI Delegation Order | Confidential | ${new Date().toISOString()}`,
               50,
               doc.page.height - 26,
               { align: 'center', width: doc.page.width - 100 }
           );

        doc.end();

        stream.on('finish', () => resolve(filename));
        stream.on('error',  reject);
    });
}

// ── Router factory ────────────────────────────────────────────
module.exports = function createAiDelegationRouter(db, appRoot) {

    const router     = express.Router();
    const uploadsDir = path.join(appRoot, 'uploads');

    // ── Ensure uploads dir exists ────────────────────────────
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // ── GET /api/ai/staff-eligible ───────────────────────────
    // Returns active staff who have inventory_access = 1
    router.get('/staff-eligible', async (req, res) => {
        try {
            const [rows] = await db.promise().query(
                `SELECT id, username, role
                 FROM   users
                 WHERE  inventory_access = 1
                   AND  is_verified      = 1
                   AND  role            != 'admin'
                 ORDER BY username ASC`
            );
            res.json(rows);
        } catch (err) {
            console.error('[Delegation] staff-eligible error:', err.message);
            res.status(500).json({ error: 'Failed to fetch eligible staff.' });
        }
    });

    // ── POST /api/ai/delegate-restock ────────────────────────
    // Body: { items: [...], assigned_to: 'username' }
    // items shape: { item_name, current_stock, daily_burn_rate, days_remaining, status, unit }
    router.post('/delegate-restock', async (req, res) => {
        const { items, assigned_to } = req.body;

        // ── Validation ───────────────────────────────────────
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items array is required and must not be empty.' });
        }
        if (!assigned_to || typeof assigned_to !== 'string' || !assigned_to.trim()) {
            return res.status(400).json({ error: 'assigned_to username is required.' });
        }

        // Filter to only items that actually need restocking
        const itemsToOrder = items.filter(item => {
            const burn  = parseFloat(item.daily_burn_rate) || 0;
            const stock = parseFloat(item.current_stock)   || 0;
            return burn > 0 && (burn * 7) > stock;
        });

        if (itemsToOrder.length === 0) {
            return res.status(400).json({
                error: 'No items require restocking at this time.',
                note:  'All items have sufficient stock for 7+ days.'
            });
        }

        try {
            // 1. Generate PDF
            const filename = await generateRestockPDF(
                itemsToOrder,
                assigned_to.trim(),
                uploadsDir
            );

            // 2. Build the public URL
            //    Mirrors the existing /uploads static route in server.js
            const pdfUrl = `/uploads/${filename}`;

            // 3. Insert into staff_tasks (NOW WITH ITEMS_PAYLOAD)
            await db.promise().query(
                `INSERT INTO staff_tasks
                    (task_type, status, assigned_to, pdf_file_url, items_payload)
                 VALUES ('restock', 'pending', ?, ?, ?)`,
                [assigned_to.trim(), pdfUrl, JSON.stringify(itemsToOrder)]
            );

            res.json({
                message:      `Restock order successfully delegated to ${assigned_to}.`,
                assigned_to:  assigned_to.trim(),
                pdf_url:      pdfUrl,
                items_count:  itemsToOrder.length,
            });
        } catch (err) {
            console.error('[Delegation] delegate-restock error:', err.message);
            res.status(500).json({ error: 'Failed to generate or save restock order.' });
        }
    });

    // ── GET /api/ai/mobile-tasks/:username ───────────────────
    // Returns pending tasks for a specific staff member
    router.get('/mobile-tasks/:username', async (req, res) => {
        const { username } = req.params;
        if (!username) {
            return res.status(400).json({ error: 'Username is required.' });
        }
        try {
            const [rows] = await db.promise().query(
                `SELECT id, task_type, status, assigned_to, pdf_file_url, items_payload, created_at
                 FROM   staff_tasks
                 WHERE  assigned_to = ?
                   AND  status      = 'pending'
                 ORDER BY created_at DESC`,
                [username]
            );
            res.json(rows);
        } catch (err) {
            console.error('[Delegation] mobile-tasks error:', err.message);
            res.status(500).json({ error: 'Failed to fetch tasks.' });
        }
    });

    // ── POST /api/ai/complete-task/:id ───────────────────────
    // Mobile: mark a task as completed after staff views the PDF
    router.post('/complete-task/:id', async (req, res) => {
        const { id } = req.params;
        try {
            await db.promise().query(
                "UPDATE staff_tasks SET status = 'completed' WHERE id = ?",
                [id]
            );
            res.json({ message: 'Task marked as completed.' });
        } catch (err) {
            console.error('[Delegation] complete-task error:', err.message);
            res.status(500).json({ error: 'Failed to update task.' });
        }
    });

    return router;
};
