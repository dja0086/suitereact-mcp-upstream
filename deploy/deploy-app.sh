#!/bin/bash

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: npm run deploy:app -- <app-name> [--install] [--with-center-category]"
  exit 1
fi

APP_NAME="$1"

npm run validate:app -- "$@"
node deploy/check-deploy-scope.js --app "$APP_NAME" --file dist/deploy.xml
suitecloud project:deploy --accountspecificvalues WARNING
