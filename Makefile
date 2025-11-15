# Docker related variables
DOCKER_IMAGE_NAME=ccxt-bot
DOCKER_TAG=-0.0.49
DOCKER_CONTAINER_NAME=ccxt-bot
DOCKER_PORT=3222

# Version bumping targets
bumpversion-patch:
	bumpversion patch --allow-dirty

bumpversion-minor:
	bumpversion minor --allow-dirty

bumpversion-major:
	bumpversion major --allow-dirty
