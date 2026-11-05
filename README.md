# AMES DE BRILLIANTE

Existing Next.js application for a jewellery showroom, SAME chat, staff-assisted jewellery onboarding, and diamond/precious-stone catalogue workflows. Commercial availability, licensing and product approval must be verified separately; demonstration assets are not proof of available stock.

## Actual architecture

- Next.js App Router and React, styled with Tailwind and the existing emerald silk environment.
- Appwrite database `ames` and storage via `node-appwrite` (`src/lib/appwrite.ts`, `src/lib/db.ts`). `schema.sql` is an Appwrite reference, **not executable SQL**. Supabase is not this application's backend; the retained `better-sqlite3` dependency is not evidence of an active SQLite data path.
- Staff login uses AMES signed session cookies and Appwrite staff records; private customer Chat uses a separate signed visitor cookie. See `docs/chat-privacy.md`.
- SAME uses Dify through `/api/ames`; separate dashboard AI helpers use the configured OpenAI-compatible endpoint in `src/lib/ai.ts`.
- The vendored `ames-engine` renders the representative ring. `@google/model-viewer` remains necessary for other active and legacy viewers.
- Public content packs are under `public/ames-engine`. Their review flags are meaningful; loading a pack does not constitute commercial approval.
- Original jewellery uploads are private Appwrite files. CAD jobs and previews use a private local worker or the optional authenticated hosted adapter. The web server does not run Blender.

The npm package's historical name is `freebuff-app`; it is not a separate running product. No dependency migration is needed merely to rename it.

## Local development

```sh
npm install
npm run dev -- --port 3010
```

Configure private environment variables locally. Do not copy credentials into documentation, screenshots or shared archives. Expired Appwrite credentials must be replaced through the account's normal secret-management process.

| Variables | Purpose |
| --- | --- |
| `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY` | Server-side Appwrite connection |
| `SESSION_SECRET` | Private cookie signing; minimum 32 characters |
| `OWNER_CODE`, `COUSIN_CODE` | Optional existing emergency staff access configuration |
| `DIFY_API_KEY` | SAME chat provider |
| `DEEPSEEK_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | Separate dashboard AI helpers |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `NOTIFY_EMAIL` | Notification mail configuration |
| `AMES_ENGINE_PACK_DIR`, `AMES_ENGINE_PACK_DIRS` | Explicit source pack location(s) for staff review and sync |
| `AMES_CAD_SERVICE_URL`, `AMES_CAD_SERVICE_TOKEN` | Optional private HTTPS CAD broker |

Do not run content-sync commands blindly: they copy from configured source packs (otherwise a sibling engine checkout) and may overwrite reviewed public presentation contracts. Read and reconcile the ring presentation changes documented below first.

## Current surfaces and limits

- `/` temporarily redirects to `/app`.
- `/app`: Boutique, Chat, Media and diamonds/precious-stones Auction. Existing silk, page turns and mobile SAFE rendering remain.
- `/login` and `/dashboard`: staff access and operational workflows, including `jewelry_products` with technical and visual approval gates.
- Legacy trader/model/stone portals and APIs remain active compatibility paths.
- Media likes, saves and comments are device-local. Billing directs customers to the AMES desk; online invoice history is not connected. Auction bidding and payments are not available.
- Native Rhino/Matrix `.3dm` files are retained as private originals and require a companion mesh export. Do not advertise native 3DM/STEP conversion or jeweller self-service as complete.

## Validation and CAD hosting

```sh
npm run build
npx tsc --noEmit
npm run test:ames-chat
npm run test:ames-boutique
npm run test:ames-media
npm run test:jewelry-onboarding
npm run test:cad
```

- `docs/representative-ring-audit.md`: current audit, screenshots, measurements, changed files and remaining approval requirements.
- `docs/jewelry-asset-quality.md`: ring/earring/pendant acceptance checklist.
- `docs/cad-processing.md`: private CAD workflow and local test limitations.
- `deploy/cad/README.md`: hosting review package. Linux Docker deployment and full hosted acceptance remain unverified; this documentation does not provision or deploy a service.
