import React from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';

const CartPage: React.FC = () => {
  const { cartItems, removeFromCart, updateQuantity, getTotalAmount, clearCart } = useCart();

  if (cartItems.length === 0) {
    return (
      <div className="cart-page empty">
        <div className="container">
          <div className="empty-cart">
            <ShoppingBag size={80} strokeWidth={1} />
            <h1>Корзина пуста</h1>
            <p>Добавьте товары из каталога</p>
            <Link to="/catalog" className="cta-button">
              Перейти в каталог
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <div className="container">
        <h1>Корзина</h1>
        <div className="cart-content">
          <div className="cart-items">
            {cartItems.map(({ product, quantity }) => (
              <div key={product.id} className="cart-item">
                <img src={product.image} alt={product.name} />
                <div className="item-details">
                  <h3>
                    <Link to={`/product/${product.id}`}>{product.name}</Link>
                  </h3>
                  <p className="item-price">{product.price.toLocaleString()} ₽</p>
                </div>
                <div className="quantity-controls">
                  <button
                    onClick={() => updateQuantity(product.id, quantity - 1)}
                    disabled={quantity <= 1}
                  >
                    <Minus size={16} />
                  </button>
                  <span>{quantity}</span>
                  <button onClick={() => updateQuantity(product.id, quantity + 1)}>
                    <Plus size={16} />
                  </button>
                </div>
                <div className="item-total">
                  {(product.price * quantity).toLocaleString()} ₽
                </div>
                <button
                  className="remove-btn"
                  onClick={() => removeFromCart(product.id)}
                  title="Удалить из корзины"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>

          <div className="cart-summary">
            <h2>Итого</h2>
            <div className="summary-row">
              <span>Товары:</span>
              <span>{getTotalAmount().toLocaleString()} ₽</span>
            </div>
            <div className="summary-row">
              <span>Доставка:</span>
              <span>Бесплатно</span>
            </div>
            <div className="summary-total">
              <span>К оплате:</span>
              <span>{getTotalAmount().toLocaleString()} ₽</span>
            </div>
            <Link to="/checkout" className="checkout-btn">
              Оформить заказ
            </Link>
            <button className="clear-cart-btn" onClick={clearCart}>
              Очистить корзину
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartPage;