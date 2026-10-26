import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { catalog } from "./catalog";
import { searchProducts } from "../server/search";
import "./style.css";
const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
const Icon = ({ name, size = 22 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden="true"
  >
    {name === "search" ? (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ) : name === "bag" ? (
      <>
        <path d="M5 7h14l1 14H4L5 7Z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </>
    ) : name === "user" ? (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
      </>
    ) : name === "arrow" ? (
      <path d="M3 12h17m-6-6 6 6-6 6" />
    ) : name === "close" ? (
      <path d="m5 5 14 14M5 19 19 5" />
    ) : name === "menu" ? (
      <path d="M3 6h18M3 12h18M3 18h18" />
    ) : (
      <path d="m5 12 4 4L19 6" />
    )}
  </svg>
);
async function api(path, options = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const type = r.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw Error("API unavailable");
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed");
  return data;
}
function Jar({ p, large = false }) {
  return (
    <div
      className={"jar-scene " + (large ? "large" : "")}
      style={{ "--jar": p.color }}
      aria-label={p.name + " supplement container"}
      role="img"
    >
      <div className="jar">
        <div className="lid" />
        <div className="label">
          <b>
            {p.brand}
            <span>®</span>
          </b>
          <small>SPORTS NUTRITION</small>
          <strong>{p.name}</strong>
          <div className="jar-line" />
          <em>{p.flavor}</em>
          <div className="jar-bottom">
            <span>{p.protein ? `${p.protein}G PROTEIN` : "DAILY FORMULA"}</span>
            <span>
              {p.servings}
              <br />
              SERVINGS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
function App() {
  const [page, setPage] = useState(location.pathname),
    [products, setProducts] = useState(catalog),
    [demo, setDemo] = useState(null),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [filters, setFilters] = useState(() => {
      const c = location.pathname.split("/category/")[1];
      return c
        ? {
            category: {
              protein: "Protein",
              creatine: "Creatine",
              "pre-workout": "Pre-workout",
              essentials: "Essentials",
            }[c],
          }
        : {};
    }),
    [searchResults, setSearchResults] = useState(null),
    [sort, setSort] = useState("featured"),
    [cart, setCart] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem("forge-cart") || "[]");
      } catch {
        return [];
      }
    }),
    [drawer, setDrawer] = useState(false),
    [modal, setModal] = useState(null),
    [user, setUser] = useState(null),
    [toast, setToast] = useState(""),
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false),
    [orders, setOrders] = useState([]),
    [adminTab, setAdminTab] = useState("products"),
    [edit, setEdit] = useState(null),
    [searchMode, setSearchMode] = useState("catalog");
  const go = (path) => {
    history.pushState({}, "", path);
    setPage(path.split("?")[0]);
    setMobile(false);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const fn = () => {
      setPage(location.pathname);
      const c = location.pathname.split("/category/")[1];
      setFilters(
        c
          ? {
              category: {
                protein: "Protein",
                creatine: "Creatine",
                "pre-workout": "Pre-workout",
                essentials: "Essentials",
              }[c],
            }
          : {},
      );
    };
    addEventListener("popstate", fn);
    api("/health")
      .then(() => {
        setDemo(false);
        api("/me")
          .then(setUser)
          .catch(() => {});
        api("/products").then((d) => setProducts(d.products));
      })
      .catch(() => setDemo(true));
    return () => removeEventListener("popstate", fn);
  }, []);
  useEffect(() => {
    localStorage.setItem("forge-cart", JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    const p = products.find((x) => "/product/" + x.slug === page);
    document.title = p
      ? `${p.name} | FORGE Sports Nutrition`
      : page === "/shop"
        ? "Shop Sports Nutrition | FORGE"
        : "FORGE — Fuel your next.";
    let tag = document.getElementById("product-schema");
    if (tag) tag.remove();
    if (p) {
      tag = document.createElement("script");
      tag.id = "product-schema";
      tag.type = "application/ld+json";
      tag.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        description: p.description,
        sku: p.id,
        brand: { "@type": "Brand", name: p.brand },
        offers: {
          "@type": "Offer",
          priceCurrency: "USD",
          price: (p.price / 100).toFixed(2),
          availability:
            "https://schema.org/" + (p.stock ? "InStock" : "OutOfStock"),
        },
      });
      document.head.appendChild(tag);
    }
  }, [page, products]);
  useEffect(() => {
    if (!drawer && !modal && !edit) return;
    const before = document.activeElement;
    const timer = setTimeout(
      () =>
        document
          .querySelector("[role=dialog] button, [role=dialog] input")
          ?.focus(),
      0,
    );
    const handle = (e) => {
      if (e.key === "Escape") {
        setDrawer(false);
        setModal(null);
        setEdit(null);
      }
      if (e.key === "Tab") {
        const all = [
          ...document.querySelectorAll(
            "[role=dialog] button:not(:disabled),[role=dialog] input,[role=dialog] select,[role=dialog] textarea,[role=dialog] a",
          ),
        ];
        if (!all.length) return;
        const first = all[0],
          last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, [drawer, modal, edit]);
  const notify = (t) => setToast(t);
  const add = (p, qty = 1) => {
    const current = cart.find((x) => x.id === p.id)?.quantity || 0;
    if (current + qty > p.stock)
      return notify("That quantity is currently unavailable.");
    setCart((c) =>
      current
        ? c.map((x) =>
            x.id === p.id ? { ...x, quantity: x.quantity + qty } : x,
          )
        : [...c, { id: p.id, quantity: qty }],
    );
    notify(p.name + " added to your bag");
  };
  const lines = cart
      .map((x) => ({ ...x, product: products.find((p) => p.id === x.id) }))
      .filter((x) => x.product),
    subtotal = lines.reduce((n, x) => n + x.product.price * x.quantity, 0),
    shipping = subtotal >= 7500 ? 0 : 590;
  const chooseCategory = (c) => {
    setFilters(c ? { category: c } : {});
    setQuery("");
    setSearch("");
    go(c ? "/category/" + c.toLowerCase() : "/shop");
  };
  const submitSearch = async (e, value = query) => {
    e?.preventDefault();
    setQuery(value);
    setSearch(value);
    go("/shop");
  };
  // Keep the complete local catalog in demo; live filtering is fetched whenever filters change.
  useEffect(() => {
    if (demo === false && (page === "/shop" || page.startsWith("/category/"))) {
      let active = true;
      setBusy(true);
      api("/products?" + new URLSearchParams({ ...filters, q: search }))
        .then((d) => {
          if (active) {
            setSearchResults(d.products);
            setSearchMode(d.searchMode);
          }
        })
        .catch((e) => notify(e.message))
        .finally(() => active && setBusy(false));
      return () => {
        active = false;
      };
    }
  }, [filters, search, demo, page]);
  const shown = (
    demo ? searchProducts(products, search, filters) : searchResults || products
  )
    .slice()
    .sort((a, b) =>
      sort === "low"
        ? a.price - b.price
        : sort === "high"
          ? b.price - a.price
          : 0,
    );
  const link = (path, label, props = {}) => (
    <a
      href={path}
      {...props}
      onClick={(e) => {
        e.preventDefault();
        go(path);
      }}
    >
      {label}
    </a>
  );
  function Card({ p }) {
    return (
      <article className="product-card">
        <button
          className="product-image"
          onClick={() => go("/product/" + p.slug)}
        >
          <span className="product-tag">
            {p.id === "p2"
              ? "PLANT POWER"
              : p.stock === 0
                ? "SOLD OUT"
                : p.id === "p1"
                  ? "BESTSELLER"
                  : p.category.toUpperCase()}
          </span>
          <Jar p={p} />
          <span className="image-arrow">
            <Icon name="arrow" />
          </span>
        </button>
        <div className="product-meta">
          <span>
            {p.brand} / {p.servings} SERVINGS
          </span>
          <span>{p.protein ? `${p.protein}G PROTEIN` : "DAILY ESSENTIAL"}</span>
        </div>
        <div className="product-name">
          <a
            href={"/product/" + p.slug}
            onClick={(e) => {
              e.preventDefault();
              go("/product/" + p.slug);
            }}
          >
            {p.name}
          </a>
          <span>{money(p.price)}</span>
        </div>
        <p>
          {p.flavor} · {p.dietary.split(",")[0]}
        </p>
        <button
          className="add-button"
          disabled={!p.stock}
          onClick={() => add(p)}
        >
          {p.stock ? "ADD TO BAG" : "OUT OF STOCK"}
          <span>+</span>
        </button>
      </article>
    );
  }
  function CartContent() {
    return (
      <>
        <h2>
          Your bag{" "}
          <span className="muted">
            ({cart.reduce((n, x) => n + x.quantity, 0)})
          </span>
        </h2>
        {!lines.length ? (
          <div className="empty">
            <h3>Good things start here.</h3>
            <p>Your bag is ready for your next routine.</p>
            <button
              className="btn"
              onClick={() => {
                setDrawer(false);
                chooseCategory();
              }}
            >
              Explore products <Icon name="arrow" />
            </button>
          </div>
        ) : (
          <>
            <p className="shipping-note">
              {subtotal >= 7500
                ? "You unlocked free shipping."
                : `${money(7500 - subtotal)} away from free shipping`}
            </p>
            <div className="progress">
              <i
                style={{ width: Math.min(100, (subtotal / 7500) * 100) + "%" }}
              />
            </div>
            {lines.map((x) => (
              <div className="cart-line" key={x.id}>
                <Jar p={x.product} />
                <div>
                  <b>{x.product.name}</b>
                  <p>{x.product.flavor}</p>
                  <div className="quantity">
                    <button
                      aria-label="Decrease quantity"
                      onClick={() =>
                        setCart((c) =>
                          c.flatMap((i) =>
                            i.id === x.id
                              ? i.quantity > 1
                                ? [{ ...i, quantity: i.quantity - 1 }]
                                : []
                              : [i],
                          ),
                        )
                      }
                    >
                      −
                    </button>
                    <span>{x.quantity}</span>
                    <button
                      aria-label="Increase quantity"
                      onClick={() => add(x.product)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="text-button"
                    onClick={() =>
                      setCart((c) => c.filter((i) => i.id !== x.id))
                    }
                  >
                    Remove
                  </button>
                </div>
                <b>{money(x.product.price * x.quantity)}</b>
              </div>
            ))}
            <div className="summary-row">
              <span>Subtotal</span>
              <b>{money(subtotal)}</b>
            </div>
            <p className="muted">Shipping calculated at checkout.</p>
            <button
              className="btn full"
              onClick={() => {
                setDrawer(false);
                go("/checkout");
              }}
            >
              Checkout <Icon name="arrow" />
            </button>
            <button
              className="text-button full"
              onClick={() => setDrawer(false)}
            >
              Continue shopping
            </button>
          </>
        )}
      </>
    );
  }
  async function loadOrders(admin = false) {
    try {
      setOrders(await api(admin ? "/admin/orders" : "/orders"));
    } catch (e) {
      notify(e.message);
    }
  }
  function Auth() {
    const [register, setRegister] = useState(false),
      [error, setError] = useState("");
    return (
      <>
        <h2>{register ? "Join the movement." : "Welcome back."}</h2>
        <p className="muted">Your routine. Your orders. All in one place.</p>
        {demo ? (
          <div className="notice">
            Accounts are available in the Node app. This hosted storefront is a
            demonstration; it does not create accounts.
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                setUser(
                  await api("/auth/" + (register ? "register" : "login"), {
                    method: "POST",
                    body: JSON.stringify(
                      Object.fromEntries(new FormData(e.target)),
                    ),
                  }),
                );
                setModal(null);
                notify("You’re signed in");
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            {register && (
              <label>
                Full name
                <input name="name" required minLength="2" autoComplete="name" />
              </label>
            )}
            <label>
              Email
              <input type="email" name="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength="10"
                maxLength="100"
                autoComplete={register ? "new-password" : "current-password"}
              />
            </label>
            <p className="error" role="alert">
              {error}
            </p>
            <button className="btn full">
              {register ? "Create account" : "Sign in"} <Icon name="arrow" />
            </button>
            <button
              type="button"
              className="text-button full"
              onClick={() => setRegister(!register)}
            >
              {register
                ? "Already a member? Sign in"
                : "New here? Create an account"}
            </button>
          </form>
        )}
      </>
    );
  }
  function Checkout() {
    const [error, setError] = useState(""),
      [loading, setLoading] = useState(false);
    return (
      <main className="wrap page">
        <div className="eyebrow">SECURE CHECKOUT</div>
        <h1>One step closer.</h1>
        <div className="checkout-layout">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (demo)
                return setError(
                  "Checkout is disabled in this preview. Run the Node app and configure Stripe to accept payments.",
                );
              if (!user) {
                setModal("auth");
                return;
              }
              setLoading(true);
              try {
                const r = await api("/checkout", {
                  method: "POST",
                  body: JSON.stringify({
                    items: cart,
                    shipping: Object.fromEntries(new FormData(e.target)),
                  }),
                });
                location.assign(r.url);
              } catch (e) {
                setError(e.message);
                setLoading(false);
              }
            }}
          >
            <h3>Shipping details</h3>
            {!user && (
              <p>
                Have an account?{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setModal("auth")}
                >
                  Sign in
                </button>
              </p>
            )}
            <label>
              Full name
              <input
                name="name"
                required
                autoComplete="name"
                defaultValue={user?.name}
              />
            </label>
            <label>
              Street address
              <input
                name="address"
                required
                minLength="5"
                autoComplete="street-address"
              />
            </label>
            <div className="form-row">
              <label>
                City
                <input name="city" required autoComplete="address-level2" />
              </label>
              <label>
                Postal code
                <input
                  name="postal"
                  required
                  minLength="2"
                  autoComplete="postal-code"
                />
              </label>
            </div>
            <label>
              Country
              <select name="country">
                <option value="US">United States</option>
              </select>
            </label>
            <p className="muted">
              US shipping ·{" "}
              {shipping ? "$5.90 standard shipping" : "Free standard shipping"}
              <br />
              Payment is securely handled by Stripe. Card details are never
              stored by FORGE.
            </p>
            {demo && (
              <div className="notice">
                Preview mode — no payments will be collected.
              </div>
            )}
            <p className="error" role="alert">
              {error}
            </p>
            <button className="btn full" disabled={loading || !lines.length}>
              {loading ? "Preparing checkout…" : "Continue to secure payment"}
              <Icon name="arrow" />
            </button>
          </form>
          <aside className="order-summary">
            <h3>Order summary</h3>
            {lines.map((x) => (
              <div className="summary-row" key={x.id}>
                <span>
                  {x.product.name} × {x.quantity}
                </span>
                <b>{money(x.product.price * x.quantity)}</b>
              </div>
            ))}
            <div className="summary-row">
              <span>Shipping</span>
              <span>{money(shipping)}</span>
            </div>
            <div className="summary-row total">
              <span>Total (USD)</span>
              <b>{money(subtotal + shipping)}</b>
            </div>
            <p className="muted">
              Displayed prices include applicable taxes. Illustrative catalog
              and pricing.
            </p>
          </aside>
        </div>
      </main>
    );
  }
  function Detail({ p }) {
    const [qty, setQty] = useState(1);
    if (!p)
      return (
        <main className="wrap page">
          <h1>Product not found.</h1>
          <button className="btn" onClick={() => chooseCategory()}>
            Back to shop
          </button>
        </main>
      );
    return (
      <main className="wrap page">
        <div className="breadcrumb">
          <button onClick={() => go("/")}>Home</button> /{" "}
          <button onClick={() => chooseCategory(p.category)}>
            {p.category}
          </button>{" "}
          / {p.name}
        </div>
        <div className="detail-grid">
          <div className="detail-image">
            <Jar p={p} large />
          </div>
          <div className="detail-copy">
            <div className="eyebrow">{p.brand} SPORTS NUTRITION</div>
            <h1>{p.name}</h1>
            <p className="detail-price">{money(p.price)}</p>
            <p>{p.description}</p>
            <div className="chips">
              {p.dietary.split(",").map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
            <label>
              Flavor
              <select value={p.flavor} readOnly>
                <option>{p.flavor}</option>
              </select>
            </label>
            <div className="buy-row">
              <div className="quantity">
                <button
                  aria-label="Decrease quantity"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                >
                  −
                </button>
                <span>{qty}</span>
                <button
                  aria-label="Increase quantity"
                  onClick={() => setQty(Math.min(p.stock, qty + 1))}
                >
                  +
                </button>
              </div>
              <button
                className="btn"
                disabled={!p.stock}
                onClick={() => add(p, qty)}
              >
                {p.stock ? "Add to bag" : "Out of stock"} <Icon name="bag" />
              </button>
            </div>
            <p className="muted">
              {p.stock
                ? `${p.stock} in stock · Free shipping on orders $75+`
                : "Currently unavailable"}
            </p>
            <details open>
              <summary>What’s inside</summary>
              <p>{p.ingredients}</p>
            </details>
            <details>
              <summary>Nutrition & serving information</summary>
              <p>
                {p.servings} servings per container.{" "}
                {p.protein
                  ? `${p.protein} g protein per serving.`
                  : "Follow the product label for serving instructions."}{" "}
                Full nutrition and allergen labeling must be verified before
                sale.
              </p>
            </details>
            <details>
              <summary>Shipping & returns</summary>
              <p>
                Standard US delivery is $5.90, free on orders $75+. Contact
                support before returning unopened products. Final policies must
                be configured by the store operator.
              </p>
            </details>
          </div>
        </div>
        <div className="section-head">
          <h2>Build your routine.</h2>
        </div>
        <div className="product-grid">
          {products
            .filter((x) => x.id !== p.id)
            .slice(0, 4)
            .map((p) => (
              <Card key={p.id} p={p} />
            ))}
        </div>
      </main>
    );
  }
  function Admin() {
    const [items, setItems] = useState(demo ? products : []);
    useEffect(() => {
      if (!demo && user?.role === "ADMIN")
        api("/admin/products")
          .then(setItems)
          .catch((e) => notify(e.message));
    }, []);
    return (
      <main className="wrap page">
        <div className="eyebrow">STORE OPERATIONS {demo ? " / DEMO" : ""}</div>
        <div className="section-head">
          <h1>Control room.</h1>
          <button
            className="btn"
            onClick={() =>
              setEdit({
                name: "",
                brand: "FORGE",
                category: "Protein",
                description: "",
                price: 0,
                stock: 0,
                flavor: "",
                ingredients: "",
                dietary: "",
                protein: 0,
                servings: 30,
                color: "#b8c6a4",
                published: true,
              })
            }
          >
            Add product +
          </button>
        </div>
        {!demo && user?.role !== "ADMIN" ? (
          <div className="notice">
            Sign in with an admin account to manage this store.
            <button className="text-button" onClick={() => setModal("auth")}>
              {" "}
              Sign in
            </button>
          </div>
        ) : (
          <>
            <div className="stats">
              <div>
                <span>CATALOG PRODUCTS</span>
                <b>{items.length}</b>
              </div>
              <div>
                <span>UNITS IN STOCK</span>
                <b>{items.reduce((n, p) => n + p.stock, 0)}</b>
              </div>
              <div>
                <span>LOW STOCK ≤ 20</span>
                <b>{items.filter((p) => p.stock <= 20).length}</b>
              </div>
            </div>
            {demo && (
              <p className="notice">
                Admin preview: changes stay in this browser session. Live
                management requires an authenticated admin in the Node app.
              </p>
            )}
            <div className="tabs">
              <button
                className={adminTab === "products" ? "active" : ""}
                onClick={() => setAdminTab("products")}
              >
                Products & inventory
              </button>
              <button
                className={adminTab === "orders" ? "active" : ""}
                onClick={() => {
                  setAdminTab("orders");
                  if (!demo) loadOrders(true);
                }}
              >
                Orders
              </button>
            </div>
            <div className="table-scroll">
              {adminTab === "products" ? (
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Inventory</th>
                      <th>Status</th>
                      <th>Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <b>{p.name}</b>
                          <small>
                            {p.brand} · {p.flavor}
                          </small>
                        </td>
                        <td>{p.category}</td>
                        <td>{money(p.price)}</td>
                        <td>{p.stock} units</td>
                        <td>
                          <span
                            className={"pill " + (p.stock <= 20 ? "warn" : "")}
                          >
                            {!p.published && p.published !== undefined
                              ? "Hidden"
                              : p.stock
                                ? "In stock"
                                : "Sold out"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => setEdit(p)}
                          >
                            Edit ↗
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <>
                  <h3>Orders</h3>
                  {!orders.length ? (
                    <p>
                      No orders yet. Paid orders will appear here after
                      checkout.
                    </p>
                  ) : (
                    orders.map((o) => (
                      <div className="order-item" key={o.id}>
                        <b>{o.id}</b>
                        <p>
                          {o.user?.email} · {money(o.total)} · {o.status}
                        </p>
                        {["PAID", "PROCESSING", "SHIPPED"].includes(
                          o.status,
                        ) && (
                          <button
                            className="btn"
                            onClick={async () => {
                              try {
                                await api("/admin/orders/" + o.id, {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    status: {
                                      PAID: "PROCESSING",
                                      PROCESSING: "SHIPPED",
                                      SHIPPED: "DELIVERED",
                                    }[o.status],
                                  }),
                                });
                                loadOrders(true);
                              } catch (e) {
                                notify(e.message);
                              }
                            }}
                          >
                            Mark{" "}
                            {
                              {
                                PAID: "processing",
                                PROCESSING: "shipped",
                                SHIPPED: "delivered",
                              }[o.status]
                            }
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </>
        )}
        {edit && (
          <div className="overlay" onClick={() => setEdit(null)}>
            <section
              className="modal editor"
              role="dialog"
              aria-modal="true"
              aria-label="Edit product"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="close"
                aria-label="Close editor"
                onClick={() => setEdit(null)}
              >
                <Icon name="close" />
              </button>
              <h2>{edit.id ? "Edit product" : "New product"}</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.target));
                  const p = {
                    ...f,
                    price: Math.round(Number(f.price) * 100),
                    stock: Number(f.stock),
                    protein: Number(f.protein),
                    servings: Number(f.servings),
                    published: f.published === "on",
                  };
                  try {
                    let saved;
                    if (demo) {
                      saved = {
                        ...edit,
                        ...p,
                        id: edit.id || "local-" + Date.now(),
                        slug:
                          edit.slug ||
                          p.name.toLowerCase().replaceAll(" ", "-"),
                      };
                    } else
                      saved = await api(
                        "/admin/products" + (edit.id ? "/" + edit.id : ""),
                        {
                          method: edit.id ? "PATCH" : "POST",
                          body: JSON.stringify(p),
                        },
                      );
                    setProducts((a) =>
                      edit.id
                        ? a.map((x) => (x.id === edit.id ? saved : x))
                        : [...a, saved],
                    );
                    setSearchResults(null);
                    setItems((a) =>
                      edit.id
                        ? a.map((x) => (x.id === edit.id ? saved : x))
                        : [...a, saved],
                    );
                    setEdit(null);
                    notify("Product saved");
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                {["name", "brand", "flavor", "ingredients", "dietary"].map(
                  (k) => (
                    <label key={k}>
                      {k}
                      <input
                        name={k}
                        defaultValue={edit[k]}
                        required={["name", "brand"].includes(k)}
                      />
                    </label>
                  ),
                )}
                <label>
                  Description
                  <textarea
                    name="description"
                    defaultValue={edit.description}
                    required
                    minLength="5"
                  />
                </label>
                <label>
                  Category
                  <select name="category" defaultValue={edit.category}>
                    {["Protein", "Creatine", "Pre-workout", "Essentials"].map(
                      (c) => (
                        <option key={c}>{c}</option>
                      ),
                    )}
                  </select>
                </label>
                <div className="form-row">
                  {["price", "stock", "protein", "servings"].map((k) => (
                    <label key={k}>
                      {k}
                      {k === "price" ? " (USD)" : ""}
                      <input
                        name={k}
                        type="number"
                        min={k === "servings" ? 1 : 0}
                        step={k === "price" ? ".01" : "1"}
                        required
                        defaultValue={
                          k === "price" ? edit.price / 100 : edit[k]
                        }
                      />
                    </label>
                  ))}
                </div>
                <label>
                  Package color
                  <input type="color" name="color" defaultValue={edit.color} />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="published"
                    defaultChecked={edit.published !== false}
                  />{" "}
                  Published
                </label>
                <button className="btn full">Save product</button>
              </form>
            </section>
          </div>
        )}
      </main>
    );
  }
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="announcement">
        BUILT FOR YOUR EVERYDAY BEST. <span>FREE SHIPPING ON ORDERS $75+</span>
        <span>MOVE WITH PURPOSE ↗</span>
      </div>
      <header>
        <div className="header-main wrap">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Icon name="menu" />
          </button>
          {link(
            "/",
            <>
              FORGE<span className="logo-dot">®</span>
            </>,
            { className: "logo", "aria-label": "FORGE home" },
          )}
          <nav className={mobile ? "open" : ""}>
            <button onClick={() => chooseCategory()}>Shop all</button>
            <button onClick={() => chooseCategory("Protein")}>Protein</button>
            <button onClick={() => chooseCategory("Creatine")}>Creatine</button>
            <button onClick={() => chooseCategory("Pre-workout")}>
              Pre-workout
            </button>
            <button onClick={() => chooseCategory("Essentials")}>
              Essentials
            </button>
          </nav>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="Search products"
              onClick={() => {
                go("/shop");
                setTimeout(
                  () => document.getElementById("search-input")?.focus(),
                  50,
                );
              }}
            >
              <Icon name="search" />
            </button>
            <button
              className="icon-button"
              aria-label="Your account"
              onClick={() => {
                if (user) {
                  go("/account");
                  loadOrders();
                } else setModal("auth");
              }}
            >
              <Icon name="user" />
            </button>
            <button
              className="bag-button"
              aria-label="Open shopping bag"
              onClick={() => setDrawer(true)}
            >
              <Icon name="bag" />
              <span>{cart.reduce((n, x) => n + x.quantity, 0)}</span>
            </button>
          </div>
        </div>
      </header>
      <div id="main" tabIndex="-1">
        {page === "/" ? (
          <>
            <section className="hero">
              <div className="hero-photo" />
              <div className="hero-grid wrap">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span className="little-dot" /> EVERY REP. EVERY DAY.
                  </div>
                  <h1>
                    FUEL
                    <br />
                    YOUR <span>NEXT.</span>
                  </h1>
                  <p>
                    Big goals. Small daily wins.
                    <br />
                    Sports nutrition that shows up with you.
                  </p>
                  <button className="btn lime" onClick={() => chooseCategory()}>
                    Find your fuel <Icon name="arrow" />
                  </button>
                  <div className="hero-foot">
                    <span>REAL INGREDIENTS.</span>
                    <span>NO SHORTCUTS.</span>
                  </div>
                </div>
                <div className="hero-product">
                  <span className="orbit-text">
                    MADE FOR THE WORK YOU PUT IN.
                  </span>
                  <Jar p={catalog[0]} large />
                  <div className="hero-caption">
                    <span>YOUR EVERYDAY FOUNDATION</span>
                    <b>
                      Whey Isolate <span>↗</span>
                    </b>
                    <small>25g protein. All-in effort.</small>
                  </div>
                </div>
                <span className="hero-index">01 — THE DAILY LINEUP</span>
              </div>
            </section>
            <div className="benefit-strip">
              <span>↗ PURPOSEFUL FORMULAS</span>
              <span>◎ TRANSPARENT INGREDIENTS</span>
              <span>✳ OPTIONS FOR YOUR ROUTINE</span>
              <span>→ FREE SHIPPING $75+</span>
            </div>
            <section className="wrap section">
              <div className="section-head">
                <div>
                  <div className="eyebrow">THE DAILY LINEUP</div>
                  <h2>
                    GOOD HABITS.
                    <br />
                    <span className="highlight">GREAT FUEL.</span>
                  </h2>
                </div>
                <button className="under-link" onClick={() => chooseCategory()}>
                  Shop all products <Icon name="arrow" />
                </button>
              </div>
              <div className="product-grid">
                {products.slice(0, 4).map((p) => (
                  <Card key={p.id} p={p} />
                ))}
              </div>
            </section>
            <section className="search-banner wrap">
              <div>
                <span className="eyebrow">LESS SCROLLING. MORE MOVING.</span>
                <h2>
                  Your goals.
                  <br />
                  Your kind of fuel.
                </h2>
                <p>
                  Tell us what you’re looking for. We’ll search the catalog.
                </p>
              </div>
              <div>
                <form className="search-box" onSubmit={submitSearch}>
                  <Icon name="search" />
                  <input
                    aria-label="Natural language product search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Try “vegan protein under $40”"
                  />
                  <button aria-label="Submit search">
                    <Icon name="arrow" />
                  </button>
                </form>
                <div className="search-examples">
                  {["Vegan protein under $40", "Caffeine-free pre-workout"].map(
                    (q) => (
                      <button key={q} onClick={() => submitSearch(null, q)}>
                        {q} ↗
                      </button>
                    ),
                  )}
                </div>
                <small>
                  {demo
                    ? "Catalog search preview"
                    : "AI-assisted intent, real catalog results"}
                  . Real products. Real availability.
                </small>
              </div>
            </section>
            <section className="category-section wrap section">
              <div className="section-head">
                <h2>
                  WHAT’S YOUR
                  <br />
                  NEXT MOVE?
                </h2>
                <p>
                  Different goals. Same commitment.
                  <br />
                  Find your place to start.
                </p>
              </div>
              <div className="category-grid">
                {[
                  ["Protein", "01", "BUILD YOUR FOUNDATION."],
                  ["Creatine", "02", "STAY CONSISTENT."],
                  ["Pre-workout", "03", "SET THE PACE."],
                ].map(([c, n, t]) => (
                  <button key={c} onClick={() => chooseCategory(c)}>
                    <span>
                      {n} / {c.toUpperCase()}
                    </span>
                    <Jar
                      p={
                        catalog[c === "Protein" ? 1 : c === "Creatine" ? 2 : 4]
                      }
                    />
                    <div>
                      <h3>{t}</h3>
                      <Icon name="arrow" />
                    </div>
                  </button>
                ))}
              </div>
            </section>
            <section className="manifesto">
              <div className="manifesto-photo" />
              <div className="manifesto-copy">
                <span className="eyebrow">PROGRESS IS PERSONAL.</span>
                <h2>
                  NO HYPE.
                  <br />
                  JUST THE
                  <br />
                  <span>WORK.</span>
                </h2>
                <p>
                  The early starts. The extra rep. The days you show up anyway.
                  We make straightforward sports nutrition for the routine
                  you’re building.
                </p>
                <button className="under-link" onClick={() => chooseCategory()}>
                  Fuel your routine <Icon name="arrow" />
                </button>
              </div>
            </section>
            <section className="wrap faq section">
              <div>
                <span className="eyebrow">A LITTLE CLARITY</span>
                <h2>
                  GOOD
                  <br />
                  QUESTIONS.
                </h2>
                <p>Know what goes into your routine.</p>
              </div>
              <div>
                {[
                  [
                    "Which protein should I choose?",
                    "Whey Isolate contains milk. Plant Protein uses pea and rice protein and is vegan. Compare the ingredients and dietary tags on each product page to find a fit.",
                  ],
                  [
                    "Do you have caffeine-free options?",
                    "Yes. Flow Stim-Free is our caffeine-free pre-workout. You can also search for “caffeine-free” and combine it with category and ingredient filters.",
                  ],
                  [
                    "How does smart search work?",
                    "Search in your own words. The Node app can use AI to extract category, budget and dietary preferences, then checks the actual catalog. Without an AI key, catalog search supports common phrases, synonyms and typos.",
                  ],
                  [
                    "Where do you ship?",
                    "This starter store is configured for US shipping: $5.90 standard delivery, free on orders $75+. Shipping policies and fulfillment should be finalized before launch.",
                  ],
                ].map(([q, a]) => (
                  <details key={q}>
                    <summary>{q}</summary>
                    <p>{a}</p>
                  </details>
                ))}
              </div>
            </section>
            <section className="newsletter">
              <div className="wrap">
                <div className="eyebrow">THE FORGE MINDSET</div>
                <h2>
                  SHOW UP.
                  <br />
                  WE’LL BRING THE FUEL.
                </h2>
                <button className="btn black" onClick={() => chooseCategory()}>
                  Build your routine <Icon name="arrow" />
                </button>
                <span className="newsletter-star">✳</span>
              </div>
            </section>
          </>
        ) : page === "/shop" || page.startsWith("/category/") ? (
          <main className="wrap page">
            <div className="breadcrumb">
              <button onClick={() => go("/")}>Home</button> / Shop
            </div>
            <div className="shop-heading">
              <div>
                <span className="eyebrow">FIND YOUR EVERYDAY EDGE</span>
                <h1>{filters.category || "ALL FUEL."}</h1>
                <p>Straightforward nutrition. Whatever your next looks like.</p>
              </div>
              <span className="shop-star">✳</span>
            </div>
            <form className="search-box shop-search" onSubmit={submitSearch}>
              <Icon name="search" />
              <input
                id="search-input"
                aria-label="Search catalog"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search naturally: vegan protein under $40"
              />
              <button className="btn black">
                Find my fuel <Icon name="arrow" />
              </button>
            </form>
            <p className="search-caption">
              {demo
                ? "Catalog search preview"
                : searchMode === "ai"
                  ? "AI-assisted search"
                  : "Catalog search"}{" "}
              · Results use actual product data and availability.
            </p>
            <div className="shop-layout">
              <aside className="filters">
                <div className="filter-title">
                  <b>FILTERS</b>
                  <button
                    className="text-button"
                    onClick={() => {
                      setFilters({});
                      setSearch("");
                      setQuery("");
                    }}
                  >
                    Reset
                  </button>
                </div>
                {[
                  [
                    "category",
                    "Category",
                    ["Protein", "Creatine", "Pre-workout", "Essentials"],
                  ],
                  ["brand", "Brand", ["FORGE", "APEX"]],
                  [
                    "flavor",
                    "Flavor",
                    [...new Set(products.map((p) => p.flavor))],
                  ],
                  [
                    "dietary",
                    "Dietary preferences",
                    ["Vegan", "Dairy-free", "Gluten-free", "Caffeine-free"],
                  ],
                ].map(([key, label, options]) => (
                  <label key={key}>
                    {label}
                    <select
                      value={filters[key] || ""}
                      onChange={(e) =>
                        setFilters({ ...filters, [key]: e.target.value })
                      }
                    >
                      <option value="">All {label.toLowerCase()}</option>
                      {options.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                ))}
                <label>
                  Maximum price (USD)
                  <input
                    type="number"
                    min="1"
                    value={filters.maxPrice || ""}
                    placeholder="No maximum"
                    onChange={(e) =>
                      setFilters({ ...filters, maxPrice: e.target.value })
                    }
                  />
                </label>
                <label>
                  Ingredient contains
                  <input
                    value={filters.ingredient || ""}
                    placeholder="e.g. pea, creatine"
                    onChange={(e) =>
                      setFilters({ ...filters, ingredient: e.target.value })
                    }
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!filters.inStock}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        inStock: e.target.checked ? "true" : "",
                      })
                    }
                  />{" "}
                  In stock only
                </label>
              </aside>
              <div>
                <div className="results-bar">
                  <span aria-live="polite">
                    {busy ? "Searching…" : `${shown.length} products`}
                    {search && ` for “${search}”`}
                  </span>
                  <select
                    aria-label="Sort products"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="featured">Featured</option>
                    <option value="low">Price: low to high</option>
                    <option value="high">Price: high to low</option>
                  </select>
                </div>
                {shown.length ? (
                  <div className="product-grid shop-grid">
                    {shown.map((p) => (
                      <Card key={p.id} p={p} />
                    ))}
                  </div>
                ) : (
                  <div className="empty">
                    <h2>No matching fuel.</h2>
                    <p>Try a broader search or remove a filter.</p>
                    <button
                      className="btn"
                      onClick={() => {
                        setFilters({});
                        setSearch("");
                        setQuery("");
                      }}
                    >
                      Reset search
                    </button>
                  </div>
                )}
              </div>
            </div>
          </main>
        ) : page.startsWith("/product/") ? (
          <Detail
            p={products.find(
              (x) => "/product/" + x.slug === page && x.published !== false,
            )}
          />
        ) : page === "/checkout" ? (
          <Checkout />
        ) : page === "/admin" ? (
          <Admin />
        ) : page === "/account" ? (
          <main className="wrap page">
            <h1>Your routine.</h1>
            {user ? (
              <>
                <p>Welcome, {user.name}.</p>
                <button
                  className="text-button"
                  onClick={async () => {
                    await api("/logout", { method: "POST" });
                    setUser(null);
                    go("/");
                  }}
                >
                  Sign out
                </button>
                <h2>Your orders</h2>
                {!orders.length ? (
                  <p>No orders yet.</p>
                ) : (
                  orders.map((o) => (
                    <div className="order-item" key={o.id}>
                      <b>{o.id}</b>
                      <p>
                        {new Date(o.createdAt).toLocaleDateString()} ·{" "}
                        {o.status} · {money(o.total)}
                      </p>
                      {o.items.map((i) => (
                        <p key={i.id}>
                          {i.name} × {i.quantity}
                        </p>
                      ))}
                    </div>
                  ))
                )}
              </>
            ) : (
              <button className="btn" onClick={() => setModal("auth")}>
                Sign in
              </button>
            )}
          </main>
        ) : (
          <main className="wrap page">
            <h1>Page not found.</h1>
            <button className="btn" onClick={() => go("/")}>
              Back to home
            </button>
          </main>
        )}
      </div>
      <footer>
        <div className="wrap footer-grid">
          <div>
            {link("/", "FORGE®", { className: "logo" })}
            <p>
              FUEL YOUR NEXT.
              <br />
              ONE DAY AT A TIME.
            </p>
          </div>
          <div>
            <b>FIND YOUR FUEL</b>
            {["Protein", "Creatine", "Pre-workout", "Essentials"].map((c) => (
              <button key={c} onClick={() => chooseCategory(c)}>
                {c}
              </button>
            ))}
          </div>
          <div>
            <b>YOUR FORGE</b>
            <button onClick={() => setModal("auth")}>My account</button>
            <button onClick={() => setDrawer(true)}>Shopping bag</button>
            <button onClick={() => go("/admin")}>Store admin</button>
            <button onClick={() => setModal("info")}>Store information</button>
          </div>
          <div className="footer-note">
            <span className="lime-text">
              MAKE YOUR
              <br />
              NEXT COUNT. ↗
            </span>
            <p>
              Supplement use should follow the product label. This is a sample
              store; catalog claims and labels require verification before
              commercial use.
            </p>
          </div>
        </div>
        <div className="wrap footer-bottom">
          <span>© {new Date().getFullYear()} FORGE Sports Nutrition</span>
          <span>
            {demo
              ? "DEMO STOREFRONT · NO LIVE PAYMENTS"
              : "POWERED BY YOUR DAILY EFFORT"}
          </span>
          <span>USD $ / EN</span>
        </div>
      </footer>
      {drawer && (
        <div className="overlay" onClick={() => setDrawer(false)}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Shopping bag"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close bag"
              onClick={() => setDrawer(false)}
            >
              <Icon name="close" />
            </button>
            <CartContent />
          </aside>
        </div>
      )}
      {modal && (
        <div className="overlay" onClick={() => setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "auth" ? "Customer account" : "Store information"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <Icon name="close" />
            </button>
            {modal === "auth" ? (
              <Auth />
            ) : (
              <>
                <h2>Store information.</h2>
                <p>
                  FORGE is a sample sports nutrition storefront. Product names,
                  formulas, pricing and branding are illustrative.
                </p>
                <p>
                  Before launch, configure your support email, legal business
                  details, privacy policy, return policy, tax handling, verified
                  product labels and payment credentials.
                </p>
              </>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" />
          {toast}
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
