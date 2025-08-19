import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { FavoritesProvider } from './context/FavoritesContext';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import CatalogPage from './pages/CatalogPage';
import CategoryPage from './pages/CategoryPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderConfirmationPage from './pages/OrderConfirmationPage';
import FavoritesPage from './pages/FavoritesPage';
import SupportChatPage from './pages/SupportChatPage';
import './App.css';

function App() {
  return (
    <Router>
      <CartProvider>
        <FavoritesProvider>
          <div className="App">
            <Header />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/catalog" element={<CatalogPage />} />
                <Route path="/category/:categoryId" element={<CategoryPage />} />
                <Route path="/product/:productId" element={<ProductPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/order-confirmation/:orderId" element={<OrderConfirmationPage />} />
                <Route path="/favorites" element={<FavoritesPage />} />
                <Route path="/support" element={<SupportChatPage />} />
                <Route path="/profile" element={<div className="container"><h1>Профиль клиента</h1><p>В разработке...</p></div>} />
              </Routes>
            </main>
          </div>
        </FavoritesProvider>
      </CartProvider>
    </Router>
  );
}

export default App;