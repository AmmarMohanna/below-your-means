# BelowYourMeans - Docker Commands
# Only Docker required - no local Node.js installation needed

.PHONY: dev dev-build dev-down local-test local-test-build local-test-down prod prod-build prod-down logs shell db-backup clean help

# Development
dev: ## Start development server with hot reload
	docker-compose -f docker-compose.dev.yml up

dev-build: ## Rebuild and start development server
	docker-compose -f docker-compose.dev.yml up --build

dev-down: ## Stop development server
	docker-compose -f docker-compose.dev.yml down

local-test: ## Start local test server against ./data-localtest
	docker-compose -p bym-localtest -f docker-compose.dev.yml -f docker-compose.localtest.yml up

local-test-build: ## Rebuild and start local test server against ./data-localtest
	docker-compose -p bym-localtest -f docker-compose.dev.yml -f docker-compose.localtest.yml up --build

local-test-down: ## Stop local test server
	docker-compose -p bym-localtest -f docker-compose.dev.yml -f docker-compose.localtest.yml down

# Production
prod: ## Start production server
	docker-compose up -d

prod-build: ## Rebuild and start production server
	docker-compose up -d --build

prod-down: ## Stop production server
	docker-compose down

# Utilities
logs: ## View production logs
	docker-compose logs -f

shell: ## Open shell in dev container
	docker-compose -f docker-compose.dev.yml exec dev sh

db-backup: ## Backup database
	@mkdir -p backups
	@cp data/belowyourmeans.db backups/backup-$$(date +%Y%m%d-%H%M%S).db
	@echo "Backup created in backups/"

clean: ## Remove all containers and volumes
	docker-compose -f docker-compose.dev.yml down -v --remove-orphans
	docker-compose down -v --remove-orphans
	rm -rf .next

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
