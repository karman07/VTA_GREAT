# VTA — Virtual Teaching Assistant (web app)

One Next.js app for **teachers and students**. It is a pure front end: all data, auth, limits and AI
live in the existing NestJS API (`../teacher_rag_main`) and RAG service (`../teacher_rag_ai`).

- Cream + deep-green light theme (no dark mode)
- Separate teacher / student sign-up and sign-in, both requiring acceptance of the Terms and Privacy Policy
- Teacher: 3 subjects, 3 documents per subject, class code + invite link, student list, student questions
- Student: join by code, 10 questions per subject, streamed cited answers, full saved chat history
- `/terms` and `/privacy` pages written to match what the product actually does

## Run

```bash
# 1. Postgres + backend (teacher_rag_main): needs DATABASE_URL, JWT_SECRET, RAG_SERVICE_URL in .env
cd ../teacher_rag_main && npx prisma migrate deploy && npm run start:dev      # http://localhost:3000/api

# 2. RAG service (teacher_rag_ai): needs GEMINI_API_KEY in .env
cd ../teacher_rag_ai && .venv/bin/python -m uvicorn main:app --port 8000

# 3. This app
cp .env.example .env.local     # NEXT_PUBLIC_API_URL → the Nest API, e.g. http://localhost:3000/api
npm run dev                    # http://localhost:3000 (use -p to change the port)
```

## Where the limits live

The server enforces them (`teacher_rag_main/src/common/limits.ts`) and exposes them at `GET /api/config`.
The UI reads that endpoint; `lib/constants.ts` holds the same numbers as an offline fallback and for the
legal pages. Change a limit in **both** files, and update the Terms text if wording needs to change.
