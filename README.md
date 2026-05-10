# SpendLens — AI Spend Audit

> Built for the Credex Web Development Intern Assignment 2026  
> Free tool that audits startup AI tool spend and surfaces savings opportunities.

---

## 🚀 Quick Start (2 minutes)

### Prerequisites
- Node.js v18+ ([nodejs.org](https://nodejs.org))
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com)) — optional, fallback summaries work without it

### 1. Install backend dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### 3. Start the backend

```bash
# In terminal 1 — from the /backend folder:
node server.js

# You should see:
# 🚀 SpendLens API running at http://localhost:3001
# Anthropic API: ✓ configured
```

### 4. Serve the frontend

```bash
# In terminal 2 — from the /frontend folder:
# Option A: Python (built into macOS/Linux)
python3 -m http.server 3000

# Option B: Node serve
npx serve . -p 3000

# Option C: VS Code Live Server
# Right-click index.html → "Open with Live Server"
# (change API URL in index.html to http://localhost:3001)
```

### 5. Open the app

```
http://localhost:3000
```

---

## 📁 Project Structure

```
spendlens/
├── backend/
│   ├── server.js          # Express API server
│   ├── audit-engine.js    # Rule-based audit logic (no AI — intentional)
│   ├── storage.js         # In-memory store (swap for Supabase in prod)
│   ├── package.json
│   └── .env.example       # Copy to .env and fill in keys
│
├── frontend/
│   └── index.html         # Complete single-file frontend
│
├── package.json           # Root scripts
└── README.md
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/audit` | Run audit, returns results + AI summary |
| GET | `/api/audit/:id` | Get saved audit by ID (PII-stripped) |
| POST | `/api/lead` | Capture email lead after audit |
| GET | `/api/leads` | Admin: list all leads (requires `x-admin-secret` header) |

### POST /api/audit — example request

```json
{
  "tools": [
    { "id": "cursor",  "plan": "business", "seats": 2,  "manualSpend": 0  },
    { "id": "claude",  "plan": "max",      "seats": 2,  "manualSpend": 0  },
    { "id": "openai-api", "plan": "payg",  "seats": 1,  "manualSpend": 350 }
  ],
  "teamSize": "2-5",
  "useCase": "coding"
}
```

### POST /api/audit — example response

```json
{
  "auditId": "uuid-here",
  "results": [
    {
      "toolId": "cursor",
      "plan": "business",
      "seats": 2,
      "monthlySpend": 80,
      "type": "saving",
      "savings": 40,
      "action": "Downgrade to Cursor Pro ($20/seat)",
      "reason": "Business plan targets teams of 3+..."
    }
  ],
  "summary": {
    "totalCurrent": 630,
    "totalSavings": 240,
    "annualSavings": 2880,
    "optimisedSpend": 390,
    "savingsPercent": 38
  },
  "aiSummary": "Your team is spending $630/month...",
  "shareUrl": "/audit/uuid-here"
}
```

---

## 🔧 Configuration

### Anthropic API (AI summaries)
Without a key, the app uses templated fallback summaries. The audit math still works perfectly.

### Email (Resend)
Add `RESEND_API_KEY` and `FROM_EMAIL` to `.env`. Without it, leads are stored but no email is sent.

### Production database (Supabase)
`storage.js` is designed to be swapped. The file contains commented-out Supabase code — install `@supabase/supabase-js`, add your keys to `.env`, and uncomment the Supabase section.

---

## 🛡️ Security & Abuse Protection

- **Rate limiting**: 20 audits per IP per 15 min; 10 lead captures per IP per hour
- **Honeypot field**: hidden `_hp` field catches bots without user friction
- **Input validation**: all fields sanitised server-side
- **No secrets in repo**: all keys via `.env` (gitignored)

---

## 📊 Pricing Data Sources

All pricing verified week of submission. See `backend/audit-engine.js` for the logic.

| Tool | Source |
|------|--------|
| Cursor | https://cursor.com/pricing |
| GitHub Copilot | https://github.com/features/copilot#pricing |
| Claude | https://anthropic.com/pricing |
| ChatGPT | https://openai.com/chatgpt/pricing |
| Gemini | https://one.google.com/about/plans |
| Windsurf | https://windsurf.com/pricing |

---

## 🚢 Deployment

### Backend → Render / Fly.io
```bash
# Render: connect GitHub repo, set env vars in dashboard, deploy
# The server.js listens on process.env.PORT automatically
```

### Frontend → Vercel / Netlify / Cloudflare Pages
```bash
# Just deploy the /frontend folder
# Update the API constant in index.html to your deployed backend URL:
# const API = 'https://your-backend.onrender.com';
```

---

## 🤝 Credits

Built by [Your Name] for the Credex Web Dev Intern Assignment 2026.  
Powered by the [Anthropic API](https://anthropic.com).
