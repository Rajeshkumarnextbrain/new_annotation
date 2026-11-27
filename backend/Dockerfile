FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=300 --retries=10 -r requirements.txt

COPY app ./app

RUN mkdir -p /app/data

EXPOSE 8784

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8784"]
