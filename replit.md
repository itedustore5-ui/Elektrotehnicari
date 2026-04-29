# Електротехничар рачунара — Матурски Квиз

## Project Overview

A Serbian-language exam preparation quiz app for "Електротехничар рачунара" (Computer Technician) students. Features per-subject practice, subject-specific scoreboards, and an admin panel for managing users and results.

## Architecture

- **Frontend** (`artifacts/srpski-kviz`): React + Vite, Tailwind CSS v4, wouter v3 router, dark blue glassmorphism theme
- **API** (`artifacts/api-server`): Express 5, Drizzle ORM, PostgreSQL, custom HMAC-SHA256 JWT auth, bcryptjs
- **Database** (`lib/db`): Drizzle ORM schema with `quiz_users` and `quiz_attempts` tables

## Routing

| Path | Service |
|------|---------|
| `/` | srpski-kviz frontend (Vite, port 24149) |
| `/api/*` | API server (Express, port 8080) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/dashboard` | Dashboard stats + per-subject scores |
| GET | `/api/questions` | All 251 questions (shuffled options) |
| GET | `/api/questions?subject=KEY` | Questions filtered by subject |
| POST | `/api/attempts` | Submit quiz answers |
| GET | `/api/scoreboard` | Overall scoreboard |
| GET | `/api/scoreboard?subject=KEY` | Per-subject scoreboard |
| GET | `/api/admin/users` | All users (admin only) |
| POST | `/api/admin/users` | Create user (admin only) |
| PUT | `/api/admin/users/:id` | Update user (admin only) |
| DELETE | `/api/admin/users/:id` | Delete user (admin only) |
| GET | `/api/admin/results` | All quiz results (admin only) |

## Subjects

| Key | Label | Question IDs |
|-----|-------|--------------|
| `rh` | Рачунарски хардвер | 1–50 |
| `os` | Оперативни системи | 51–151 |
| `ors` | Одржавање рачунарских система | 152–200 |
| `td` | Техничка документација | 201–250 |

## Features

- **Login page**: Dark blue glassmorphism design
- **Dashboard**: Per-subject score cards (clickable — navigate to subject quiz), overall quiz button
- **Quiz**: 251 questions (single, multi, fill, match, order types), shuffled answer options, image support, explanation after each answer, dot progress indicator, back/forward navigation
- **Subject quiz**: Filter by `?subject=KEY` param, only shows subject's questions
- **Scoreboard**: Overall + per-subject (`?subject=KEY`), admin sees all students, student sees only themselves
- **Admin panel**: CRUD for users, view all results

## Default Credentials

- Admin: `admin` / `admin123`
- Student demo: `ucenik1` / `ucenik123`

## Database

Schema is managed by Drizzle ORM. To apply schema changes:
```
pnpm --filter @workspace/db run push
```

## Key Files

- `artifacts/api-server/src/data/questions.ts` — all 251 quiz questions
- `artifacts/api-server/src/routes/quiz.ts` — quiz logic, scoring, subject filtering
- `artifacts/api-server/src/routes/auth.ts` — login, JWT
- `artifacts/api-server/src/routes/admin.ts` — user management
- `artifacts/api-server/src/middlewares/auth.ts` — JWT verification middleware
- `artifacts/srpski-kviz/src/App.tsx` — full frontend (single-file React app)
- `lib/db/src/schema/index.ts` — database schema
