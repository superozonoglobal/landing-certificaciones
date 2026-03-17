/**
 * ══════════════════════════════════════════════════════════════
 *  Super Ozono Global — Backend API
 *  Archivo:  backend/server.js
 *  Puerto:   3001 (configurable via ENV)
 * ══════════════════════════════════════════════════════════════
 *
 *  Endpoints:
 *POST  /api/leads → Crear nuevo lead
 *GET   /api/leads → Listar leads (requiere API key)
 *GET   /api/leads/export  → Exportar CSV (requiere API key)
 *GET   /health→ Health check
 *
 *  Base de datos: SQLite (archivo ./data/leads.db)
 *
 *  Variables de entorno (.env recomendado):
 *PORT=3001
 *API_KEY=tu_clave_super_secreta
 *ALLOWED_ORIGINS=https://certificacion.superozonoglobal.com
 */

'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const { Resend } = require('resend');

/* ─────────────────────────────────────────────
   CONFIGURACIÓN
───────────────────────────────────────────── */
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || 'CAMBIA_ESTA_CLAVE_EN_PRODUCCION';

// Configuración de Cloudflare R2 (igual que kumo-ozono)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'a7d0037fa11e8906bbb1f457f8c99893';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '1de3f939945e165d48933ca1921103cf';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '5034698928b52eb1a2835fc82f85f4dcd2e5b7e4bce5f592fcf9345fe46df754';
const R2_BUCKET = process.env.R2_BUCKET || 'certificaciones-ozono';

// Cliente de R2
const r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

console.log('🎬 [VIDEO-SERVER] R2 Client initialized');
console.log('🎬 [VIDEO-SERVER] Bucket:', R2_BUCKET);
console.log('🎬 [VIDEO-SERVER] Account ID:', R2_ACCOUNT_ID);

// Configuración de Resend para envío de correos
const resend = new Resend('re_SDodSAvq_3mV4Kb5bTxZX6gQV7CBE6Lrh');
console.log('📧 [EMAIL-SERVER] Resend initialized');

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
    .concat([
        'http://localhost',
        'http://localhost:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://127.0.0.1:63315',
        'https://certificacion.superozonoglobal.com',
    ]);

/* ─────────────────────────────────────────────
   BASE DE DATOS SQLite
───────────────────────────────────────────── */
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'leads.db'));

// Habilitar WAL para mejor rendimiento
db.pragma('journal_mode = WAL');

// Crear tabla si no existe
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    pais TEXT NOT NULL,
    fuente TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    page_url TEXT,
    user_agent TEXT,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_whatsapp ON leads(whatsapp);
`);

console.log('✅ Base de datos SQLite conectada →', path.join(DATA_DIR, 'leads.db'));

/* ─────────────────────────────────────────────
   PREPARED STATEMENTS
───────────────────────────────────────────── */
const stmtInsert = db.prepare(`
  INSERT INTO leads (id, nombre, email, whatsapp, pais, fuente,
utm_source, utm_medium, utm_campaign, utm_content, utm_term,
page_url, user_agent, ip, created_at)
  VALUES (@id, @nombre, @email, @whatsapp, @pais, @fuente,
@utm_source, @utm_medium, @utm_campaign, @utm_content, @utm_term,
@page_url, @user_agent, @ip, @created_at)
`);

const stmtList = db.prepare(`
  SELECT id, nombre, email, whatsapp, pais, utm_source, utm_campaign, created_at
  FROM leads
  ORDER BY created_at DESC
  LIMIT @limit OFFSET @offset
`);

const stmtCount = db.prepare(`SELECT COUNT(*) as total FROM leads`);

const stmtAll = db.prepare(`
  SELECT * FROM leads ORDER BY created_at DESC
`);

const stmtDeleteAll = db.prepare(`
  DELETE FROM leads
`);

/* ─────────────────────────────────────────────
   APP EXPRESS
───────────────────────────────────────────── */
const app = express();

// Seguridad HTTP headers
app.use(helmet());

// CORS
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS: origen no permitido'));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// Servir archivos estáticos del frontend (padre del directorio backend)
app.use(express.static(path.join(__dirname, '..')));

/* ─────────────────────────────────────────────
   RATE LIMITING
───────────────────────────────────────────── */
const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,   // máx 10 envíos por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: 'Demasiadas solicitudes. Intente en 15 minutos.' },
});

const readLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
});

/* ─────────────────────────────────────────────
   MIDDLEWARE: AUTH para rutas administrativas
───────────────────────────────────────────── */
function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (!key || key !== API_KEY) {
        return res.status(401).json({ ok: false, message: 'No autorizado.' });
    }
    next();
}

/* ─────────────────────────────────────────────
   VALIDACIÓN DE LEAD
───────────────────────────────────────────── */
function validateLead(data) {
    const errors = [];

    if (!data.nombre || typeof data.nombre !== 'string' || data.nombre.trim().length < 2) {
        errors.push('nombre: mínimo 2 caracteres');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!data.email || !emailRegex.test(data.email.trim())) {
        errors.push('email: formato inválido');
    }

    const phoneRegex = /^\+?[\d\s\-().]{7,20}$/;
    if (!data.whatsapp || !phoneRegex.test(data.whatsapp.trim())) {
        errors.push('whatsapp: mínimo 7 dígitos');
    }

    if (!data.pais || typeof data.pais !== 'string' || data.pais.trim() === '') {
        errors.push('pais: requerido');
    }

    return errors;
}

/* ─────────────────────────────────────────────
   EMAIL SERVICE — Resend
──────────────────────────────────────────── */

// ── Enviar lead a n8n webhook
async function sendToN8n(lead) {
    try {
        console.log(`🔄 [N8N] Enviando lead a webhook: ${lead.email}`);
        console.log(`🔄 [N8N] URL: https://superozonoglobal.app.n8n.cloud/webhook-test/nuevo-lead`);

        const payload = {
            id: lead.id,
            nombre: lead.nombre,
            email: lead.email,
            whatsapp: lead.whatsapp,
            pais: lead.pais,
            fuente: lead.fuente,
            utm_source: lead.utm_source,
            utm_medium: lead.utm_medium,
            utm_campaign: lead.utm_campaign,
            utm_content: lead.utm_content,
            utm_term: lead.utm_term,
            page_url: lead.page_url,
            user_agent: lead.user_agent,
            ip: lead.ip,
            created_at: lead.created_at,
            timestamp: new Date().toISOString()
        };

        console.log(`🔄 [N8N] Payload a enviar:`, JSON.stringify(payload, null, 2));

        const n8nResponse = await fetch('https://superozonoglobal.app.n8n.cloud/webhook-test/nuevo-lead', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'SuperOzonoGlobal-API/1.0'
            },
            body: JSON.stringify(payload)
        });

        console.log(`🔄 [N8N] Response status: ${n8nResponse.status}`);
        console.log(`🔄 [N8N] Response headers:`, n8nResponse.headers);

        if (n8nResponse.ok) {
            const responseText = await n8nResponse.text();
            console.log('✅ [N8N] Lead enviado exitosamente a n8n');
            console.log(`✅ [N8N] Response body: ${responseText}`);
            return { success: true };
        } else {
            const errorText = await n8nResponse.text();
            console.error('❌ [N8N] Error al enviar lead a n8n:', n8nResponse.status, errorText);
            console.error(`❌ [N8N] Error details: Status ${n8nResponse.status}, Body: ${errorText}`);
            return { success: false, error: `HTTP ${n8nResponse.status}: ${errorText}` };
        }
    } catch (error) {
        console.error('❌ [N8N] Error de conexión con n8n:', error.message);
        console.error('❌ [N8N] Error stack:', error.stack);
        return { success: false, error: error.message };
    }
}

async function sendWelcomeEmail(lead) {
    try {
        console.log(`📧 [EMAIL-SERVER] Enviando correo a: ${lead.email}`);

        // Leer el logo como base64
        const logoPath = path.join(__dirname, '..', 'logo.png');
        const logoBase64 = fs.readFileSync(logoPath, 'base64');

        const emailContent = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Super Ozono Global - Confirmación de Registro</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>
body {
font-family: 'Inter', sans-serif;
margin: 0;
padding: 32px 16px;
background-color: #F8FAFC;
}
.container {
max-width: 672px;
margin: 0 auto;
background: white;
box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
border-radius: 16px;
overflow: hidden;
}
.header {
padding: 24px 32px;
border-bottom: 1px solid #F1F5F9;
display: flex;
align-items: center;
justify-content: space-between;
}
.brand {
display: flex;
align-items: center;
gap: 8px;
}
.logo {
width: 40px;
height: 40px;
background: #22c55e;
border-radius: 8px;
display: flex;
align-items: center;
justify-content: center;
overflow: hidden;
}
.logo img {
width: 28px;
height: 28px;
object-fit: contain;
}
.brand-name {
font-size: 20px;
font-weight: 700;
color: #0F172A;
}
.tag {
font-size: 12px;
font-weight: 500;
color: #94A3B8;
text-transform: uppercase;
letter-spacing: 0.05em;
}
.content {
padding: 40px 32px;
position: relative;
}
.watermark {
position: absolute;
top: 0;
left: 0;
right: 0;
bottom: 0;
background-image: url('cid:logo-watermark');
background-repeat: no-repeat;
background-position: center;
background-size: 200px;
opacity: 0.03;
pointer-events: none;
z-index: 0;
}
.content-inner {
position: relative;
z-index: 1;
}
.greeting {
color: #475569;
margin-bottom: 24px;
}
.message {
color: #475569;
margin-bottom: 32px;
}
.highlight {
font-weight: 600;
color: #22c55e;
}
.event-details {
background: #F8FAFC;
border: 1px solid #E2E8F0;
border-radius: 12px;
padding: 24px;
margin-bottom: 32px;
}
.event-item {
display: flex;
align-items: center;
gap: 12px;
margin-bottom: 12px;
}
.event-item:last-child {
margin-bottom: 0;
}
.event-icon {
color: #22c55e;
font-size: 20px;
width: 20px;
text-align: center;
}
.event-text {
color: #334155;
font-size: 14px;
}
.event-text strong {
color: #0F172A;
}
.event-text a {
color: #22c55e;
text-decoration: underline;
}
.reminders {
margin-bottom: 32px;
}
.reminders-title {
font-weight: 600;
color: #0F172A;
margin-bottom: 16px;
}
.reminders-list {
color: #475569;
padding-left: 20px;
margin: 0;
}
.reminders-list li {
margin-bottom: 12px;
}
.benefits {
background: #F0FDF4;
border-left: 4px solid #22c55e;
padding: 16px;
margin-bottom: 32px;
}
.benefits-text {
color: #334155;
font-size: 14px;
line-height: 1.6;
}
.benefits-text strong {
color: #22c55e;
}
.signature {
color: #475569;
}
.signature-name {
font-weight: 700;
color: #0F172A;
margin-top: 16px;
}
.footer {
background: #22c55e;
padding: 48px 32px;
text-align: center;
color: white;
}
.footer-title {
font-size: 32px;
font-weight: 700;
margin-bottom: 8px;
}
.footer-subtitle {
color: #DCFCE7;
margin-bottom: 32px;
}
.footer-buttons {
display: flex;
flex-direction: column;
gap: 16px;
margin-bottom: 40px;
}
.footer-button {
display: inline-flex;
align-items: center;
justify-content: center;
gap: 8px;
padding: 10px 24px;
background: rgba(255, 255, 255, 0.1);
border: 1px solid rgba(255, 255, 255, 0.3);
border-radius: 9999px;
color: white;
text-decoration: none;
font-weight: 500;
transition: all 0.2s;
}
.footer-button:hover {
background: rgba(255, 255, 255, 0.2);
}
.community-title {
font-size: 12px;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 0.1em;
color: #BBF7D0;
margin-bottom: 24px;
}
.social-links {
display: flex;
justify-content: center;
gap: 24px;
margin-bottom: 40px;
}
.social-link {
color: white;
text-decoration: none;
transition: color 0.2s;
}
.social-link:hover {
color: #DCFCE7;
}
.footer-description {
font-size: 10px;
color: rgba(255, 255, 255, 0.6);
line-height: 1.5;
max-width: 384px;
margin: 0 auto;
}
@media (max-width: 640px) {
.header {
flex-direction: column;
gap: 16px;
text-align: center;
}
.footer-buttons {
flex-direction: column;
}
.social-links {
flex-wrap: wrap;
}
}
</style>
</head>
<body>
<div class="container">
<div class="header">
<div class="brand">
<span class="brand-name">Super Ozono Global</span>
</div>
<div class="tag">Certificación Agrícola</div>
</div>

<div class="content">
<div class="watermark"></div>
<div class="content-inner">
<p class="greeting">Hola, ${lead.nombre},</p>
<p class="greeting">¡Un gusto saludarte!</p>
<p class="message">
Te confirmamos tu registro exitoso para el webinar exclusivo de <span class="highlight">Super Ozono Global</span>, en la fecha y hora acordadas:
</p>

<div class="event-details">
<div class="event-item">
<span class="event-icon"></span>
<span class="event-text"><strong>Día:</strong> 15 de Octubre de 2026</span>
</div>
<div class="event-item">
<span class="event-icon"></span>
<span class="event-text"><strong>Hora:</strong> 7:00 p.m. hora Colombia (GMT-5)</span>
</div>
<div class="event-item">
<span class="event-icon"></span>
<span class="event-text"><strong>Link de acceso:</strong> <a href="#">Enlace del webinar será enviado 30 minutos antes</a></span>
</div>
</div>

<div class="reminders">
<p class="reminders-title">Por favor, recuerda:</p>
<ol class="reminders-list">
<li>Tener acceso a una computadora o dispositivo con buena conexión a Internet.</li>
<li>Preparar tus preguntas sobre tecnología de ozono agrícola.</li>
<li>Estar en un lugar tranquilo para aprovechar al máximo el contenido.</li>
</ol>
</div>

<div class="benefits">
<p class="benefits-text">
Durante el webinar aprenderás sobre la tecnología de ozono más avanzada para agricultura, optimización de cultivos, reducción de químicos, y cómo liderar el mercado agrícola de alto rendimiento. Al finalizar, recibirás una <strong>guía técnica gratuita</strong> y acceso a nuestra comunidad exclusiva.
</p>
</div>


</div>
</div>

<div class="footer">
<p class="footer-description">
Super Ozono Global es líder en tecnología de ozono para agricultura. Transformamos la forma de cultivar con soluciones sostenibles y de alto rendimiento. Únete a la revolución agrícola del futuro.
</p>
</div>
</div>
</body>
</html>
`;

        const { data, error } = await resend.emails.send({
            from: 'Super Ozono Global <noreply@superozonoglobal.com>',
            to: [lead.email],
            subject: `🎉 ¡Tu lugar está reservado, ${lead.nombre}! - Webinar Super Ozono Global`,
            html: emailContent,
        });

        if (error) {
            console.error('❌ [EMAIL-SERVER] Error al enviar correo:', error);
            return { success: false, error: error.message };
        }

        console.log('✅ [EMAIL-SERVER] Correo enviado exitosamente:', data);
        return { success: true, data };

    } catch (error) {
        console.error('❌ [EMAIL-SERVER] Error en sendWelcomeEmail:', error.message);
        return { success: false, error: error.message };
    }
}

/* ─────────────────────────────────────────────
   HELPER: obtener IP real
──────────────────────────────────────────── */
function getClientIp(req) {
    return (
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.connection?.remoteAddress ||
        req.ip ||
        'unknown'
    );
}

/* ─────────────────────────────────────────────
   RUTAS
───────────────────────────────────────────── */

// ── Health check
app.get('/health', (req, res) => {
    const total = stmtCount.get().total;
    res.json({ ok: true, service: 'Super Ozono Global API', leads: total, ts: new Date().toISOString() });
});

// ── POST /api/leads — Crear lead
app.post('/api/leads', submitLimiter, async (req, res) => {
    console.log(`📥 [LEAD] Nueva petición de: ${req.ip}`);
    console.log(`📥 [LEAD] Headers:`, req.headers);
    console.log(`📥 [LEAD] Body:`, req.body);

    const body = req.body || {};

    // Validar
    const errors = validateLead(body);
    if (errors.length > 0) {
        return res.status(422).json({ ok: false, message: 'Datos inválidos.', errors });
    }

    const lead = {
        id: uuidv4(),
        nombre: body.nombre.trim(),
        email: body.email.trim().toLowerCase(),
        whatsapp: body.whatsapp.trim(),
        pais: body.pais.trim(),
        fuente: (body.fuente || '').substring(0, 255),
        utm_source: (body.utm_source || '').substring(0, 100),
        utm_medium: (body.utm_medium || '').substring(0, 100),
        utm_campaign: (body.utm_campaign || '').substring(0, 100),
        utm_content: (body.utm_content || '').substring(0, 100),
        utm_term: (body.utm_term || '').substring(0, 100),
        page_url: (body.page_url || '').substring(0, 500),
        user_agent: (body.user_agent || '').substring(0, 500),
        ip: getClientIp(req),
        created_at: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
    };

    try {
        stmtInsert.run(lead);

        console.log(`[LEAD] ${lead.created_at} | ${lead.nombre} | ${lead.email} | ${lead.pais}`);

        // Enviar lead a n8n webhook
        const n8nResult = await sendToN8n(lead);

        if (n8nResult.success) {
            console.log('✅ [LEAD] Lead enviado a n8n exitosamente');
        } else {
            console.error('❌ [LEAD] Error al enviar lead a n8n:', n8nResult.error);
            // No fallar el registro si n8n falla, solo loguear el error
        }

        // Enviar correo de bienvenida con Resend
        const emailResult = await sendWelcomeEmail(lead);

        if (emailResult.success) {
            console.log('✅ [LEAD] Correo enviado exitosamente');
        } else {
            console.error('❌ [LEAD] Error al enviar correo:', emailResult.error);
            // No fallar el registro si el correo falla, solo loguear el error
        }

        return res.status(201).json({
            ok: true,
            message: '¡Registro exitoso! Revisa tu correo.',
            id: lead.id,
            emailSent: emailResult.success,
        });

    } catch (err) {
        // Email duplicado (UNIQUE constraint)
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            // Determinar qué campo está duplicado
            let duplicateField = 'desconocido';
            let duplicateValue = '';

            if (err.message.includes('leads.email')) {
                duplicateField = 'email';
                duplicateValue = lead.email;
                console.log(`⚠️ [LEAD] Correo duplicado detectado: ${lead.email}`);
            } else if (err.message.includes('leads.whatsapp')) {
                duplicateField = 'whatsapp';
                duplicateValue = lead.whatsapp;
                console.log(`⚠️ [LEAD] WhatsApp duplicado detectado: ${lead.whatsapp}`);
            }

            let message = '';
            if (duplicateField === 'email') {
                message = 'Este correo electrónico ya está registrado para nuestro webinar. ¡Revisa tu bandeja de entrada para recibir todos los detalles del evento!';
            } else if (duplicateField === 'whatsapp') {
                message = 'Este número de WhatsApp ya está registrado para nuestro webinar. Por favor usa otro número o contáctanos si necesitas ayuda.';
            } else {
                message = 'Ya existe un registro con estos datos. Por favor verifica o contáctanos para ayuda.';
            }

            return res.status(409).json({
                ok: false,
                message: message,
                duplicate: true,
                field: duplicateField,
                value: duplicateValue,
                suggestion: 'Si no encuentras el correo, revisa tu carpeta de spam o contáctanos por WhatsApp para ayuda.'
            });
        }

        console.error('[ERROR] al insertar lead:', err);
        return res.status(500).json({ ok: false, message: 'Error interno del servidor.' });
    }
});

// ── DELETE /api/leads/clear — Limpiar todos los leads y resetear IDs (solo desarrollo)
app.delete('/api/leads/clear', requireApiKey, (req, res) => {
    try {
        console.log('🗑️ [LEAD] Iniciando limpieza de base de datos...');

        // Eliminar todos los leads
        const deleteResult = stmtDeleteAll.run();
        console.log(`🗑️ [LEAD] Leads eliminados: ${deleteResult.changes}`);

        // Resetear el contador auto-incremental para que empiece desde 1
        try {
            db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run('leads');
            console.log('🗑️ [LEAD] Contador de IDs reseteado');
        } catch (seqErr) {
            console.log('⚠️ [LEAD] No se pudo resetear contador (puede que no exista):', seqErr.message);
        }

        console.log(`🗑️ [LEAD] Limpieza completada: ${deleteResult.changes} leads eliminados`);

        res.json({
            ok: true,
            message: `Se eliminaron ${deleteResult.changes} leads de la base de datos y se reseteó el contador de IDs`,
            deleted: deleteResult.changes,
            idReset: true
        });
    } catch (err) {
        console.error('[ERROR] al limpiar leads:', err);
        res.status(500).json({ ok: false, message: 'Error al limpiar la base de datos', error: err.message });
    }
});

// ── GET /api/leads-debug — Ver leads (solo desarrollo)
app.get('/api/leads-debug', (req, res) => {
    try {
        const leads = stmtAll.all();
        console.log(`🔍 [DEBUG] Total leads en BD: ${leads.length}`);

        // Mostrar solo información básica por seguridad
        const basicInfo = leads.map(lead => ({
            email: lead.email,
            nombre: lead.nombre,
            created_at: lead.created_at
        }));

        res.json({
            ok: true,
            total: leads.length,
            data: basicInfo
        });
    } catch (error) {
        console.error('❌ [DEBUG] Error al consultar leads:', error);
        res.status(500).json({ ok: false, message: 'Error al consultar leads' });
    }
});

// ── GET /api/leads — Listar leads (admin)
app.get('/api/leads', readLimiter, requireApiKey, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '100'), 500);
    const offset = Math.max(parseInt(req.query.offset || '0'), 0);

    const rows = stmtList.all({ limit, offset });
    const total = stmtCount.get().total;

    res.json({ ok: true, total, limit, offset, data: rows });
});

// ── GET /api/leads/export — Exportar CSV (admin)
app.get('/api/leads/export', readLimiter, requireApiKey, (req, res) => {
    const rows = stmtAll.all();

    const headers = [
        'id', 'nombre', 'email', 'whatsapp', 'pais',
        'utm_source', 'utm_medium', 'utm_campaign',
        'fuente', 'ip', 'created_at',
    ];

    const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;

    const csv = [
        headers.join(','),
        ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
    ].join('\n');

    const filename = `leads_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM para Excel
});

/* ─────────────────────────────────────────────
   VIDEO ENDPOINTS — Cloudflare R2 (como kumo-ozono)
──────────────────────────────────────────── */

// ── GET /api/videos/manifest — Servir manifiesto HLS
app.get('/api/videos/manifest', async (req, res) => {
    try {
        const { path: filePath } = req.query;

        if (!filePath) {
            return res.status(400).json({ ok: false, message: 'Path is required' });
        }

        console.log('🎬 [VIDEO-SERVER] Serving manifest:', filePath);

        // Obtener el manifiesto desde R2
        const command = new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: filePath,
        });

        const response = await r2Client.send(command);
        const manifestBody = await response.Body?.transformToString();

        if (!manifestBody) {
            return res.status(404).json({ ok: false, message: 'Manifest not found' });
        }

        // Para landing page, no reescribimos las URLs (servimos directo)
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(manifestBody);

    } catch (error) {
        console.error('❌ [VIDEO-SERVER] Error serving manifest:', error.message);
        if (error.name === 'NoSuchKey') {
            return res.status(404).json({ ok: false, message: 'Video manifest not found in R2' });
        }
        res.status(500).json({ ok: false, message: 'Error processing video manifest' });
    }
});

// ── GET /api/videos/asset — Servir assets de video (segmentos, init, etc)
app.get('/api/videos/asset', async (req, res) => {
    try {
        const { path: filePath } = req.query;

        if (!filePath) {
            return res.status(400).json({ ok: false, message: 'Path is required' });
        }

        console.log('🎬 [VIDEO-SERVER] Serving asset:', filePath);

        const command = new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: filePath,
        });

        const response = await r2Client.send(command);

        // Pasar headers importantes
        if (response.ContentType) res.set('Content-Type', response.ContentType);
        if (response.ContentLength) res.set('Content-Length', String(response.ContentLength));
        if (response.CacheControl) res.set('Cache-Control', response.CacheControl);

        // Soporte para streaming
        res.set('Accept-Ranges', 'bytes');

        // Pipe del stream directamente a la respuesta
        response.Body.pipe(res);

    } catch (error) {
        console.error('❌ [VIDEO-SERVER] Error serving asset:', error.message);
        if (error.name === 'NoSuchKey') {
            return res.status(404).json({ ok: false, message: 'Asset not found in R2' });
        }
        res.status(500).json({ ok: false, message: 'Error streaming video asset' });
    }
});

// ── GET /api/videos/direct — Servir video MP4 directo
app.get('/api/videos/direct', async (req, res) => {
    try {
        const { path: filePath } = req.query;

        if (!filePath) {
            return res.status(400).json({ ok: false, message: 'Path is required' });
        }

        console.log('🎬 [VIDEO-SERVER] Serving direct video:', filePath);

        const command = new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: filePath,
        });

        const response = await r2Client.send(command);

        // Pasar headers para video
        if (response.ContentType) res.set('Content-Type', response.ContentType);
        if (response.ContentLength) res.set('Content-Length', String(response.ContentLength));
        res.set('Accept-Ranges', 'bytes');
        res.set('Cache-Control', 'public, max-age=31536000'); // 1 año cache

        // Pipe del stream directamente a la respuesta
        response.Body.pipe(res);

    } catch (error) {
        console.error('❌ [VIDEO-SERVER] Error serving direct video:', error.message);
        if (error.name === 'NoSuchKey') {
            return res.status(404).json({ ok: false, message: 'Video not found in R2' });
        }
        res.status(500).json({ ok: false, message: 'Error serving video' });
    }
});

/* ─────────────────────────────────────────────
   SPA FALLBACK — servir index.html para rutas desconocidas
──────────────────────────────────────────── */
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).json({ ok: false, message: 'Not found' });
    }
});

/* ─────────────────────────────────────────────
   ERROR HANDLER GLOBAL
───────────────────────────────────────────── */
app.use((err, req, res, _next) => {
    console.error('[ERROR GLOBAL]', err.message);
    res.status(500).json({ ok: false, message: 'Error interno.' });
});

/* ─────────────────────────────────────────────
   ARRANQUE
───────────────────────────────────────────── */
app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║Super Ozono Global — Backend API  ║
  ║Puerto: ${PORT}   ║
  ║Base de datos: /backend/data/leads.db ║
  ╠══════════════════════════════════════════════╣
  ║  POST  /api/leads → Crear lead   ║
  ║  GET   /api/leads → Listar (+ key)   ║
  ║  GET   /api/leads/export  → CSV (+ key)  ║
  ║  GET   /health→ Health check ║
  ╚══════════════════════════════════════════════╝
  `);
});

module.exports = app;
