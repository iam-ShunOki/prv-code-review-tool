FROM node:18

# 必要なパッケージのインストール
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install git curl python3 python3-pip python3-venv \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Python仮想環境の作成とPython依存関係のインストール（LangChain用）
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip3 install --no-cache-dir langchain chromadb

# グローバルnpmパッケージのインストール
RUN npm install -g typescript ts-node nodemon

WORKDIR /workspace


# SSHディレクトリのセットアップ
RUN mkdir -p /home/node/.ssh && chown -R node:node /home/node/.ssh && chmod 700 /home/node/.ssh
# Add known hosts
RUN touch /home/node/.ssh/known_hosts && chown node:node /home/node/.ssh/known_hosts && chmod 644 /home/node/.ssh/known_hosts

# 環境変数の設定
ENV NODE_ENV=development
ENV PYTHONPATH="/opt/venv/bin:$PYTHONPATH"