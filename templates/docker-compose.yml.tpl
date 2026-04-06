# docker-compose.yml generado por devkit
# Proyecto: {{PROJECT_NAME}}

services:
{{#MYSQL}}
  mysql:
    image: mysql:8
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
    image: postgres:16
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
    image: redis:7
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
    image: axllent/mailpit
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

networks:
  devkit:
    driver: bridge
