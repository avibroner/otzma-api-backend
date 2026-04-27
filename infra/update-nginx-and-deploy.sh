#!/bin/bash
# Updates nginx config + deploys latest code in one go.
# Run on srv1187409 from /var/www/otzma-api:
#   bash infra/update-nginx-and-deploy.sh

set -e  # stop on first error

NGINX_FILE="/etc/nginx/sites-enabled/api.otzma-ins.co.il"
SOURCE_FILE="/var/www/otzma-api/infra/nginx/api.otzma-ins.co.il.conf"
BACKUP_FILE="${NGINX_FILE}.backup-$(date +%Y%m%d-%H%M%S)"

echo ""
echo "=== 1/5: Backing up current nginx config ==="
cp "$NGINX_FILE" "$BACKUP_FILE"
echo "Backup saved to: $BACKUP_FILE"

echo ""
echo "=== 2/5: Installing new nginx config ==="
cp "$SOURCE_FILE" "$NGINX_FILE"
echo "New config in place. Diff:"
diff "$BACKUP_FILE" "$NGINX_FILE" || true

echo ""
echo "=== 3/5: Testing nginx config ==="
if ! nginx -t; then
    echo ""
    echo "❌ nginx config test FAILED. Rolling back..."
    cp "$BACKUP_FILE" "$NGINX_FILE"
    echo "Rolled back to original. nginx NOT reloaded."
    exit 1
fi

echo ""
echo "=== 4/5: Reloading nginx ==="
systemctl reload nginx
echo "✅ nginx reloaded"

echo ""
echo "=== 5/5: Restarting pm2 (otzma-api) ==="
pm2 restart otzma-api
sleep 2
pm2 logs otzma-api --lines 10 --nostream

echo ""
echo "=== ✅ Done ==="
echo "Test: open an iframe and check the dashboard — IP column should now show your real IP, not 127.0.0.1"
