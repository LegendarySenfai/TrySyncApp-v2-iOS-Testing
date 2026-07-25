require('dotenv').config();
const pool = require('./config/db');

async function simulateRealWorldData() {
    const db = pool.promise();

    console.log('🧹 1. Wiping bypassed for safety...');
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    // await db.query('TRUNCATE TABLE sales_log');
    // await db.query('TRUNCATE TABLE store_expenses'); 
    // await db.query('TRUNCATE TABLE shift_audits');
    // await db.query('TRUNCATE TABLE staff_tasks');
    // await db.query('TRUNCATE TABLE ai_insights');
    await db.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('📦 2. Fetching real products from your database...');
    const [products] = await db.query('SELECT id, product_name, base_price, category FROM products WHERE is_active = 1');

    if (products.length === 0) {
        console.log('🚨 Error: No real products found. Please add products in the system first.');
        process.exit();
    }

    const daysToSimulate = 180; 
    let totalSales = 0;
    let totalVoids = 0;

    console.log(`🚀 3. Injecting 6 months of transactions (Matched exactly to UniversalPOS.js)...`);

    for (let i = daysToSimulate; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        
        const isWeekend = (date.getDay() === 0 || date.getDay() === 6);
        const baseTransactions = isWeekend ? 25 : 15;
        const transactionsToday = Math.floor(Math.random() * 10) + baseTransactions; 

        for (let j = 0; j < transactionsToday; j++) {
            const cartItems = [];
            let totalAmount = 0;
            let totalCogs = 0;
            const itemsInCart = Math.floor(Math.random() * 2) + 1; 

            let receiptCategory = 'milktea'; 

            for (let k = 0; k < itemsInCart; k++) {
                const product = products[Math.floor(Math.random() * products.length)];
                const qty = Math.floor(Math.random() * 2) + 1; 
                const price = parseFloat(product.base_price);
                
                // 🚨 CRITICAL FIX: The keys here NOW exactly match UniversalPOS.js 🚨
                cartItems.push({
                    product_id: product.id,
                    item_name: product.product_name, // Fixed: Your server looks for 'item_name'
                    base_price: price,               // Fixed: Your POS uses 'base_price'
                    qty: qty,
                    modifiers: [],                   // Fixed: Matches real POS data structure
                    size: 'Regular'
                });

                totalAmount += (price * qty);
                
                const itemCogs = (price * qty) * (Math.random() * (0.38 - 0.30) + 0.30);
                totalCogs += itemCogs;
                receiptCategory = product.category || 'milktea';
            }

            date.setHours(Math.floor(Math.random() * 10) + 10); 
            date.setMinutes(Math.floor(Math.random() * 60));
            date.setSeconds(Math.floor(Math.random() * 60));
            const timestamp = date.toISOString().slice(0, 19).replace('T', ' ');

            const detailsJson = JSON.stringify({ items: cartItems, discount: 0 });
            
            const isVoided = Math.random() < 0.02 ? 1 : 0;
            if (isVoided) totalVoids++;

            await db.query(
                `INSERT INTO sales_log (category, amount, details, timestamp, total_cogs, is_voided, payment_method) 
                 VALUES (?, ?, ?, ?, ?, ?, 'cash')`,
                [receiptCategory, totalAmount, detailsJson, timestamp, totalCogs, isVoided]
            );
            totalSales++;
        }
    }

    console.log(`\n✅ SUCCESS! Enterprise Simulation Complete.`);
    console.log(`📊 Injected ${totalSales} Highly Realistic Receipts.`);
    console.log(`🗑️  Injected ${totalVoids} Voided Transactions.`);
    console.log(`\nYour Dashboard Top Sellers and Transaction History will now perfectly display product names.`);
    
    process.exit();
}

simulateRealWorldData();
