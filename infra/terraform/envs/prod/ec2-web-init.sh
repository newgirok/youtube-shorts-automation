#!/bin/bash
set -e

REGION=ap-northeast-2
ECR_REGISTRY=682251233572.dkr.ecr.$REGION.amazonaws.com
APP_DIR=/home/ec2-user/app

# Docker 설치 (Amazon Linux 2023)
dnf update -y
dnf install -y docker cronie
systemctl enable --now docker crond

# Docker Compose v2 플러그인 설치
COMPOSE_VERSION="v2.27.1"
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL \
  "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# ec2-user를 docker 그룹에 추가
usermod -aG docker ec2-user

# SSM 파라미터를 /etc/web.env 로 갱신하는 헬퍼
cat > /usr/local/bin/refresh-web-env.sh << 'HELPER'
#!/bin/bash
REGION=ap-northeast-2

get_param() {
  aws ssm get-parameter --name "shorts.prod.$1" --with-decryption \
    --query "Parameter.Value" --output text --region $REGION 2>/dev/null
}

NEXTAUTH_URL=$(get_param NEXTAUTH_URL)
AUTH_SECRET=$(get_param AUTH_SECRET)
GOOGLE_CLIENT_ID=$(get_param YOUTUBE_CLIENT_ID)
GOOGLE_CLIENT_SECRET=$(get_param YOUTUBE_CLIENT_SECRET)

cat > /etc/web.env << EOF
NODE_ENV=production
PORT=3001
NEXTAUTH_URL=${NEXTAUTH_URL}
AUTH_URL=${NEXTAUTH_URL}
AUTH_SECRET=${AUTH_SECRET}
NEXTAUTH_SECRET=${AUTH_SECRET}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
EOF
HELPER
chmod +x /usr/local/bin/refresh-web-env.sh

# 앱 디렉토리 및 Nginx 설정
mkdir -p $APP_DIR/nginx/conf.d

cat > $APP_DIR/nginx/conf.d/web.conf << 'NGINX'
server {
    listen 443 ssl;
    server_name shorts-kit.com www.shorts-kit.com;

    ssl_certificate /etc/letsencrypt/live/shorts-kit.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/shorts-kit.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://web:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name shorts-kit.com www.shorts-kit.com;
    return 301 https://$host$request_uri;
}
NGINX

cat > $APP_DIR/docker-compose.yml << 'COMPOSE'
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - web
    restart: unless-stopped

  web:
    image: 682251233572.dkr.ecr.ap-northeast-2.amazonaws.com/web:latest
    env_file: /etc/web.env
    restart: unless-stopped
COMPOSE

chown -R ec2-user:ec2-user $APP_DIR

# systemd 서비스 — 부팅 시 Docker Compose 자동 시작
cat > /etc/systemd/system/web.service << 'UNIT'
[Unit]
Description=Web App (Docker Compose)
After=docker.service network-online.target
Requires=docker.service

[Service]
WorkingDirectory=/home/ec2-user/app
ExecStartPre=/usr/local/bin/refresh-web-env.sh
ExecStartPre=/bin/bash -c 'aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 682251233572.dkr.ecr.ap-northeast-2.amazonaws.com'
ExecStartPre=/usr/bin/docker compose pull
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable web

# certbot 자동 갱신 — 갱신 후 nginx 컨테이너 reload
echo "0 0,12 * * * root certbot renew --quiet && docker compose -f ${APP_DIR}/docker-compose.yml exec nginx nginx -s reload" \
  > /etc/cron.d/certbot-renew
