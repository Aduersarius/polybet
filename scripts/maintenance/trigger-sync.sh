#!/bin/bash
echo "Triggering sports sync..."
curl -X POST http://localhost:3000/api/sports/sync
echo ""
echo "Sync complete!"

