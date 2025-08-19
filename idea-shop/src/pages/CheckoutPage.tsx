import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Truck, MapPin, Phone, Mail, User } from 'lucide-react';
import { useCart } from '../context/CartContext';

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { cartItems, getTotalAmount, clearCart } = useCart();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    zipCode: '',
    deliveryMethod: 'courier',
    paymentMethod: 'card',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // В реальном приложении здесь бы был API-запрос
    const orderId = Date.now().toString();
    clearCart();
    navigate(`/order-confirmation/${orderId}`);
  };

  if (cartItems.length === 0) {
    navigate('/cart');
    return null;
  }

  const deliveryPrice = formData.deliveryMethod === 'pickup' ? 0 : 300;
  const totalAmount = getTotalAmount() + deliveryPrice;

  return (
    <div className="checkout-page">
      <div className="container">
        <h1>Оформление заказа</h1>
        
        <form onSubmit={handleSubmit} className="checkout-form">
          <div className="checkout-content">
            <div className="checkout-main">
              <section className="checkout-section">
                <h2>
                  <User size={20} />
                  Контактные данные
                </h2>
                <div className="form-group">
                  <label htmlFor="name">ФИО</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="phone">Телефон</label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>
              </section>

              <section className="checkout-section">
                <h2>
                  <Truck size={20} />
                  Способ доставки
                </h2>
                <div className="radio-group">
                  <label className={formData.deliveryMethod === 'courier' ? 'active' : ''}>
                    <input
                      type="radio"
                      name="deliveryMethod"
                      value="courier"
                      checked={formData.deliveryMethod === 'courier'}
                      onChange={handleInputChange}
                    />
                    <div>
                      <strong>Курьерская доставка</strong>
                      <span>300 ₽, 1-3 дня</span>
                    </div>
                  </label>
                  <label className={formData.deliveryMethod === 'pickup' ? 'active' : ''}>
                    <input
                      type="radio"
                      name="deliveryMethod"
                      value="pickup"
                      checked={formData.deliveryMethod === 'pickup'}
                      onChange={handleInputChange}
                    />
                    <div>
                      <strong>Самовывоз</strong>
                      <span>Бесплатно</span>
                    </div>
                  </label>
                </div>

                {formData.deliveryMethod === 'courier' && (
                  <div className="delivery-address">
                    <div className="form-group">
                      <label htmlFor="address">Адрес доставки</label>
                      <input
                        type="text"
                        id="address"
                        name="address"
                        value={formData.address}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="city">Город</label>
                        <input
                          type="text"
                          id="city"
                          name="city"
                          value={formData.city}
                          onChange={handleInputChange}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="zipCode">Индекс</label>
                        <input
                          type="text"
                          id="zipCode"
                          name="zipCode"
                          value={formData.zipCode}
                          onChange={handleInputChange}
                          required
                        />
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="checkout-section">
                <h2>
                  <CreditCard size={20} />
                  Способ оплаты
                </h2>
                <div className="radio-group">
                  <label className={formData.paymentMethod === 'card' ? 'active' : ''}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="card"
                      checked={formData.paymentMethod === 'card'}
                      onChange={handleInputChange}
                    />
                    <div>
                      <strong>Банковской картой</strong>
                      <span>Онлайн на сайте</span>
                    </div>
                  </label>
                  <label className={formData.paymentMethod === 'cash' ? 'active' : ''}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cash"
                      checked={formData.paymentMethod === 'cash'}
                      onChange={handleInputChange}
                    />
                    <div>
                      <strong>Наличными</strong>
                      <span>При получении</span>
                    </div>
                  </label>
                </div>
              </section>
            </div>

            <div className="checkout-sidebar">
              <div className="order-summary">
                <h2>Ваш заказ</h2>
                <div className="order-items">
                  {cartItems.map(({ product, quantity }) => (
                    <div key={product.id} className="order-item">
                      <span>{product.name} × {quantity}</span>
                      <span>{(product.price * quantity).toLocaleString()} ₽</span>
                    </div>
                  ))}
                </div>
                <div className="order-totals">
                  <div className="total-row">
                    <span>Товары:</span>
                    <span>{getTotalAmount().toLocaleString()} ₽</span>
                  </div>
                  <div className="total-row">
                    <span>Доставка:</span>
                    <span>{deliveryPrice > 0 ? `${deliveryPrice} ₽` : 'Бесплатно'}</span>
                  </div>
                  <div className="total-row final">
                    <span>Итого:</span>
                    <span>{totalAmount.toLocaleString()} ₽</span>
                  </div>
                </div>
                <button type="submit" className="submit-order-btn">
                  Оформить заказ
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CheckoutPage;