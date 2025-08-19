import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Heart, ShoppingCart, Star, ChevronLeft, Truck, Shield, RefreshCw } from 'lucide-react';
import { products, categories } from '../utils/mockData';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';
import ProductCard from '../components/ProductCard';

const ProductPage: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useCart();
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites();

  const product = products.find(p => p.id === productId);
  const category = product ? categories.find(c => c.id === product.category) : null;
  const relatedProducts = product 
    ? products.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4)
    : [];

  if (!product) {
    return (
      <div className="container">
        <h1>Товар не найден</h1>
        <Link to="/catalog">Вернуться в каталог</Link>
      </div>
    );
  }

  const handleAddToCart = () => {
    for (let i = 0; i < quantity; i++) {
      addToCart(product);
    }
  };

  const handleFavoriteClick = () => {
    if (isFavorite(product.id)) {
      removeFromFavorites(product.id);
    } else {
      addToFavorites(product);
    }
  };

  return (
    <div className="product-page">
      <div className="container">
        <div className="breadcrumbs">
          <Link to="/">Главная</Link>
          <span>/</span>
          <Link to="/catalog">Каталог</Link>
          <span>/</span>
          <Link to={`/category/${product.category}`}>{category?.name}</Link>
          <span>/</span>
          <span>{product.name}</span>
        </div>

        <Link to="/catalog" className="back-link">
          <ChevronLeft size={20} />
          <span>Назад в каталог</span>
        </Link>

        <div className="product-content">
          <div className="product-images">
            <img src={product.image} alt={product.name} className="main-image" />
          </div>

          <div className="product-details">
            <h1>{product.name}</h1>
            
            <div className="rating-section">
              <div className="rating">
                <Star size={20} fill="gold" />
                <span className="rating-value">{product.rating}</span>
                <span className="reviews">({product.reviews} отзывов)</span>
              </div>
            </div>

            <div className="price-section">
              <span className="price">{product.price.toLocaleString()} ₽</span>
              {product.inStock ? (
                <span className="in-stock">✓ В наличии</span>
              ) : (
                <span className="out-of-stock">Нет в наличии</span>
              )}
            </div>

            <p className="description">{product.description}</p>

            <div className="purchase-section">
              <div className="quantity-selector">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  -
                </button>
                <input 
                  type="number" 
                  value={quantity} 
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                />
                <button onClick={() => setQuantity(quantity + 1)}>
                  +
                </button>
              </div>

              <button 
                className="add-to-cart-btn primary"
                onClick={handleAddToCart}
                disabled={!product.inStock}
              >
                <ShoppingCart size={20} />
                <span>Добавить в корзину</span>
              </button>

              <button 
                className={`favorite-btn ${isFavorite(product.id) ? 'active' : ''}`}
                onClick={handleFavoriteClick}
              >
                <Heart size={20} />
              </button>
            </div>

            <div className="features">
              <div className="feature">
                <Truck size={20} />
                <span>Быстрая доставка</span>
              </div>
              <div className="feature">
                <Shield size={20} />
                <span>Гарантия качества</span>
              </div>
              <div className="feature">
                <RefreshCw size={20} />
                <span>Возврат в течение 14 дней</span>
              </div>
            </div>
          </div>
        </div>

        {relatedProducts.length > 0 && (
          <section className="related-products">
            <h2>Похожие товары</h2>
            <div className="products-grid">
              {relatedProducts.map(p => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default ProductPage;