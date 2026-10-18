FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=casino_backend.settings

WORKDIR /app

# System deps for Pillow + psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev libjpeg-dev zlib1g-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
# ASGI: serves HTTP and the messenger websockets (/ws/)
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "--proxy-headers", \
     "casino_backend.asgi:application"]
