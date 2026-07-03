import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { 
  ClerkProvider, 
  SignInButton, 
  SignUpButton, 
  UserButton, 
  useAuth,
  RedirectToSignIn,
  Show
} from '@clerk/react';
import axios from 'axios';
import './App.css';


const queryClient = new QueryClient();

const PUBLISHABLE_KEY = "pk_test_ZGVmaW5pdGUtbWFrby0yMi5jbGVyay5hY2NvdW50cy5kZXYk"; 

const API_URL = "http://localhost:5000/api";


// --- AUTH GUARD COMPONENT ---
// This wraps the main app content. If the user isn't signed in, it redirects to sign-in.
const ProtectedRoute = ({ children }) => {
  const { isLoaded, isSignedIn } = useAuth();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const queryClient = useQueryClient(); 

  useEffect(() => {
    if (!isSignedIn) {
      queryClient.clear(); // React Query
      setProducts([]);
      setSales([]);
    }
  }, [isSignedIn]);

  if (!isLoaded) {
    return <div className="app" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (!isSignedIn) {
    // Redirect to Clerk's hosted sign-in page
    return <RedirectToSignIn />;
  }

  return children;

  
};

// --- LANDING PAGE (Public) ---
function LandingPage() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  // If they are already signed in, send them straight to the app
  if (isSignedIn) {
    return <Navigate to="/" replace />;
  }

 

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f5f7fa' }}>
      <h1>Easy Kiosk</h1>
      <p>Inventory Management System</p>
      <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
        <SignInButton mode="modal">
          <button className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '16px' }}>Sign In</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="btn" style={{ padding: '10px 20px', border: '1px solid #ccc', fontSize: '16px' }}>Sign Up</button>
        </SignUpButton>
      </div>
    </div>
  );
}

// --- MAIN APP CONTENT (Protected) ---
function AppContent() {
  const [activePage, setActivePage] = useState('dashboard');
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);

  useEffect(() => {
  if (!isSignedIn) {
    queryClient.clear();
    localStorage.clear();
    sessionStorage.clear();

    // Reset any React state here as well
    setProducts([]);
    setSales([]);
    
  }
}, [isSignedIn]);

  return (
    <div className="app">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      <div className="main">
        <div className="topbar">
          <div className="topbar-title">{activePage.charAt(0).toUpperCase() + activePage.slice(1)}</div>
          
          {/* Auth Controls in Top Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
        
        <div className="content">
          {activePage === 'dashboard' && <Dashboard />}
          {activePage === 'products' && <Products />}
          {activePage === 'stock' && <StockMoves />}
          {activePage === 'sales' && <Sales />}
          {activePage === 'categories' && <Categories />}
          {activePage === 'suppliers' && <Suppliers />}
          {activePage === 'alerts' && <Alerts />}
        </div>
      </div>
    </div>
  );
}

// --- EXISTING COMPONENTS (Unchanged Logic) ---

function Sidebar({ activePage, setActivePage }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'products', label: 'Products', icon: '📦' },
    { id: 'stock', label: 'Stock Movements', icon: '🔄' },
    { id: 'sales', label: 'Sales', icon: '🧾' },
    { id: 'categories', label: 'Categories', icon: '🏷️' },
    { id: 'suppliers', label: 'Suppliers', icon: '🚚' },
    { id: 'alerts', label: 'Low Stock Alerts', icon: '🔔' },
  ];

  return (
    <div className="sidebar">
      <div className="logo">Easy<span>Kiosk</span></div>
      <nav>
        {menuItems.map(item => (
          <div
            key={item.id}
            className={`nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => setActivePage(item.id)}
          >
            <span>{item.icon}</span> {item.label}
          </div>
        ))}
      </nav>
    </div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState({ revenue: 0, profit: 0, stockValue: 0, lowStockCount: 0 });
  const [recentSales, setRecentSales] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, salesRes] = await Promise.all([
        axios.get(`${API_URL}/products`),
        axios.get(`${API_URL}/sales`)
      ]);

      const products = productsRes.data;
      const sales = salesRes.data;

      const revenue = sales.reduce((sum, s) => sum + s.total, 0);
      const profit = sales.reduce((sum, s) => {
        const p = products.find(x => x._id === s.productId);
        return sum + (p ? (s.price - p.cost) * s.qty : 0);
      }, 0);
      const stockValue = products.reduce((sum, p) => sum + p.stock * p.cost, 0);
      const lowStock = products.filter(p => p.stock <= p.threshold);

      setStats({
        revenue,
        profit,
        stockValue: Math.round(stockValue),
        lowStockCount: lowStock.length
      });
      setRecentSales(sales.slice(0, 5));
      setLowStockItems(lowStock);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="dashboard">
      {stats.lowStockCount > 0 && (
        <div className="alert-banner">
          ⚠️ {stats.lowStockCount} product(s) running low on stock
        </div>
      )}
      <div className="metrics">
        <div className="metric success">
          <div className="metric-label">Total Revenue</div>
          <div className="metric-value">KES {stats.revenue.toLocaleString()}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Gross Profit</div>
          <div className="metric-value">KES {stats.profit.toLocaleString()}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Stock Value</div>
          <div className="metric-value">KES {stats.stockValue.toLocaleString()}</div>
        </div>
        <div className="metric alert">
          <div className="metric-label">Low Stock</div>
          <div className="metric-value">{stats.lowStockCount}</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Recent Sales</h3>
          <table className="table">
            <thead><tr><th>Product</th><th>Qty</th><th>Total</th><th>Date</th></tr></thead>
            <tbody>
              {recentSales.map(s => (
                <tr key={s._id}>
                  <td>{s.productId?.name || 'Unknown'}</td>
                  <td>{s.qty}</td>
                  <td>KES {s.total.toLocaleString()}</td>
                  <td>{new Date(s.date).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Low Stock Items</h3>
          <table className="table">
            <thead><tr><th>Product</th><th>Stock</th><th>Threshold</th></tr></thead>
            <tbody>
              {lowStockItems.map(p => (
                <tr key={p._id}>
                  <td>{p.name}</td>
                  <td style={{ color: '#E24B4A', fontWeight: 'bold' }}>{p.stock}</td>
                  <td>{p.threshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '', sku: '', catId: '', supplierId: '', price: 0, cost: 0, stock: 0, threshold: 10, unit: 'pcs'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [pRes, cRes, sRes] = await Promise.all([
      axios.get(`${API_URL}/products`),
      axios.get(`${API_URL}/categories`),
      axios.get(`${API_URL}/suppliers`)
    ]);
    setProducts(pRes.data);
    setCategories(cRes.data);
    setSuppliers(sRes.data);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this product?')) {
      await axios.delete(`${API_URL}/products/${id}`);
      fetchData();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      catId: parseInt(formData.catId),
      supplierId: parseInt(formData.supplierId),
      price: parseFloat(formData.price),
      cost: parseFloat(formData.cost),
      stock: parseInt(formData.stock),
      threshold: parseInt(formData.threshold)
    };

    if (editingId) {
      await axios.put(`${API_URL}/products/${editingId}`, payload);
    } else {
      await axios.post(`${API_URL}/products`, payload);
    }
    setShowModal(false);
    setEditingId(null);
    setFormData({ name: '', sku: '', catId: '', supplierId: '', price: 0, cost: 0, stock: 0, threshold: 10, unit: 'pcs' });
    fetchData();
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const matchesCat = filterCat ? p.catId === parseInt(filterCat) : true;
    return matchesSearch && matchesCat;
  });

  return (
    <div>
      <div className="topbar-actions">
        <button className="btn btn-primary" onClick={() => { setEditingId(null); setShowModal(true); }}>+ Add Product</button>
      </div>
      <div className="card">
        <div className="search-bar">
          <input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Product</th><th>SKU</th><th>Category</th><th>Supplier</th><th>Stock</th><th>Price</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(p => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong></td>
                <td>{p.sku}</td>
                <td>{p.category?.name || '-'}</td>
                <td>{p.supplier?.name || '-'}</td>
                <td>{p.stock} {p.unit}</td>
                <td>KES {p.price}</td>
                <td>
                  <span className={`badge ${p.stock <= p.threshold ? 'badge-danger' : 'badge-success'}`}>
                    {p.stock <= p.threshold ? 'Low Stock' : 'In Stock'}
                  </span>
                </td>
                <td>
                  <button className="btn btn-sm" onClick={() => { setEditingId(p.id); setFormData(p); setShowModal(true); }}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
  <div className="modal-bg" onClick={() => setShowModal(false)}>
    <div className="modal" onClick={e => e.stopPropagation()}>
      <h3>{editingId ? 'Edit Product' : 'Add Product'}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>Name</label>
            <input required value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>SKU</label>
            <input value={formData.sku}
              onChange={e => setFormData({ ...formData, sku: e.target.value })} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Category</label>
            <select value={formData.catId}
              onChange={e => setFormData({ ...formData, catId: e.target.value })}>
              <option value="">Select Category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Supplier</label>
            <select value={formData.supplierId}
              onChange={e => setFormData({ ...formData, supplierId: e.target.value })}>
              <option value="">Select Supplier</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Price (KES)</label>
            <input type="number" value={formData.price}
              onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })} />
          </div>
          <div className="form-group">
            <label>Cost (KES)</label>
            <input type="number" value={formData.cost}
              onChange={e => setFormData({ ...formData, cost: parseFloat(e.target.value) })} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Stock</label>
            <input type="number" value={formData.stock}
              onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) })} />
          </div>
          <div className="form-group">
            <label>Threshold</label>
            <input type="number" value={formData.threshold}
              onChange={e => setFormData({ ...formData, threshold: parseInt(e.target.value) })} />
          </div>
        </div>

        <div className="form-group">
          <label>Unit</label>
          <select value={formData.unit}
            onChange={e => setFormData({ ...formData, unit: e.target.value })}>
            <option>pcs</option>
            <option>kg</option>
            <option>litre</option>
            <option>pack</option>
            <option>box</option>
          </select>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
  </div>
)}
    </div>
  );
}


function Sales() {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [saleData, setSaleData] = useState({ productId: '', qty: 1, customer: 'Walk-in' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [sRes, pRes] = await Promise.all([
      axios.get(`${API_URL}/sales`),
      axios.get(`${API_URL}/products`)
    ]);
    setSales(sRes.data);
    setProducts(pRes.data);
  };

  const handleSale = async (e) => {
    e.preventDefault();
    const product = products.find(p => p.id === parseInt(saleData.productId));
    if (!product) return;

    const payload = {
      productId: parseInt(saleData.productId),
      qty: Number(saleData.qty),
      price: product.price,
      customer: saleData.customer
    };

    try {
      await axios.post(`${API_URL}/sales`, payload);
      setShowModal(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Error recording sale');
    }
  };

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);

  return (
    <div>
      <div className="topbar-actions">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Record Sale</button>
      </div>
      <div className="metrics" style={{ marginBottom: '16px' }}>
        <div className="metric success">
          <div className="metric-label">Total Revenue</div>
          <div className="metric-value">KES {totalRevenue.toLocaleString()}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Transactions</div>
          <div className="metric-value">{sales.length}</div>
        </div>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Date</th><th>Product</th><th>Customer</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>
            {sales.map(s => (
              <tr key={s.id}>
                <td>{new Date(s.date).toLocaleDateString()}</td>
                <td>{s.productName || '-'}</td>
                <td>{s.customer}</td>
                <td>{s.qty}</td>
                <td><strong>KES {s.total.toLocaleString()}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-bg" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Record Sale</h3>
            <form onSubmit={handleSale}>
              <div className="form-group">
                <label>Product</label>
                <select required value={saleData.productId}
                  onChange={e => setSaleData({ ...saleData, productId: e.target.value })}>
                  <option value="">Select Product</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (KES {p.price})</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" min="1" required value={saleData.qty}
                    onChange={e => setSaleData({ ...saleData, qty: parseInt(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label>Customer</label>
                  <input value={saleData.customer}
                    onChange={e => setSaleData({ ...saleData, customer: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Record Sale</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


function StockMoves() {
  const [moves, setMoves] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [moveData, setMoveData] = useState({ productId: '', type: 'in', qty: 0, note: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [mRes, pRes] = await Promise.all([axios.get(`${API_URL}/stock-moves`), axios.get(`${API_URL}/products`)]);
    setMoves(mRes.data);
    setProducts(pRes.data);
  };

  const handleMove = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/stock-moves`, moveData);
      setShowModal(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Error recording movement');
    }
  };

  return (
    <div>
      <div className="topbar-actions">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Record Movement</button>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Note</th></tr></thead>
          <tbody>
            {moves.map(m => (
              <tr key={m._id}>
                <td>{new Date(m.date).toLocaleDateString()}</td>
                <td>{m.productId?.name || '-'}</td>
                <td>
                  <span className={`badge ${m.type === 'in' ? 'badge-success' : 'badge-danger'}`}>
                    {m.type === 'in' ? 'Stock In' : 'Stock Out'}
                  </span>
                </td>
                <td>{m.qty}</td>
                <td>{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-bg" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Stock Movement</h3>
            <form onSubmit={handleMove}>
              <div className="form-group">
                <label>Product</label>
                <select required value={moveData.productId} onChange={e => setMoveData({...moveData, productId: e.target.value})}>
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p._id} value={p._id}>{p.name} (Current: {p.stock})</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Type</label>
                  <select value={moveData.type} onChange={e => setMoveData({...moveData, type: e.target.value})}>
                    <option value="in">Stock In</option>
                    <option value="out">Stock Out</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" min="1" required value={moveData.qty} onChange={e => setMoveData({...moveData, qty: parseInt(e.target.value)})} />
                </div>
              </div>
              <div className="form-group">
                <label>Note</label>
                <input value={moveData.note} onChange={e => setMoveData({...moveData, note: e.target.value})} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Record</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Categories() {
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', desc: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const res = await axios.get(`${API_URL}/categories`);
    setCategories(res.data);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this category?')) {
      await axios.delete(`${API_URL}/categories/${id}`);
      fetchData();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await axios.put(`${API_URL}/categories/${editingId}`, formData);
      setEditingId(null);
    } else {
      await axios.post(`${API_URL}/categories`, formData);
    }
    setShowModal(false);
    setFormData({ name: '', desc: '' });
    fetchData();
  };

  return (
    <div>
      <div className="topbar-actions">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Category</button>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Name</th><th>Description</th><th>Actions</th></tr></thead>
          <tbody>
            {categories.map(c => (
              <tr key={c._id}>
                <td><strong>{c.name}</strong></td>
                <td>{c.desc}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => { setEditingId(c._id); setFormData(c); setShowModal(true); }}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c._id)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showModal && (
        <div className="modal-bg" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editingId ? 'Edit Category' : 'Add Category'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name</label>
                <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input value={formData.desc} onChange={e => setFormData({...formData, desc: e.target.value})} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', contact: '', phone: '', email: '', addr: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const res = await axios.get(`${API_URL}/suppliers`);
    setSuppliers(res.data);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this supplier?')) {
      await axios.delete(`${API_URL}/suppliers/${id}`);
      fetchData();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await axios.put(`${API_URL}/suppliers/${editingId}`, formData);
    } else {
      await axios.post(`${API_URL}/suppliers`, formData);
    }
    setShowModal(false);
    setEditingId(null);
    setFormData({ name: '', contact: '', phone: '', email: '', addr: '' });
    fetchData();
  };

  return (
    <div>
      <div className="topbar-actions">
        <button className="btn btn-primary" onClick={() => { setEditingId(null); setShowModal(true); }}>+ Add Supplier</button>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Actions</th></tr></thead>
          <tbody>
            {suppliers.map(s => (
              <tr key={s._id}>
                <td><strong>{s.name}</strong><br/><small>{s.addr}</small></td>
                <td>{s.contact}</td>
                <td>{s.phone}</td>
                <td>{s.email}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => { setEditingId(s._id); setFormData(s); setShowModal(true); }}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s._id)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showModal && (
        <div className="modal-bg" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editingId ? 'Edit Supplier' : 'Add Supplier'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name</label>
                <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Contact Person</label>
                  <input value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label>Email</label>
                <input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input value={formData.addr} onChange={e => setFormData({...formData, addr: e.target.value})} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Alerts() {
  const [products, setProducts] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const res = await axios.get(`${API_URL}/products`);
    const low = res.data.filter(p => p.stock <= p.threshold);
    setProducts(res.data);
    setLowStockItems(low);
  };

  return (
    <div>
      <h2>Low Stock Alerts</h2>
      {lowStockItems.length === 0 ? (
        <div className="empty">All products are well-stocked!</div>
      ) : (
        <div className="card">
          <table className="table">
            <thead><tr><th>Product</th><th>Stock</th><th>Threshold</th><th>Deficit</th></tr></thead>
            <tbody>
              {lowStockItems.map(p => (
                <tr key={p._id}>
                  <td><strong>{p.name}</strong></td>
                  <td style={{ color: '#E24B4A', fontWeight: 'bold' }}>{p.stock}</td>
                  <td>{p.threshold}</td>
                  <td><span className="badge badge-danger">-{p.threshold - p.stock}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- ROOT APP EXPORT ---
function App() {

  return (
    
    <ClerkProvider publishableKey="pk_test_ZGVmaW5pdGUtbWFrby0yMi5jbGVyay5hY2NvdW50cy5kZXYk">
      <QueryClientProvider client={queryClient}>
      <Router>
        {/* Public Route */}
        <div className="route-wrapper">
          {!window.location.pathname.startsWith('/') ? (
            <LandingPage />
          ) : (
            /* Protected Route */
            <ProtectedRoute>
              <AppContent />
            </ProtectedRoute>
          )}
        </div>
      </Router>
      </QueryClientProvider>
    </ClerkProvider>
    
  );
}

export default App;
