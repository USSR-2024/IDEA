import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Heart, User, Search, MessageCircle, Home } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useFavorites } from '../context/FavoritesContext';

const Header: React.FC = () => {
  const { getTotalItems } = useCart();
  const { favorites } = useFavorites();
  const cartItemsCount = getTotalItems();

  return (
    <header className="header">
      <div className="container">
        <div className="header-content">
          <Link to="/" className="logo">
            <Home size={24} />
            <span>IDEA</span>
          </Link>

          <div className="search-bar">
            <Search size={20} />
            <input type="text" placeholder="Поиск товаров..." />
          </div>

          <nav className="header-nav">
            <Link to="/favorites" className="nav-item">
              <Heart size={24} />
              {favorites.length > 0 && (
                <span className="badge">{favorites.length}</span>
              )}
            </Link>
            <Link to="/cart" className="nav-item">
              <ShoppingCart size={24} />
              {cartItemsCount > 0 && (
                <span className="badge">{cartItemsCount}</span>
              )}
            </Link>
            <Link to="/profile" className="nav-item">
              <User size={24} />
            </Link>
            <Link to="/support" className="nav-item">
              <MessageCircle size={24} />
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;