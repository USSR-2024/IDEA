import React from 'react';
import { useParams, Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { categories, products } from '../utils/mockData';
import { ChevronLeft } from 'lucide-react';

const CategoryPage: React.FC = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const category = categories.find(c => c.id === categoryId);
  const categoryProducts = products.filter(p => p.category === categoryId);

  if (!category) {
    return (
      <div className="container">
        <h1>Категория не найдена</h1>
        <Link to="/catalog">Вернуться в каталог</Link>
      </div>
    );
  }

  return (
    <div className="category-page">
      <div className="container">
        <div className="page-header">
          <Link to="/catalog" className="back-link">
            <ChevronLeft size={20} />
            <span>Назад в каталог</span>
          </Link>
          <h1>
            <span className="category-icon">{category.icon}</span>
            {category.name}
          </h1>
          <div className="breadcrumbs">
            <Link to="/">Главная</Link>
            <span>/</span>
            <Link to="/catalog">Каталог</Link>
            <span>/</span>
            <span>{category.name}</span>
          </div>
        </div>

        <div className="category-info">
          <p className="products-count">
            Найдено товаров: {categoryProducts.length}
          </p>
        </div>

        {categoryProducts.length > 0 ? (
          <div className="products-grid">
            {categoryProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="no-products">
            <p>В этой категории пока нет товаров</p>
            <Link to="/catalog" className="cta-button">
              Посмотреть другие категории
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryPage;