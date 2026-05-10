// storage.js
// In-memory store for development. 
// Replace with Supabase/Postgres for production (see comments below).

const { v4: uuidv4 } = require('uuid');

// In-memory stores
const audits = new Map();   // auditId -> audit record
const leads  = new Map();   // leadId  -> lead record

// ─── AUDIT STORE ──────────────────────────────────────────────
async function saveAudit({ tools, teamSize, useCase, auditData }) {
  const id = uuidv4();
  const record = {
    id,
    createdAt: new Date().toISOString(),
    teamSize,
    useCase,
    tools,          // stored for potential re-run
    results: auditData.results,
    summary: auditData.summary,
  };
  audits.set(id, record);
  return { id, ...record };
}

async function getAudit(id) {
  return audits.get(id) || null;
}

// ─── LEAD STORE ───────────────────────────────────────────────
async function saveLead({ email, company, role, auditId, totalSavings }) {
  const id = uuidv4();
  const record = {
    id,
    createdAt: new Date().toISOString(),
    email,
    company: company || null,
    role: role || null,
    auditId,
    totalSavings,
    highValue: totalSavings > 500,
  };
  leads.set(id, record);
  console.log(`[LEAD] ${email} | savings=$${totalSavings} | highValue=${record.highValue}`);
  return record;
}

async function getAllLeads() {
  return [...leads.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = { saveAudit, getAudit, saveLead, getAllLeads };

/*
─── SUPABASE REPLACEMENT (production) ────────────────────────────

npm install @supabase/supabase-js

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function saveAudit({ tools, teamSize, useCase, auditData }) {
  const id = require('uuid').v4();
  const { data, error } = await supabase.from('audits').insert([{
    id, team_size: teamSize, use_case: useCase,
    tools_json: JSON.stringify(tools),
    results_json: JSON.stringify(auditData.results),
    summary_json: JSON.stringify(auditData.summary),
  }]).select().single();
  if (error) throw error;
  return data;
}

async function getAudit(id) {
  const { data } = await supabase.from('audits').select('*').eq('id', id).single();
  return data;
}

async function saveLead({ email, company, role, auditId, totalSavings }) {
  const { data, error } = await supabase.from('leads').insert([{
    email, company, role, audit_id: auditId,
    total_savings: totalSavings, high_value: totalSavings > 500,
  }]).select().single();
  if (error) throw error;
  return data;
}
*/
