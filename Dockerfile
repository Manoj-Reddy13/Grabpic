# syntax=docker/dockerfile:1

# ==========================================
# Stage 1: Build React Frontend
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend

COPY grabpic-frontend/package.json grabpic-frontend/package-lock.json* ./
RUN npm ci

COPY grabpic-frontend/ ./
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# Standalone Frontend Target
FROM nginx:alpine-slim AS frontend
RUN rm -rf /etc/nginx/conf.d/default.conf
COPY grabpic-frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-builder /build/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]


# ==========================================
# Stage 2: Build Spring Boot Backend
# ==========================================
FROM eclipse-temurin:21-jdk AS backend-builder
WORKDIR /build/backend

COPY backend/build.gradle backend/settings.gradle backend/gradlew ./
COPY backend/gradle ./gradle
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew
RUN ./gradlew dependencies --no-daemon

COPY backend/src ./src
RUN ./gradlew bootJar --no-daemon

# Standalone Backend Target
FROM eclipse-temurin:21-jre-alpine AS backend
WORKDIR /app
COPY --from=backend-builder /build/backend/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-Xmx256m", "-Xms128m", "-XX:+UseContainerSupport", "-jar", "app.jar"]


# ==========================================
# Stage 3: Python AI Service
# ==========================================
FROM python:3.11-slim AS ai-service
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    gcc \
    g++ \
    python3-dev \
    ffmpeg \
    libsm6 \
    libxext6 \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Download InsightFace buffalo_l models
RUN mkdir -p /root/.insightface/models/buffalo_l && \
    wget https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip -O /tmp/model.zip && \
    unzip /tmp/model.zip -d /tmp && \
    mv /tmp/*.onnx /root/.insightface/models/buffalo_l/ && \
    rm -rf /tmp/model.zip /tmp/*.onnx

COPY ai-service/requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    apt-get purge -y build-essential gcc g++ python3-dev && \
    apt-get autoremove -y && \
    rm -rf /root/.cache/pip

COPY ai-service/ .

ENV BASE_DATA_DIR=/app/data
ENV QUERY_DIR=/app/query_data
ENV PYTHONPATH=/app

RUN mkdir -p /app/data/events /app/query_data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]


# ==========================================
# Stage 4: Unified All-in-One Container (Default)
# Runs Frontend + Backend + AI Service via Supervisord
# ==========================================
FROM python:3.11-slim AS all-in-one

# Install system dependencies, Nginx, and Supervisor
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    supervisor \
    curl \
    ffmpeg \
    libsm6 \
    libxext6 \
    wget \
    unzip \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy Java 21 JRE from Temurin
COPY --from=eclipse-temurin:21-jre /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# Install InsightFace buffalo_l model weights
RUN mkdir -p /root/.insightface/models/buffalo_l && \
    wget https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip -O /tmp/model.zip && \
    unzip /tmp/model.zip -d /tmp && \
    mv /tmp/*.onnx /root/.insightface/models/buffalo_l/ && \
    rm -rf /tmp/model.zip /tmp/*.onnx

# Install Python requirements for AI Service
COPY ai-service/requirements.txt /app/ai-service/
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r /app/ai-service/requirements.txt && \
    apt-get purge -y build-essential python3-dev && \
    apt-get autoremove -y && \
    rm -rf /root/.cache/pip

# Copy AI service source
COPY ai-service/ /app/ai-service/
ENV BASE_DATA_DIR=/app/data
ENV QUERY_DIR=/app/query_data
ENV PYTHONPATH=/app/ai-service
RUN mkdir -p /app/data/events /app/query_data /var/log/supervisor

# Copy Backend JAR
WORKDIR /app/backend
COPY --from=backend-builder /build/backend/build/libs/*.jar /app/backend/app.jar

# Copy Frontend static assets & Nginx config
RUN rm -rf /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf
COPY docker/nginx-all-in-one.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-builder /build/frontend/dist /usr/share/nginx/html

# Copy Supervisor configuration
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
