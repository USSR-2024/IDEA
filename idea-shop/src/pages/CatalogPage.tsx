import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { categories, products } from '../utils/mockData';
import { Filter } from 'lucide-react';

const CatalogPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('popular');

  const filteredProducts = selectedCategory === 'all'
    ? products
    : products.filter(p => p.category === selectedCategory);

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case 'price-asc':
        return a.price - b.price;
      case 'price-desc':
        return b.price - a.price;
      case 'rating':
        return b.rating - a.rating;
      default:
        return b.reviews - a.reviews;
    }
  });

  return (
    <div className="catalog-page">
      <div className="container">
        <div className="page-header">
          <h1>Каталог товаров</h1>
          <div className="breadcrumbs">
            <Link to="/">Главная</Link>
            <span>/</span>
            <span>Каталог</span>
          </div>
        </div>

        <div className="catalog-content">
          <aside className="filters">
            <div className="filter-header">
              <Filter size={20} />
              <h3>Фильтры</h3>
            </div>
            
            <div className="filter-section">
              <h4>Категории</h4>
              <div className="filter-options">
                <label>
                  <input
                    type="radio"
                    name="category"
                    value="all"
                    checked={selectedCategory === 'all'}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  />
                  <span>Все товары</span>
                </label>
                {categories.map((category) => (
                  <label key={category.id}>
                    <input
                      type="radio"
                      name="category"
                      value={category.id}
                      checked={selectedCategory === category.id}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                    />
                    <span>{category.name} ({category.productCount})</span>
                  </label>
                ))}
              </div>
            </div>
          </aside>

          <div className="catalog-main">
            <div className="catalog-toolbar">
              <p className="results-count">
                Найдено товаров: {sortedProducts.length}
              </p>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="sort-select"
              >
                <option value="popular">По популярности</option>
                <option value="rating">По рейтингу</option>
                <option value="price-asc">Цена: по возрастанию</option>
                <option value="price-desc">Цена: по убыванию</option>
              </select>
            </div>

            <div className="products-grid">
              {sortedProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CatalogPage;