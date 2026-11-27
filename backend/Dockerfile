FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_HTTP_TIMEOUT=300 \
    UV_CONCURRENT_DOWNLOADS=4 \
    UV_CONCURRENT_REQUESTS=4

COPY requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

COPY app ./app

RUN mkdir -p /app/data

EXPOSE 8784

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8784"]
