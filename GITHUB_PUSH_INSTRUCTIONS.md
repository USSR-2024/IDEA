# 📤 Инструкция по загрузке кода в GitHub

## Способ 1: Через Personal Access Token (Рекомендуется)

### Шаг 1: Создайте Personal Access Token на GitHub

1. Перейдите на GitHub.com и войдите в аккаунт
2. Нажмите на фото профиля → **Settings**
3. В левом меню выберите **Developer settings**
4. Выберите **Personal access tokens** → **Tokens (classic)**
5. Нажмите **Generate new token** → **Generate new token (classic)**
6. Дайте токену название (например, "TMS Project")
7. Выберите срок действия
8. Отметьте права доступа:
   - ✅ `repo` (полный доступ к репозиториям)
   - ✅ `workflow` (если планируете использовать GitHub Actions)
9. Нажмите **Generate token**
10. **ВАЖНО:** Скопируйте токен сразу! Он больше не будет показан

### Шаг 2: Используйте токен для пуша

```bash
# Вариант 1: Добавьте токен в URL репозитория
git remote set-url origin https://YOUR_TOKEN@github.com/USSR-2024/IDEA.git

# Вариант 2: Используйте токен при пуше (GitHub запросит username и password)
git push -u origin main
# Username: ваш_github_username
# Password: ваш_personal_access_token (НЕ пароль от GitHub!)
```

## Способ 2: Через SSH ключ

### Шаг 1: Создайте SSH ключ

```bash
# Генерация нового SSH ключа
ssh-keygen -t ed25519 -C "your_email@example.com"

# Или для старых систем
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
```

### Шаг 2: Добавьте SSH ключ в ssh-agent

```bash
# Запустите ssh-agent
eval "$(ssh-agent -s)"

# Добавьте ключ
ssh-add ~/.ssh/id_ed25519
```

### Шаг 3: Добавьте SSH ключ в GitHub

1. Скопируйте публичный ключ:
```bash
cat ~/.ssh/id_ed25519.pub
```

2. На GitHub: Settings → SSH and GPG keys → New SSH key
3. Вставьте ключ и сохраните

### Шаг 4: Измените remote URL на SSH

```bash
git remote set-url origin git@github.com:USSR-2024/IDEA.git
git push -u origin main
```

## Способ 3: Через GitHub CLI

### Установка GitHub CLI

```bash
# macOS
brew install gh

# Ubuntu/Debian
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh
```

### Аутентификация

```bash
# Войдите в GitHub
gh auth login

# Выберите GitHub.com
# Выберите HTTPS
# Выберите Login with a web browser

# После аутентификации
git push -u origin main
```

## Способ 4: Использование Git Credential Manager

```bash
# Настройка credential helper
git config --global credential.helper store

# При первом пуше введите:
git push -u origin main
# Username: ваш_github_username  
# Password: ваш_personal_access_token

# Credentials будут сохранены для будущих операций
```

## 🔐 Безопасность

### Важные замечания:

1. **НИКОГДА** не делитесь своим Personal Access Token
2. **НЕ** коммитьте токены в код
3. Используйте токены с минимально необходимыми правами
4. Регулярно обновляйте токены
5. Удаляйте неиспользуемые токены

### Если токен скомпрометирован:

1. Немедленно отзовите его на GitHub
2. Создайте новый токен
3. Обновите все места, где использовался старый токен

## 📝 Текущий статус репозитория

```bash
# Проверить текущий remote
git remote -v

# Проверить статус
git status

# Посмотреть последний коммит
git log --oneline -1
```

## 🚀 После успешной аутентификации

Ваш код будет доступен по адресу:
https://github.com/USSR-2024/IDEA

## ❓ Troubleshooting

### Ошибка: "Permission denied"
- Проверьте, что у вас есть права на запись в репозиторий
- Убедитесь, что токен имеет scope `repo`

### Ошибка: "Repository not found"
- Проверьте правильность URL репозитория
- Убедитесь, что репозиторий существует

### Ошибка: "Authentication failed"
- Проверьте правильность токена
- Убедитесь, что используете токен, а не пароль от GitHub

---

*Для этого проекта рекомендуется использовать **Способ 1** с Personal Access Token*