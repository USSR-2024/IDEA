import React from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import { useFavorites } from '../context/FavoritesContext';

const FavoritesPage: React.FC = () => {
  const { favorites } = useFavorites();

  return (
    <div className="favorites-page">
      <div className="container">
        <h1>Избранные товары</h1>
        
        {favorites.length > 0 ? (
          <>
            <p className="favorites-count">
              Товаров в избранном: {favorites.length}
            </p>
            <div className="products-grid">
              {favorites.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        ) : (
          <div className="empty-favorites">
            <Heart size={80} strokeWidth={1} />
            <h2>В избранном пока ничего нет</h2>
            <p>Добавляйте понравившиеся товары, чтобы вернуться к ним позже</p>
            <Link to="/catalog" className="cta-button">
              Перейти в каталог
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default FavoritesPage;