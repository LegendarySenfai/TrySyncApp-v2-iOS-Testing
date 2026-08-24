require('dotenv').config({ override: true }); // 1. Load .env first

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

// 2. Import Multer & Cloudinary
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// 3. JWT Secret Validation
if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET is not set. Refusing to start with a hardcoded fallback secret.');
    console.error('   Set JWT_SECRET in your .env (local) or Render dashboard (deployed).');
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// 4. Local Disk Storage Setup (for Existing Images & PDF Orders)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
    console.log("🛠️ Created missing uploads directory");
}

const localDiskStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); 
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); 
    }
});
const upload = multer({ storage: localDiskStorage });

console.log("Cloudinary Check:", process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY ? "KEY_EXISTS" : "KEY_MISSING");

// 5. Cloudinary Storage Setup (for New Admin Product Uploads)
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const productCloudStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'duosync_products',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'avif'],
    },
});
const uploadProductImage = multer({ storage: productCloudStorage });

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "Unauthorized: Token missing" });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Forbidden: Invalid token" });
        
        // Ensure user hasn't been deactivated since the token was issued
        db.query("SELECT is_verified FROM users WHERE username = ?", [user.username], (dbErr, data) => {
            if (dbErr || data.length === 0 || data[0].is_verified === 0) {
                return res.status(403).json({ message: "Forbidden: Account deactivated." });
            }
            req.user = user;
            next();
        });
    });
};

const app = express();
app.set('trust proxy', 1);

app.use(express.json());
app.use(cors({
    origin: [
        "http://localhost:5173", 
        "http://localhost:8081", 
        "http://localhost:5000", 
        "https://try-sync-app-v2.vercel.app"
    ], 
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));
app.use(bodyParser.json());
app.use('/uploads', express.static(uploadDir));

// --- RATE LIMITING ---
// Stricter limiter for endpoints that send real emails (registration OTP,
// login OTP, password-reset OTP). This is the endpoint category most
// likely to look like "abuse traffic" to a host like Render if it's
// ever hit in a loop — by a bot, a bug, or a teammate's retry logic.
const otpEmailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,                    // 5 email-sending attempts per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests. Please wait a few minutes and try again." }
});

// Looser limiter for verify/check endpoints — no email cost, but still
// worth capping so a script can't hammer OTP verification or login.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many attempts. Please wait a few minutes and try again." }
});



// --- IN-MEMORY STORAGE ---
const tempRegistrationStore = {}; 
const loginOtpStore = {};

// --- SECURITY: RATE LIMITING STORE (GLOBAL SCOPE) ---
const loginAttempts = {}; 
const MAX_ATTEMPTS = 3;
const LOCKOUT_TIME = 30 * 60 * 1000;  // 30 minutes — failed login lockout
const OTP_EXPIRY   = 5 * 60 * 1000;   // 5 minutes — OTP validity

// --- DATABASE CONNECTION ---
// Single shared pool — see config/db.js. simulateData.js and triggerAI.js
// use the same module so credentials and connection settings can't drift.
const db = require('./config/db');

// --- EMAIL CONFIG ---
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ EMAIL_USER / EMAIL_PASS are not set. Refusing to start with hardcoded email credentials.');
    console.error('   Set these in your .env (local) or Render dashboard (deployed).');
    process.exit(1);
}
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const logActivity = (username, action, details) => {
    const sql = "INSERT INTO activity_logs (username, action, details) VALUES (?, ?, ?)";
    db.query(sql, [username || 'System', action, details], (err) => {
        if (err) console.error("Logging failed:", err);
    });
};

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
// --- HEALTH CHECK (Keeps Render Awake) ---
app.get('/ping', (req, res) => res.status(200).send('Server is awake!'));

// --- ROUTES ---

// 1. REGISTER (Now accepts names & dynamic emails)
app.post('/register', otpEmailLimiter, async (req, res) => {
    const { first_name, last_name, username, password, role, email } = req.body;
    
    // VALIDATION: Ensure required fields exist
    if (!first_name || !last_name || !email) {
        return res.status(400).json({ message: "First name, last name, and email are required." });
    }

    if (password.length < 5 || password.length > 16) {
        return res.status(400).json({ message: "Password must be 5-16 characters." });
    }

    // VALIDATION: Basic email format check (Allows @gmail.com, @yahoo.com, etc.)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format." });
    }

    const checkSql = "SELECT * FROM users WHERE username = ? OR email = ?";
    db.query(checkSql, [username, email], async (err, data) => {
        if (data.length > 0) return res.status(400).json({ message: "Username or Email already exists!" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const userOtp = generateOTP();

        // Store new data in memory temporarily
        tempRegistrationStore[username] = {
            otp: userOtp,
            password_hash: hashedPassword,
            role: role,
            email: email,
            first_name: first_name,
            last_name: last_name
        };

        // SEND TO THE INPUTTED EMAIL (Req #4)
        const mailOptions = {
            from: '"DuoSync Security" <skustateethclinic@gmail.com>',
            to: email, // <--- Now sends directly to the user's email
            subject: `🔐 Your DuoSync Registration Code`,
            html: `
            <div style="font-family: Arial, sans-serif; background-color: #f1f5f9; padding: 40px 20px;">
                <table width="100%" style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-collapse: collapse;">
                    <tr><td style="background: linear-gradient(135deg, #0f172a, #1e3a5f); padding: 30px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 1px;">DuoSync</h1></td></tr>
                    <tr>
                        <td style="padding: 40px 30px; text-align: center; color: #334155;">
                            <h2 style="margin-top:0; color:#0f172a;">Account Registration</h2>
                            <p style="font-size: 15px; margin-bottom: 25px;">Hello ${first_name}, your DuoSync account verification code is:</p>
                            <div style="font-size: 32px; font-weight: bold; color: #3b82f6; letter-spacing: 5px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px dashed #cbd5e1; display: inline-block; margin-bottom: 25px;">${userOtp}</div>
                            <p style="font-size: 13px; color: #64748b; margin: 0;">Please enter this on the admin screen to finalize your registration.</p>
                        </td>
                    </tr>
                </table>
            </div>`
        };

        transporter.sendMail(mailOptions, (error) => {
            if (error) console.log('SMTP Error:', error);
        });

        console.log(`🔐 REGISTRATION OTP for ${username} sent to ${email}: ${userOtp}`); 
        return res.json({ message: "Verification OTP sent to the provided email." });
    });
});

// 2. VERIFY REGISTER (Now saves names & email to DB)
app.post('/verify-register', authLimiter, (req, res) => {
    const { username, otp } = req.body;
    const pendingUser = tempRegistrationStore[username];

    if (!pendingUser) return res.status(400).json({ message: "No pending registration found or session expired." });
    if (pendingUser.otp !== otp) return res.status(400).json({ message: "Invalid OTP Code." });

    // Insert all the new data into the database
    const sql = "INSERT INTO users (`username`, `password_hash`, `role`, `first_name`, `last_name`, `email`, `is_verified`) VALUES (?, ?, ?, ?, ?, ?, 1)";
    db.query(sql, [username, pendingUser.password_hash, pendingUser.role, pendingUser.first_name, pendingUser.last_name, pendingUser.email], (err, result) => {
        if (err) return res.status(500).json({ message: "Database Insertion Failed", error: err });
        
        delete tempRegistrationStore[username]; 
        logActivity('Admin', 'USER_VERIFY', `Verified and Created user ${username} (${pendingUser.role})`);
        return res.json({ message: "Account Verified & Created Successfully!" });
    });
});

// PHASE 2 — ADMIN: CREATE STAFF ACCOUNT (Activation Link Flow)
// Called by CreateAccountAdmin.jsx — does NOT touch /register or /verify-register
app.post('/admin/create-account', authenticateToken, async (req, res) => {
    const { first_name, last_name, username, email, role } = req.body;
 
    // ── Validation ──────────────────────────────────────────
    if (!first_name || !last_name || !username || !email || !role) {
        return res.status(400).json({ message: "All fields are required." });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format." });
    }
 
    // ── Check for duplicates ─────────────────────────────────
    db.query("SELECT id FROM users WHERE username = ? OR email = ?", [username, email], async (err, data) => {
        if (err) return res.status(500).json({ message: "Database error." });
        if (data.length > 0) {
            return res.status(400).json({ message: "Username or Email already exists." });
        }
 
        // ── Generate a dummy hashed password and secure token ─
        const dummyHash       = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        const activationToken = crypto.randomBytes(48).toString('hex'); // 96-char hex token
 
        // ── Insert user as PENDING (is_verified = 0) ─────────
        const inventoryAccessVal = req.body.inventory_access ? 1 : 0;
        const insertSql = `
            INSERT INTO users 
                (first_name, last_name, username, email, password_hash, role, is_verified, activation_token, inventory_access) 
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
        `;
        db.query(insertSql, [first_name, last_name, username, email, dummyHash, role, activationToken, inventoryAccessVal], (insertErr) => {
            if (insertErr) {
                console.error("Insert Error:", insertErr);
                return res.status(500).json({ message: "Failed to create account.", error: insertErr });
            }
 
            // ── Build activation URL ──────────────────────────
            const frontendUrl    = process.env.FRONTEND_URL || 'http://localhost:5173';
            const activationLink = `${frontendUrl}/activate/${activationToken}`;
 
            // ── Send professional HTML activation email ───────
            const roleLabel = {
                milktea_staff: 'Milktea Staff',
                laundry_staff: 'Laundry Staff',
                admin:         'Administrator',
            }[role] || role;
 
            const mailOptions = {
                from: '"DuoSync System" <skustateethclinic@gmail.com>',
                to: email,
                subject: `🎉 Welcome to DuoSync — Activate Your Account`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Activate Your DuoSync Account</title>
                    </head>
                    <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
                        <tr><td align="center">
                        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
                    
                            <!-- Header -->
                            <tr>
                            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:36px 40px;text-align:center;">
                                <div style="font-size:32px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">DuoSync</div>
                                <div style="font-size:13px;color:#94a3b8;margin-top:4px;text-transform:uppercase;letter-spacing:2px;">The Meet Up Hub &bull; POS System</div>
                            </td>
                            </tr>
                    
                            <!-- Body -->
                            <tr>
                            <td style="padding:40px;">
                                <h2 style="color:#0f172a;margin:0 0 8px 0;font-size:22px;font-weight:800;">Welcome, ${first_name}! 👋</h2>
                                <p style="color:#64748b;font-size:15px;margin:0 0 24px 0;line-height:1.6;">
                                An administrator has created a <strong>DuoSync</strong> account for you. 
                                Your account role is <strong style="color:#3b82f6;">${roleLabel}</strong>.
                                </p>
                    
                                <!-- Info Card -->
                                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:28px;">
                                <table width="100%" cellpadding="6">
                                    <tr>
                                    <td style="font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;width:110px;">Username</td>
                                    <td style="font-size:14px;color:#0f172a;font-weight:700;">${username}</td>
                                    </tr>
                                    <tr>
                                    <td style="font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Role</td>
                                    <td style="font-size:14px;color:#0f172a;font-weight:700;">${roleLabel}</td>
                                    </tr>
                                    <tr>
                                    <td style="font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Email</td>
                                    <td style="font-size:14px;color:#0f172a;font-weight:700;">${email}</td>
                                    </tr>
                                </table>
                                </div>
                    
                                <p style="color:#475569;font-size:14px;margin:0 0 24px 0;line-height:1.6;">
                                To activate your account and set your own password, click the button below.
                                This link is <strong>unique to you</strong> and can only be used once.
                                </p>
                    
                                <!-- CTA Button -->
                                <div style="text-align:center;margin:28px 0;">
                                <a href="${activationLink}" 
                                    style="display:inline-block;background:linear-gradient(135deg,#1e293b 0%,#3b4f6b 100%);color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:10px;font-size:16px;font-weight:700;letter-spacing:0.3px;">
                                    ✅ Activate My Account
                                </a>
                                </div>
                    
                                <!-- Fallback link -->
                                <p style="color:#94a3b8;font-size:12px;text-align:center;margin:16px 0 0 0;line-height:1.6;">
                                Button not working? Copy and paste this link into your browser:<br>
                                <a href="${activationLink}" style="color:#3b82f6;word-break:break-all;">${activationLink}</a>
                                </p>
                            </td>
                            </tr>
                    
                            <!-- Footer -->
                            <tr>
                            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;text-align:center;">
                                <p style="color:#94a3b8;font-size:12px;margin:0;line-height:1.6;">
                                This email was sent automatically by DuoSync Admin System.<br>
                                If you did not expect this email, please contact your store administrator.
                                </p>
                            </td>
                            </tr>
                    
                        </table>
                        </td></tr>
                    </table>
                    </body>
                    </html>
                                    `,
            };
 
            transporter.sendMail(mailOptions, (mailErr) => {
                if (mailErr) console.error('Activation Email Error:', mailErr);
            });
 
            logActivity('Admin', 'CREATE_ACCOUNT', `Created pending account for ${username} (${role}) — activation email sent to ${email}`);
            return res.json({ message: `Account created. An activation email has been sent to ${email}.` });
        });
    });
});
 
 
// PHASE 2 — PUBLIC: ACTIVATE ACCOUNT (Staff clicks email link, sets their own password)
app.post('/activate', authLimiter, async (req, res) => {
    const { token, newPassword } = req.body;
 
    if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required." });
    }
    if (newPassword.length < 5 || newPassword.length > 16) {
        return res.status(400).json({ message: "Password must be 5–16 characters." });
    }
 
    // Find the user by their activation token
    db.query("SELECT id, username, first_name, role FROM users WHERE activation_token = ? AND is_verified = 0", [token], async (err, data) => {
        if (err) return res.status(500).json({ message: "Database error." });
        if (data.length === 0) {
            return res.status(400).json({ message: "Invalid or expired activation link. Please contact your administrator." });
        }
 
        const user = data[0];
        const hashedPassword = await bcrypt.hash(newPassword, 10);
 
        // Activate: set password, verify, clear token
        const updateSql = "UPDATE users SET password_hash = ?, is_verified = 1, activation_token = NULL WHERE id = ?";
        db.query(updateSql, [hashedPassword, user.id], (updateErr) => {
            if (updateErr) return res.status(500).json({ message: "Failed to activate account." });
 
            logActivity(user.username, 'ACCOUNT_ACTIVATED', `${user.username} (${user.role}) activated their account and set a password.`);
            return res.json({ message: "Account activated successfully! You can now log in." });
        });
    });
});


// 3. LOGIN (Fixed Lockout Logic)
app.post('/login', otpEmailLimiter, (req, res) => {
    const { username, password } = req.body;

    const ATTEMPT_EXPIRY = 15 * 60 * 1000; // 15-minute rolling window

    // A. CHECK LOCKOUT STATUS
    const userAttempt = loginAttempts[username];
    if (userAttempt && userAttempt.lockoutUntil > Date.now()) {
        const remainingMinutes = Math.ceil((userAttempt.lockoutUntil - Date.now()) / 60000);
        return res.status(403).json({ 
            message: `Account Locked. Try again in ${remainingMinutes} minutes.` 
        });
    }

    // B. RESET EXPIRED LOCKOUTS OR INACTIVE FAILED ATTEMPTS
    if (userAttempt) {
        if (userAttempt.lockoutUntil !== 0 && userAttempt.lockoutUntil <= Date.now()) {
            delete loginAttempts[username];
        } else if (userAttempt.lockoutUntil === 0 && userAttempt.lastAttempt && (Date.now() - userAttempt.lastAttempt > ATTEMPT_EXPIRY)) {
            delete loginAttempts[username];
        }
    }

    // C. NORMAL LOGIN PROCESS
        const sql = "SELECT * FROM users WHERE username = ?";
        db.query(sql, [username], async (err, data) => {
            if (err) {
                console.error("🚨 LOGIN DATABASE ERROR:", err); // <-- THIS PRINTS TO RENDER
                return res.status(500).json({ error: "Database query failed", details: err });
            }
        
        // Fail silently if user doesn't exist
        if (data.length === 0) return res.status(401).json({ message: "User not found" });

        if (data[0].is_verified === 0) return res.status(403).json({ message: "Account pending approval" });

        const user = data[0];
        let match = false;
        try { match = await bcrypt.compare(password, user.password_hash); } catch (e) { match = false; }
        if (!match && password === user.password_hash) match = true; 

        // D. HANDLE FAILED PASSWORD
        if (!match) {
            console.log(`❌ Login Failed for: ${username}`);
            
            // Increment or Initialize Attempts
            if (!loginAttempts[username]) {
                loginAttempts[username] = { attempts: 1, lockoutUntil: 0, lastAttempt: Date.now() };
            } else {
                loginAttempts[username].attempts += 1;
                loginAttempts[username].lastAttempt = Date.now();
            }

            const attempts = loginAttempts[username].attempts;
            const remaining = MAX_ATTEMPTS - attempts;

            if (attempts >= MAX_ATTEMPTS) {
                // Set Lockout Time
                loginAttempts[username].lockoutUntil = Date.now() + LOCKOUT_TIME;
                return res.status(403).json({ message: "Too many failed attempts. Account locked for 30 minutes." });
            }

            return res.status(401).json({ message: `Wrong credentials. ${remaining} attempts remaining.` });
        }

        // E. SUCCESS: RESET ATTEMPTS & SEND OTP
        // If password is correct, we clear the failure history
        if (loginAttempts[username]) delete loginAttempts[username];

        // --- 🚨 BOUNCER PATCH 🚨 ---
        if (req.body.source === 'web' && user.role !== 'admin') {
            return res.status(403).json({ 
                message: "Access Denied: The Web Portal is strictly for Administrators. Please use the DuoSync Mobile App." 
            });
        }
        // ---------------------------

        const loginOtp = generateOTP();
        const expiresAt = Date.now() + (30 * 60 * 1000); // OTP Expires in 30 mins

        loginOtpStore[username] = { 
            code: loginOtp, 
            role: user.role,
            inventory_access: user.inventory_access,
            expiresAt: expiresAt,
            attempts: 0 // Track OTP attempts too
        }; 

        const mailOptions = {
            from: '"DuoSync Security" <skustateethclinic@gmail.com>',
            to: user.email,
            subject: `🔐 Login Code: ${loginOtp}`,
            html: `
            <div style="font-family: Arial, sans-serif; background-color: #f1f5f9; padding: 40px 20px;">
                <table width="100%" style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-collapse: collapse;">
                    <tr><td style="background: linear-gradient(135deg, #0f172a, #1e3a5f); padding: 30px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 1px;">DuoSync</h1></td></tr>
                    <tr>
                        <td style="padding: 40px 30px; text-align: center; color: #334155;">
                            <h2 style="margin-top:0; color:#0f172a;">Secure Login</h2>
                            <p style="font-size: 15px; margin-bottom: 25px;">Hello ${user.first_name || user.username}, your DuoSync authentication code is:</p>
                            <div style="font-size: 32px; font-weight: bold; color: #3b82f6; letter-spacing: 5px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px dashed #cbd5e1; display: inline-block; margin-bottom: 25px;">${loginOtp}</div>
                            <p style="font-size: 13px; color: #64748b; margin: 0;">This code expires in 5 minutes.</p>
                        </td>
                    </tr>
                </table>
            </div>`
        };
        transporter.sendMail(mailOptions, (error) => {
            if (error) console.log('SMTP Error:', error);
        });
        
        console.log(`🔑 VALID OTP FOR ${username}: ${loginOtp}`);
        return res.json({ message: "OTP sent", step: "otp_verification", username: username, role: user.role });
    });
});

// 4. VERIFY OTP
app.post('/verify-login-otp', authLimiter, (req, res) => {
    const { username, otp } = req.body;
    const storedData = loginOtpStore[username];

    // Check Existence
    if (!storedData) {
        return res.status(400).json({ message: "Session expired. Please login again." });
    }

    // Check Expiration
    if (Date.now() > storedData.expiresAt) {
        delete loginOtpStore[username];
        return res.status(400).json({ message: "OTP has expired (30 min limit)." });
    }

    // Check Limit (3 Tries for OTP)
    if (storedData.code !== otp) {
        storedData.attempts += 1;
        const remaining = 3 - storedData.attempts;

        // --- GLOBAL LOCKOUT ON 3rd OTP FAIL ---
        if (storedData.attempts >= 3) {
            delete loginOtpStore[username]; // Kill OTP session
            
            // Lock account for 30 minutes
            loginAttempts[username] = { 
                attempts: 3, 
                lockoutUntil: Date.now() + LOCKOUT_TIME,
                lastAttempt: Date.now()
            };
            
            return res.status(403).json({ message: "Too many wrong OTPs. Account locked for 30 minutes." });
        }
        return res.status(400).json({ message: `Invalid Code. ${remaining} attempts remaining.` });
    }
    
    // SUCCESS
    const userRole = storedData.role;
    const inventoryAccess = storedData.inventory_access; // <--- ADD THIS LINE
    delete loginOtpStore[username];
    
    // 🌟 Generate JWT Token (Now includes inventory_access)
    const token = jwt.sign({ username, role: userRole, inventory_access: inventoryAccess }, JWT_SECRET, { expiresIn: '12h' });
    
    // <--- UPDATE THIS RESPONSE LINE
    res.json({ message: "Login Success", role: userRole, inventory_access: inventoryAccess, token }); 
});

// 5. UPGRADED ANALYTICS (Date Filters, COGS, Net Profit, Top Sellers, Financial Breakdown)
app.get('/analytics', authenticateToken, async (req, res) => {
    const { category, startDate, endDate } = req.query;
    
    let filterClause = " WHERE is_voided = FALSE";
    let params = [];

    if (category && category !== 'all') {
        filterClause += " AND category = ?";
        params.push(category);
    }
    if (startDate && endDate) {
        filterClause += " AND DATE(DATE_ADD(timestamp, INTERVAL 8 HOUR)) >= ? AND DATE(DATE_ADD(timestamp, INTERVAL 8 HOUR)) <= ?";
        params.push(startDate, endDate);
    }

    let historySql = "SELECT * FROM sales_log" + filterClause + " ORDER BY timestamp DESC LIMIT 10";
    let graphSql = "SELECT DATE_FORMAT(timestamp, '%b %d') as name, SUM(amount) as sales FROM sales_log" + filterClause + " GROUP BY name ORDER BY MAX(timestamp) ASC LIMIT 7";
    let summarySql = "SELECT SUM(amount) as total_revenue, SUM(total_cogs) as total_cogs, COUNT(*) as total_count FROM sales_log" + filterClause;
    let allSalesSql = "SELECT details FROM sales_log" + filterClause;

    // 🛠️ EXTRA EXPENSES QUERY (Petty Cash)
    let expFilterClause = " WHERE 1=1";
    let expParams = [];
    if (category && category !== 'all') {
        expFilterClause += " AND (category = ? OR category = 'general')";
        expParams.push(category);
    }
    if (startDate && endDate) {
        expFilterClause += " AND DATE(DATE_ADD(timestamp, INTERVAL 8 HOUR)) >= ? AND DATE(DATE_ADD(timestamp, INTERVAL 8 HOUR)) <= ?";
        expParams.push(startDate, endDate);
    }
    let expenseSql = "SELECT SUM(amount) as extra_expenses FROM store_expenses" + expFilterClause;

    // 🌟 NEW: VARIANCE LOSS QUERY (Z-Readings)
    let auditFilterClause = " WHERE 1=1";
    let auditParams = [];
    if (category && category !== 'all') {
        auditFilterClause += " AND shop_category = ?";
        auditParams.push(category);
    }
    if (startDate && endDate) {
        // Matches the frontend date picker format for the audit table
        auditFilterClause += " AND DATE(audit_date) >= ? AND DATE(audit_date) <= ?";
        auditParams.push(startDate, endDate);
    }
    let varianceSql = "SELECT SUM(total_loss) as variance_loss FROM shift_audits" + auditFilterClause;

    try {
        const [history] = await db.promise().query(historySql, params);
        const [graphData] = await db.promise().query(graphSql, params);
        const [summaryResult] = await db.promise().query(summarySql, params);
        const [allSales] = await db.promise().query(allSalesSql, params);
        const [expenseResult] = await db.promise().query(expenseSql, expParams);
        const [varianceResult] = await db.promise().query(varianceSql, auditParams); 

        // 🌟 BREAKDOWN MATH: Separate everything so the frontend can itemize it!
        const cogs = parseFloat(summaryResult[0].total_cogs || 0); 
        const pettyCash = parseFloat(expenseResult[0].extra_expenses || 0); 
        const varianceLoss = parseFloat(varianceResult[0].variance_loss || 0); 

        summaryResult[0].cogs = cogs;
        summaryResult[0].store_expenses = pettyCash;
        summaryResult[0].variance_loss = varianceLoss;
        summaryResult[0].total_expenses = cogs + pettyCash + varianceLoss;

        // Calculate Top Selling Items safely
        let itemCounts = {};
        allSales.forEach(sale => {
            if (sale.details) {
                try { 
                    const parsed = JSON.parse(sale.details);
                    const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
                    items.forEach(item => {
                        if (item.item_name) {
                            itemCounts[item.item_name] = (itemCounts[item.item_name] || 0) + item.qty;
                        }
                    });
                } catch (e) {}
            }
        });
        
        const topSellers = Object.keys(itemCounts)
            .map(name => ({ name, qty: itemCounts[name] }))
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5); 

        res.json({ 
            history, 
            graphData, 
            summary: summaryResult[0],
            topSellers 
        });
    } catch (err) {
        console.error("🚨 Analytics Crash:", err);
        res.status(500).json(err);
    }
});

// ==============================================================================
// 🌟 MASTER FINANCIAL LEDGER (Sales, COGS, Expenses, Variances Combined)
// ==============================================================================
app.get('/finance/ledger', authenticateToken, async (req, res) => {
    const { category, startDate, endDate } = req.query;
    let paramsSales = [];
    let paramsExpenses = [];
    let paramsAudits = [];
    
    let salesWhere = " WHERE is_voided = FALSE";
    let expenseWhere = " WHERE 1=1";
    let auditWhere = " WHERE total_loss > 0";

    if (category && category !== 'all') {
        salesWhere += " AND category = ?";
        paramsSales.push(category);

        expenseWhere += " AND (category = ? OR category = 'general')";
        paramsExpenses.push(category);

        auditWhere += " AND shop_category = ?";
        paramsAudits.push(category);
    }

    if (startDate && endDate) {
        salesWhere += " AND DATE(DATE_ADD(timestamp, INTERVAL 8 HOUR)) >= ? AND DATE(DATE_ADD(timestamp, INTERVAL 8 HOUR)) <= ?";
        paramsSales.push(startDate, endDate);

        expenseWhere += " AND DATE(DATE_ADD(timestamp, INTERVAL 8 HOUR)) >= ? AND DATE(DATE_ADD(timestamp, INTERVAL 8 HOUR)) <= ?";
        paramsExpenses.push(startDate, endDate);

        auditWhere += " AND DATE(audit_date) >= ? AND DATE(audit_date) <= ?";
        paramsAudits.push(startDate, endDate);
    }

    try {
        const salesQuery = `SELECT timestamp as date, 'SALE' as type, id as ref_id, 'System/Staff' as staff, details as description, amount as cash_in, total_cogs as cogs_out, 0 as expense_out FROM sales_log ${salesWhere}`;
        const expenseQuery = `SELECT timestamp as date, 'EXPENSE' as type, id as ref_id, 'Admin' as staff, description, 0 as cash_in, 0 as cogs_out, amount as expense_out FROM store_expenses ${expenseWhere}`;
        const auditQuery = `SELECT audit_date as date, 'VARIANCE_LOSS' as type, id as ref_id, staff_name as staff, variance_reason as description, 0 as cash_in, 0 as cogs_out, total_loss as expense_out FROM shift_audits ${auditWhere}`;

        const [sales] = await db.promise().query(salesQuery, paramsSales);
        const [expenses] = await db.promise().query(expenseQuery, paramsExpenses);
        const [audits] = await db.promise().query(auditQuery, paramsAudits);

        let ledger = [...sales, ...expenses, ...audits].map(row => {
            let desc = row.description;
            if (row.type === 'SALE') {
                try {
                    const parsed = JSON.parse(row.description);
                    desc = Array.isArray(parsed) ? parsed.map(i => `${i.qty}x ${i.item_name}`).join(', ') : (parsed.items ? parsed.items.map(i => `${i.qty}x ${i.item_name}`).join(', ') : 'Order Items');
                } catch(e) {}
            }
            const paddedId = String(row.ref_id).padStart(5, '0');
            const formattedRef = row.type === 'SALE' ? `#TXN-${paddedId}` : (row.type === 'EXPENSE' ? `#EXP-${paddedId}` : `#ZRD-${paddedId}`);

            return {
                ...row,
                ref_id: formattedRef,
                description: desc || 'N/A',
                net_impact: parseFloat(row.cash_in) - parseFloat(row.cogs_out) - parseFloat(row.expense_out)
            };
        }).sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(ledger);
    } catch (err) {
        console.error("🚨 Ledger Error:", err);
        res.status(500).json(err);
    }
});

app.get('/inventory', authenticateToken, (req, res) => {
    const category = req.query.category;
    let sql = "SELECT * FROM inventory WHERE status = 'active'";
    let params = [];
    if (category && category !== "undefined" && category !== "null" && category !== "") {
        sql += " AND category = ?";
        params.push(category);
    }
    db.query(sql, params, (err, data) => res.json(data));
});

app.post('/inventory/add', authenticateToken, (req, res) => {
    const { item_name, category, quantity, unit, price } = req.body;
    if (parseFloat(quantity) <= 0 || isNaN(parseFloat(quantity))) {
        return res.status(400).json({ message: "Quantity must be greater than zero." });
    }
    const sql = "INSERT INTO inventory (`item_name`, `category`, `quantity`, `unit`, `price`) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [item_name, category, quantity, unit, price], (err) => {
        if (err) return res.status(500).json({ message: "Database Error", error: err });
        logActivity('Admin', 'ADD_ITEM', `Added ${item_name}`);
        res.json({ message: "Item Added" });
    });
});

app.post('/inventory/remove', authenticateToken, (req, res) => {
    const { id } = req.body;
    db.query("SELECT item_name FROM inventory WHERE id = ?", [id], (err, data) => {
        const itemName = data.length > 0 ? data[0].item_name : 'Unknown Item';
        const sql = "DELETE FROM inventory WHERE id = ?";
        db.query(sql, [id], (delErr) => {
             if (delErr) return res.status(500).json(delErr);
             logActivity('Admin', 'DELETE_HARD', `Deleted ${itemName}`);
             res.json({ message: "Item Deleted" });
        });
    });
});

app.put('/inventory/update/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { quantity, price, item_name } = req.body;
    const sql = "UPDATE inventory SET quantity = ?, price = ?, item_name = ? WHERE id = ?";
    db.query(sql, [quantity, price, item_name, id], (err) => {
        if (err) return res.status(500).json(err);
        logActivity('Admin', 'UPDATE_ITEM', `Updated Item #${id}`);
        return res.json({ message: "Item Updated Successfully" });
    });
});

app.put('/users/deactivate/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const sql = "UPDATE users SET is_verified = 0 WHERE id = ?";
    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json(err);
        logActivity('Admin', 'DEACTIVATE_USER', `Deactivated User #${id}`);
        return res.json({ message: "User Deactivated" });
    });
});

app.put('/users/toggle-inventory/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { inventory_access } = req.body;
    const sql = "UPDATE users SET inventory_access = ? WHERE id = ?";
    db.query(sql, [inventory_access ? 1 : 0, id], (err) => {
        if (err) return res.status(500).json(err);
        logActivity('Admin', 'UPDATE_PERMISSIONS', `Updated inventory access for User #${id} to ${inventory_access}`);
        return res.json({ message: "Permissions Updated" });
    });
});

app.get('/users', authenticateToken, (req, res) => {
    // is_pending: true  → is_verified=0 AND activation_token IS NOT NULL  (Awaiting activation click)
    // is_pending: false → is_verified=0 AND activation_token IS NULL       (Deactivated by Admin)
    const sql = `
        SELECT 
            id, 
            username, 
            role, 
            is_verified,
            inventory_access,
            (activation_token IS NOT NULL) AS is_pending
        FROM users
        ORDER BY id ASC
    `;
    db.query(sql, (err, data) => {
        if (err) return res.status(500).json(err);
        res.json(data);
    });
});

app.post('/transaction/checkout', authenticateToken, async (req, res) => {
    const {
        cart_items, total_revenue, discount_type, customer_name, customer_id,
        customer_phone, weight_kg, pickup_date, claim_ticket, order_type,
        payment_method, amount_received, gcash_reference
    } = req.body;

    if (!cart_items || cart_items.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
    }

    // 🌟 ADD THIS WRAPPER
    db.getConnection((err, connection) => {
        if (err) return res.status(500).json({ message: "DB Connection Error" });

        connection.beginTransaction(async (err) => {
            if (err) {
                connection.release();
                return res.status(500).json({ message: "Database Error" });
            }

            try {
                let fullReceipt = [];
                let transactionCategory = 'pos_transaction'; 
                let total_cogs = 0; 

                // 🌟 CHANGE all 'db.promise().query' inside here to 'connection.promise().query'
                const [prodData] = await connection.promise().query("SELECT category FROM products WHERE id = ?", [cart_items[0].product_id]);
                if (prodData.length > 0) transactionCategory = prodData[0].category; 

                const productIds = [...new Set(cart_items.map(item => item.product_id))];
                const modIds = [];
                cart_items.forEach(item => {
                    if (item.modifiers) {
                        item.modifiers.forEach(mod => modIds.push(mod.id));
                    }
                });

                const [allRecipes] = await connection.promise().query(
                    `SELECT pr.product_id, pr.raw_inventory_id, pr.amount_needed, r.item_name, r.unit, r.cost_per_unit, r.stock_quantity 
                     FROM product_recipes pr 
                     JOIN raw_inventory r ON pr.raw_inventory_id = r.id 
                     WHERE pr.product_id IN (?)`,
                    [productIds]
                );

                let allMods = [];
                if (modIds.length > 0) {
                    const [modsData] = await connection.promise().query(
                        `SELECT m.id as modifier_id, m.raw_inventory_id, m.amount_needed, r.item_name, r.unit, r.cost_per_unit, r.stock_quantity 
                         FROM modifiers m 
                         JOIN raw_inventory r ON m.raw_inventory_id = r.id 
                         WHERE m.id IN (?)`,
                        [modIds]
                    );
                    allMods = modsData;
                }

                let inventoryUpdates = {}; 

                for (const item of cart_items) {
                    let itemDeductions = [];
                    const itemRecipe = allRecipes.filter(r => r.product_id === item.product_id);

                    for (const ing of itemRecipe) {
                        const totalDeducted = ing.amount_needed * item.qty;
                        const ingredientCost = totalDeducted * parseFloat(ing.cost_per_unit || 0);
                        total_cogs += ingredientCost; 
                        
                        itemDeductions.push(`-${totalDeducted}${ing.unit} ${ing.item_name}`);
                        
                        if (!inventoryUpdates[ing.raw_inventory_id]) {
                            inventoryUpdates[ing.raw_inventory_id] = { deduct: 0, name: ing.item_name, stock: parseFloat(ing.stock_quantity) };
                        }
                        inventoryUpdates[ing.raw_inventory_id].deduct += totalDeducted;
                    }

                    if (item.modifiers && item.modifiers.length > 0) {
                        for (const mod of item.modifiers) {
                            const modIng = allMods.find(m => m.modifier_id === mod.id);
                            if (modIng) {
                                const mQty = mod.qty || 1; 
                                const modDeducted = modIng.amount_needed * item.qty * mQty; 
                                const modCost = modDeducted * parseFloat(modIng.cost_per_unit || 0);
                                total_cogs += modCost; 
                                
                                itemDeductions.push(`-${modDeducted}${modIng.unit} ${modIng.item_name} (Add-on x${mQty})`);
                                
                                if (!inventoryUpdates[modIng.raw_inventory_id]) {
                                    inventoryUpdates[modIng.raw_inventory_id] = { deduct: 0, name: modIng.item_name, stock: parseFloat(modIng.stock_quantity) };
                                }
                                inventoryUpdates[modIng.raw_inventory_id].deduct += modDeducted;
                            }
                        }
                    }
                    fullReceipt.push({ ...item, exact_deductions: itemDeductions });
                }

                for (const rawId in inventoryUpdates) {
                    const inv = inventoryUpdates[rawId];
                    if (inv.stock < inv.deduct) {
                        throw new Error(`Insufficient stock for ${inv.name}`);
                    }
                }

                const updatePromises = Object.keys(inventoryUpdates).map(rawId => {
                    return connection.promise().query(
                        "UPDATE raw_inventory SET stock_quantity = stock_quantity - ? WHERE id = ?", 
                        [inventoryUpdates[rawId].deduct, rawId]
                    );
                });
                await Promise.all(updatePromises);

                const laundryMetadata = order_type === 'laundry' ? {
                    weight_kg: weight_kg,
                    pickup_date: pickup_date,
                    claim_ticket: claim_ticket,
                    customer_phone: customer_phone
                } : null;

                const finalDetails = {
                    items: fullReceipt,
                    laundry_data: laundryMetadata
                };

                await connection.promise().query(
                    `INSERT INTO sales_log
                        (category, amount, details, total_cogs, discount_type,
                         customer_name, customer_id,
                         payment_method, amount_received, gcash_reference)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        transactionCategory,
                        total_revenue,
                        JSON.stringify(finalDetails),
                        total_cogs,
                        discount_type    || null,
                        customer_name    || null,
                        customer_id      || null,
                        payment_method   || 'cash',
                        amount_received  || null,
                        gcash_reference  || null,
                    ]
                );

                // 🌟 COMMIT AND RELEASE
                connection.commit(() => {
                    connection.release();
                    res.json({ message: "Transaction Complete! Inventory & COGS recorded." });
                });

            } catch (error) {
                // 🌟 ROLLBACK AND RELEASE
                connection.rollback(() => {
                    connection.release();
                    res.status(500).json({ message: "Checkout Failed", error: error.message || error });
                });
            }
        });
    });
});

// --- NEW BACKEND ROUTES (March 25, may forget password + personalized OTP) ---

// 2. REACTIVATE ACCOUNT (Change 3)
app.put('/users/reactivate/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const sql = "UPDATE users SET is_verified = 1 WHERE id = ?";
    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json(err);
        logActivity('Admin', 'REACTIVATE_USER', `Reactivated User #${id}`);
        return res.json({ message: "User Reactivated" });
    });
});

// 3. DELETE ACCOUNT PERMANENTLY (Change 4)
app.delete('/users/delete/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const sql = "DELETE FROM users WHERE id = ?";
    db.query(sql, [id], (err) => {
        if (err) return res.status(500).json(err);
        logActivity('Admin', 'DELETE_USER', `Permanently Deleted User #${id}`);
        return res.json({ message: "User Permanently Deleted" });
    });
});

// --- FORGOT CREDENTIALS & CHANGE PASSWORD SYSTEM ---
const forgotOtpStore = {}; 
const forgotLockout = {}; 

const checkForgotLockout = (email) => {
    const userAttempt = forgotLockout[email];
    if (userAttempt && userAttempt.lockoutUntil > Date.now()) {
        return Math.ceil((userAttempt.lockoutUntil - Date.now()) / 60000);
    }
    if (userAttempt && userAttempt.lockoutUntil <= Date.now()) {
        delete forgotLockout[email];
    }
    return 0;
};

// A. Request Forgot Username / Password
app.post('/forgot-request', otpEmailLimiter, (req, res) => {
    const { email, type, source } = req.body; 
    
    const lockedMins = checkForgotLockout(email);
    if (lockedMins > 0) return res.status(403).json({ message: `Requests locked. Try again in ${lockedMins} minutes.` });

    db.query("SELECT * FROM users WHERE email = ?", [email], (err, data) => {
        if (err) return res.status(500).json(err);
        if (data.length === 0) return res.status(404).json({ message: "The email address provided is not registered in the system." });

        const user = data[0];
        
        if (source === 'web' && user.role !== 'admin') {
            return res.status(403).json({ message: "Access Denied: The Web Portal is strictly for Administrators. Please use the DuoSync Mobile App." });
        }

        const resetOtp = generateOTP();
        forgotOtpStore[email] = { 
            code: resetOtp, 
            attempts: 0, 
            expiresAt: Date.now() + (15 * 60 * 1000),
            type: type,
            username: user.username
        };

        const mailOptions = {
            from: '"DuoSync Security" <skustateethclinic@gmail.com>',
            to: email,
            subject: `🔐 Your DuoSync Verification Code`,
            html: `
            <div style="font-family: Arial, sans-serif; background-color: #f1f5f9; padding: 40px 20px;">
                <table width="100%" style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-collapse: collapse;">
                    <tr><td style="background: linear-gradient(135deg, #0f172a, #1e3a5f); padding: 30px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 1px;">DuoSync</h1></td></tr>
                    <tr>
                        <td style="padding: 40px 30px; text-align: center; color: #334155;">
                            <h2 style="margin-top:0; color:#0f172a;">Password Reset Request</h2>
                            <p style="font-size: 15px; margin-bottom: 25px;">Hello ${user.first_name || 'User'}, your verification code is:</p>
                            <div style="font-size: 32px; font-weight: bold; color: #10b981; letter-spacing: 5px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px dashed #cbd5e1; display: inline-block; margin-bottom: 25px;">${resetOtp}</div>
                            <p style="font-size: 13px; color: #ef4444; margin: 0; font-weight: bold;">Do not share this code with anyone.</p>
                            <p style="font-size: 13px; color: #475569; margin: 0;">For your security, this code will expire in <strong style="color: #0f172a;">5 minutes</strong>.</p>
                        </td>
                    </tr>
                </table>
            </div>`
        };
        transporter.sendMail(mailOptions);
        res.json({ message: "An email has been sent to the given email address with the OTP." });
    });
});

// B. Verify Forgot OTP
app.post('/forgot-verify-otp', authLimiter, (req, res) => {
    const { email, otp } = req.body;
    const store = forgotOtpStore[email];

    if (!store) return res.status(400).json({ message: "Session expired. Try again." });
    if (Date.now() > store.expiresAt) return res.status(400).json({ message: "OTP expired." });

    if (store.code !== otp) {
        store.attempts += 1;
        if (store.attempts >= 3) {
            delete forgotOtpStore[email]; 
            forgotLockout[email] = { lockoutUntil: Date.now() + OTP_EXPIRY };
            return res.status(403).json({ message: "Too many failed attempts. Reset locked for 5 minutes." });
        }
        return res.status(400).json({ message: `Invalid Code. ${3 - store.attempts} attempts remaining.` });
    }

    store.isVerified = true; 
    
    if (store.type === 'username') {
        const mailOptions = {
            from: '"DuoSync Security" <skustateethclinic@gmail.com>',
            to: email,
            subject: `👤 Your DuoSync Username`,
            html: `
            <div style="font-family: Arial, sans-serif; background-color: #f1f5f9; padding: 40px 20px;">
                <table width="100%" style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-collapse: collapse;">
                    <tr><td style="background: linear-gradient(135deg, #0f172a, #1e3a5f); padding: 30px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 1px;">DuoSync</h1></td></tr>
                    <tr>
                        <td style="padding: 40px 30px; text-align: center; color: #334155;">
                            <h2 style="margin-top:0; color:#0f172a;">Username Recovery</h2>
                            <p style="font-size: 15px; margin-bottom: 25px;">Hello, your registered DuoSync username is:</p>
                            <div style="font-size: 24px; font-weight: bold; color: #3b82f6; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #cbd5e1; display: inline-block; margin-bottom: 25px;">${store.username}</div>
                            <p style="font-size: 13px; color: #64748b; margin: 0;">You can now return to the app and log in.</p>
                        </td>
                    </tr>
                </table>
            </div>`
        };
        transporter.sendMail(mailOptions);
        delete forgotOtpStore[email];
        return res.json({ message: "Successfully sent the username in your registered email address." });
    }

    res.json({ message: "OTP Verified. Please enter new password." });
});

// C. Finalize Forgot Password
app.post('/forgot-reset-password', authLimiter, async (req, res) => {
    const { email, newPassword } = req.body;
    const store = forgotOtpStore[email];

    if (!store || !store.isVerified || store.type !== 'password') return res.status(403).json({ message: "Unauthorized request." });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.query("UPDATE users SET password_hash = ? WHERE email = ?", [hashedPassword, email], (err) => {
        if (err) return res.status(500).json(err);
        delete forgotOtpStore[email]; 
        res.json({ message: "Password updated successfully!" });
    });
});

// D. Change Password Verification (Authenticated)
app.post('/change-password-check', authenticateToken, (req, res) => {
    const { email, source } = req.body;
    db.query("SELECT * FROM users WHERE email = ?", [email], (err, data) => {
        if (err) return res.status(500).json(err);
        if (data.length === 0) return res.status(404).json({ message: "The email address provided is not registered in the system." });
        
        if (source === 'web' && data[0].role !== 'admin') {
            return res.status(403).json({ message: "Access Denied: The Web Portal is strictly for Administrators. Please use the DuoSync Mobile App." });
        }
        if (data[0].username !== req.user.username) {
            return res.status(403).json({ message: "This email does not belong to your logged-in account." });
        }
        res.json({ message: "Email verified." });
    });
});

// E. Change Password Final (Authenticated)
app.post('/change-password-auth', authenticateToken, async (req, res) => {
    const { email, oldPassword, newPassword } = req.body;
    
    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, data) => {
        if (err) return res.status(500).json(err);
        if (data.length === 0) return res.status(404).json({ message: "The email address provided is not registered in the system." });
        
        const user = data[0];
        const match = await bcrypt.compare(oldPassword, user.password_hash);
        if (!match) return res.status(400).json({ message: "Incorrect old password." });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        db.query("UPDATE users SET password_hash = ? WHERE id = ?", [hashedPassword, user.id], (updateErr) => {
            if (updateErr) return res.status(500).json(updateErr);
            logActivity('System', 'PASSWORD_CHANGE', `User ${user.username} changed their password`);
            res.json({ message: "Password updated successfully!" });
        });
    });
});

// 1. Fetch Menu Products for the Grid (OPTIMIZED: No N+1 Queries)
app.get('/inventory/products', async (req, res) => {
    const { category } = req.query;
    let sql = "SELECT * FROM products WHERE is_active = TRUE";
    let params = [];

    if (category) {
        sql += " AND category = ?";
        params.push(category);
    }

    try {
        const [products] = await db.promise().query(sql, params);

        // Early exit if no products exist to prevent SQL crashes
        if (products.length === 0) return res.json([]);

        // Get an array of all product IDs
        const productIds = products.map(p => p.id);

        // Fetch ALL recipes for these products in ONE massive query
        const [allRecipes] = await db.promise().query(
            `SELECT pr.product_id, pr.amount_needed, r.item_name, r.unit, r.stock_quantity 
             FROM product_recipes pr 
             JOIN raw_inventory r ON pr.raw_inventory_id = r.id 
             WHERE pr.product_id IN (?)`,
            [productIds]
        );

        // Match them up instantly in server memory
        for (let p of products) {
            // Filter the massive recipe array for just this product's ingredients
            p.recipe = allRecipes.filter(r => r.product_id === p.id); 

            let missing = 0;
            p.recipe.forEach(ing => {
                if (parseFloat(ing.stock_quantity) < parseFloat(ing.amount_needed)) {
                    missing++;
                }
            });
            p.missing_ingredients = missing;
        }
        res.json(products);
    } catch (err) {
        console.error("🚨 Fetch Products Error:", err);
        res.status(500).json(err);
    }
});

// 2. Fetch Available Modifiers for the Cart Add-ons (FIXED: Now checks stock)
app.get('/modifiers', (req, res) => {
    const { category } = req.query;
    const sql = `
        SELECT m.*, r.stock_quantity 
        FROM modifiers m 
        JOIN raw_inventory r ON m.raw_inventory_id = r.id 
        WHERE m.category = ?
    `;
    db.query(sql, [category], (err, data) => {
        if (err) return res.status(500).json(err);
        res.json(data);
    });
});

// Fetch raw ingredients for the staff screen (Excludes stock counts for Blind Auditing)
app.get('/inventory/raw', authenticateToken, (req, res) => {
    const { category } = req.query;
    // Notice we DO NOT select stock_quantity here.
    const sql = "SELECT id, item_name, unit, category FROM raw_inventory WHERE category = ?";
    db.query(sql, [category], (err, data) => {
        if (err) return res.status(500).json(err);
        res.json(data);
    });
});

// --- MOBILE: GET MISSING RAW INGREDIENTS FOR A SPECIFIC PRODUCT ---
app.get('/inventory/missing-ingredients/:productId', authenticateToken, async (req, res) => {
    const { productId } = req.params;
    try {
        const [rows] = await db.promise().query(`
            SELECT r.id, r.item_name, r.unit, r.stock_quantity, pr.amount_needed 
            FROM product_recipes pr 
            JOIN raw_inventory r ON pr.raw_inventory_id = r.id 
            WHERE pr.product_id = ?
        `, [productId]);
        res.json(rows);
    } catch (err) {
        console.error("Missing ingredients error:", err);
        res.status(500).json({ message: "Failed to fetch missing ingredients." });
    }
});

// 🌟 --- GLOBAL ADMIN ROUTE PROTECTION --- 🌟
// This applies the JWT check to ALL routes below this line that start with /admin
app.use('/admin', authenticateToken);

// --- ADMIN: CREATE NEW PRODUCT & RECIPE ---
// 🌟 Added upload.single('image') middleware
// REPLACE ROUTE: /admin/products/create
app.post('/admin/products/create', uploadProductImage.single('image'), async (req, res) => {
    const { product_name, category, sub_category, base_price, allow_modifiers } = req.body;
    const ingredients = JSON.parse(req.body.ingredients);
    
    // Saves Cloudinary HTTPS URL if uploaded, null if no image attached
    const image_url = req.file ? req.file.path : null;

    db.getConnection((err, connection) => {
        if (err) return res.status(500).json({ message: "DB Connection Error" });

        connection.beginTransaction(async (err) => {
            if (err) {
                connection.release();
                return res.status(500).json({ message: "Database Error" });
            }

            try {
                const [productResult] = await connection.promise().query(
                    "INSERT INTO products (product_name, category, sub_category, base_price, is_active, allow_modifiers, image_url) VALUES (?, ?, ?, ?, TRUE, ?, ?)",
                    [product_name, category, sub_category, base_price, allow_modifiers, image_url]
                );
                
                const newProductId = productResult.insertId;

                for (const ing of ingredients) {
                    let amount_needed = 0;
                    if (ing.input_unit === 'scoops') amount_needed = ing.input_quantity * 15; 
                    else if (ing.input_unit === 'pumps') amount_needed = ing.input_quantity * 10; 
                    else if (ing.input_unit === 'sachets' || ing.input_unit === 'pcs') amount_needed = ing.input_quantity; 
                    else amount_needed = ing.input_quantity; 

                    await connection.promise().query(
                        "INSERT INTO product_recipes (product_id, raw_inventory_id, input_quantity, input_unit, amount_needed) VALUES (?, ?, ?, ?, ?)",
                        [newProductId, ing.raw_inventory_id, ing.input_quantity, ing.input_unit, amount_needed]
                    );
                }
                await connection.promise().query("INSERT INTO activity_logs (username, action, details) VALUES ('Admin', 'Menu Management', ?)", [`Published new product: ${product_name}`]);

                connection.commit(() => {
                    connection.release();
                    res.json({ message: "Product and Recipe successfully created!" });
                });

            } catch (error) {
                connection.rollback(() => {
                    connection.release();
                    console.error("🚨 REAL ERROR MESSAGE:", error.message || error);
                    console.error("🚨 SQL / ERROR STACK:", error.stack || error);
                    res.status(500).json({ 
                        message: "Failed to create recipe.", 
                        details: error.message || String(error) 
                    });
                });
            }
        });
    });
});

// --- ADMIN: GET RAW INGREDIENTS FOR DROPDOWN ---
app.get('/admin/raw_inventory', (req, res) => {
    // Admin needs to see everything, including stock levels
    db.query("SELECT * FROM raw_inventory", (err, data) => {
        if (err) return res.status(500).json(err);
        res.json(data);
    });
});


// --- ADMIN: FETCH ALL PRODUCTS WITH THEIR RECIPES (OPTIMIZED) ---
app.get('/admin/products', async (req, res) => {
    try {
        const [products] = await db.promise().query("SELECT * FROM products ORDER BY category, product_name");
        
        if (products.length === 0) return res.json([]);
        
        const productIds = products.map(p => p.id);

        // Fetch ALL recipes in ONE query
        const [allRecipes] = await db.promise().query(
            `SELECT pr.*, r.item_name 
             FROM product_recipes pr 
             JOIN raw_inventory r ON pr.raw_inventory_id = r.id 
             WHERE pr.product_id IN (?)`, 
            [productIds]
        );

        // Match them up instantly in memory
        for (let p of products) {
            p.recipe = allRecipes.filter(r => r.product_id === p.id);
        }
        
        res.json(products);
    } catch (err) {
        console.error("🚨 Admin Fetch Products Error:", err);
        res.status(500).json(err);
    }
});

// --- ADMIN: UPDATE PRODUCT AND RECIPE ---
// 🌟 Added upload.single('image') middleware
// REPLACE ROUTE: /admin/products/update/:id
app.put('/admin/products/update/:id', uploadProductImage.single('image'), async (req, res) => {
    const { id } = req.params;
    const { product_name, category, sub_category, base_price, allow_modifiers, is_active } = req.body;
    const ingredients = JSON.parse(req.body.ingredients);

    db.getConnection((err, connection) => {
        if (err) return res.status(500).json({ message: "DB Connection Error" });

        connection.beginTransaction(async (err) => {
            if (err) {
                connection.release();
                return res.status(500).json({ message: "Database Error" });
            }

            try {
                if (req.file) {
                    const [oldProd] = await connection.promise().query("SELECT image_url FROM products WHERE id = ?", [id]);
                    const oldUrl = oldProd[0]?.image_url;

                    // Only unlink if it was an old local image file (not an external Cloudinary URL)
                    if (oldUrl && !oldUrl.startsWith('http')) {
                        const oldImagePath = path.join(__dirname, 'uploads', oldUrl);
                        if (fs.existsSync(oldImagePath)) {
                            fs.unlinkSync(oldImagePath); 
                        }
                    }

                    const newImageUrl = req.file.path; // New Cloudinary URL
                    await connection.promise().query(
                        "UPDATE products SET product_name = ?, category = ?, sub_category = ?, base_price = ?, allow_modifiers = ?, is_active = ?, image_url = ? WHERE id = ?",
                        [product_name, category, sub_category, base_price, allow_modifiers, is_active, newImageUrl, id]
                    );
                } else {
                    await connection.promise().query(
                        "UPDATE products SET product_name = ?, category = ?, sub_category = ?, base_price = ?, allow_modifiers = ?, is_active = ? WHERE id = ?",
                        [product_name, category, sub_category, base_price, allow_modifiers, is_active, id]
                    );
                }

                await connection.promise().query("DELETE FROM product_recipes WHERE product_id = ?", [id]);

                for (const ing of ingredients) {
                    let amount_needed = 0;
                    if (ing.input_unit === 'scoops') amount_needed = ing.input_quantity * 15;
                    else if (ing.input_unit === 'pumps') amount_needed = ing.input_quantity * 10;
                    else if (ing.input_unit === 'sachets' || ing.input_unit === 'pcs') amount_needed = ing.input_quantity;
                    else amount_needed = ing.input_quantity;

                    await connection.promise().query(
                        "INSERT INTO product_recipes (product_id, raw_inventory_id, input_quantity, input_unit, amount_needed) VALUES (?, ?, ?, ?, ?)",
                        [id, ing.raw_inventory_id, ing.input_quantity, ing.input_unit, amount_needed]
                    );
                }

                connection.commit(() => {
                    connection.release();
                    res.json({ message: "Product & Recipe successfully updated!" });
                });
            } catch (error) {
                connection.rollback(() => {
                    connection.release();
                    res.status(500).json({ message: "Update Failed", error });
                });
            }
        });
    });
});


// --- ADMIN: VOID TRANSACTION ---
// REPLACE ROUTE: /admin/transactions/void/:id
app.put('/admin/transactions/void/:id', async (req, res) => {
    const { id } = req.params;
    
    db.getConnection((err, connection) => {
        if (err) return res.status(500).json({ message: "DB Connection Error" });

        connection.beginTransaction(async (err) => {
            if (err) {
                connection.release();
                return res.status(500).json({ message: "Database Error" });
            }
            try {
                const [txn] = await connection.promise().query("SELECT details, is_voided FROM sales_log WHERE id = ?", [id]);
                if (txn.length === 0) throw new Error("Transaction not found");
                if (txn[0].is_voided) throw new Error("Transaction already voided");
                
                const parsedDetails = JSON.parse(txn[0].details || "[]");
                const itemsArray = Array.isArray(parsedDetails) ? parsedDetails : (parsedDetails.items || []);

                for (const item of itemsArray) {
                    const [recipe] = await connection.promise().query("SELECT raw_inventory_id, amount_needed FROM product_recipes WHERE product_id = ?", [item.product_id]);
                    for (const ing of recipe) {
                        await connection.promise().query("UPDATE raw_inventory SET stock_quantity = stock_quantity + ? WHERE id = ?", [ing.amount_needed * item.qty, ing.raw_inventory_id]);
                    }
                    
                    if (item.modifiers) {
                        for (const mod of item.modifiers) {
                            const [modData] = await connection.promise().query("SELECT raw_inventory_id, amount_needed FROM modifiers WHERE id = ?", [mod.id]);
                            if (modData.length > 0) {
                                await connection.promise().query("UPDATE raw_inventory SET stock_quantity = stock_quantity + ? WHERE id = ?", [modData[0].amount_needed * item.qty, modData[0].raw_inventory_id]);
                            }
                        }
                    }
                }

                await connection.promise().query("UPDATE sales_log SET is_voided = TRUE WHERE id = ?", [id]);
                
                await connection.promise().query("INSERT INTO activity_logs (username, action, details) VALUES ('Admin', 'Sales & Voids', ?)", [`Voided Transaction #${id}`]);
                
                connection.commit(() => {
                    connection.release();
                    res.json({ message: "Transaction Voided Successfully & Inventory Restored!" });
                });
            } catch (error) {
                connection.rollback(() => {
                    connection.release();
                    res.status(500).json({ message: error.message || "Voiding Failed", error });
                });
            }
        });
    });
});

// --- ADMIN: LOG PETTY CASH / STORE EXPENSE ---
app.post('/admin/expenses', async (req, res) => {
    // 🌟 NEW: Destructure receipt_number
    const { amount, description, category, receipt_number } = req.body; 
    try {
        await db.promise().query(
            "INSERT INTO store_expenses (amount, description, category, receipt_number) VALUES (?, ?, ?, ?)", 
            [amount, description, category || 'general', receipt_number || null]
        );
        await db.promise().query(
            "INSERT INTO activity_logs (username, action, details) VALUES ('Admin', 'Expenses', ?)", 
            [`Logged store expense: ₱${amount} for ${description} (Ref: ${receipt_number || 'None'})`]
        );
        res.json({ message: "Expense logged!" });
    } catch (error) {
        res.status(500).json(error);
    }
});

// --- ADMIN: FETCH EMERGENCY RESTOCK LOGS ---
app.get('/admin/emergency-logs', (req, res) => {
    db.query("SELECT * FROM emergency_restocks ORDER BY timestamp DESC", (err, data) => {
        if (err) return res.status(500).json(err);
        res.json(data);
    });
});

// --- ADMIN: FETCH GLOBAL ACTIVITY LOGS ---
app.get('/admin/activity-logs', (req, res) => {
    // Fetches the latest 100 system actions
    db.query("SELECT * FROM activity_logs ORDER BY id DESC LIMIT 100", (err, data) => {
        if (err) return res.status(500).json(err);
        res.json(data);
    });
});

// --- ADMIN: ACKNOWLEDGE/VERIFY EMERGENCY LOG ---
app.put('/admin/emergency-logs/acknowledge/:id', (req, res) => {
    const { id } = req.params;
    db.query("UPDATE emergency_restocks SET is_acknowledged = TRUE WHERE id = ?", [id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Log marked as verified!" });
    });
});

// --- ADMIN: FETCH ALL TRANSACTIONS & EXPENSES ---
app.get('/admin/transactions', async (req, res) => {
    try {
        const [sales] = await db.promise().query("SELECT * FROM sales_log");
        const [expenses] = await db.promise().query("SELECT * FROM store_expenses");
        
        // Format Sales
        const formattedSales = sales.map(row => {
            let parsedDetails = [];
            try {
                if (row.details) parsedDetails = JSON.parse(row.details);
            } catch (e) {
                parsedDetails = []; 
            }
            return { ...row, details: parsedDetails, type: 'sale' }; // Tag as sale
        });

        // Format Expenses to pretend to be a receipt so the frontend table doesn't crash
        const formattedExpenses = expenses.map(row => {
            return {
                id: row.id,
                timestamp: row.timestamp,
                amount: row.amount,
                details: [{ item_name: row.description, qty: 1 }], 
                is_voided: 0,
                type: 'expense', // Tag as expense
                category: row.category,
                receipt_number: row.receipt_number // 🌟 NEW: Pass to frontend
            };
        });

        // Merge both arrays and sort by newest timestamp first
        const combinedData = [...formattedSales, ...formattedExpenses].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        res.json(combinedData);
    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});

// --- ADMIN: UPDATE RAW INGREDIENT STOCK & COST ---
app.put('/admin/raw_inventory/:id', (req, res) => {
    const { id } = req.params;
    const { stock_quantity, cost_per_unit } = req.body;
    
    const sql = "UPDATE raw_inventory SET stock_quantity = ?, cost_per_unit = ? WHERE id = ?";
    db.query(sql, [stock_quantity, cost_per_unit, id], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Ingredient successfully updated!" });
    });
});

// --- ADMIN: DELETE RAW INGREDIENT ---
app.delete('/admin/raw_inventory/:id', (req, res) => {
    const { id } = req.params;
    
    // Check if ingredient is used in any active recipe
    db.query("SELECT product_id FROM product_recipes WHERE raw_inventory_id = ? LIMIT 1", [id], (checkErr, checkData) => {
        if (checkErr) return res.status(500).json(checkErr);
        
        if (checkData.length > 0) {
            return res.status(400).json({ 
                message: "Cannot delete this ingredient. It is currently being used in a menu product recipe. Please remove it from the recipe first." 
            });
        }

        // Safe to delete
        db.query("DELETE FROM raw_inventory WHERE id = ?", [id], (err) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Ingredient permanently deleted." });
        });
    });
});

// --- ADMIN: ADD NEW RAW INGREDIENT (AUTO-MATH UX) ---
app.post('/admin/raw_inventory/add', (req, res) => {
    const { item_name, category, unit, total_cost, total_quantity } = req.body;

    // 🛠️ FIXED: Prevent Division by Zero database corruption
    if (parseFloat(total_quantity) <= 0) {
        return res.status(400).json({ message: "Package size/quantity must be greater than zero." });
    }

    // 1. The System does the math automatically
    const cost_per_unit = parseFloat(total_cost) / parseFloat(total_quantity);

    // 2. We save the item with the initial stock already added!
    const sql = "INSERT INTO raw_inventory (item_name, category, unit, cost_per_unit, stock_quantity) VALUES (?, ?, ?, ?, ?)";
    
    db.query(sql, [item_name, category, unit, cost_per_unit, total_quantity], (err) => {
        if (err) {
            console.error("🚨 Admin Add Ingredient Error:", err);
            return res.status(500).json(err);
        }
        res.json({ message: "Raw Ingredient securely added by Admin." });
    });
}); 

// --- MOBILE: GET SHIFT SUMMARY (Expected cash displayed on Z-Reading modal) ---
app.get('/audit/shift-summary', authenticateToken, async (req, res) => {
    const { category, starting_cash } = req.query;
    try {
        // 1. Find the timestamp of the last closed shift for this category
        const [lastAudit] = await db.promise().query(
            "SELECT MAX(audit_date) as last_date FROM shift_audits WHERE shop_category = ?",
            [category]
        );
        const lastDate = lastAudit[0].last_date || '1970-01-01 00:00:00';
 
        // 2. Sum all completed (non-voided) sales since then
        const [salesData] = await db.promise().query(
            "SELECT SUM(amount) as shift_sales FROM sales_log WHERE category = ? AND timestamp > ? AND is_voided = FALSE",
            [category, lastDate]
        );
        const shiftSales = parseFloat(salesData[0].shift_sales) || 0;
 
        // 3. Sum any expenses charged to this category (or general) since then
        const [expenseData] = await db.promise().query(
            "SELECT SUM(amount) as shift_expenses FROM store_expenses WHERE timestamp > ? AND (category = ? OR category = 'general')",
            [lastDate, category]
        );
        const totalExpenses = parseFloat(expenseData[0].shift_expenses) || 0;
 
        // 4. Calculate the expected drawer total
        const startCash    = parseFloat(starting_cash) || 0;
        const expectedCash = (startCash + shiftSales) - totalExpenses;
 
        res.json({
            starting_cash:   startCash,
            shift_sales:     shiftSales,
            total_expenses:  totalExpenses,
            expected_cash:   expectedCash,
        });
    } catch (err) {
        console.error("Shift summary error:", err);
        res.status(500).json({ message: "Failed to calculate shift summary." });
    }
});


// --- MOBILE: SUBMIT END OF SHIFT BLIND AUDIT (UPGRADED WITH CASH REMITTANCE) ---
app.post('/audit/submit', authenticateToken, async (req, res) => {
    const { staff_name, shop_category, physical_counts, starting_cash, actual_cash, variance_reason } = req.body;

    // 🌟 1. Grab a single connection from the pool
    db.getConnection((err, connection) => {
        if (err) return res.status(500).json({ message: "DB Connection Error" });

        // 🌟 2. Start the transaction on this specific connection
        connection.beginTransaction(async (err) => {
            if (err) {
                connection.release();
                return res.status(500).json({ message: "Transaction Error" });
            }

            try {
                // 1. CALCULATE SHIFT SALES
                const [lastAudit] = await connection.promise().query(
                    "SELECT MAX(audit_date) as last_date FROM shift_audits WHERE shop_category = ?", 
                    [shop_category]
                );
                const lastDate = lastAudit[0].last_date || '1970-01-01 00:00:00';

                const [salesData] = await connection.promise().query(
                    "SELECT SUM(amount) as shift_sales FROM sales_log WHERE category = ? AND timestamp > ? AND is_voided = FALSE",
                    [shop_category, lastDate]
                );
                const shiftSales = parseFloat(salesData[0].shift_sales) || 0;

                // 2. CALCULATE EXPENSES
                const [expenseData] = await connection.promise().query(
                    "SELECT SUM(amount) as shift_expenses FROM store_expenses WHERE timestamp > ? AND (category = ? OR category = 'general')",
                    [lastDate, shop_category]
                );
                const totalExpenses = parseFloat(expenseData[0].shift_expenses) || 0;

                // 3. CALCULATE CASH VARIANCE
                const startCash = parseFloat(starting_cash) || 0;
                const endCash = parseFloat(actual_cash) || 0;
                const expectedCash = (startCash + shiftSales) - totalExpenses; 
                const cashVariance = expectedCash - endCash; 

                // 4. CALCULATE INVENTORY VARIANCE
                const [systemStock] = await connection.promise().query(
                    "SELECT id, item_name, unit, stock_quantity, cost_per_unit FROM raw_inventory WHERE category = ?",
                    [shop_category]
                );

                let total_loss = 0;
                let audit_details = [];

                for (const sysItem of systemStock) {
                    const physCount = parseFloat(physical_counts[sysItem.id]) || 0; 
                    const sysCount = parseFloat(sysItem.stock_quantity) || 0;
                    const costPerUnit = parseFloat(sysItem.cost_per_unit) || 0; 
                    
                    const variance = sysCount - physCount; 
                    const financial_loss = variance > 0 ? variance * costPerUnit : 0;
                    total_loss += financial_loss;

                    audit_details.push({
                        item_id: sysItem.id,
                        item_name: sysItem.item_name,
                        unit: sysItem.unit,
                        system_stock: sysCount,
                        physical_count: physCount,
                        variance: variance,
                        loss: financial_loss
                    });

                    await connection.promise().query(
                        "UPDATE raw_inventory SET stock_quantity = ? WHERE id = ?",
                        [physCount, sysItem.id]
                    );
                }

                // 5. SAVE THE COMPLETE Z-READING
                await connection.promise().query(
                    `INSERT INTO shift_audits
                        (staff_name, shop_category, audit_details, total_loss,
                         starting_cash, expected_cash, actual_cash, cash_variance, variance_reason)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        staff_name || 'Staff User',
                        shop_category,
                        JSON.stringify(audit_details),
                        total_loss,
                        startCash,
                        expectedCash,
                        endCash,
                        cashVariance,
                        variance_reason || null,
                    ]
                );

                // 🌟 3. Commit and release the connection back to the pool
                connection.commit(() => {
                    connection.release();
                    res.json({ message: "Shift closed and remitted." });
                });

            } catch (error) {
                // 🌟 4. Rollback and release on failure
                connection.rollback(() => {
                    connection.release();
                    console.error("🚨 Z-READING CRASH:", error); 
                    res.status(500).json({ error });
                });
            }
        });
    });
});

// --- ADMIN: FETCH AUDIT REPORTS ---
app.get('/admin/audits', (req, res) => {
    db.query("SELECT * FROM shift_audits ORDER BY audit_date DESC", (err, data) => {
        if (err) return res.status(500).json(err);
        const formatted = data.map(row => {
            let parsedDetails = [];
            try {
                // If it's a seeded row with NULL details, default to an empty array
                parsedDetails = JSON.parse(row.audit_details || "[]");
            } catch (e) {
                parsedDetails = [];
            }
            
            return {
                ...row, 
                // Fallbacks for the seeded data so the table doesn't look blank
                staff_name: row.staff_name || 'System Auto-Audit',
                shop_category: row.shop_category || 'General',
                audit_details: parsedDetails
            };
        });
        res.json(formatted);
    });
});





// --- MOBILE: EMERGENCY RESTOCK ---
// REPLACE ROUTE: /inventory/emergency-restock
app.post('/inventory/emergency-restock', authenticateToken, async (req, res) => {
    const { staff_name, shop_category, raw_inventory_id, amount_added } = req.body;
    
    db.getConnection((err, connection) => {
        if (err) return res.status(500).json({ message: "DB Connection Error" });

        connection.beginTransaction(async (err) => {
            if (err) {
                connection.release();
                return res.status(500).json({ message: "Database Error" });
            }
            try {
                await connection.promise().query(
                    "UPDATE raw_inventory SET stock_quantity = stock_quantity + ? WHERE id = ?",
                    [amount_added, raw_inventory_id]
                );
                
                const [item] = await connection.promise().query("SELECT item_name, unit FROM raw_inventory WHERE id = ?", [raw_inventory_id]);
                
                await connection.promise().query(
                    "INSERT INTO emergency_restocks (staff_name, shop_category, item_name, amount_added) VALUES (?, ?, ?, ?)",
                    [staff_name || 'Staff User', shop_category, `${item[0].item_name} (${item[0].unit})`, amount_added]
                );
                
                connection.commit(() => {
                    connection.release();
                    res.json({ message: "Emergency Stock Added!" });
                });
            } catch (error) {
                connection.rollback(() => {
                    connection.release();
                    res.status(500).json({ error });
                });
            }
        });
    });
});

// --- MOBILE: GET SPECIFIC MISSING INGREDIENTS FOR A PRODUCT ---
// REPLACE ROUTE: /inventory/log-restock
app.post('/inventory/log-restock', authenticateToken, async (req, res) => {
    const { staff_name, raw_inventory_id, amount_added, reference_note, total_cost_paid } = req.body;

    db.getConnection((err, connection) => {
        if (err) return res.status(500).json({ message: "DB Connection Error" });

        connection.beginTransaction(async (err) => {
            if (err) {
                connection.release();
                return res.status(500).json({ message: "Database Error" });
            }
            try {
                const [currentItem] = await connection.promise().query("SELECT stock_quantity, cost_per_unit, item_name, unit FROM raw_inventory WHERE id = ?", [raw_inventory_id]);
                
                const oldStock = parseFloat(currentItem[0].stock_quantity);
                const oldCost = parseFloat(currentItem[0].cost_per_unit);
                const addedStock = parseFloat(amount_added);
                const addedCost = parseFloat(total_cost_paid) || 0; 

                const totalInventoryValue = (oldStock * oldCost) + addedCost;
                const newTotalStock = oldStock + addedStock;
                const newCostPerUnit = newTotalStock > 0 ? (totalInventoryValue / newTotalStock) : oldCost;

                await connection.promise().query(
                    "UPDATE raw_inventory SET stock_quantity = ?, cost_per_unit = ? WHERE id = ?",
                    [newTotalStock, newCostPerUnit, raw_inventory_id]
                );

                await connection.promise().query(
                    "INSERT INTO activity_logs (username, action, details) VALUES (?, 'STOCK_DELIVERY', ?)",
                    [staff_name || 'Staff', `Restocked +${amount_added}${currentItem[0].unit} of ${currentItem[0].item_name}. Updated cost to ₱${newCostPerUnit.toFixed(2)}/unit.`]
                );

                connection.commit(() => {
                    connection.release();
                    res.json({ message: "Restock Logged & Average Cost Updated!" });
                });
            } catch (error) {
                connection.rollback(() => {
                    connection.release();
                    res.status(500).json({ error });
                });
            }
        });
    });
});

// --- MOBILE: BATCH STAFF RESTOCK (SINGLE RECEIPT + MAC MATH + EMERGENCY LOG) ---
// REPLACE ROUTE: /inventory/batch-restock
app.post('/inventory/batch-restock', authenticateToken, async (req, res) => {
    const { staff_name, reference_note, items } = req.body;

    db.getConnection((err, connection) => {
        if (err) return res.status(500).json({ message: "DB Connection Error" });

        connection.beginTransaction(async (err) => {
            if (err) {
                connection.release();
                return res.status(500).json({ message: "Database Error" });
            }
            try {
                let logDetails = [];
                let shop_category = 'milktea'; 

                for (const item of items) {
                    const [currentItem] = await connection.promise().query("SELECT stock_quantity, cost_per_unit, category FROM raw_inventory WHERE id = ?", [item.id]);
                    const oldStock = parseFloat(currentItem[0].stock_quantity);
                    const oldCost = parseFloat(currentItem[0].cost_per_unit);
                    const addedStock = parseFloat(item.amount);
                    const addedCost = parseFloat(item.total_cost_paid) || 0;
                    
                    shop_category = currentItem[0].category;

                    const totalInventoryValue = (oldStock * oldCost) + addedCost;
                    const newTotalStock = oldStock + addedStock;
                    const newCostPerUnit = newTotalStock > 0 ? (totalInventoryValue / newTotalStock) : oldCost;

                    await connection.promise().query(
                        "UPDATE raw_inventory SET stock_quantity = ?, cost_per_unit = ? WHERE id = ?",
                        [newTotalStock, newCostPerUnit, item.id]
                    );
                    
                    logDetails.push(`+${item.amount}${item.unit} ${item.name} (₱${addedCost})`);

                    await connection.promise().query(
                        "INSERT INTO emergency_restocks (staff_name, shop_category, item_name, amount_added, is_acknowledged) VALUES (?, ?, ?, ?, ?)",
                        [staff_name || 'Staff User', shop_category, `${item.name} (${item.unit})`, addedStock, 1] 
                    );
                }

                const summaryText = logDetails.join(', ');
                await connection.promise().query(
                    "INSERT INTO activity_logs (username, action, details) VALUES (?, 'STOCK_DELIVERY', ?)",
                    [staff_name || 'Staff', `Receipt/Ref: ${reference_note || 'None'} | Items: ${summaryText}`]
                );

                connection.commit(() => {
                    connection.release();
                    res.json({ message: "Batch Restock Successfully Logged & Average Costs Updated!" });
                });
            } catch (error) {
                connection.rollback(() => {
                    connection.release();
                    res.status(500).json({ error });
                });
            }
        });
    });
});

app.use('/api/test', require('./services/aiForecasterService')(db));
app.use('/api/test', require('./services/aiFinancialService')(db));

require('./services/cronJobs')(db);
app.use('/api', require('./services/aiInsightsService')(db));

app.use('/api/ai', require('./services/aiDelegationService')(db, __dirname));

// 🌟 GLOBAL ERROR HANDLER FOR MULTER & CLOUDINARY
app.use((err, req, res, next) => {
    console.error("🚨 UPLOAD / SERVER ERROR DETAILS:", JSON.stringify(err, null, 2) || err);
    res.status(500).json({ 
        message: err.message || "File upload or internal server error", 
        error: err 
    });
});

const PORT = process.env.PORT || 5000; 
app.listen(PORT, () => {
    console.log(`🚀 DuoSync Secure Server running on ${PORT}`);
});
