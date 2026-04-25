# docker-compose.yml generado por devkit
# Proyecto: {{PROJECT_NAME}}

services:
{{#MYSQL}}
  mysql:
    image: mysql:{{MYSQL_VERSION}}
    container_name: {{PROJECT_NAME}}-mysql
    restart: unless-stopped
    ports:
      - "{{MYSQL_PORT}}:3306"
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-{{MYSQL_PASSWORD}}}
      MYSQL_DATABASE: {{DB_NAME}}
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - devkit
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p$$MYSQL_ROOT_PASSWORD"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
{{/MYSQL}}
{{#POSTGRES}}
  postgres:
    image: postgres:{{POSTGRES_VERSION}}
    container_name: {{PROJECT_NAME}}-postgres
    restart: unless-stopped
    ports:
      - "{{POSTGRES_PORT}}:5432"
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-{{POSTGRES_USER}}}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-{{POSTGRES_PASSWORD}}}
      POSTGRES_DB: {{DB_NAME}}
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks:
      - devkit
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U {{POSTGRES_USER}}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
{{/POSTGRES}}
{{#REDIS}}
  redis:
    image: redis:{{REDIS_VERSION}}
    container_name: {{PROJECT_NAME}}-redis
    restart: unless-stopped
    ports:
      - "{{REDIS_PORT}}:6379"
    volumes:
      - redis_data:/data
    networks:
      - devkit
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
{{/REDIS}}
{{#MAILPIT}}
  mailpit:
    image: axllent/mailpit:{{MAILPIT_VERSION}}
    container_name: {{PROJECT_NAME}}-mailpit
    restart: unless-stopped
    ports:
      - "{{SMTP_PORT}}:1025"
      - "{{MAILPIT_PORT}}:8025"
    networks:
      - devkit
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8025"]
      interval: 10s
      timeout: 5s
      retries: 5
{{/MAILPIT}}
{{#PHP}}
  php:
    image: php:{{PHP_VERSION}}-cli
    container_name: {{PROJECT_NAME}}-php
    restart: unless-stopped
    working_dir: /var/www
    ports:
      - "{{APP_PORT}}:{{APP_PORT}}"
    volumes:
      - .:/var/www
    networks:
      - devkit
    command: {{PHP_COMMAND}}
{{/PHP}}
{{#NODE}}
  node:
    image: node:{{NODE_VERSION}}-alpine
    container_name: {{PROJECT_NAME}}-node
    restart: unless-stopped
    working_dir: /app
    ports:
      - "{{APP_PORT}}:{{APP_PORT}}"
    volumes:
      - .:/app
      - node_modules:/app/node_modules
    networks:
      - devkit
    command: {{NODE_COMMAND}}
{{/NODE}}
{{#PYTHON}}
  python:
    image: python:{{PYTHON_VERSION}}-slim
    container_name: {{PROJECT_NAME}}-python
    restart: unless-stopped
    working_dir: /app
    ports:
      - "{{APP_PORT}}:{{APP_PORT}}"
    volumes:
      - .:/app
    networks:
      - devkit
{{/PYTHON}}

volumes:
{{#MYSQL}}
  mysql_data:
{{/MYSQL}}
{{#POSTGRES}}
  pg_data:
{{/POSTGRES}}
{{#REDIS}}
  redis_data:
{{/REDIS}}
{{#NODE}}
  node_modules:
{{/NODE}}

networks:
  devkit:
    driver: bridge
