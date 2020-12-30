#!/bin/bash

#
# Init
#

homeDir="$(dirname $0)"
cd "${homeDir}"
homeDir="$(pwd)"

#
# Build
#

docker-compose build
docker-compose up -d
