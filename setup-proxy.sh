#!/bin/bash
# Setup reverse proxy di server 43.134.121.246
# Jalankan sebagai root di server

set -e

echo "=== Installing nginx ==="
apt-get update -qq && apt-get install -y nginx

echo "=== Creating reverse proxy config ==="
cat > /etc/nginx/sites-available/alhijaz-proxy <<'EOF'
server {
    listen 8220;

    location / {
        proxy_pass http://115.124.86.220;
        proxy_set_header Host 115.124.86.220;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 30s;
        proxy_read_timeout 120s;
        proxy_send_timeout 30s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/alhijaz-proxy /etc/nginx/sites-enabled/

echo "=== Testing nginx config ==="
nginx -t

echo "=== Restarting nginx ==="
systemctl enable nginx
systemctl restart nginx

echo "=== Done! Proxy active on port 8220 ==="
echo "Test: curl -s -o /dev/null -w '%{http_code}' http://localhost:8220/aiw/staff/cek_login.php"
