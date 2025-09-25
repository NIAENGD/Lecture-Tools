# Use the AWS hosted mirror of the official Python image to avoid Docker Hub
# authentication/rate limiting issues when building the container in
# environments without Docker Hub credentials.
FROM public.ecr.aws/docker/library/python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        build-essential \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-dev.txt /tmp/requirements.txt
RUN pip install --upgrade pip \
    && pip install -r /tmp/requirements.txt

COPY app ./app
COPY config ./config
COPY run.py ./run.py
COPY README.md ./README.md

RUN mkdir -p storage assets
VOLUME ["/app/storage", "/app/assets"]

EXPOSE 8000

CMD ["python", "run.py", "serve", "--host", "0.0.0.0", "--port", "8000"]
