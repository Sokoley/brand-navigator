# Инструкция по деплою на сервер

## Требования на сервере
- Docker и Docker Compose
- Nginx (уже установлен)
- SSL сертификат Let's Encrypt (уже настроен)

---

## Шаг 1: Загрузка проекта на сервер

### Вариант A: через Git
```bash
# На сервере
cd /var/www
git clone <url-репозитория> storage
cd storage
```

### Вариант B: через SCP/SFTP
```bash
# На локальной машине
scp -r /Users/sokoley/Desktop/ai/storage user@your-server:/var/www/www-root/data/www/brand.smazka.ru
```

---

## Шаг 2: Настройка переменных окружения

```bash
cd /var/www/www-root/data/www/brand.smazka.ru

# Создать .env файл из примера
cp .env.example .env

# Отредактировать .env
nano .env
```

**Обязательно заполните:**
```env
JWT_SECRET=ваш_случайный_секрет_минимум_32_символа
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ваш_надежный_пароль
YANDEX_OAUTH_TOKEN=токен_яндекс_диска_если_нужен
```

**Сгенерировать JWT_SECRET:**
```bash
openssl rand -base64 32
```

---

## Шаг 3: Создание JSON файлов (если их нет)

```bash
# Создать пустые файлы если их нет
[ ! -f custom_properties.json ] && echo '{}' > custom_properties.json
[ ! -f products_cache.json ] && echo '{}' > products_cache.json

# Установить права
chmod 666 custom_properties.json products_cache.json
```

---

## Шаг 4: Сборка и запуск Docker

```bash
# Собрать образ
docker compose build

# Запустить в фоновом режиме
docker compose up -d

# Проверить статус
docker compose ps

# Посмотреть логи
docker compose logs -f
```

---

## Шаг 5: Настройка Nginx

### Создать конфигурацию:
```bash
sudo nano /etc/nginx/sites-available/storage.conf
```

### Вставить конфигурацию (замените `brand.smazka.ru` на ваш домен):
```nginx
server {
    listen 80;
    server_name brand.smazka.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name brand.smazka.ru;

    # SSL сертификаты Let's Encrypt
    ssl_certificate /etc/letsencrypt/live/brand.smazka.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/brand.smazka.ru/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Увеличенный лимит для загрузки файлов
    client_max_body_size 100M;
}
```

### Активировать конфигурацию:
```bash
# Создать символическую ссылку
sudo ln -s /etc/nginx/sites-available/storage.conf /etc/nginx/sites-enabled/

# Проверить конфигурацию
sudo nginx -t

# Перезапустить nginx
sudo systemctl reload nginx
```

---

## Шаг 6: Проверка

1. Откройте в браузере: `https://brand.smazka.ru`
2. Проверьте логи: `docker compose logs -f`

---

## Полезные команды

```bash
# Перезапуск приложения
docker compose restart

# Остановка
docker compose down

# Пересборка после изменений
docker compose build --no-cache && docker compose up -d

# Просмотр логов
docker compose logs -f app

# Зайти в контейнер
docker compose exec app sh
```

---

## Обновление приложения

```bash
cd /var/www/www-root/data/www/brand.smazka.ru

# Если используете Git
git pull

# Пересобрать и перезапустить
docker compose build && docker compose up -d
```

---

## Troubleshooting

### Ошибка "JWT_SECRET is not set"
Убедитесь, что файл `.env` содержит `JWT_SECRET` и Docker Compose его читает:
```bash
docker compose config  # Проверить итоговую конфигурацию
```

### Приложение недоступно
```bash
# Проверить что контейнер запущен
docker compose ps

# Проверить порт
curl http://localhost:3000

# Проверить логи
docker compose logs app
```

### Nginx 502 Bad Gateway
Контейнер не запущен или порт неправильный. Проверьте:
```bash
docker compose ps
docker compose logs
```
