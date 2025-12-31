#!/bin/bash
# Watchdog script - restarts container if unhealthy
# Run via cron every 10 minutes

CONTAINER_NAME="belowyourmeans"
LOG_FILE="/var/log/belowyourmeans-watchdog.log"
COMPOSE_DIR="$HOME/below-your-means"

# Get container health status
HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null)

# Log timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

if [ "$HEALTH" = "unhealthy" ]; then
    echo "[$TIMESTAMP] Container unhealthy - restarting..." >> "$LOG_FILE"
    cd "$COMPOSE_DIR" && docker compose restart
    echo "[$TIMESTAMP] Restart complete" >> "$LOG_FILE"
elif [ -z "$HEALTH" ]; then
    echo "[$TIMESTAMP] Container not found or no healthcheck" >> "$LOG_FILE"
else
    # Only log healthy status once per hour (on the hour)
    MINUTE=$(date '+%M')
    if [ "$MINUTE" = "00" ]; then
        echo "[$TIMESTAMP] Container healthy" >> "$LOG_FILE"
    fi
fi

