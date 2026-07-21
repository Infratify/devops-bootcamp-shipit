#!/bin/bash

echo "BOARD_URL: $BOARD_URL"

if [ -n "$SHIPIT_TOKEN" ]; then
  echo "SHIPIT_TOKEN successfully loaded."
else
  echo "SHIPIT_TOKEN is missing."
  exit 1
fi
