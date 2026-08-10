.PHONY: dev dev-backend dev-frontend worker docker-up seed test

# Run the backend API with autoreload. `app` resolves as a package because
# cwd is backend/ — this matches how the Dockerfile runs it too.
dev-backend:
	cd backend && uvicorn app.main:app --reload

# Run the frontend Vite dev server
dev-frontend:
	cd frontend && npm run dev

# Run the Celery worker locally (needs Redis reachable at REDIS_URL,
# e.g. `docker compose up -d redis`).
worker:
	cd backend && celery -A app.core.celery_app worker --loglevel=info

# Bring up the full stack (redis, neo4j, fastapi-backend, celery-worker,
# frontend-dev) via Docker Compose.
docker-up:
	docker compose up --build

# Convenience alias while iterating on just the backend (Phase 0);
# use `make docker-up` for the full stack.
dev: dev-backend

# Seed the deterministic demo dataset (Phase 7) — not implemented yet.
seed:
	cd backend && python scripts/seed.py

# Run the backend test suite.
test:
	cd backend && pytest
