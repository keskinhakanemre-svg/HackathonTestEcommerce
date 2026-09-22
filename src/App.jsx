import { useState } from "react";
import Header from "./components/Header";
import ProductDetailPage from "./components/ProductDetailPage";
import ProductList from "./components/ProductList";
import AgentRequestPage from "./pages/AgentRequestPage";
import { products } from "./data/products";
import "./App.css";

function App() {
  const [cartCount, setCartCount] = useState(0);
  const [page, setPage] = useState("products"); // "products" | "product-detail" | "agent-request"
  const [selectedProduct, setSelectedProduct] = useState(null);

  const handleAddToCart = () => {
    setCartCount((count) => count + 1);
  };

  const handleNavigate = (nextPage) => {
    setPage(nextPage);
  };

  const handleOpenProductDetail = (product) => {
    setSelectedProduct(product);
    setPage("product-detail");
  };

  return (
    <div className="app">
      <Header
        cartCount={cartCount}
        page={page === "product-detail" ? "products" : page}
        onNavigate={handleNavigate}
      />
      <main className="app__main">
        {page === "products" ? (
          <>
            <section className="app__intro">
              <h2>Ürün Listesi</h2>
              <p>Basit e-ticaret ürün listeleme sayfası.</p>
            </section>
            <ProductList
              products={products}
              onAddToCart={handleAddToCart}
              onViewDetails={handleOpenProductDetail}
            />
          </>
        ) : page === "product-detail" && selectedProduct ? (
          <ProductDetailPage
            product={selectedProduct}
            onBack={() => handleNavigate("products")}
            onAddToCart={handleAddToCart}
          />
        ) : (
          <AgentRequestPage />
        )}
      </main>
      <footer className="app__footer">
        <p>SimpleShop &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

export default App;
