.PHONY: dev dev-backend dev-frontend seed test

# Run the backend API with autoreload (repo root, so `backend` resolves as a package)
dev-backend:
	uvicorn backend.main:app --reload

# Run the frontend Vite dev server
dev-frontend:
	cd frontend && npm run dev

# Convenience alias while only the backend is runnable (Phase 0 Task 0.1);
# once Docker Compose (Task 0.5) lands, this should become `docker compose up`.
dev: dev-backend

# Seed the deterministic 3-meeting demo dataset (Phase 7.3) — not implemented yet.
seed:
	python scripts/seed.py

# Run the backend test suite.
test:
	pytest backend
