import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, Package, Mail, Phone } from 'lucide-react';

const OrderConfirmationPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();

  return (
    <div className="order-confirmation-page">
      <div className="container">
        <div className="confirmation-content">
          <div className="success-icon">
            <CheckCircle size={80} color="#4CAF50" />
          </div>
          
          <h1>Заказ успешно оформлен!</h1>
          <p className="order-number">Номер заказа: #{orderId}</p>
          
          <div className="confirmation-details">
            <div className="info-block">
              <Package size={24} />
              <div>
                <h3>Статус заказа</h3>
                <p>Ваш заказ принят и будет обработан в течение 24 часов</p>
              </div>
            </div>
            
            <div className="info-block">
              <Mail size={24} />
              <div>
                <h3>Подтверждение на email</h3>
                <p>Мы отправили подтверждение заказа на вашу электронную почту</p>
              </div>
            </div>
            
            <div className="info-block">
              <Phone size={24} />
              <div>
                <h3>Свяжемся с вами</h3>
                <p>Наш менеджер свяжется с вами для уточнения деталей доставки</p>
              </div>
            </div>
          </div>
          
          <div className="confirmation-actions">
            <Link to="/profile/orders" className="cta-button">
              Мои заказы
            </Link>
            <Link to="/catalog" className="secondary-button">
              Продолжить покупки
            </Link>
          </div>
          
          <div className="support-info">
            <p>Есть вопросы? Свяжитесь с нашей службой поддержки:</p>
            <p className="support-contacts">
              <a href="tel:+78001234567">+7 (800) 123-45-67</a>
              <span>или</span>
              <a href="mailto:support@idea-shop.ru">support@idea-shop.ru</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmationPage;