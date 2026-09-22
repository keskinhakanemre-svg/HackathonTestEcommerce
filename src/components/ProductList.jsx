import ProductCard from "./ProductCard";

export default function ProductList({ products, onAddToCart, onViewDetails }) {
  if (products.length === 0) {
    return <p className="product-list__empty">Gösterilecek ürün bulunamadı.</p>;
  }

  return (
    <div className="product-list">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onAddToCart={onAddToCart}
          onViewDetails={onViewDetails}
        />
      ))}
    </div>
  );
}
