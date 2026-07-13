#!/bin/bash
set -e

REGION=ap-northeast-2
ECR_REGISTRY=682251233572.dkr.ecr.$REGION.amazonaws.com

# Docker 설치 (Amazon Linux 2023)
dnf update -y
dnf install -y docker
systemctl enable --now docker

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

# systemd 서비스 등록
cat > /etc/systemd/system/web.service << 'UNIT'
[Unit]
Description=Web App (Next.js)
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=10

ExecStartPre=/usr/local/bin/refresh-web-env.sh
ExecStartPre=/bin/bash -c 'aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 682251233572.dkr.ecr.ap-northeast-2.amazonaws.com'
ExecStartPre=/usr/bin/docker pull 682251233572.dkr.ecr.ap-northeast-2.amazonaws.com/web:latest
ExecStartPre=-/usr/bin/docker stop web
ExecStartPre=-/usr/bin/docker rm web
ExecStart=/usr/bin/docker run --name web --rm \
  --env-file /etc/web.env \
  -p 3001:3001 \
  682251233572.dkr.ecr.ap-northeast-2.amazonaws.com/web:latest
ExecStop=-/usr/bin/docker stop web

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable web
systemctl start web
