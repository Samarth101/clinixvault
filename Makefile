.PHONY: all dev test lint format compile-cpp deploy-edge deploy-cloud clean help

help:
	@echo "ClinixVault Build & Orchestration Commands:"
	@echo "  make compile-cpp   Compile C++ low-level inference acceleration library"
	@echo "  make dev           Start all microservices locally via Docker Compose"
	@echo "  make test          Run complete unit and integration test suite"
	@echo "  make lint          Run linter checks across codebase"
	@echo "  make format        Format code using black and ruff"
	@echo "  make deploy-edge   Apply K3s edge Kubernetes manifests"
	@echo "  make deploy-cloud  Deploy cloud Docker Compose configuration"
	@echo "  make clean         Remove build artifacts and temporary caches"

compile-cpp:
	@echo "Compiling C++ inference accelerator..."
	$(MAKE) -C inference/cpp

dev: compile-cpp
	@echo "Starting ClinixVault services locally via Docker Compose..."
	docker compose -f deployment/docker-compose.yml up --build

test: compile-cpp
	@echo "Executing ClinixVault test suite with pytest..."
	python3 -m pytest tests/unit tests/integration -v

lint:
	@echo "Running code quality checks..."
	python3 -m ruff check . || true

format:
	@echo "Formatting Python files..."
	python3 -m black backend inference training tests || true

deploy-edge:
	@echo "Deploying to Edge K3s cluster..."
	kubectl apply -f deployment/k3s/namespace.yaml
	kubectl apply -f deployment/k3s/services/
	kubectl apply -f deployment/k3s/deployments/

deploy-cloud:
	@echo "Deploying to Cloud environment..."
	docker compose -f deployment/docker-compose.cloud.yml up -d

clean:
	@echo "Cleaning temporary files and build artifacts..."
	rm -rf .pytest_cache __pycache__ */__pycache__ */*/__pycache__ */*/*/__pycache__
	$(MAKE) -C inference/cpp clean
