#!/bin/zsh
cd "$(dirname "$0")"
export HARNESS_STOP_AT=2026-10-11T07:00:00Z
while true; do
  node --env-file=.env --import tsx src/run.ts >> logs/run-supervised.out 2>&1
  code=$?
  if grep -q "stop time reached" logs/run-supervised.out && [ $code -eq 0 ]; then break; fi
  echo "restart after exit $code at $(date -u +%FT%TZ)" >> logs/run-supervised.out
  sleep 10
done
