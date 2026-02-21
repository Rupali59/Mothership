# Motherboard monorepo - root Makefile
# Common targets delegate to deploy.sh (which uses --remove-orphans on up)

.PHONY: up down restart clean logs status

## Start local monolith (infra + platform) - removes orphan containers automatically
up:
	./deploy.sh local-mono up -d

## Stop local monolith
down:
	./deploy.sh local-mono down

## Restart local monolith (down --remove-orphans, then up)
restart:
	./deploy.sh local-mono restart

## One-time cleanup: stop everything and remove orphan containers
clean:
	./deploy.sh local-mono down --remove-orphans

## View logs
logs:
	./deploy.sh local-mono logs

## Show container status
status:
	./deploy.sh local-mono status
