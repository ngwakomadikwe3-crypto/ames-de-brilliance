# AMES DE BRILLIANCE

A B2B wholesale diamond sourcing platform for a licensed dealer in Botswana. Built with Next.js, Tailwind CSS, SQLite, and DeepSeek AI.

## Quick Start

```bash
npm install
cp .env.example .env.local   # edit with your values
npm run dev                   # http://localhost:3000
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_PASSWORD` | `ames2026` | Dealer login password |
| `SESSION_SECRET` | built-in | HMAC session signing secret (change in production) |
| `DEEPSEEK_API_KEY` | — | API key for DeepSeek or any OpenAI-compatible provider |
| `AI_BASE_URL` | `https://api.deepseek.com` | LLM API base URL |
| `AI_MODEL` | `deepseek-chat` | Model name |
| `SMTP_HOST` | — | SMTP server host (required for email notifications) |
| `SMTP_PORT` | `587` | SMTP port (587 for TLS, 465 for SSL) |
| `SMTP_USER` | — | SMTP username / login |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | `SMTP_USER` | Sender address |
| `NOTIFY_EMAIL` | `SMTP_USER` | Notification recipient address |

## Pages

| Route | Access | Description |
|---|---|---|
| `/` | Public | Available diamond stock (rough + polished) |
| `/request` | Public | Sourcing request form |
| `/success` | Public | Post-submission confirmation |
| `/login` | Public | Dealer login |
| `/dashboard` | Auth | Requests, Stones, Add Stone, Paste-in, Traders |
| `/terms` | Public | Terms of Use |
| `/privacy` | Public | Privacy Policy |
| `/compliance` | Public | KP compliance & licensing |

## Supabase Setup (Production)

1. Create a new Supabase project
2. Run `schema.sql` in the SQL Editor to create tables + photo bucket
3. Set environment variables in the Supabase dashboard
4. Deploy with `npx vercel --prod` or your preferred platform

## Features

- **Rough & polished diamond listings** with KP compliance badges
- **Sourcing request form** with validation, consent, and KP fields for rough
- **Dealer dashboard** with 5 tabs: Requests, Stones, Add Stone, Paste-in, Traders
- **AI-powered tools**: parse requests, draft replies, generate offers, bulk-import stock
- **Offer generator**: AI matches inventory to buyer specs, produces plain-text offer sheets
- **Paste-in tab**: bulk paste stock text, AI parses into editable cards, one-click publish
- **Session-based auth** with HMAC-signed cookies
- **Responsive design** — mobile hamburger menu, stacked cards, tappable buttons
- **Legal pages** — Terms, Privacy, Compliance with Kimberley Process disclosures

## Tech Stack

- Next.js 16 (App Router, Turbopack)
- Tailwind CSS v4
- SQLite via better-sqlite3
- DeepSeek API (OpenAI-compatible)
- Zod validation
- Inter font
