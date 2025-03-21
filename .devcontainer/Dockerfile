FROM node:22

# キャッシュ設定の最適化
RUN npm config set cache /tmp --global

# 必要なパッケージのインストール (最適化済み)
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends git curl openssh-client \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# # Python仮想環境の作成とPython依存関係のインストール（LangChain用）
# RUN python3 -m venv /opt/venv
# ENV PATH="/opt/venv/bin:$PATH"


# グローバルnpmパッケージのインストール (必要最小限)
RUN npm install -g typescript ts-node nodemon

WORKDIR /workspace

# SSHディレクトリのセットアップ
RUN mkdir -p /home/node/.ssh && chown -R node:node /home/node/.ssh && chmod 700 /home/node/.ssh
# Add known hosts
RUN touch /home/node/.ssh/known_hosts && chown node:node /home/node/.ssh/known_hosts && chmod 644 /home/node/.ssh/known_hosts

# Node.js関連の環境変数設定
ENV NODE_ENV=development
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV PYTHONPATH="/opt/venv/bin:$PYTHONPATH"
ENV CHROMA_TIMEOUT=60000

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', res => process.exit(res.statusCode === 200 ? 0 : 1))" || exit 1