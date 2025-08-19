import React, { useState } from 'react';
import { Send, MessageCircle } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'support';
  timestamp: Date;
}

const SupportChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Здравствуйте! Я виртуальный помощник IDEA. Чем могу помочь?',
      sender: 'support',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages([...messages, userMessage]);
    setInputText('');

    // Имитация ответа поддержки
    setTimeout(() => {
      const supportMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Спасибо за ваше обращение! Наш специалист скоро ответит вам.',
        sender: 'support',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, supportMessage]);
    }, 1000);
  };

  return (
    <div className="support-chat-page">
      <div className="container">
        <div className="chat-container">
          <div className="chat-header">
            <MessageCircle size={24} />
            <h1>Чат с поддержкой</h1>
          </div>

          <div className="chat-messages">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message ${message.sender === 'user' ? 'user-message' : 'support-message'}`}
              >
                <div className="message-content">
                  <p>{message.text}</p>
                  <span className="timestamp">
                    {message.timestamp.toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <form className="chat-input-form" onSubmit={handleSendMessage}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Напишите сообщение..."
              className="chat-input"
            />
            <button type="submit" className="send-button" disabled={!inputText.trim()}>
              <Send size={20} />
            </button>
          </form>

          <div className="chat-info">
            <p>Время работы поддержки: Пн-Пт 9:00-21:00, Сб-Вс 10:00-20:00</p>
            <p>Среднее время ответа: 5-10 минут</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportChatPage;