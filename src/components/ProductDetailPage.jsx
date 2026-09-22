const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
});

export default function ProductDetailPage({
  product,
  onBack,
  onAddToCart,
}) {
  return (
    <section className="product-detail">
      <button type="button" className="product-detail__back" onClick={onBack}>
        ← Ürün listesine dön
      </button>
      <div className="product-detail__card">
        <div className="product-detail__image" aria-hidden="true">
          <span>{product.emoji}</span>
        </div>
        <div className="product-detail__content">
          <span className="product-detail__category">{product.category}</span>
          <h2 className="product-detail__name">{product.name}</h2>
          <p className="product-detail__description">
            {product.name}, {product.category.toLowerCase()} kategorisindeki örnek
            ürünlerden biridir. Dummy veri için hazırlanan bu sayfada temel ürün
            bilgilerini görüntüleyebilir ve ürünü sepete ekleyebilirsin.
          </p>
          <div className="product-detail__meta">
            <div className="product-detail__meta-item">
              <span className="product-detail__meta-label">Ürün Kodu</span>
              <strong>SKU-{product.id}</strong>
            </div>
            <div className="product-detail__meta-item">
              <span className="product-detail__meta-label">Fiyat</span>
              <strong>{currencyFormatter.format(product.price)}</strong>
            </div>
          </div>
          <button
            type="button"
            className="product-card__button"
            onClick={() => onAddToCart(product)}
          >
            Sepete Ekle
          </button>
        </div>
      </div>
    </section>
  );
}
