# Ai Knowledge and Agent Framework Backend - Docker & Make targets
# Usage: make install | make up | make build | make run | make stop | make logs

IMAGE_NAME   := ai-knowledge-and-agent-framework
IMAGE_TAG    := $(shell git rev-parse --short HEAD 2>/dev/null || echo "latest")
CONTAINER_NAME := ai-knowledge-and-agent-framework
PORT         := 8000
ENV_FILE     := .env

.PHONY: install build run up stop logs check-docker

# Default target
.DEFAULT_GOAL := up

# Ensure Docker is available
check-docker:
	@which docker >/dev/null 2>&1 || \
		(echo "Error: Docker is not installed or not in PATH."; \
		echo ""; \
		echo "Install Docker:"; \
		echo "  Amazon Linux 2: sudo yum install -y docker && sudo systemctl start docker && sudo systemctl enable docker"; \
		echo "  Ubuntu:        sudo apt-get update && sudo apt-get install -y docker.io && sudo systemctl start docker"; \
		echo "  macOS:         https://docs.docker.com/desktop/install/mac-install/"; \
		echo ""; \
		exit 1)

# Install: check Docker, build image
install: check-docker build

# Build the Docker image
build: check-docker
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) -t $(IMAGE_NAME):latest .

# Run the container (requires build first)
run: check-docker
	@docker stop $(CONTAINER_NAME) 2>/dev/null || true
	@docker rm $(CONTAINER_NAME) 2>/dev/null || true
	@if [ -f $(ENV_FILE) ]; then \
		docker run -d --name $(CONTAINER_NAME) -p $(PORT):8000 --env-file $(ENV_FILE) --restart unless-stopped $(IMAGE_NAME):$(IMAGE_TAG); \
	else \
		echo "Warning: $(ENV_FILE) not found. Run with: docker run -d --name $(CONTAINER_NAME) -p $(PORT):8000 -e CLIENT_URL=... -e OPENAI_API_KEY=... $(IMAGE_NAME):$(IMAGE_TAG)"; \
		docker run -d --name $(CONTAINER_NAME) -p $(PORT):8000 --restart unless-stopped $(IMAGE_NAME):$(IMAGE_TAG); \
	fi
	@echo "Container started. App available at http://localhost:$(PORT)"

# Build + run
up: build run

# Stop the container
stop:
	docker stop $(CONTAINER_NAME) 2>/dev/null || true
	docker rm $(CONTAINER_NAME) 2>/dev/null || true
	@echo "Container stopped and removed."

# Show container logs
logs:
	docker logs -f $(CONTAINER_NAME)
