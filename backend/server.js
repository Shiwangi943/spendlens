// server.js — SpendLens Backend
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const { runAudit } = require('./audit-engine');
const { saveAudit, getAudit, saveLead, getAllLeads } = require('./storage');

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use(express.json());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
  ],
  credentials: true,
}));
const path = require('path');

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Catch-all: serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// Rate limiting (abuse protection)
const auditLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: 'Too many audit requests. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: 'Too many submissions from this IP.' },
});

// ─── HONEYPOT MIDDLEWARE ──────────────────────────────────────
function checkHoneypot(req, res, next) {
  if (req.body._hp && req.body._hp !== '') {
    // Bot filled the hidden field — silently accept but don't process
    return res.json({ ok: true, id: uuidv4() });
  }
  next();
}

// ─── ROUTES ───────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', ts: new Date().toISOString() });
});

// POST /api/audit — run the audit engine + call Anthropic for summary
app.post('/api/audit', auditLimiter, async (req, res) => {
  try {
    const { tools, teamSize, useCase } = req.body;

    // Validation
    if (!Array.isArray(tools) || tools.length === 0) {
      return res.status(400).json({ error: 'Provide at least one tool.' });
    }
    if (tools.length > 12) {
      return res.status(400).json({ error: 'Maximum 12 tools per audit.' });
    }
    for (const t of tools) {
      if (!t.id || !t.plan) return res.status(400).json({ error: 'Each tool needs id and plan.' });
      t.seats      = Math.min(Math.max(parseInt(t.seats) || 1, 1), 10000);
      t.manualSpend = Math.min(Math.max(parseFloat(t.manualSpend) || 0, 0), 1000000);
    }

    // Run deterministic audit engine
    const auditData = runAudit({ tools, teamSize, useCase });

    // Save to store
    const saved = await saveAudit({ tools, teamSize, useCase, auditData });

    // Generate AI summary (non-blocking — send audit immediately, stream summary separately)
    const aiSummary = await generateAISummary(auditData, teamSize, useCase).catch(() => null);

    res.json({
      auditId:   saved.id,
      results:   auditData.results,
      summary:   auditData.summary,
      aiSummary: aiSummary || buildFallbackSummary(auditData.summary, teamSize, useCase),
      shareUrl:  `/audit/${saved.id}`,
    });

  } catch (err) {
    console.error('[/api/audit]', err);
    res.status(500).json({ error: 'Audit failed. Please try again.' });
  }
});

// GET /api/audit/:id — retrieve a saved audit (PII-stripped for public sharing)
app.get('/api/audit/:id', async (req, res) => {
  try {
    const audit = await getAudit(req.params.id);
    if (!audit) return res.status(404).json({ error: 'Audit not found.' });

    // Strip any PII — only tool data and savings numbers returned
    const { results, summary, teamSize, useCase, createdAt } = audit;
    res.json({ results, summary, teamSize, useCase, createdAt });
  } catch (err) {
    res.status(500).json({ error: 'Could not retrieve audit.' });
  }
});

// POST /api/lead — capture email after audit
app.post('/api/lead', leadLimiter, checkHoneypot, async (req, res) => {
  try {
    const { email, company, role, auditId, totalSavings } = req.body;

    if (!email || !email.includes('@') || email.length > 254) {
      return res.status(400).json({ error: 'Valid email required.' });
    }
    if (!auditId) {
      return res.status(400).json({ error: 'auditId required.' });
    }

    const lead = await saveLead({ email, company, role, auditId, totalSavings: totalSavings || 0 });

    // Send transactional email if Resend key configured
    if (process.env.RESEND_API_KEY) {
      sendAuditEmail(email, company, totalSavings, auditId).catch(e =>
        console.warn('[email] Failed to send:', e.message)
      );
    }

    res.json({ ok: true, leadId: lead.id, highValue: lead.highValue });
  } catch (err) {
    console.error('[/api/lead]', err);
    res.status(500).json({ error: 'Could not save your details. Please try again.' });
  }
});

// GET /api/leads — internal admin endpoint (basic secret check)
app.get('/api/leads', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  getAllLeads().then(leads => res.json({ leads, count: leads.length }));
});

// ─── AI SUMMARY GENERATION ────────────────────────────────────
async function generateAISummary(auditData, teamSize, useCase) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('No API key');

  const { results, summary } = auditData;
  const toolList = results.map(r =>
    `${r.toolId} (${r.plan}, $${r.monthlySpend}/mo): ${r.action}`
  ).join('; ');

  const prompt = `You are a financial advisor specialising in SaaS cost optimisation for startups.
Write a 90-110 word personalised audit summary.

Team: ${teamSize} people, primary use case: ${useCase}
Current AI spend: $${summary.totalCurrent}/month
Potential savings found: $${summary.totalSavings}/month (${summary.savingsPercent}%)
Tools audited: ${toolList}

Rules:
- Start with "Your team is..."
- Tone: direct, honest, founder-to-founder. No fluff or filler.
- If savings > $200/mo, mention Credex (credex.rocks) as a source of discounted AI credits.
- If spend is already lean, say so — don't manufacture urgency.
- No bullet points, no headers, no markdown. Plain paragraph only.
- End with one specific, actionable next step.`;

  // Dynamic import for ESM node-fetch
  const fetch = (await import('node-fetch')).default;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API ${response.status}`);
  const data = await response.json();
  return data.content?.[0]?.text || null;
}

function buildFallbackSummary(summary, teamSize, useCase) {
  const { totalCurrent, totalSavings, annualSavings } = summary;
  if (totalSavings > 500) {
    return `Your team is spending $${totalCurrent.toLocaleString()}/month on AI tools — and this audit found $${totalSavings.toLocaleString()}/month in savings you're leaving on the table. That's $${annualSavings.toLocaleString()} annually. The biggest opportunities are plan right-sizing and switching from retail pricing to discounted credits. For a ${teamSize}-person team focused on ${useCase}, acting on these recommendations this month is the highest-ROI change you can make to your SaaS bill. Consider booking a consultation at credex.rocks to go further.`;
  }
  if (totalSavings > 0) {
    return `Your team is spending $${totalCurrent.toLocaleString()}/month on AI tools. The audit found $${totalSavings.toLocaleString()} in monthly savings through plan adjustments — modest but worth capturing. The optimisations above will also right-size your stack for growth, so you're on the correct tier when your team expands.`;
  }
  return `Your team is spending $${totalCurrent.toLocaleString()}/month on AI tools — and you're spending it well. Based on your ${teamSize}-person team's focus on ${useCase}, your current plans look appropriately matched. No immediate action required. Revisit this audit when your team size changes or when new pricing tiers emerge.`;
}

// ─── TRANSACTIONAL EMAIL ──────────────────────────────────────
async function sendAuditEmail(email, company, savings, auditId) {
  const fetch = (await import('node-fetch')).default;
  const body = {
    from: process.env.FROM_EMAIL || 'audit@credex.rocks',
    to: email,
    subject: `Your SpendLens AI Spend Audit${savings > 0 ? ` — $${savings}/mo in savings found` : ''}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1916">
        <h1 style="color:#1a472a">SpendLens Audit Report</h1>
        <p>Hi${company ? ` from ${company}` : ''},</p>
        <p>Your AI spend audit is ready. We found <strong>$${savings}/month</strong> in potential savings.</p>
        <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/audit/${auditId}" style="background:#1a472a;color:#fff;padding:12px 24px;border-radius:20px;text-decoration:none;display:inline-block;margin:1rem 0">View your audit →</a></p>
        ${savings > 500 ? `<p>Because your savings opportunity is significant, a Credex advisor will be in touch to discuss discounted AI credits. You can also book directly at <a href="https://credex.rocks">credex.rocks</a>.</p>` : ''}
        <hr style="border:none;border-top:1px solid #e2dfd8;margin:2rem 0"/>
        <p style="font-size:12px;color:#9a9890">SpendLens is a free tool by <a href="https://credex.rocks" style="color:#1a472a">Credex</a>.</p>
      </div>
    `,
  };

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

// ─── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 SpendLens API running at http://localhost:${PORT}`);
  console.log(`   Anthropic API: ${process.env.ANTHROPIC_API_KEY ? '✓ configured' : '✗ not set (fallback summaries will be used)'}`);
  console.log(`   Email (Resend): ${process.env.RESEND_API_KEY ? '✓ configured' : '✗ not set (emails skipped)'}`);
  console.log(`   Storage: in-memory (replace storage.js with Supabase for production)\n`);
});

module.exports = app;
