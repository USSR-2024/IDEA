import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, Star } from 'lucide-react';
import { Product } from '../types';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';

interface ProductCardProps {
  product: Product;
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { addToCart } = useCart();
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites();

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isFavorite(product.id)) {
      removeFromFavorites(product.id);
    } else {
      addToFavorites(product);
    }
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    addToCart(product);
  };

  return (
    <Link to={`/product/${product.id}`} className="product-card">
      <div className="product-image">
        <img src={product.image} alt={product.name} />
        <button
          className={`favorite-btn ${isFavorite(product.id) ? 'active' : ''}`}
          onClick={handleFavoriteClick}
        >
          <Heart size={20} />
        </button>
      </div>
      <div className="product-info">
        <h3>{product.name}</h3>
        <div className="rating">
          <Star size={16} fill="gold" />
          <span>{product.rating}</span>
          <span className="reviews">({product.reviews})</span>
        </div>
        <p className="price">{product.price.toLocaleString()} ₽</p>
        <button className="add-to-cart-btn" onClick={handleAddToCart}>
          <ShoppingCart size={16} />
          <span>В корзину</span>
        </button>
      </div>
    </Link>
  );
};

export default ProductCard;