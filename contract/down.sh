#!/usr/bin/env bash
# Removes the containers and the network of the contract run.
docker rm -f bl-img bl-pg bl-rec bl-build >/dev/null 2>&1 || true
docker network rm bl-net >/dev/null 2>&1 || true
