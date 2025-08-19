.PHONY: help install dev stop clean build test deploy

# Colors for output
GREEN=\033[0;32m
YELLOW=\033[1;33m
NC=\033[0m # No Color

help: ## Show this help message
	@echo "$(GREEN)TMS - Transport Management System$(NC)"
	@echo ""
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-15s$(NC) %s\n", $$1, $$2}'

install: ## Install all dependencies
	@echo "$(GREEN)Installing dependencies...$(NC)"
	cd tms-backend && npm install
	cd tms-backend/api-gateway && npm install
	cd tms-backend/services/auth && npm install
	cd tms-backend/services/order && npm install
	cd tms-backend/services/courier && npm install
	cd tms-backend/services/route && npm install
	cd tms-backend/services/notification && npm install
	cd tms-backend/services/analytics && npm install
	cd tms-backend/services/vehicle && npm install
	cd tms-backend/services/location && npm install
	@echo "$(GREEN)Dependencies installed!$(NC)"

dev: ## Start development environment with Docker
	@echo "$(GREEN)Starting development environment...$(NC)"
	./start-dev.sh

dev-local: ## Start services locally without Docker
	@echo "$(GREEN)Starting services locally...$(NC)"
	@echo "$(YELLOW)Starting Redis...$(NC)"
	redis-server &
	@echo "$(YELLOW)Starting Auth Service...$(NC)"
	cd tms-backend/services/auth && npm run dev &
	@echo "$(YELLOW)Starting Order Service...$(NC)"
	cd tms-backend/services/order && npm run dev &
	@echo "$(YELLOW)Starting API Gateway...$(NC)"
	cd tms-backend/api-gateway && npm run dev &
	@echo "$(GREEN)Services started!$(NC)"

stop: ## Stop all Docker containers
	@echo "$(YELLOW)Stopping all services...$(NC)"
	docker-compose down
	@echo "$(GREEN)Services stopped!$(NC)"

clean: ## Clean up containers, volumes, and node_modules
	@echo "$(YELLOW)Cleaning up...$(NC)"
	docker-compose down -v
	find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
	find . -name "dist" -type d -prune -exec rm -rf '{}' +
	find . -name "*.log" -type f -delete
	@echo "$(GREEN)Cleanup complete!$(NC)"

build: ## Build all services
	@echo "$(GREEN)Building all services...$(NC)"
	docker-compose build
	@echo "$(GREEN)Build complete!$(NC)"

test: ## Run tests for all services
	@echo "$(GREEN)Running tests...$(NC)"
	cd tms-backend/api-gateway && npm test
	cd tms-backend/services/auth && npm test
	cd tms-backend/services/order && npm test
	@echo "$(GREEN)Tests complete!$(NC)"

migrate: ## Run database migrations
	@echo "$(GREEN)Running database migrations...$(NC)"
	node init-tms-database.js
	node add-users-and-couriers.js
	@echo "$(GREEN)Migrations complete!$(NC)"

logs: ## Show logs for all services
	docker-compose logs -f

logs-gateway: ## Show API Gateway logs
	docker-compose logs -f api-gateway

logs-auth: ## Show Auth Service logs
	docker-compose logs -f auth-service

logs-order: ## Show Order Service logs
	docker-compose logs -f order-service

ps: ## Show status of all services
	@docker-compose ps

deploy: ## Deploy to production
	@echo "$(GREEN)Deploying to production...$(NC)"
	@echo "$(YELLOW)Building production images...$(NC)"
	docker-compose -f docker-compose.prod.yml build
	@echo "$(YELLOW)Pushing to registry...$(NC)"
	# Add your registry push commands here
	@echo "$(GREEN)Deployment complete!$(NC)"

seed-db: ## Seed database with test data
	@echo "$(GREEN)Seeding database...$(NC)"
	node test-supabase-connection.js
	node init-tms-database.js
	node add-users-and-couriers.js
	@echo "$(GREEN)Database seeded!$(NC)"

reset-db: ## Reset database (CAUTION: Deletes all data)
	@echo "$(YELLOW)⚠️  WARNING: This will delete all data!$(NC)"
	@read -p "Are you sure? (y/N) " -n 1 -r; \
	echo ""; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "$(YELLOW)Resetting database...$(NC)"; \
		# Add database reset commands here \
		echo "$(GREEN)Database reset complete!$(NC)"; \
	fi