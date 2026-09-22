const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
});

export default function ProductCard({ product, onAddToCart, onViewDetails }) {
  return (
    <div className="product-card">
      <div className="product-card__image" aria-hidden="true">
        <span>{product.emoji}</span>
      </div>
      <div className="product-card__body">
        <span className="product-card__category">{product.category}</span>
        <h3 className="product-card__name">{product.name}</h3>
        <p className="product-card__price">
          {currencyFormatter.format(product.price)}
        </p>
        <div className="product-card__actions">
          <button
            type="button"
            className="product-card__button product-card__button--secondary"
            onClick={() => onViewDetails(product)}
          >
            Detayı Gör
          </button>
          <button
            type="button"
            className="product-card__button"
            onClick={() => onAddToCart(product)}
          >
            Sepete Ekle
          </button>
        </div>
      </div>
    </div>
  );
}
