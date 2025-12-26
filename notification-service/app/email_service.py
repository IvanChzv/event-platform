import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging
from . import schemas

logger = logging.getLogger(__name__)

# Конфигурация email
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", 587))
EMAIL_USERNAME = os.getenv("EMAIL_USERNAME", "your-email@gmail.com")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "your-app-password")
EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@events.com")

async def send_email_notification(
    notification: schemas.Notification,
    recipient_email: str = None
):
    """Отправка email уведомления"""
    
    # В реальном приложении здесь бы запрашивался email пользователя из auth-service
    if not recipient_email:
        recipient_email = f"user{notification.user_id}@example.com"
    
    # Создание сообщения
    message = MIMEMultipart("alternative")
    message["Subject"] = get_email_subject(notification.notification_type)
    message["From"] = EMAIL_FROM
    message["To"] = recipient_email
    
    # Текст сообщения
    text = f"""
    Уведомление от Event Management Platform
    
    {notification.message}
    
    Тип: {notification.notification_type}
    Дата: {notification.created_at}
    
    ---
    Это автоматическое сообщение, пожалуйста, не отвечайте на него.
    """
    
    # HTML версия
    html = f"""
    <html>
      <body>
        <h2>Уведомление от Event Management Platform</h2>
        <p>{notification.message}</p>
        <p><strong>Тип:</strong> {notification.notification_type}</p>
        <p><strong>Дата:</strong> {notification.created_at}</p>
        <hr>
        <p><em>Это автоматическое сообщение, пожалуйста, не отвечайте на него.</em></p>
      </body>
    </html>
    """
    
    # Добавляем части сообщения
    part1 = MIMEText(text, "plain")
    part2 = MIMEText(html, "html")
    message.attach(part1)
    message.attach(part2)
    
    try:
        # Отправка email
        await aiosmtplib.send(
            message,
            hostname=EMAIL_HOST,
            port=EMAIL_PORT,
            username=EMAIL_USERNAME,
            password=EMAIL_PASSWORD,
            start_tls=True
        )
        logger.info(f"Email отправлен на {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"Ошибка отправки email: {str(e)}")
        return False

def get_email_subject(notification_type: str) -> str:
    """Получение темы письма в зависимости от типа уведомления"""
    subjects = {
        "event_created": "Ваше мероприятие создано",
        "event_registration": "Регистрация на мероприятие",
        "event_updated": "Мероприятие обновлено",
        "event_cancelled": "Мероприятие отменено",
        "test": "Тестовое уведомление"
    }
    return subjects.get(notification_type, "Уведомление от Event Management Platform")