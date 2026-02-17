# crumb

Task management CLI/TUI with AI-powered decomposition.

## Tech Stack
- TypeScript, Ink (React), SQLite (better-sqlite3), tsup
- ESM modules

## Build
```bash
npm run build   # tsup build
npm run dev     # tsup --watch
```

## Project Structure
- src/index.ts - CLI entry point
- src/app.tsx - Ink root component
- src/db.ts - SQLite database layer
- src/services/tasks.ts - Task CRUD operations
- src/services/ai.ts - AI service (Claude)
- src/components/ - Ink/React components
