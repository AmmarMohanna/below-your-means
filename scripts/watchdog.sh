#!/bin/bash
#
# Watchdog script for BelowYourMeans
# Checks container health and restarts if unhealthy
#
# Install as cron job:
#   chmod +x ~/below-your-means/scripts/watchdog.sh
#   (crontab -l 2>/dev/null; echo "*/10 * * * * /bin/bash $HOME/below-your-means/scripts/watchdog.sh") | crontab -
#

CONTAINER_NAME="belowyourmeans"
COMPOSE_FILE="$HOME/below-your-means/docker-compose.yml"
LOG_FILE="/var/log/belowyourmeans-watchdog.log"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

# Check if container exists
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "$TIMESTAMP - Container $CONTAINER_NAME not found. Starting..." >> $LOG_FILE
  cd $HOME/below-your-means && docker compose up -d >> $LOG_FILE 2>&1
  exit 0
fi

# Get container health status
STATUS=$(docker inspect --format='{{.State.Health.Status}}' $CONTAINER_NAME 2>/dev/null)

if [ "$STATUS" = "unhealthy" ]; then
  echo "$TIMESTAMP - Container $CONTAINER_NAME is unhealthy. Restarting..." >> $LOG_FILE
  cd $HOME/below-your-means && docker compose restart >> $LOG_FILE 2>&1
  echo "$TIMESTAMP - Restart command issued." >> $LOG_FILE
elif [ "$STATUS" = "" ]; then
  echo "$TIMESTAMP - Container $CONTAINER_NAME has no healthcheck. Checking if running..." >> $LOG_FILE
  RUNNING=$(docker inspect --format='{{.State.Running}}' $CONTAINER_NAME 2>/dev/null)
  if [ "$RUNNING" != "true" ]; then
    echo "$TIMESTAMP - Container not running. Starting..." >> $LOG_FILE
    cd $HOME/below-your-means && docker compose up -d >> $LOG_FILE 2>&1
  fi
else
  # Only log healthy status once per hour to avoid log bloat
  MINUTE=$(date +%M)
  if [ "$MINUTE" = "00" ]; then
    echo "$TIMESTAMP - Container $CONTAINER_NAME is $STATUS" >> $LOG_FILE
  fi
fi
