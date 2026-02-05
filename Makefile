SHELL := /bin/zsh
COMPOSE := docker compose -f infra/docker-compose.yml

.PHONY: init up down install migrate seed dev test logs open

init:
	bash infra/scripts/init_env.sh

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down -v

install:
	$(COMPOSE) run --rm backend npm ci
	$(COMPOSE) run --rm frontend npm ci

migrate:
	$(COMPOSE) exec backend bash -lc "npx prisma migrate dev --name init"

seed:
	$(COMPOSE) exec backend bash -lc "npx prisma db seed"

dev:
	$(COMPOSE) up --build

test:
	$(COMPOSE) exec backend npm test
	$(COMPOSE) exec frontend npm run lint

logs:
	$(COMPOSE) logs -f --tail=200

open:
	@echo "Swagger: http://localhost:3001/api/docs"
	@echo "Web:     http://localhost:3000"

