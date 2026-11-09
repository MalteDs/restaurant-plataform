COMPOSE = docker compose -f infra/docker-compose.yml

.PHONY: up down logs restart ps

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

# El backend recompila al reiniciar; no hace falta reconstruir imagenes.
restart:
	$(COMPOSE) restart backend

ps:
	$(COMPOSE) ps
