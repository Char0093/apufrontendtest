.PHONY: dev dev-backend dev-frontend seed test

# Run the backend API with autoreload. `app` resolves as a package because
# cwd is backend/ — this matches how the Dockerfile runs it too.
dev-backend:
	cd backend && uvicorn app.main:app --reload

# Run the frontend Vite dev server
dev-frontend:
	cd frontend && npm run dev

# Convenience alias while only the backend is runnable (Phase 0);
# once Docker Compose (Task 0.5) lands, this should become `docker compose up`.
dev: dev-backend

# Seed the deterministic demo dataset (Phase 7) — not implemented yet.
seed:
	cd backend && python scripts/seed.py

# Run the backend test suite.
test:
	cd backend && pytest
