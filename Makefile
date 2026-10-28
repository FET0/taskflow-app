SHELL := /bin/bash

IMAGE ?= ghcr.io/fet0/taskflow-api

.PHONY: test lint seal render

test:
	npm test

lint:
	npm run lint

seal:
	./scripts/seal-secret.sh

render:
	helm template taskflow ./deploy/chart
