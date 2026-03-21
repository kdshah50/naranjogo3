import { useState, useEffect, useRef } from "react";

// ── Google Fonts injection ──────────────────────────────────────────────────
const fontStyle = document.createElement("style");
fontStyle.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --emerald: #1B4332; --emerald-light: #2D6A4F; --gold: #D4A017; --gold-light: #F0C040;
    --clay: #C8704A; --cream: #FDF8F1; --warm-white: #FEFCF9; --smoke: #F4F0EB;
    --charcoal: #1C1917; --mid: #6B7280; --border: #E5E0D8; --success: #059669; --danger: #DC2626;
  }
  body { font-family: 'DM Sans', sans-serif; background: var(--cream); color: var(--charcoal); }
  input, button { font-family: 'DM Sans', sans-serif; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .fade-up { animation: fadeUp 0.4s ease forwards; }
  .fade-up-delay-1 { animation: fadeUp 0.4s 0.05s ease both; }
  .fade-up-delay-2 { animation: fadeUp 0.4s 0.1s ease both; }
  .fade-up-delay-3 { animation: fadeUp 0.4s 0.15s ease both; }
  .fade-up-delay-4 { animation: fadeUp 0.4s 0.2s ease both; }
  .fade-up-delay-5 { animation: fadeUp 0.4s 0.25s ease both; }
  .fade-up-delay-6 { animation: fadeUp 0.4s 0.3s ease both; }
  .card-hover { transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .card-hover:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(27,67,50,0.12); }
  .btn-primary { background: var(--emerald); color: white; border: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer; transition: background 0.2s, transform 0.1s; }
  .btn-primary:hover { background: var(--emerald-light); }
  .btn-primary:active { transform: scale(0.98); }
  .btn-gold { background: var(--gold); color: white; border: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer; transition: background 0.2s, transform 0.1s; }
  .btn-gold:hover { background: #C4900D; }
  .btn-ghost { background: transparent; color: var(--emerald); border: 1.5px solid var(--emerald); padding: 10px 20px; border-radius: 10px; font-weight: 500; font-size: 14px; cursor: pointer; transition: all 0.2s; }
  .btn-ghost:hover { background: var(--emerald); color: white; }
  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s; border: 1.5px solid transparent; }
  .chip-active { background: var(--emerald); color: white; }
  .chip-inactive { background: white; color: var(--mid); border-color: var(--border); }
  .chip-inactive:hover { border-color: var(--emerald); color: var(--emerald); }
  .search-input { width: 100%; border: none; outline: none; font-size: 16px; background: transparent; color: var(--charcoal); }
  .search-input::placeholder { color: #A8A095; }
  .filter-pill { display: inline-flex; align-items: center; gap: 4px; padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 500; background: var(--emerald); color: white; cursor: pointer; }
  .trust-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; background: #ECFDF5; color: var(--success); }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: flex-end; justify-content: center; animation: fadeUp 0.2s ease; }
  .modal-sheet { background: white; border-radius: 20px 20px 0 0; width: 100%; max-width: 480px; padding: 24px; max-height: 85vh; overflow-y: auto; animation: fadeUp 0.3s ease; }
  .range-slider { -webkit-appearance: none; width: 100%; height: 4px; border-radius: 2px; outline: none; }
  .range-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--emerald); cursor: pointer; box-shadow: 0 2px 6px rgba(27,67,50,0.3); }
  .lang-toggle { display: flex; background: var(--smoke); border-radius: 8px; padding: 3px; gap: 2px; }
  .lang-btn { padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s; }
  .lang-active { background: white; color: var(--emerald); box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
  .lang-inactive { background: transparent; color: var(--mid); }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #D1C9BE; border-radius: 2px; }
`;
document.head.appendChild(fontStyle);

// ── DATA ──────────────────────────────────────────────────────────────────────
const T = {
  es: { appName: "Tianguis", tagline: "El Mercado Digital de México", searchPlaceholder: "¿Qué estás buscando?", searchBtn: "Buscar", categories: "Categorías", filters: "Filtros", apply: "Aplicar", clear: "Limpiar", sell: "Vender", price: "Precio", location: "Ubicación", condition: "Estado", distance: "Distancia", allMexico: "Todo México", new: "Nuevo", used: "Usado", verified: "Verificado", featured: "Destacado", sortBy: "Ordenar por", relevance: "Relevancia", newest: "Más reciente", priceLow: "Menor precio", priceHigh: "Mayor precio", results: "resultados", contact: "Contactar", protect: "Compra Protegida", saveSearch: "Guardar búsqueda", listNow: "Publicar ahora", aiListing: "IA detectó:", suggestedPrice: "Precio sugerido", comparables: "artículos similares vendidos", trustScore: "Confianza", members: "miembro desde", addPhoto: "Agregar foto", titleLabel: "Título", descLabel: "Descripción", priceLabel: "Precio (MXN)", cityLabel: "Ciudad", publishBtn: "Publicar gratis", heroTitle: "Compra y vende\ncon confianza", heroSub: "El mercado digital más seguro de México. Sin estafas, sin spam.", trending: "Tendencias", nearby: "Cerca de ti", recentSearches: "Búsquedas recientes", perMonth: "/mes", negotiable: "Negociable", shipping: "Envío disponible" },
  en: { appName: "Tianguis", tagline: "Mexico's Digital Marketplace", searchPlaceholder: "What are you looking for?", searchBtn: "Search", categories: "Categories", filters: "Filters", apply: "Apply", clear: "Clear", sell: "Sell", price: "Price", location: "Location", condition: "Condition", distance: "Distance", allMexico: "All Mexico", new: "New", used: "Used", verified: "Verified", featured: "Featured", sortBy: "Sort by", relevance: "Relevance", newest: "Newest", priceLow: "Price: Low", priceHigh: "Price: High", results: "results", contact: "Contact", protect: "Buyer Protection", saveSearch: "Save search", listNow: "List now", aiListing: "AI detected:", suggestedPrice: "Suggested price", comparables: "similar sold listings", trustScore: "Trust", members: "member since", addPhoto: "Add photo", titleLabel: "Title", descLabel: "Description", priceLabel: "Price (MXN)", cityLabel: "City", publishBtn: "List for free", heroTitle: "Buy & sell\nwith confidence", heroSub: "Mexico's safest digital marketplace. No scams, no spam.", trending: "Trending", nearby: "Near you", recentSearches: "Recent searches", perMonth: "/mo", negotiable: "Negotiable", shipping: "Shipping available" }
};
const CATEGORIES = [
  { id: "all", icon: "◈", label: { es: "Todo", en: "All" } },
  { id: "electronics", icon: "📱", label: { es: "Electrónica", en: "Electronics" } },
  { id: "vehicles", icon: "🚗", label: { es: "Vehículos", en: "Vehicles" } },
  { id: "fashion", icon: "👗", label: { es: "Moda", en: "Fashion" } },
  { id: "home", icon: "🏠", label: { es: "Hogar", en: "Home" } },
  { id: "services", icon: "🔧", label: { es: "Servicios", en: "Services" } },
  { id: "realestate", icon: "🏡", label: { es: "Bienes Raíces", en: "Real Estate" } },
  { id: "sports", icon: "⚽", label: { es: "Deportes", en: "Sports" } },
];
const LISTINGS = [
  { id: 1, category: "electronics", title: { es: "iPhone 14 Pro Max 256GB — Excelente estado", en: "iPhone 14 Pro Max 256GB — Excellent condition" }, price: 18500, currency: "MXN", usd: 1050, location: { es: "Condesa, CDMX", en: "Condesa, Mexico City" }, image: "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=400&q=80", seller: { name: "Carlos M.", rating: 4.9, reviews: 47, verified: true, since: "2022" }, condition: "used", shipping: true, negotiable: false, badge: "featured", timeAgo: { es: "hace 2 horas", en: "2 hours ago" }, tags: { es: ["Batería 92%", "Sin rayones", "Caja original"], en: ["92% battery", "No scratches", "Original box"] } },
  { id: 2, category: "vehicles", title: { es: "Toyota Corolla 2020 — Impecable, 28,000 km", en: "Toyota Corolla 2020 — Immaculate, 28K km" }, price: 285000, currency: "MXN", usd: 16200, location: { es: "Polanco, CDMX", en: "Polanco, Mexico City" }, image: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400&q=80", seller: { name: "María G.", rating: 5.0, reviews: 12, verified: true, since: "2021" }, condition: "used", shipping: false, negotiable: true, badge: "verified", timeAgo: { es: "hace 1 día", en: "1 day ago" }, tags: { es: ["Único dueño", "Servicio al corriente", "Factura"], en: ["Single owner", "Up-to-date service", "Invoice"] } },
  { id: 3, category: "home", title: { es: "Sillón de cuero italiano — Mid-century modern", en: "Italian leather armchair — Mid-century modern" }, price: 7800, currency: "MXN", usd: 440, location: { es: "Roma Norte, CDMX", en: "Roma Norte, Mexico City" }, image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&q=80", seller: { name: "Sofia R.", rating: 4.7, reviews: 23, verified: true, since: "2023" }, condition: "used", shipping: false, negotiable: true, badge: null, timeAgo: { es: "hace 3 horas", en: "3 hours ago" }, tags: { es: ["Medidas: 80x85cm", "Cuero genuino"], en: ["Dimensions: 80x85cm", "Genuine leather"] } },
  { id: 4, category: "electronics", title: { es: "MacBook Air M2 — 8GB RAM, 256GB", en: "MacBook Air M2 — 8GB RAM, 256GB" }, price: 22000, currency: "MXN", usd: 1250, location: { es: "Monterrey, NL", en: "Monterrey, NL" }, image: "https://images.unsplash.com/photo-1611186871525-9f5e17258e76?w=400&q=80", seller: { name: "Diego V.", rating: 4.8, reviews: 31, verified: true, since: "2020" }, condition: "used", shipping: true, negotiable: false, badge: null, timeAgo: { es: "hace 5 horas", en: "5 hours ago" }, tags: { es: ["Batería perfecta", "Sin uso intenso"], en: ["Perfect battery", "Light use"] } },
  { id: 5, category: "fashion", title: { es: "Bolsa Gucci Dionysus — Auténtica, como nueva", en: "Gucci Dionysus Bag — Authentic, like new" }, price: 28000, currency: "MXN", usd: 1590, location: { es: "Guadalajara, JAL", en: "Guadalajara, JAL" }, image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&q=80", seller: { name: "Valentina P.", rating: 5.0, reviews: 8, verified: true, since: "2022" }, condition: "used", shipping: true, negotiable: false, badge: "verified", timeAgo: { es: "hace 2 días", en: "2 days ago" }, tags: { es: ["Certificado de autenticidad", "Bolsa original"], en: ["Authentication cert", "Original dust bag"] } },
  { id: 6, category: "home", title: { es: "Bicicleta Trek FX3 2022 — 21 velocidades", en: "Trek FX3 2022 Bike — 21-speed hybrid" }, price: 9500, currency: "MXN", usd: 540, location: { es: "Coyoacán, CDMX", en: "Coyoacán, Mexico City" }, image: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=400&q=80", seller: { name: "Andrés L.", rating: 4.6, reviews: 19, verified: false, since: "2023" }, condition: "used", shipping: false, negotiable: true, badge: null, timeAgo: { es: "hace 4 horas", en: "4 hours ago" }, tags: { es: ["Talla M", "Cambios Shimano"], en: ["Size M", "Shimano shifters"] } },
];
const TRENDING = [
  { es: "iPhone 14", en: "iPhone 14" }, { es: "Sofá esquinero", en: "Corner sofa" },
  { es: "PlayStation 5", en: "PlayStation 5" }, { es: "Departamento renta", en: "Apartment rental" },
  { es: "Bicicleta eléctrica", en: "Electric bike" },
];

function fmtMXN(n) { return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n); }
function fmtUSD(n) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n); }

function Stars({ rating }) {
  return <span style={{ color: "#D4A017", fontSize: 13, letterSpacing: -1 }}>{"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))}<span style={{ color: "#6B7280", marginLeft: 4, fontSize: 12, fontWeight: 600 }}>{rating.toFixed(1)}</span></span>;
}

function ListingCard({ listing, lang, currency, onClick }) {
  const t = T[lang];
  const [saved, setSaved] = useState(false);
  return (
    <div onClick={onClick} className="card-hover" style={{ background: "white", borderRadius: 16, overflow: "hidden", cursor: "pointer", border: `1px solid var(--border)`, position: "relative" }}>
      <div style={{ position: "relative", paddingBottom: "72%", background: "#F4F0EB" }}>
        <img src={listing.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 5 }}>
          {listing.badge === "featured" && <span style={{ background: "#D4A017", color: "white", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5 }}>✦ {t.featured.toUpperCase()}</span>}
          {listing.badge === "verified" && <span className="trust-badge">✓ {t.verified}</span>}
        </div>
        <button onClick={e => { e.stopPropagation(); setSaved(!saved); }} style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.9)", border: "none", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {saved ? "❤️" : "🤍"}
        </button>
      </div>
      <div style={{ padding: "14px 14px 12px" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--charcoal)", lineHeight: 1.3, marginBottom: 6 }}>
          {currency === "MXN" ? fmtMXN(listing.price) : fmtUSD(listing.usd)}
          {listing.negotiable && <span style={{ fontSize: 11, fontWeight: 400, color: "var(--mid)", marginLeft: 6 }}>· {t.negotiable}</span>}
        </div>
        <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.4, marginBottom: 8, fontWeight: 400 }}>{listing.title[lang]}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
          {listing.tags[lang].slice(0, 2).map(tag => <span key={tag} style={{ fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 4, background: "var(--smoke)", color: "var(--mid)" }}>{tag}</span>)}
          {listing.shipping && <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 4, background: "#EFF6FF", color: "#1D4ED8" }}>📦 {t.shipping}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg, #1B4332, #2D6A4F)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "white", fontWeight: 700 }}>{listing.seller.name[0]}</div>
            <span style={{ fontSize: 11, color: "var(--mid)" }}>{listing.seller.name}</span>
            {listing.seller.verified && <span style={{ fontSize: 11, color: "var(--success)" }}>✓</span>}
          </div>
          <span style={{ fontSize: 11, color: "#A8A095" }}>{listing.location[lang]}</span>
        </div>
      </div>
    </div>
  );
}

function ListingDetail({ listing, lang, currency, t, onClose }) {
  const [contacted, setContacted] = useState(false);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: "#E5E0D8", borderRadius: 2, margin: "0 auto 20px" }} />
        <img src={listing.image} alt="" style={{ width: "100%", borderRadius: 12, height: 220, objectFit: "cover", marginBottom: 16 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--emerald)" }}>{currency === "MXN" ? fmtMXN(listing.price) : fmtUSD(listing.usd)}</div>
          {listing.negotiable && <span style={{ fontSize: 12, color: "var(--mid)", fontStyle: "italic" }}>{t.negotiable}</span>}
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--charcoal)", marginBottom: 12, lineHeight: 1.4 }}>{listing.title[lang]}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>{listing.tags[lang].map(tag => <span key={tag} style={{ fontSize: 12, padding: "4px 10px", background: "var(--smoke)", borderRadius: 6, color: "#374151", fontWeight: 500 }}>{tag}</span>)}</div>
        <div style={{ background: "var(--smoke)", borderRadius: 12, padding: "14px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #1B4332, #2D6A4F)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "white", fontWeight: 700, flexShrink: 0 }}>{listing.seller.name[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontWeight: 600, fontSize: 14 }}>{listing.seller.name}</span>{listing.seller.verified && <span className="trust-badge">✓ {t.verified}</span>}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}><Stars rating={listing.seller.rating} /><span style={{ fontSize: 11, color: "var(--mid)" }}>({listing.seller.reviews})</span></div>
            <div style={{ fontSize: 11, color: "var(--mid)", marginTop: 1 }}>{t.members} {listing.seller.since}</div>
          </div>
        </div>
        <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🛡️</span>
          <div><div style={{ fontSize: 13, fontWeight: 600, color: "#065F46" }}>{t.protect}</div><div style={{ fontSize: 11, color: "#047857" }}>{lang === "es" ? "Tu pago está protegido hasta confirmar tu compra" : "Your payment is held until you confirm receipt"}</div></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20, color: "var(--mid)", fontSize: 13 }}><span>📍</span> {listing.location[lang]}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-primary" style={{ flex: 1, fontSize: 15 }} onClick={() => setContacted(true)}>{contacted ? (lang === "es" ? "✓ Mensaje enviado" : "✓ Message sent") : t.contact}</button>
          <button className="btn-ghost" style={{ padding: "10px 14px" }}>💬 WhatsApp</button>
        </div>
      </div>
    </div>
  );
}

// ── SELL FLOW — FIXED: onPublish callback wires new listing into feed ──────────
function SellModal({ lang, t, onClose, onPublish }) {
  const [step, setStep] = useState(1);
  const [photo, setPhoto] = useState(null);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("electronics");
  const [city, setCity] = useState("CDMX");
  const [negotiable, setNegotiable] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [published, setPublished] = useState(false);
  const fileRef = useRef();

  const simulateAI = () => {
    setAiScanning(true);
    setTimeout(() => { setAiScanning(false); setAiDone(true); setTitle(lang === "es" ? "iPhone 13 Pro — 128GB Grafito" : "iPhone 13 Pro — 128GB Graphite"); setPrice("15000"); }, 2200);
  };

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (file) { const url = URL.createObjectURL(file); setPhoto(url); setStep(2); simulateAI(); }
  };

  if (published) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ textAlign: "center", padding: "40px 24px" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <div style={{ fontFamily: "Playfair Display", fontSize: 26, fontWeight: 700, color: "var(--emerald)", marginBottom: 8 }}>{lang === "es" ? "¡Publicado!" : "Listed!"}</div>
        <div style={{ fontSize: 14, color: "var(--mid)", marginBottom: 24 }}>{lang === "es" ? "Tu artículo ya está visible para compradores." : "Your item is now visible to buyers."}</div>
        <button className="btn-primary" onClick={onClose}>{lang === "es" ? "Ver mi anuncio" : "View my listing"}</button>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: "#E5E0D8", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>{[1,2,3].map(s => <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "var(--emerald)" : "var(--border)", transition: "background 0.3s" }} />)}</div>
        {step === 1 && (
          <div className="fade-up">
            <div style={{ fontFamily: "Playfair Display", fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{lang === "es" ? "¿Qué quieres vender?" : "What are you selling?"}</div>
            <div style={{ fontSize: 13, color: "var(--mid)", marginBottom: 24 }}>{lang === "es" ? "Sube una foto y la IA detecta el artículo automáticamente." : "Upload a photo and AI auto-detects your item."}</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
            <div onClick={() => fileRef.current.click()} style={{ border: "2px dashed var(--border)", borderRadius: 16, padding: "48px 24px", textAlign: "center", cursor: "pointer" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--emerald)"; e.currentTarget.style.background = "var(--smoke)"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "transparent"; }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📷</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.addPhoto}</div>
              <div style={{ fontSize: 12, color: "var(--mid)" }}>{lang === "es" ? "La IA genera el título y precio sugerido" : "AI generates title and suggested price"}</div>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="fade-up">
            <div style={{ fontFamily: "Playfair Display", fontSize: 22, fontWeight: 700, marginBottom: 16 }}>{lang === "es" ? "Detalles del artículo" : "Item details"}</div>
            {photo && <div style={{ marginBottom: 16 }}><img src={photo} alt="" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 12 }} /></div>}
            {aiScanning && <div style={{ background: "var(--smoke)", borderRadius: 10, padding: "14px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 20, height: 20, border: "2px solid var(--emerald)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} /><span style={{ fontSize: 13, color: "var(--emerald)", fontWeight: 500 }}>{lang === "es" ? "IA analizando imagen…" : "AI analyzing image…"}</span></div>}
            {aiDone && <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}><div style={{ fontSize: 11, fontWeight: 700, color: "var(--success)", marginBottom: 6 }}>✦ {t.aiListing}</div><div style={{ fontSize: 13, fontWeight: 600, color: "#065F46" }}>{lang === "es" ? "Smartphone Apple" : "Apple Smartphone"} · {t.suggestedPrice}: {fmtMXN(15000)}</div></div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={{ fontSize: 12, fontWeight: 600, color: "var(--mid)", display: "block", marginBottom: 6 }}>{t.titleLabel}</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder={lang === "es" ? "Ej: iPhone 14 Pro Max 256GB" : "E.g. iPhone 14 Pro Max 256GB"} style={{ width: "100%", padding: "12px 14px", border: "1.5px solid var(--border)", borderRadius: 10, fontSize: 14, outline: "none" }} onFocus={e => e.target.style.borderColor = "var(--emerald)"} onBlur={e => e.target.style.borderColor = "var(--border)"} /></div>
              <div><label style={{ fontSize: 12, fontWeight: 600, color: "var(--mid)", display: "block", marginBottom: 6 }}>{t.descLabel}</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder={lang === "es" ? "Describe tu artículo..." : "Describe your item..."} style={{ width: "100%", padding: "12px 14px", border: "1.5px solid var(--border)", borderRadius: 10, fontSize: 14, outline: "none", resize: "none", fontFamily: "DM Sans, sans-serif" }} onFocus={e => e.target.style.borderColor = "var(--emerald)"} onBlur={e => e.target.style.borderColor = "var(--border)"} /></div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 600, color: "var(--mid)", display: "block", marginBottom: 6 }}>{t.priceLabel}</label><div style={{ position: "relative" }}><span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--mid)", fontWeight: 600 }}>$</span><input value={price} onChange={e => setPrice(e.target.value)} type="number" placeholder="0" style={{ width: "100%", padding: "12px 14px 12px 28px", border: "1.5px solid var(--border)", borderRadius: 10, fontSize: 14, outline: "none" }} onFocus={e => e.target.style.borderColor = "var(--emerald)"} onBlur={e => e.target.style.borderColor = "var(--border)"} /></div></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 600, color: "var(--mid)", display: "block", marginBottom: 6 }}>{t.cityLabel}</label><select value={city} onChange={e => setCity(e.target.value)} style={{ width: "100%", padding: "12px 14px", border: "1.5px solid var(--border)", borderRadius: 10, fontSize: 14, outline: "none", background: "white", fontFamily: "DM Sans, sans-serif", cursor: "pointer" }}>{["CDMX","Guadalajara","Monterrey","Puebla","Tijuana","León","Mérida"].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              </div>
              <div><label style={{ fontSize: 12, fontWeight: 600, color: "var(--mid)", display: "block", marginBottom: 6 }}>{t.categories}</label><select value={category} onChange={e => setCategory(e.target.value)} style={{ width: "100%", padding: "12px 14px", border: "1.5px solid var(--border)", borderRadius: 10, fontSize: 14, outline: "none", background: "white", fontFamily: "DM Sans, sans-serif", cursor: "pointer" }}>{CATEGORIES.filter(c => c.id !== "all").map(c => <option key={c.id} value={c.id}>{c.icon} {c.label[lang]}</option>)}</select></div>
              <div style={{ display: "flex", gap: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}><input type="checkbox" checked={negotiable} onChange={e => setNegotiable(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--emerald)" }} />{t.negotiable}</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}><input type="checkbox" checked={shipping} onChange={e => setShipping(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--emerald)" }} />{t.shipping}</label>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn-ghost" onClick={() => setStep(1)} style={{ padding: "12px 16px" }}>←</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={() => setStep(3)} disabled={!title || !price}>{lang === "es" ? "Continuar" : "Continue"}</button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="fade-up">
            <div style={{ fontFamily: "Playfair Display", fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{lang === "es" ? "Alcance y publicación" : "Reach & publish"}</div>
            <div style={{ fontSize: 13, color: "var(--mid)", marginBottom: 20 }}>{lang === "es" ? "Elige dónde mostrar tu anuncio." : "Choose where to show your listing."}</div>
            {[{ city: "CDMX", desc: lang === "es" ? "8.2M compradores activos" : "8.2M active buyers", checked: true }, { city: "Guadalajara", desc: lang === "es" ? "1.8M compradores activos" : "1.8M active buyers", checked: true }, { city: "Monterrey", desc: lang === "es" ? "+1.4M compradores" : "+1.4M buyers", checked: false }].map(({ city, desc, checked }) => (
              <div key={city} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "var(--smoke)", borderRadius: 10, marginBottom: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, background: checked ? "var(--emerald)" : "white", border: checked ? "none" : "1.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{checked && <span style={{ color: "white", fontSize: 12, fontWeight: 700 }}>✓</span>}</div>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{city}</div><div style={{ fontSize: 11, color: "var(--mid)" }}>{desc}</div></div>
                {!checked && <span style={{ fontSize: 10, fontWeight: 600, color: "var(--gold)", background: "#FEF3C7", padding: "2px 8px", borderRadius: 4 }}>Boost</span>}
              </div>
            ))}
            <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10, padding: "12px 14px", marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 20 }}>🛡️</span><div><div style={{ fontSize: 13, fontWeight: 600, color: "#065F46" }}>{t.protect}</div><div style={{ fontSize: 11, color: "#047857" }}>{lang === "es" ? "Gratis para vendedores. Compradores pagan 3%." : "Free for sellers. Buyers pay 3%."}</div></div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-ghost" onClick={() => setStep(2)} style={{ padding: "12px 16px" }}>←</button>
              <button className="btn-gold" style={{ flex: 1, fontSize: 15 }} onClick={() => {
                const newListing = { id: Date.now(), category, title: { es: title, en: title }, price: parseInt(price) || 0, currency: "MXN", usd: Math.round((parseInt(price) || 0) / 17.6), location: { es: city, en: city }, image: photo || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80", seller: { name: "Tú", rating: 5.0, reviews: 0, verified: false, since: new Date().getFullYear().toString() }, condition: "used", shipping, negotiable, badge: null, timeAgo: { es: "ahora mismo", en: "just now" }, tags: { es: description ? [description.slice(0, 30)] : [], en: description ? [description.slice(0, 30)] : [] }, isUserListing: true };
                onPublish(newListing);
                setPublished(true);
              }}>✦ {t.publishBtn}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FiltersPanel({ lang, t, onClose, onApply }) {
  const [maxPrice, setMaxPrice] = useState(30000);
  const [condition, setCondition] = useState("all");
  const [radius, setRadius] = useState(25);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div style={{ width: 36, height: 4, background: "#E5E0D8", borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}><div style={{ fontFamily: "Playfair Display", fontSize: 20, fontWeight: 700 }}>{t.filters}</div><button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--mid)" }}>✕</button></div>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{t.price}</span><span style={{ fontSize: 13, color: "var(--emerald)", fontWeight: 700 }}>{fmtMXN(maxPrice)}</span></div>
          <input type="range" min={500} max={500000} step={500} value={maxPrice} onChange={e => setMaxPrice(+e.target.value)} className="range-slider" style={{ background: `linear-gradient(to right, var(--emerald) 0%, var(--emerald) ${((maxPrice-500)/499500)*100}%, #E5E0D8 ${((maxPrice-500)/499500)*100}%)` }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}><span style={{ fontSize: 11, color: "var(--mid)" }}>{fmtMXN(500)}</span><span style={{ fontSize: 11, color: "var(--mid)" }}>{fmtMXN(500000)}</span></div>
        </div>
        <div style={{ marginBottom: 28 }}><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{t.condition}</div><div style={{ display: "flex", gap: 8 }}>{["all","new","used"].map(c => <button key={c} onClick={() => setCondition(c)} className={`chip ${condition===c?"chip-active":"chip-inactive"}`}>{c==="all"?(lang==="es"?"Todos":"All"):t[c]}</button>)}</div></div>
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{t.distance}</span><span style={{ fontSize: 13, color: "var(--emerald)", fontWeight: 700 }}>{radius} km</span></div>
          <input type="range" min={1} max={200} step={1} value={radius} onChange={e => setRadius(+e.target.value)} className="range-slider" style={{ background: `linear-gradient(to right, var(--emerald) 0%, var(--emerald) ${(radius/200)*100}%, #E5E0D8 ${(radius/200)*100}%)` }} />
        </div>
        <div style={{ display: "flex", gap: 10 }}><button className="btn-ghost" style={{ flex: 0.4 }} onClick={onClose}>{t.clear}</button><button className="btn-primary" style={{ flex: 0.6 }} onClick={() => { onApply(); onClose(); }}>{t.apply} ({LISTINGS.length} {t.results})</button></div>
      </div>
    </div>
  );
}

// ── MAIN APP — FIXED: listings in state + handlePublish + persistence ──────────
export default function Tianguis() {
  const [lang, setLang] = useState("es");
  const [currency, setCurrency] = useState("MXN");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [sort, setSort] = useState("relevance");
  const [showFilters, setShowFilters] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);
  const [view, setView] = useState("home");
  const [activeFilters, setActiveFilters] = useState([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [listings, setListings] = useState(LISTINGS); // ← FIXED: was hardcoded const

  useEffect(() => {
    const load = async () => {
      try {
        const result = await window.storage.get("userListings");
        if (result && result.value) { const saved = JSON.parse(result.value); setListings([...saved, ...LISTINGS]); }
      } catch (e) {}
    };
    load();
  }, []);

  const handlePublish = async (newListing) => { // ← FIXED: was missing entirely
    setListings(prev => [newListing, ...prev]);
    try {
      const result = await window.storage.get("userListings");
      const existing = result ? JSON.parse(result.value) : [];
      await window.storage.set("userListings", JSON.stringify([newListing, ...existing]));
    } catch (e) { console.error("Storage error:", e); }
  };

  const t = T[lang];
  const filteredListings = listings.filter(l => {
    if (activeCategory !== "all" && l.category !== activeCategory) return false;
    if (query && !l.title[lang].toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
  const doSearch = () => { setView("results"); setSearchFocused(false); };

  const Header = () => (
    <div style={{ background: "white", borderBottom: "1px solid var(--border)", padding: "0 20px", position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(10px)" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", height: 60, gap: 12 }}>
        {view === "results" && <button onClick={() => setView("home")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--emerald)", padding: "4px 4px 4px 0", flexShrink: 0 }}>←</button>}
        <div onClick={() => setView("home")} style={{ cursor: "pointer", flexShrink: 0 }}>
          <span style={{ fontFamily: "Playfair Display", fontSize: 22, fontWeight: 700, color: "var(--emerald)" }}>T</span>
          <span style={{ fontFamily: "Playfair Display", fontSize: 18, fontWeight: 400, color: "var(--charcoal)" }}>ianguis</span>
          <span style={{ fontSize: 10, color: "var(--gold)", fontWeight: 700, marginLeft: 2 }}>✦</span>
        </div>
        {view === "results" && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "var(--smoke)", borderRadius: 10, padding: "8px 14px", border: "1.5px solid transparent" }}><span style={{ fontSize: 14, color: "var(--mid)" }}>🔍</span><input className="search-input" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} placeholder={t.searchPlaceholder} style={{ fontSize: 14 }} /></div>}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div className="lang-toggle">{["es","en"].map(l => <button key={l} className={`lang-btn ${lang===l?"lang-active":"lang-inactive"}`} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
          <button onClick={() => setCurrency(c => c==="MXN"?"USD":"MXN")} style={{ background: "var(--smoke)", border: "none", padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--emerald)" }} onMouseEnter={e => e.target.style.background="var(--border)"} onMouseLeave={e => e.target.style.background="var(--smoke)"}>{currency}</button>
          <button className="btn-gold" style={{ padding: "8px 16px", fontSize: 13 }} onClick={() => setShowSell(true)}>+ {t.sell}</button>
        </div>
      </div>
    </div>
  );

  if (view === "home") return (
    <div style={{ minHeight: "100vh", background: "var(--cream)", fontFamily: "DM Sans, sans-serif" }}>
      <Header />
      <div style={{ background: "linear-gradient(135deg, var(--emerald) 0%, #2D6A4F 60%, #1B4332 100%)", padding: "52px 20px 64px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -80, right: -80, width: 300, height: 300, borderRadius: "50%", background: "rgba(212,160,23,0.08)" }} />
        <div style={{ position: "absolute", bottom: -100, left: -60, width: 240, height: 240, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div className="fade-up" style={{ display: "inline-block", background: "rgba(212,160,23,0.2)", borderRadius: 999, padding: "4px 16px", marginBottom: 16 }}><span style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-light)", letterSpacing: 1 }}>✦ {lang==="es"?"BETA • CIUDAD DE MÉXICO":"BETA • MEXICO CITY"}</span></div>
          <h1 className="fade-up-delay-1" style={{ fontFamily: "Playfair Display", fontSize: "clamp(32px, 6vw, 44px)", fontWeight: 700, color: "white", lineHeight: 1.15, marginBottom: 12, whiteSpace: "pre-line" }}>{t.heroTitle}</h1>
          <p className="fade-up-delay-2" style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", marginBottom: 32, lineHeight: 1.6 }}>{t.heroSub}</p>
          <div className="fade-up-delay-3" style={{ background: "white", borderRadius: 16, padding: "6px 6px 6px 18px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", position: "relative" }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>🔍</span>
            <input className="search-input" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key==="Enter"&&doSearch()} onFocus={() => setSearchFocused(true)} onBlur={() => setTimeout(() => setSearchFocused(false), 200)} placeholder={t.searchPlaceholder} style={{ fontSize: 16 }} />
            <button className="btn-primary" onClick={doSearch} style={{ whiteSpace: "nowrap", borderRadius: 12 }}>{t.searchBtn}</button>
            {searchFocused && <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, background: "white", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", border: "1px solid var(--border)", overflow: "hidden", zIndex: 100 }}><div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}><span style={{ fontSize: 11, fontWeight: 700, color: "var(--mid)", letterSpacing: 0.5 }}>{t.trending.toUpperCase()}</span></div>{TRENDING.map((item,i) => <div key={i} onClick={() => { setQuery(item[lang]); doSearch(); }} style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background="var(--smoke)"} onMouseLeave={e => e.currentTarget.style.background="transparent"}><span style={{ fontSize: 14 }}>🔥</span><span style={{ fontSize: 14 }}>{item[lang]}</span></div>)}</div>}
          </div>
        </div>
      </div>
      <div style={{ background: "white", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 20px", overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 4, padding: "12px 0", minWidth: "max-content" }}>
            {CATEGORIES.map(cat => <button key={cat.id} onClick={() => { setActiveCategory(cat.id); if (cat.id!=="all") doSearch(); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", transition: "all 0.15s", background: activeCategory===cat.id?"var(--emerald)":"var(--smoke)", color: activeCategory===cat.id?"white":"var(--charcoal)", fontSize: 13, fontWeight: 500, fontFamily: "DM Sans, sans-serif", whiteSpace: "nowrap" }}><span style={{ fontSize: 16 }}>{cat.icon}</span>{cat.label[lang]}</button>)}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontFamily: "Playfair Display", fontSize: 22, fontWeight: 700 }}>{lang==="es"?"Destacados":"Featured"}</h2>
          <button onClick={() => setView("results")} style={{ fontSize: 13, color: "var(--emerald)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>{lang==="es"?"Ver todos →":"See all →"}</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
          {listings.slice(0, 6).map((listing, i) => <div key={listing.id} className={`fade-up-delay-${Math.min(i+1,6)}`}><ListingCard listing={listing} lang={lang} currency={currency} onClick={() => setSelectedListing(listing)} /></div>)}
        </div>
      </div>
      <div style={{ background: "var(--emerald)", padding: "32px 20px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, textAlign: "center" }}>
            {[{ icon: "🛡️", title: { es: "Compra protegida", en: "Buyer protection" }, sub: { es: "Escrow hasta confirmar", en: "Escrow until confirmed" } }, { icon: "✓", title: { es: "Vendedores verificados", en: "Verified sellers" }, sub: { es: "INE / teléfono", en: "ID / phone verified" } }, { icon: "⚡", title: { es: "Publicar en 30s", en: "List in 30s" }, sub: { es: "IA detecta tu artículo", en: "AI detects your item" } }].map((item,i) => <div key={i}><div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div><div style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 4 }}>{item.title[lang]}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{item.sub[lang]}</div></div>)}
          </div>
        </div>
      </div>
      <div style={{ height: 40 }} />
      {showSell && <SellModal lang={lang} t={t} onClose={() => setShowSell(false)} onPublish={handlePublish} />}
      {selectedListing && <ListingDetail listing={selectedListing} lang={lang} currency={currency} t={t} onClose={() => setSelectedListing(null)} />}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <Header />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 14, color: "var(--mid)" }}><span style={{ fontWeight: 700, color: "var(--charcoal)", fontSize: 18 }}>{filteredListings.length}</span> {t.results}{query && <span style={{ color: "var(--emerald)", fontWeight: 600 }}> "{query}"</span>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" style={{ fontSize: 13, padding: "8px 16px" }} onClick={() => setShowFilters(true)}>⊞ {t.filters}{activeFilters.length > 0 && <span style={{ background: "var(--emerald)", color: "white", borderRadius: "50%", padding: "1px 6px", fontSize: 11, marginLeft: 6, fontWeight: 700 }}>{activeFilters.length}</span>}</button>
            <select value={sort} onChange={e => setSort(e.target.value)} style={{ padding: "8px 14px", border: "1.5px solid var(--border)", borderRadius: 10, fontSize: 13, background: "white", color: "var(--charcoal)", cursor: "pointer", outline: "none", fontFamily: "DM Sans, sans-serif" }}><option value="relevance">{t.relevance}</option><option value="newest">{t.newest}</option><option value="priceLow">{t.priceLow}</option><option value="priceHigh">{t.priceHigh}</option></select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12, marginBottom: 8 }}>{CATEGORIES.map(cat => <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`chip ${activeCategory===cat.id?"chip-active":"chip-inactive"}`}>{cat.icon} {cat.label[lang]}</button>)}</div>
        {activeFilters.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>{activeFilters.map(f => <span key={f} className="filter-pill">{f} <span onClick={() => setActiveFilters(prev => prev.filter(x => x!==f))} style={{ marginLeft: 4, cursor: "pointer" }}>✕</span></span>)}</div>}
        {filteredListings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 20px" }}><div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div><div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{lang==="es"?"Sin resultados":"No results found"}</div><div style={{ fontSize: 14, color: "var(--mid)" }}>{lang==="es"?"Intenta con otro término":"Try a different search term"}</div></div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>{filteredListings.map((listing,i) => <div key={listing.id} className={`fade-up-delay-${Math.min(i+1,6)}`}><ListingCard listing={listing} lang={lang} currency={currency} onClick={() => setSelectedListing(listing)} /></div>)}</div>
        )}
      </div>
      {showFilters && <FiltersPanel lang={lang} t={t} onClose={() => setShowFilters(false)} onApply={() => setActiveFilters([lang==="es"?"CDMX":"Mexico City","< $30,000"])} />}
      {showSell && <SellModal lang={lang} t={t} onClose={() => setShowSell(false)} onPublish={handlePublish} />}
      {selectedListing && <ListingDetail listing={selectedListing} lang={lang} currency={currency} t={t} onClose={() => setSelectedListing(null)} />}
      <button className="btn-gold" onClick={() => setShowSell(true)} style={{ position: "fixed", bottom: 24, right: 24, borderRadius: 999, padding: "14px 22px", boxShadow: "0 4px 20px rgba(212,160,23,0.4)", fontSize: 15, zIndex: 40 }}>+ {t.sell}</button>
    </div>
  );
    }
