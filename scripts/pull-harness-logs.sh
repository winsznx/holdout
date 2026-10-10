#!/bin/zsh
# Copies the bot decision logs from the VPS back into evidence/raw/harness.
set -e
cd "$(dirname "$0")/.."
ssh nightbook-vps 'systemctl is-active holdout-bots || true; wc -l /opt/holdout/evidence/raw/harness/*.jsonl'
scp -q nightbook-vps:'/opt/holdout/evidence/raw/harness/*.jsonl' evidence/raw/harness/
echo "pulled to evidence/raw/harness"
