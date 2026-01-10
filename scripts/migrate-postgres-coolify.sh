#!/bin/bash

################################################################################
# PostgreSQL Migration for Coolify (Docker Container)
# Migrates from old VPS to PostgreSQL container in Coolify
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   PostgreSQL Migration to Coolify     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Configuration
read -p "Old VPS IP (default: 188.137.178.118): " OLD_VPS_IP
OLD_VPS_IP=${OLD_VPS_IP:-188.137.178.118}

read -p "New VPS IP (default: 212.69.87.149): " NEW_VPS_IP
NEW_VPS_IP=${NEW_VPS_IP:-212.69.87.149}

read -p "Old VPS SSH User (default: root): " OLD_VPS_USER
OLD_VPS_USER=${OLD_VPS_USER:-root}

read -p "New VPS SSH User (default: root): " NEW_VPS_USER
NEW_VPS_USER=${NEW_VPS_USER:-root}

read -p "Database name (default: pariflow): " DB_NAME
DB_NAME=${DB_NAME:-pariflow}

read -p "Database user (default: pariflow_user): " DB_USER
DB_USER=${DB_USER:-pariflow_user}

read -sp "Database password: " DB_PASSWORD
echo ""

read -p "PostgreSQL container port (default: 5432): " PG_PORT
PG_PORT=${PG_PORT:-5432}

BACKUP_FILE="pariflow_migration_$(date +%Y%m%d_%H%M%S).dump"
BACKUP_PATH="/tmp/${BACKUP_FILE}"
CONTAINER_NAME="postgres"

echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Old VPS: $OLD_VPS_USER@$OLD_VPS_IP"
echo "  New VPS: $NEW_VPS_USER@$NEW_VPS_IP (Coolify)"
echo "  Database: $DB_NAME"
echo "  Database User: $DB_USER"
echo "  PostgreSQL Port: $PG_PORT"
echo "  Container: $CONTAINER_NAME"
echo ""

read -p "Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo -e "${RED}Migration cancelled${NC}"
    exit 1
fi

################################################################################
# Step 1: Test SSH Connections
################################################################################
echo ""
echo -e "${BLUE}[1/7] Testing SSH connections...${NC}"

if ssh -o ConnectTimeout=5 -o BatchMode=yes ${OLD_VPS_USER}@${OLD_VPS_IP} exit 2>/dev/null; then
    echo -e "${GREEN}✓ Connected to old VPS${NC}"
else
    echo -e "${RED}✗ Cannot connect to old VPS${NC}"
    echo "Run: ssh-copy-id ${OLD_VPS_USER}@${OLD_VPS_IP}"
    exit 1
fi

if ssh -o ConnectTimeout=5 -o BatchMode=yes ${NEW_VPS_USER}@${NEW_VPS_IP} exit 2>/dev/null; then
    echo -e "${GREEN}✓ Connected to new VPS (Coolify)${NC}"
else
    echo -e "${RED}✗ Cannot connect to new VPS${NC}"
    echo "Run: ssh-copy-id ${NEW_VPS_USER}@${NEW_VPS_IP}"
    exit 1
fi

################################################################################
# Step 2: Setup PostgreSQL Container on New VPS
################################################################################
echo ""
echo -e "${BLUE}[2/7] Setting up PostgreSQL container in Coolify...${NC}"

ssh ${NEW_VPS_USER}@${NEW_VPS_IP} bash <<EOF
    set -e
    
    # Check if container already exists
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}\$"; then
        echo "PostgreSQL container already exists"
        docker start ${CONTAINER_NAME} 2>/dev/null || true
    else
        echo "Creating PostgreSQL container..."
        docker run -d \
            --name ${CONTAINER_NAME} \
            --restart unless-stopped \
            -e POSTGRES_DB=${DB_NAME} \
            -e POSTGRES_USER=${DB_USER} \
            -e POSTGRES_PASSWORD=${DB_PASSWORD} \
            -p ${PG_PORT}:5432 \
            -v postgres-data:/var/lib/postgresql/data \
            postgres:15-alpine
        
        echo "Waiting for PostgreSQL to start..."
        sleep 10
    fi
    
    # Verify container is running
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}\$"; then
        echo -e "${GREEN}✓ PostgreSQL container running${NC}"
    else
        echo -e "${RED}✗ PostgreSQL container failed to start${NC}"
        docker logs ${CONTAINER_NAME}
        exit 1
    fi
EOF

echo -e "${GREEN}✓ PostgreSQL container setup complete${NC}"

################################################################################
# Step 3: Create Backup on Old VPS
################################################################################
echo ""
echo -e "${BLUE}[3/7] Creating backup on old VPS...${NC}"

# First, detect the old database name
echo "Detecting old database name..."
OLD_DB_NAME=$(ssh ${OLD_VPS_USER}@${OLD_VPS_IP} "PGPASSWORD='Baltim0r' psql -h localhost -U polybet_user -l -t 2>/dev/null | cut -d'|' -f1 | grep -E 'polybet|pariflow' | head -1 | xargs" 2>/dev/null || echo "polybet")

if [ -z "$OLD_DB_NAME" ]; then
    OLD_DB_NAME="polybet"
fi

echo "Old database name: $OLD_DB_NAME"

# Create backup (simpler command to avoid SSH timeout)
echo "Creating backup..."
ssh ${OLD_VPS_USER}@${OLD_VPS_IP} "PGPASSWORD='Baltim0r' pg_dump -h localhost -U polybet_user -d ${OLD_DB_NAME} --format=custom --file=${BACKUP_PATH} --verbose 2>&1 | tail -20" || {
    echo -e "${YELLOW}Trying with sudo...${NC}"
    ssh ${OLD_VPS_USER}@${OLD_VPS_IP} "sudo -u postgres pg_dump -d ${OLD_DB_NAME} --format=custom --file=${BACKUP_PATH} 2>&1 | tail -20"
}

# Verify backup was created
BACKUP_SIZE=$(ssh ${OLD_VPS_USER}@${OLD_VPS_IP} "ls -lh ${BACKUP_PATH} 2>/dev/null | awk '{print \$5}'" || echo "0")

if [ "$BACKUP_SIZE" = "0" ] || [ -z "$BACKUP_SIZE" ]; then
    echo -e "${RED}Backup failed or file is empty${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Backup created: ${BACKUP_SIZE}${NC}"

################################################################################
# Step 4: Transfer Backup to New VPS
################################################################################
echo ""
echo -e "${BLUE}[4/7] Transferring backup to new VPS...${NC}"

echo "Downloading backup from old VPS..."
scp ${OLD_VPS_USER}@${OLD_VPS_IP}:${BACKUP_PATH} ./${BACKUP_FILE}

echo "Uploading backup to new VPS..."
scp ./${BACKUP_FILE} ${NEW_VPS_USER}@${NEW_VPS_IP}:${BACKUP_PATH}

echo "Cleaning up local backup..."
rm ./${BACKUP_FILE}

echo -e "${GREEN}✓ Backup transferred successfully${NC}"

################################################################################
# Step 5: Restore Database in Container
################################################################################
echo ""
echo -e "${BLUE}[5/7] Restoring database in PostgreSQL container...${NC}"

ssh ${NEW_VPS_USER}@${NEW_VPS_IP} bash <<EOF
    set -e
    
    echo "Restoring database..."
    
    # Copy backup into container
    docker cp ${BACKUP_PATH} ${CONTAINER_NAME}:/tmp/${BACKUP_FILE}
    
    # Restore using pg_restore inside container
    docker exec -e PGPASSWORD=${DB_PASSWORD} ${CONTAINER_NAME} \
        pg_restore -U ${DB_USER} -d ${DB_NAME} \
        --verbose \
        --no-owner \
        --no-acl \
        /tmp/${BACKUP_FILE} || true
    
    # Grant all permissions to user
    docker exec -e PGPASSWORD=${DB_PASSWORD} ${CONTAINER_NAME} \
        psql -U ${DB_USER} -d ${DB_NAME} <<SQL
GRANT ALL ON SCHEMA public TO ${DB_USER};
GRANT ALL ON ALL TABLES IN SCHEMA public TO ${DB_USER};
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
SQL
    
    # Cleanup
    docker exec ${CONTAINER_NAME} rm -f /tmp/${BACKUP_FILE}
    rm -f ${BACKUP_PATH}
    
    echo "Database restored successfully"
EOF

echo -e "${GREEN}✓ Database restored successfully${NC}"

################################################################################
# Step 6: Verify Migration
################################################################################
echo ""
echo -e "${BLUE}[6/7] Verifying migration...${NC}"

export PGPASSWORD="${DB_PASSWORD}"

echo "Testing connection to new database..."
if psql -h ${NEW_VPS_IP} -p ${PG_PORT} -U ${DB_USER} -d ${DB_NAME} -c "SELECT version();" &>/dev/null; then
    echo -e "${GREEN}✓ Connection successful${NC}"
    
    echo ""
    echo "Database statistics:"
    psql -h ${NEW_VPS_IP} -p ${PG_PORT} -U ${DB_USER} -d ${DB_NAME} <<SQL 2>/dev/null || true
SELECT 'Users: ' || COUNT(*) FROM "User";
SELECT 'Deposits: ' || COUNT(*) FROM "Deposit";
SELECT 'Events: ' || COUNT(*) FROM "Event";
SELECT 'Orders: ' || COUNT(*) FROM "Order";
SQL
else
    echo -e "${RED}✗ Connection failed${NC}"
    echo "Checking container logs..."
    ssh ${NEW_VPS_USER}@${NEW_VPS_IP} "docker logs ${CONTAINER_NAME} --tail 50"
    exit 1
fi

################################################################################
# Step 7: Update Configuration Files
################################################################################
echo ""
echo -e "${BLUE}[7/7] Updating configuration...${NC}"

NEW_CONNECTION="postgresql://${DB_USER}:${DB_PASSWORD}@${NEW_VPS_IP}:${PG_PORT}/${DB_NAME}?sslmode=disable"

# Update .env
if [ -f ".env" ]; then
    echo "Updating .env..."
    if grep -q "DATABASE_URL" .env; then
        sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=\"${NEW_CONNECTION}\"|" .env
        echo -e "${GREEN}✓ Updated .env${NC}"
    fi
fi

# Update .env.local
if [ -f ".env.local" ]; then
    echo "Updating .env.local..."
    if grep -q "DATABASE_URL" .env.local; then
        sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=\"${NEW_CONNECTION}\"|" .env.local
        echo -e "${GREEN}✓ Updated .env.local${NC}"
    fi
fi

################################################################################
# Summary
################################################################################
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Migration Complete! ✅               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}PostgreSQL Container Details:${NC}"
echo "  Host: ${NEW_VPS_IP}"
echo "  Port: ${PG_PORT}"
echo "  Database: ${DB_NAME}"
echo "  User: ${DB_USER}"
echo "  Container: ${CONTAINER_NAME}"
echo ""
echo -e "${YELLOW}New database connection string:${NC}"
echo "${NEW_CONNECTION}"
echo ""
echo -e "${YELLOW}For internal Coolify services (same VPS):${NC}"
echo "postgresql://${DB_USER}:${DB_PASSWORD}@${CONTAINER_NAME}:5432/${DB_NAME}?sslmode=disable"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update DATABASE_URL in Vercel:"
echo "   ${NEW_CONNECTION}"
echo ""
echo "2. Update DATABASE_URL in Coolify services (use internal connection):"
echo "   postgresql://${DB_USER}:${DB_PASSWORD}@${CONTAINER_NAME}:5432/${DB_NAME}?sslmode=disable"
echo ""
echo "3. Add PostgreSQL to Coolify network:"
echo "   ssh ${NEW_VPS_USER}@${NEW_VPS_IP}"
echo "   docker network connect coolify ${CONTAINER_NAME}"
echo ""
echo "4. Test your application"
echo ""
echo "5. Keep old VPS running for 48 hours as backup"
echo ""
echo -e "${YELLOW}Container management:${NC}"
echo "  Stop: docker stop ${CONTAINER_NAME}"
echo "  Start: docker start ${CONTAINER_NAME}"
echo "  Logs: docker logs -f ${CONTAINER_NAME}"
echo "  Backup: docker exec ${CONTAINER_NAME} pg_dump -U ${DB_USER} ${DB_NAME} > backup.sql"
echo ""
echo -e "${GREEN}Migration completed successfully!${NC}"
