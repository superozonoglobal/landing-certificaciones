const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const app = express();

// Configuración Supabase (variables de entorno en Vercel)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Configuración Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10kb' }));

// Rate limiting
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas solicitudes. Intente en 15 minutos.' },
});

// Validación
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

// Health check
app.get('/health', async (req, res) => {
  try {
    const { count, error } = await supabase.from('leads').select('*', { count: 'exact', head: true });
    res.json({ ok: true, service: 'Super Ozono Global API', leads: count || 0 });
  } catch (err) {
    res.json({ ok: true, service: 'Super Ozono Global API', leads: 0 });
  }
});

// POST /api/leads - Crear lead
app.post('/api/leads', submitLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const errors = validateLead(body);
    if (errors.length > 0) {
      return res.status(422).json({ ok: false, message: 'Datos inválidos.', errors });
    }

    const lead = {
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
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      created_at: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
    };

    // Insertar en Supabase
    const { data: insertedLead, error } = await supabase.from('leads').insert([lead]).select();

    if (error) {
      if (error.code === '23505') {
        const duplicateField = error.message.includes('leads_email') ? 'email' : 'whatsapp';
        const duplicateValue = duplicateField === 'email' ? lead.email : lead.whatsapp;
        const message = duplicateField === 'email' 
          ? 'Este correo electrónico ya está registrado para nuestro webinar.'
          : 'Este número de WhatsApp ya está registrado para nuestro webinar.';
        
        return res.status(409).json({
          ok: false,
          message,
          duplicate: true,
          field: duplicateField,
          value: duplicateValue,
        });
      }
      throw error;
    }

    // Enviar a n8n
    try {
      await fetch('https://superozonoglobal.app.n8n.cloud/webhook-test/leads-landing-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: insertedLead[0].id,
          ...lead,
          timestamp: new Date().toISOString()
        })
      });
    } catch (n8nError) {
      console.error('Error n8n:', n8nError);
    }

    // Enviar email
    try {
      await resend.emails.send({
        from: 'Super Ozono Global <noreply@superozonoglobal.com>',
        to: [lead.email],
        subject: `🎉 ¡Tu lugar está reservado, ${lead.nombre}! - Webinar Super Ozono Global`,
        html: `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Super Ozono Global - Confirmación de Registro</title>
<style>
body { font-family: Arial, sans-serif; margin: 0; padding: 32px 16px; background-color: #F8FAFC; }
.container { max-width: 672px; margin: 0 auto; background: white; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); border-radius: 16px; }
.header { padding: 24px 32px; border-bottom: 1px solid #F1F5F9; text-align: center; }
.brand-name { font-size: 20px; font-weight: 700; color: #0F172A; }
.tag { font-size: 12px; color: #94A3B8; text-transform: uppercase; }
.content { padding: 40px 32px; }
.greeting { color: #475569; margin-bottom: 24px; }
.message { color: #475569; margin-bottom: 32px; }
.highlight { font-weight: 600; color: #22c55e; }
.event-details { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; margin-bottom: 32px; }
.event-item { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.event-icon { color: #22c55e; font-size: 20px; }
.event-text { color: #334155; font-size: 14px; }
.footer { background: #22c55e; padding: 48px 32px; text-align: center; color: white; }
.footer-title { font-size: 32px; font-weight: 700; margin-bottom: 8px; }
.footer-description { font-size: 10px; color: rgba(255, 255, 255, 0.6); line-height: 1.5; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<div class="brand-name">Super Ozono Global</div>
<div class="tag">Certificación Agrícola</div>
</div>
<div class="content">
<p class="greeting">Hola, ${lead.nombre},</p>
<p class="message">
Te confirmamos tu registro exitoso para el webinar exclusivo de <span class="highlight">Super Ozono Global</span>, en la fecha y hora acordadas:
</p>
<div class="event-details">
<div class="event-item">
<span class="event-icon">📅</span>
<span class="event-text"><strong>Día:</strong> 15 de Octubre de 2026</span>
</div>
<div class="event-item">
<span class="event-icon">🕐</span>
<span class="event-text"><strong>Hora:</strong> 7:00 p.m. hora Colombia (GMT-5)</span>
</div>
<div class="event-item">
<span class="event-icon">🔗</span>
<span class="event-text"><strong>Link de acceso:</strong> Se enviará 30 minutos antes</span>
</div>
</div>
</div>
<div class="footer">
<div class="footer-title">Super Ozono Global</div>
<div class="footer-description">
Líder en tecnología de ozono para agricultura. Transformamos la forma de cultivar con soluciones sostenibles y de alto rendimiento.
</div>
</div>
</div>
</body>
</html>`
      });
    } catch (emailError) {
      console.error('Error email:', emailError);
    }

    res.status(201).json({
      ok: true,
      message: '¡Registro exitoso! Revisa tu correo.',
      id: insertedLead[0].id,
    });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ ok: false, message: 'Error interno del servidor.' });
  }
});

// Exportar para Vercel
module.exports = app;
