import React from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { categories, products } from '../utils/mockData';

const HomePage: React.FC = () => {
  const featuredProducts = products.slice(0, 4);

  return (
    <div className="home-page">
      <section className="hero">
        <div className="container">
          <h1>IDEA - Всё для вашего дома</h1>
          <p>Превратите ваш дом в место мечты</p>
          <Link to="/catalog" className="cta-button">
            Перейти в каталог
          </Link>
        </div>
      </section>

      <section className="categories">
        <div className="container">
          <h2>Категории товаров</h2>
          <div className="categories-grid">
            {categories.map((category) => (
              <Link
                key={category.id}
                to={`/category/${category.id}`}
                className="category-card"
              >
                <div className="category-icon">{category.icon}</div>
                <h3>{category.name}</h3>
                <p>{category.productCount} товаров</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="featured-products">
        <div className="container">
          <h2>Популярные товары</h2>
          <div className="products-grid">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <div className="see-more">
            <Link to="/catalog" className="see-more-link">
              Смотреть все товары
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;