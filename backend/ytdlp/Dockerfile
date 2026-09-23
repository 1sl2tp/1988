FROM node:22-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    PIP_DISABLE_PIP_VERSION_CHECK=1 \\
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \\
    python3 \\
    python3-venv \\
    python3-pip \\
    ffmpeg \\
    git \\
    ca-certificates \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv

WORKDIR /app

COPY requirements.txt ./
COPY package.json ./

# yt-dlp uses the nightly channel via pip --pre. Every Render rebuild fetches
# the newest nightly because YouTube frequently changes clients, signatures and POT.
RUN pip install --no-cache-dir --upgrade pip \\
    && pip install --no-cache-dir --upgrade --pre "yt-dlp[default,curl-cffi]" \\
    && pip install --no-cache-dir -r requirements.txt

ARG BGUTIL_VERSION=2.0.0
RUN git clone --depth 1 --branch "${BGUTIL_VERSION}" \\
      https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil \\
    && cd /opt/bgutil/server \\
    && npm ci \\
    && npx tsc \\
    && npm cache clean --force

COPY . .

RUN chmod +x /app/start.sh

EXPOSE 10000

CMD ["/app/start.sh"]
