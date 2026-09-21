export default function Header({ cartCount, page, onNavigate }) {
  return (
    <header className="header">
      <div className="header__inner">
        <h1 className="header__logo">🛍️ SimpleShop</h1>
        <nav className="header__nav" aria-label="Sayfalar">
          <button
            type="button"
            className={
              "header__nav-link" +
              (page === "products" ? " header__nav-link--active" : "")
            }
            onClick={() => onNavigate("products")}
          >
            Ürünler
          </button>
          <button
            type="button"
            className={
              "header__nav-link" +
              (page === "agent-request" ? " header__nav-link--active" : "")
            }
            onClick={() => onNavigate("agent-request")}
          >
            Yeni Özellik İste
          </button>
        </nav>
        <div className="header__cart" aria-label="Sepet">
          <span className="header__cart-icon">🛒</span>
          <span className="header__cart-count">{cartCount}</span>
        </div>
      </div>
    </header>
  );
}
