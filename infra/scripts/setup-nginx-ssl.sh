#!/bin/bash
# Nginx + Let's Encrypt SSL 설정 스크립트
# DNS A 레코드가 EC2 IP를 가리킨 후 실행해야 합니다.
#
# 실행 방법 (SSM send-command):
#   aws ssm send-command \
#     --instance-ids <INSTANCE_ID> \
#     --document-name "AWS-RunShellScript" \
#     --parameters "commands=['bash /home/ec2-user/setup-nginx-ssl.sh']" \
#     --region ap-northeast-2

set -e

DOMAIN="shorts-kit.com"
EMAIL="fingercloud5900@gmail.com"

echo "[1/4] Nginx 설치..."
dnf install -y nginx

echo "[2/4] Certbot 설치..."
dnf install -y python3-certbot-nginx augeas-libs

echo "[3/4] Nginx 초기 설정 (HTTP)..."
cat > /etc/nginx/conf.d/web.conf << EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

systemctl enable --now nginx
nginx -t && systemctl reload nginx

echo "[4/4] Let's Encrypt SSL 인증서 발급..."
certbot --nginx \
  -d "${DOMAIN}" \
  -d "www.${DOMAIN}" \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  --redirect

echo ""
echo "완료! https://${DOMAIN} 으로 접근 가능합니다."
echo "인증서 자동 갱신: $(systemctl is-enabled certbot-renew.timer 2>/dev/null || echo 'cron 설정 필요')"

# cron 자동 갱신 등록
echo "0 0,12 * * * root certbot renew --quiet" > /etc/cron.d/certbot-renew
