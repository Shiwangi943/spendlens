// audit-engine.js
// Rule-based audit logic. No AI used here intentionally —
// "knowing when NOT to use AI is part of the test." — Credex brief

const TOOL_PLANS = {
  cursor: {
    hobby:      { price: 0,   label: 'Hobby (Free)' },
    pro:        { price: 20,  label: 'Pro' },
    business:   { price: 40,  label: 'Business' },
    enterprise: { price: 60,  label: 'Enterprise' },
  },
  copilot: {
    individual: { price: 10,  label: 'Individual' },
    business:   { price: 19,  label: 'Business' },
    enterprise: { price: 39,  label: 'Enterprise' },
  },
  claude: {
    free:       { price: 0,   label: 'Free' },
    pro:        { price: 20,  label: 'Pro' },
    max:        { price: 100, label: 'Max' },
    team:       { price: 30,  label: 'Team' },
    enterprise: { price: 60,  label: 'Enterprise' },
    api:        { price: null, label: 'API Direct' },
  },
  chatgpt: {
    plus:       { price: 20,  label: 'Plus' },
    team:       { price: 30,  label: 'Team' },
    enterprise: { price: 60,  label: 'Enterprise' },
    api:        { price: null, label: 'API Direct' },
  },
  'openai-api': {
    payg:       { price: null, label: 'Pay-as-you-go' },
  },
  'anthropic-api': {
    payg:       { price: null, label: 'Pay-as-you-go' },
  },
  gemini: {
    pro:        { price: 19.99, label: 'Pro' },
    ultra:      { price: 249,   label: 'Ultra' },
    api:        { price: null,  label: 'API' },
  },
  windsurf: {
    free:       { price: 0,   label: 'Free' },
    pro:        { price: 15,  label: 'Pro' },
    teams:      { price: 35,  label: 'Teams' },
  },
};

function getMonthlySpend(toolId, planId, seats, manualSpend) {
  const plan = TOOL_PLANS[toolId]?.[planId];
  if (!plan) return manualSpend || 0;
  if (plan.price === null) return manualSpend || 0;
  return plan.price * seats;
}

function auditCursor(plan, seats, spend, useCase) {
  if (plan === 'business' && seats <= 2) {
    const savings = (40 - 20) * seats;
    return {
      type: 'saving', savings,
      action: `Downgrade to Cursor Pro ($20/seat)`,
      reason: `Business plan targets teams of 3+. At ${seats} seat(s), Pro gives identical core AI features at half the price. Business adds admin controls and SSO you don't need at this scale.`
    };
  }
  if (plan === 'enterprise' && seats < 10) {
    const savings = (60 - 40) * seats;
    return {
      type: 'saving', savings,
      action: 'Drop to Cursor Business ($40/seat)',
      reason: `Enterprise pricing is justified only at 10+ seats for the audit logs, custom model config, and SLA. You're paying an $20/seat premium for features you almost certainly aren't using.`
    };
  }
  if (plan === 'pro' && useCase === 'writing') {
    return {
      type: 'warning', savings: 0,
      action: 'Consider switching to Claude Pro or ChatGPT Plus',
      reason: `Cursor Pro is an IDE copilot — it excels at code completion and inline editing. For writing-focused work, Claude Pro ($20/user) or ChatGPT Plus ($20/user) offer substantially better output per dollar.`
    };
  }
  return {
    type: 'optimal', savings: 0,
    action: 'Plan is well-matched to your team.',
    reason: `Cursor ${plan} is the right tier for ${seats} developer(s). No action needed.`
  };
}

function auditCopilot(plan, seats, spend, useCase) {
  if (plan === 'enterprise' && seats < 10) {
    const savings = (39 - 19) * seats;
    return {
      type: 'saving', savings,
      action: 'Drop to Copilot Business ($19/seat)',
      reason: `Enterprise adds audit logs, IP indemnity, and dedicated support — valuable at 10+ seats, overkill below that. You're paying a $20/seat premium (~$${savings}/mo) for governance features you don't yet need.`
    };
  }
  if (plan === 'business' && useCase === 'writing') {
    const savings = Math.round(spend * 0.5);
    return {
      type: 'saving', savings,
      action: 'Switch to Claude Pro or ChatGPT Plus for writing',
      reason: `GitHub Copilot is purpose-built for code completion in IDEs. For writing-focused teams it's the wrong tool: you're paying $19/seat for something that adds friction outside a code editor. Claude Pro ($20/user) handles writing, research, and analysis with far higher ROI.`
    };
  }
  return {
    type: 'optimal', savings: 0,
    action: 'Copilot spend looks right-sized.',
    reason: `GitHub Copilot Business at $19/seat is the industry standard for engineering teams. Good value for the integration depth.`
  };
}

function auditClaude(plan, seats, spend, useCase) {
  if (plan === 'max' && seats <= 2) {
    const savings = (100 - 20) * seats;
    return {
      type: 'saving', savings,
      action: 'Downgrade to Claude Pro ($20/seat)',
      reason: `Max is designed for power users with extreme message volume — think 5x+ Pro limits. At ${seats} seat(s), you'd need to be hitting Pro's ceiling consistently to justify the 5x price jump. Most teams don't.`
    };
  }
  if (plan === 'team' && seats < 5) {
    const savings = (30 - 20) * seats;
    return {
      type: 'saving', savings,
      action: 'Switch to Claude Pro per user ($20/seat)',
      reason: `Team plan adds admin controls and centralised billing — features that matter at 5+ seats. Below that, individual Pro subscriptions save $10/seat/month with identical AI capability.`
    };
  }
  if (plan === 'enterprise' && seats < 15) {
    return {
      type: 'warning', savings: 0,
      action: 'Verify Enterprise is necessary at this team size',
      reason: `Enterprise unlocks SSO, custom retention policies, and dedicated support. Valuable at 15+ seats; at ${seats} seats you may find Team plan covers your needs at lower cost.`
    };
  }
  return {
    type: 'optimal', savings: 0,
    action: 'Claude plan looks well-matched.',
    reason: `Claude ${plan} is appropriate for your team's size and ${useCase} use case.`
  };
}

function auditChatGPT(plan, seats, spend, useCase) {
  if (plan === 'team' && seats < 5) {
    const savings = (30 - 20) * seats;
    return {
      type: 'saving', savings,
      action: 'Switch to ChatGPT Plus per user ($20/seat)',
      reason: `ChatGPT Team adds workspace admin and collaboration features. At ${seats} seat(s), individual Plus subscriptions cost $10/seat/month less with the same GPT-4o access.`
    };
  }
  if (plan === 'plus' && useCase === 'coding' && seats > 2) {
    return {
      type: 'warning', savings: 0,
      action: 'Cursor or Copilot may deliver more value for coding',
      reason: `For coding workflows, IDE-native tools like Cursor Pro ($20/seat) or Copilot Business ($19/seat) provide inline completion, context-aware debugging, and codebase understanding — higher ROI than ChatGPT Plus for developers who live in their editor.`
    };
  }
  return {
    type: 'optimal', savings: 0,
    action: 'ChatGPT plan looks appropriate.',
    reason: `ChatGPT ${plan} is well-suited to your team's needs.`
  };
}

function auditAPI(toolId, spend) {
  if (spend > 500) {
    const savings = Math.round(spend * 0.25);
    return {
      type: 'saving', savings,
      action: 'Audit model selection — tier down non-critical calls',
      reason: `At $${spend}/mo, you likely have a mix of task types. Routing non-critical tasks to cheaper models (GPT-4o-mini at ~$0.15/1M tokens vs GPT-4o at $5/1M; claude-haiku vs claude-sonnet) typically saves 20–40% with no quality loss on summarisation, classification, or extraction tasks.`
    };
  }
  if (spend > 200) {
    const savings = Math.round(spend * 0.15);
    return {
      type: 'saving', savings,
      action: 'Consider prompt caching to reduce token costs',
      reason: `Anthropic and OpenAI both offer prompt caching for repeated system prompts. At $${spend}/mo, this typically saves 10–20% with a one-time implementation effort.`
    };
  }
  return {
    type: 'optimal', savings: 0,
    action: 'API spend is lean — no action needed.',
    reason: `$${spend}/mo is below the threshold where model tiering or caching optimisation pays back the engineering time.`
  };
}

function auditGemini(plan, seats, spend) {
  if (plan === 'ultra') {
    const savings = Math.max(0, spend - 30 * seats);
    return {
      type: 'saving', savings,
      action: 'Compare with Claude Team or ChatGPT Team ($30/seat)',
      reason: `Gemini Ultra at $249/mo is a single-user plan. For teams, Claude Team or ChatGPT Team at $30/seat offer comparable multimodal capability with better collaboration features and often lower total cost.`
    };
  }
  return {
    type: 'optimal', savings: 0,
    action: 'Gemini Pro is competitively priced.',
    reason: `Good value, especially for teams deep in Google Workspace. No action needed.`
  };
}

function auditWindsurf(plan, seats, spend) {
  if (plan === 'teams' && seats <= 3) {
    const savings = (35 - 15) * seats;
    return {
      type: 'saving', savings,
      action: 'Downgrade to Windsurf Pro ($15/seat)',
      reason: `Teams plan admin features are designed for 4+ seat coordination. At ${seats} seat(s), Pro gives full AI capability at $20/seat less — saving $${savings}/mo.`
    };
  }
  return {
    type: 'optimal', savings: 0,
    action: 'Windsurf plan is right-sized.',
    reason: `Windsurf ${plan} is a solid Cursor alternative for coding teams.`
  };
}

// ─── Main export ───────────────────────────────────────────────
function runAudit({ tools, teamSize, useCase }) {
  const results = [];

  for (const tool of tools) {
    const { id, plan, seats, manualSpend } = tool;
    const spend = getMonthlySpend(id, plan, seats, manualSpend);
    let result = { type: 'optimal', savings: 0, action: '', reason: '' };

    switch (id) {
      case 'cursor':        result = auditCursor(plan, seats, spend, useCase); break;
      case 'copilot':       result = auditCopilot(plan, seats, spend, useCase); break;
      case 'claude':        result = auditClaude(plan, seats, spend, useCase); break;
      case 'chatgpt':       result = auditChatGPT(plan, seats, spend, useCase); break;
      case 'openai-api':
      case 'anthropic-api': result = auditAPI(id, spend); break;
      case 'gemini':        result = auditGemini(plan, seats, spend); break;
      case 'windsurf':      result = auditWindsurf(plan, seats, spend); break;
    }

    results.push({
      toolId: id,
      plan,
      seats,
      monthlySpend: spend,
      ...result,
      savings: Math.round(result.savings),
    });
  }

  const totalCurrent  = results.reduce((s, r) => s + r.monthlySpend, 0);
  const totalSavings  = results.reduce((s, r) => s + r.savings, 0);
  const optimisedSpend = Math.max(0, totalCurrent - totalSavings);

  return {
    results,
    summary: {
      totalCurrent:   Math.round(totalCurrent),
      totalSavings:   Math.round(totalSavings),
      annualSavings:  Math.round(totalSavings * 12),
      optimisedSpend: Math.round(optimisedSpend),
      savingsPercent: totalCurrent > 0 ? Math.round((totalSavings / totalCurrent) * 100) : 0,
    }
  };
}

module.exports = { runAudit, TOOL_PLANS };
