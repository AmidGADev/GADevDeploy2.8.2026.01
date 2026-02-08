#!/bin/bash
# Script to prepare Prisma schema for PostgreSQL deployment (Render)
# Run this during the build phase on Render

set -e

SCHEMA_FILE="prisma/schema.prisma"

echo "Preparing Prisma schema for PostgreSQL..."

# Check if schema file exists
if [ ! -f "$SCHEMA_FILE" ]; then
  echo "Error: $SCHEMA_FILE not found"
  exit 1
fi

# Show current state
echo "Current schema provider:"
cat "$SCHEMA_FILE" | grep provider | head -2

# Always replace sqlite with postgresql (force replacement)
sed -i 's/provider = "sqlite"/provider = "postgresql"/g' "$SCHEMA_FILE"

# Show result
echo "After replacement:"
cat "$SCHEMA_FILE" | grep provider | head -2

# Verify postgresql is now set
if grep -q 'postgresql' "$SCHEMA_FILE"; then
  echo "Schema configured for PostgreSQL successfully"
else
  echo "Error: Failed to configure schema for PostgreSQL"
  exit 1
fi
