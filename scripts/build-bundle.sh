#!/bin/zsh
# Builds evidence/bundle/bundle.zip: everything pnpm verify needs, plus the published run.
set -e
cd "$(dirname "$0")/.."
latest=$(node -p "require('./evidence/runs/latest.json').runId")
mkdir -p evidence/bundle apps/web/public/evidence
rm -f evidence/bundle/bundle.zip
zip -qr evidence/bundle/bundle.zip \
  evidence/PREREG.md evidence/freeze evidence/raw/histories evidence/raw/market evidence/raw/harness \
  evidence/runs/latest.json "evidence/runs/$latest" \
  docs/METHODOLOGY.md docs/MATH.md docs/DECISIONS.md \
  -x "*.DS_Store" 2>/dev/null || zip -qr evidence/bundle/bundle.zip evidence/PREREG.md evidence/raw/histories evidence/raw/market evidence/raw/harness evidence/runs/latest.json "evidence/runs/$latest" docs/METHODOLOGY.md docs/MATH.md docs/DECISIONS.md
cp evidence/bundle/bundle.zip apps/web/public/evidence/bundle.zip
echo "bundle for $latest: $(du -h evidence/bundle/bundle.zip | cut -f1)"
