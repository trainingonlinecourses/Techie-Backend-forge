#!/bin/bash
# keep-alive.sh — Ping Render backend to prevent free-tier sleep
# 
# Usage:
#   ./keep-alive.sh
#
# External cron services (cron-job.org, UptimeRobot, etc.):
#   Set URL to: https://raw.githubusercontent.com/trainingonlinecourses/Techie-Backend-forge/main/scripts/keep-alive.sh
#   Or run this script via GitHub Actions (see .github/workflows/keep-alive.yml)
#
# Render free-tier instances sleep after 15 minutes of inactivity.
# This script pings the health endpoint to keep it alive.

BACKEND_URL="https://backendforge-academy-api-bef2.onrender.com"
HEALTH_ENDPOINT="$BACKEND_URL/actuator/health"
CONTENT_ENDPOINT="$BACKEND_URL/api/content/stats"

echo "=== Render Keep-Alive Ping ==="
echo "Timestamp: $(date -u)"
echo ""

# Ping health endpoint
echo "Pinging health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 30 "$HEALTH_ENDPOINT" 2>&1)
HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)

if [ "$HEALTH_CODE" = "200" ]; then
    echo "✅ Health: OK ($HEALTH_CODE)"
else
    echo "⚠️ Health: $HEALTH_CODE"
    echo "   Response: $HEALTH_BODY"
fi

# Ping content endpoint (heavier, ensures full startup)
echo ""
echo "Pinging content API..."
CONTENT_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 60 "$CONTENT_ENDPOINT" 2>&1)
CONTENT_CODE=$(echo "$CONTENT_RESPONSE" | tail -1)
CONTENT_BODY=$(echo "$CONTENT_RESPONSE" | head -n -1)

if [ "$CONTENT_CODE" = "200" ]; then
    echo "✅ Content API: OK ($CONTENT_CODE)"
    # Extract stats
    MODULES=$(echo "$CONTENT_BODY" | grep -o '"modules":[0-9]*' | cut -d: -f2)
    LESSONS=$(echo "$CONTENT_BODY" | grep -o '"lessons":[0-9]*' | cut -d: -f2)
    echo "   Modules: $MODULES | Lessons: $LESSONS"
else
    echo "⚠️ Content API: $CONTENT_CODE"
    echo "   Response: $CONTENT_BODY"
fi

echo ""
echo "=== Ping Complete ==="
