import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { 
  ClerkProvider, 
  UserButton, 
  useAuth,
  useClerk,
  useUser,
  RedirectToSignIn
} from '@clerk/react';
import axios from 'axios';
import './App.css';


const queryClient = new QueryClient();
const API_URL = "http://localhost:5000/api";

// --- HELPER FUNCTIONS ---

function formatDate(value) {
  if (!value) return '-';
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? '-' : parsedDate.toLocaleString();
}

// --- AUTH GUARD COMPONENT ---
const ProtectedRoute = ({ children }) => {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClientInstance = useQueryClient(); 
  
  useEffect(() => {
    if (!isSignedIn) {
      queryClientInstance.clear(); 
    }
  }, [isSignedIn, queryClientInstance]);

  if (!isLoaded) {
    return <div className="app" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  return children;
};

// --- SIMPLE LANDING PAGE (Public) ---
function LandingPageSimple() {
  const { openSignIn, openSignUp } = useClerk();
  
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f5f7fa' }}>
      <h1>Easy Kiosk</h1>
      <p>Inventory Management System</p>
      <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
        <button onClick={() => openSignIn()} className="btn btn-primary">Sign In</button>
        <button onClick={() => openSignUp()} className="btn">Sign Up</button>
      </div>
    </div>
  );
}

// --- ADMIN PANEL COMPONENT ---
function AdminUsersPanel({ onClose }) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionId, setActionId] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const { getToken } = useAuth(); 

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError('');

    try {
      const token = await getToken();
      const response = await axios.get(`${API_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data);
    } catch (err) {
      console.error(err);
      if (err.response?.status === 403) {
        setError('You do not have permission to view this page.');
      } else {
        setError('Failed to load users. Please try again later.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const openUserDetails = async (user) => {
    setSelectedUser(user);
    setDetailsLoading(true);

    try {
      const token = await getToken();
      const response = await axios.get(`${API_URL}/admin/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` } 
      }); 
      setSelectedUser(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const updateUserStatus = async (user, action) => {
    const confirmationMessage = action === 'delete'
      ? `Delete ${user.name || user.email || 'this user'}?`
      : `${action === 'deactivate' ? 'Deactivate' : 'Reactivate'} ${user.name || user.email || 'this user'}?`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    setActionId(user.id);

    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      if (action === 'delete') {
        await axios.delete(`${API_URL}/admin/users/${user.id}`, { headers: headers });
      } else {
        await axios.patch(`${API_URL}/admin/users/${user.id}/${action}`, {}, { headers: headers });
      }

      await fetchUsers();
    } catch (requestError) {
      setError(requestError.response?.data?.error || `Unable to ${action} the selected user.`);
    } finally {
      setActionId(null);
    }
  };

  const filteredUsers = users.filter((user) => {
    const searchableText = `${user.name || ''} ${user.email || ''} ${user.phone || ''}`.toLowerCase();
    const matchesSearch = searchableText.includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' ? true : String(user.status || 'active').toLowerCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalUsers = users.length;
  const activeUsers = users.filter((user) => String(user.status || 'active').toLowerCase() === 'active').length;
  const deactivatedUsers = users.filter((user) => String(user.status || '').toLowerCase() === 'inactive').length;

  return (
    <div>
      <div className="metrics admin-metrics">
        <div className="metric success">
          <div className="metric-label">Total users</div>
          <div className="metric-value">{totalUsers}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Active</div>
          <div className="metric-value">{activeUsers}</div>
        </div>
        <div className="metric alert">
          <div className="metric-label">Inactive</div>
          <div className="metric-value">{deactivatedUsers}</div>
        </div>
      </div>

      {error && <div className="alert-banner admin-alert">{error}</div>}

      <div className="card">
        <div className="search-bar admin-search-bar">
          <input
            placeholder="Search users by name, email, or phone..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button className="btn" onClick={fetchUsers}>Refresh</button>
        </div>

        {isLoading ? (
          <div className="empty">Loading users...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty">No users match the current filters.</div>
        ) : (
          <table className="table admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const status = String(user.status || 'active').toLowerCase();
                const canReactivate = status === 'inactive';

                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name || user.fullName || 'Unnamed user'}</strong>
                      <br />
                      <small>{user.phone || user.username || user.id}</small>
                    </td>
                    <td>{user.email || '-'}</td>
                    <td>{user.role || 'User'}</td>
                    <td>
                      <span className={`badge ${status === 'active' ? 'badge-success' : 'badge-gray'}`}>
                        {status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDate(user.lastLoginAt || user.updatedAt || user.createdAt)}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button className="btn btn-sm" onClick={() => openUserDetails(user)}>View</button>
                        <button
                          className="btn btn-sm"
                          disabled={actionId === user.id}
                          onClick={() => updateUserStatus(user, canReactivate ? 'reactivate' : 'deactivate')}
                        >
                          {actionId === user.id ? 'Working...' : canReactivate ? 'Reactivate' : 'Deactivate'}
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={actionId === user.id}
                          onClick={() => updateUserStatus(user, 'delete')}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedUser && (
        <div className="modal-bg" onClick={() => setSelectedUser(null)}>
          <div className="modal admin-detail-modal" onClick={(event) => event.stopPropagation()}>
            <h3>User details</h3>
            <div className="detail-modal-body">
              {detailsLoading ? (
                <div className="empty">Loading details...</div>
              ) : (
                <div className="details-grid">
                  <div><span className="detail-label">Name</span><strong>{selectedUser.name || selectedUser.fullName || 'Unnamed user'}</strong></div>
                  <div><span className="detail-label">Email</span><strong>{selectedUser.email || '-'}</strong></div>
                  <div><span className="detail-label">Phone</span><strong>{selectedUser.phone || '-'}</strong></div>
                  <div><span className="detail-label">Role</span><strong>{selectedUser.role || 'User'}</strong></div>
                  <div><span className="detail-label">Status</span><strong>{selectedUser.status || 'active'}</strong></div>
                  <div><span className="detail-label">Created</span><strong>{formatDate(selectedUser.createdAt)}</strong></div>
                  <div><span className="detail-label">Last login</span><strong>{formatDate(selectedUser.lastLoginAt)}</strong></div>
                  <div><span className="detail-label">User ID</span><strong>{selectedUser.id}</strong></div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setSelectedUser(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// --- MAIN APP CONTENT (Protected) ---
function AppContent() {
  const [activePage, setActivePage] = useState('dashboard');
  const [showAdmin, setShowAdmin] = useState(false);
  const { getToken } = useAuth();

  const handleAdminClick = async () => {
    try {
      const token = await getToken();
      // Try to fetch admin users. If fails, user isn't admin.
      await axios.get(`${API_URL}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
      setShowAdmin(true);
    } catch (err) { 
      alert('You do not have admin privileges.');
    }
  };

  return (
    <div className="app">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      <div className="main">
        <div className="topbar">
          <div className="topbar-title">{activePage.charAt(0).toUpperCase() + activePage.slice(1)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Add Admin Button */}
            <button className="btn btn-sm" onClick={handleAdminClick}>Admin Panel</button>
            
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
        
        <div className="content">
          {showAdmin ? (
             <AdminUsersPanel onClose={() => setShowAdmin(false)} /> 
          ) : (
            <>
              {activePage === 'dashboard' && <Dashboard />}
              {activePage === 'reports' && <Reports />}
              {activePage === 'products' && <Products />}
              {activePage === 'stock' && <StockMoves />}
              {activePage === 'sales' && <Sales />}
              {activePage === 'categories' && <Categories />}
              {activePage === 'suppliers' && <Suppliers />}
              {activePage === 'alerts' && <Alerts />}
            </>
          )}
        </div>
      </div>
    </div>
  );
} 


// --- SIDEBAR ---
function Sidebar({ activePage, setActivePage }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'reports', label: 'Reports' },
    { id: 'products', label: 'Products' },
    { id: 'stock', label: 'Stock Movements' },
    { id: 'sales', label: 'Sales' },
    { id: 'categories', label: 'Categories' },
    { id: 'suppliers', label: 'Suppliers' },
    { id: 'alerts', label: 'Low Stock Alerts' },
  ];

  return (
    <div className="sidebar">
      <div className="logo">
        <img className="logo-image" src="/est.png" alt="EasyKiosk" />
        <span className="logo-text">EasyKiosk</span>
      </div>
      <nav>
        {menuItems.map(item => (
          <div
            key={item.id}
            className={`nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => {
              setActivePage(item.id);
              // Optional: Close admin panel when navigating elsewhere
              // You might want to lift showAdmin state up if you want nav clicks to close it
            }}
          >
            {item.label}
          </div>
        ))}
      </nav>
    </div>
  );
}

// --- DASHBOARD ---
function Dashboard() {
  const [stats, setStats] = useState({ revenue: 0, profit: 0, stockValue: 0, lowStockCount: 0 });
  const [recentSales, setRecentSales] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const { getToken } = useAuth();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [productsRes, salesRes] = await Promise.all([
        axios.get(`${API_URL}/products`, { headers }),
        axios.get(`${API_URL}/sales`, { headers })
      ]);

      const products = productsRes.data;
      const sales = salesRes.data;

      const revenue = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);
      
      const profit = sales.reduce((sum, s) => {
        const p = products.find(x => x.id === s.productId);
        return sum + (p ? (Number(s.price) - Number(p.cost)) * Number(s.qty) : 0);
      }, 0);

      const stockValue = products.reduce((sum, p) => sum + Number(p.stock) * Number(p.cost || 0), 0);
      
      const lowStock = products.filter(p => Number(p.stock) <= Number(p.threshold));

      setStats({
        revenue,
        profit,
        stockValue: Math.round(stockValue),
        lowStockCount: lowStock.length
      });
      
      setRecentSales(sales.slice(0, 5));
      setLowStockItems(lowStock);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    }
  };

  return (
    <div className="dashboard dashboard-page">
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
                <tr key={s.id}>
                  <td>{s.productName || 'Unknown'}</td>
                  <td>{s.qty}</td>
                  <td>KES {Number(s.total).toLocaleString()}</td>
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
                <tr key={p.id}>
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

// --- REPORTS ---
function Reports() {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const { getToken } = useAuth();

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setError('');

    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [productsRes, salesRes] = await Promise.all([
        axios.get(`${API_URL}/products`, { headers }),
        axios.get(`${API_URL}/sales`, { headers }),
      ]);

      setProducts(Array.isArray(productsRes.data) ? productsRes.data : []);
      setSales(Array.isArray(salesRes.data) ? salesRes.data : []);
    } catch (requestError) {
      console.error('Reports fetch error:', requestError);
      setError(requestError.response?.data?.error || 'Unable to load reports right now.');
      setProducts([]);
      setSales([]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- DOWNLOAD CSV FUNCTION ---
  const downloadReportCSV = () => {
    if (!sales.length) return;

    // Define CSV headers
    const headers = ['Date', 'Product Name', 'Customer', 'Quantity', 'Price per Unit', 'Total'];
    
    // Convert sales data to CSV rows
    const csvRows = sales.map(sale => {
      const product = products.find(p => p.id === sale.productId);
      const productName = product ? product.name : (sale.productName || 'Unknown');
      
      // Escape commas and quotes in strings to prevent CSV breaking
      const escapeCell = (val) => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      return [
        new Date(sale.date).toLocaleDateString(),
        escapeCell(productName),
        escapeCell(sale.customer || ''),
        sale.qty,
        sale.price,
        sale.total
      ].join(',');
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    
    // Create blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `easykiosk_sales_report_${new Date().toISOString().split('T')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const revenue = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const costOfGoods = sales.reduce((sum, sale) => {
    const product = products.find((item) => item.id === sale.productId);
    return sum + (product ? Number(product.cost || 0) * Number(sale.qty || 0) : 0);
  }, 0);
  const grossProfit = revenue - costOfGoods;
  const lowStockItems = products.filter((product) => Number(product.stock || 0) <= Number(product.threshold || 0));

  const topProducts = sales.reduce((summary, sale) => {
    const product = products.find((item) => item.id === sale.productId);
    const name = product ? product.name : sale.productName || 'Unknown';
    const current = summary.get(name) || { name, qty: 0, total: 0 };

    current.qty += Number(sale.qty || 0);
    current.total += Number(sale.total || 0);
    summary.set(name, current);
    return summary;
  }, new Map());

  const rankedProducts = Array.from(topProducts.values())
    .sort((left, right) => right.total - left.total)
    .slice(0, 5);

  return (
    <div className="reports-page">
      {error && <div className="alert-banner admin-alert">{error}</div>}

      {/* ADD DOWNLOAD BUTTON HERE */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2>Sales Reports</h2>
        <button 
          className="btn btn-primary" 
          onClick={downloadReportCSV} 
          disabled={!sales.length}
          title="Download Sales Data as CSV"
        >
           Download Report
        </button>
      </div>

      <div className="metrics admin-metrics">
        <div className="metric success">
          <div className="metric-label">Revenue</div>
          <div className="metric-value">KES {revenue.toLocaleString()}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Gross Profit</div>
          <div className="metric-value">KES {grossProfit.toLocaleString()}</div>
        </div>
        <div className="metric alert">
          <div className="metric-label">Low Stock Items</div>
          <div className="metric-value">{lowStockItems.length}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="empty">Loading reports...</div>
      ) : (
        <div className="dashboard-grid">
          <div className="card">
            <h3>Top Selling Products</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty Sold</th>
                  <th>Sales Value</th>
                </tr>
              </thead>
              <tbody>
                {rankedProducts.length === 0 ? (
                  <tr>
                    <td colSpan="3">No sales data available yet.</td>
                  </tr>
                ) : (
                  rankedProducts.map((item) => (
                    <tr key={item.name}>
                      <td><strong>{item.name}</strong></td>
                      <td>{item.qty}</td>
                      <td>KES {item.total.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>Low Stock Alert</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Current Stock</th>
                  <th>Threshold</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.length === 0 ? (
                   <tr><td colSpan="3">All items well stocked!</td></tr>
                ) : (
                  lowStockItems.map((product) => (
                    <tr key={product.id}>
                      <td><strong>{product.name}</strong></td>
                      <td style={{ color: '#E24B4A', fontWeight: 'bold' }}>{product.stock}</td>
                      <td>{product.threshold}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


// --- PRODUCTS ---
function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const { getToken } = useAuth();
  const [formData, setFormData] = useState({
    name: '', catId: '', supplierId: '', price: 0, stock: 0, threshold: 10, unit: 'pcs'
  });

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setError('');

    try {
      const token = await getToken();

      const [pRes, cRes, sRes] = await Promise.all([
        axios.get(`${API_URL}/products`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/categories`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/suppliers`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      setProducts(pRes.data);
      setSuppliers(sRes.data);
      setCategories(cRes.data);
    } catch (requestError) {
      console.error('Products fetch error:', requestError);
      setError(requestError.response?.data?.error || 'Unable to load products.');
      setProducts([]);
      setSuppliers([]);
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  }; 

  const handleDelete = async (id) => {
    if (window.confirm('Delete this product?')) {
      try {
        const token = await getToken();
        await axios.delete(`${API_URL}/products/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        await fetchData();
      } catch (requestError) {
        alert(requestError.response?.data?.error || 'Unable to delete this product.');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      catId: parseInt(formData.catId),
      supplierId: parseInt(formData.supplierId),
      price: parseFloat(formData.price),
      stock: parseInt(formData.stock),
      threshold: parseInt(formData.threshold)
    };

    const token = await getToken();
    const config = { headers: { Authorization: `Bearer ${token}` } };

    try {
      if (editingId) {
        await axios.put(`${API_URL}/products/${editingId}`, payload, config);
      } else {
        await axios.post(`${API_URL}/products`, payload, config);
      }
      setShowModal(false);
      setEditingId(null);
      setFormData({ name: '',  catId: '', supplierId: '', price: 0, stock: 0, threshold: 10, unit: 'pcs' });
      await fetchData();
    } catch (requestError) {
      alert(requestError.response?.data?.error || 'Unable to save product.');
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase());
    const matchesCat = filterCat ? p.catId === parseInt(filterCat) : true;
    return matchesSearch && matchesCat;
  });

  return (
    <div>
      <div className="topbar-actions">
        <button className="btn btn-primary" onClick={() => { setEditingId(null); setShowModal(true); }}>+ Add Product</button>
      </div>
      <div className="card">
        {error && <div className="alert-banner admin-alert">{error}</div>}
        <div className="search-bar">
          <input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {isLoading ? (
          <div className="empty">Loading products...</div>
        ) : (
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
        )}
      </div>

      {showModal && (
        <div className="modal-bg" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editingId ? 'Edit Product' : 'Add Product'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <select value={formData.catId} onChange={e => setFormData({ ...formData, catId: e.target.value })}>
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Supplier</label>
                  <select value={formData.supplierId} onChange={e => setFormData({ ...formData, supplierId: e.target.value })}>
                    <option value="">Select Supplier</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Price (KES)</label>
                  <input type="number" value={formData.price} onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Stock</label>
                  <input type="number" value={formData.stock} onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label>Threshold</label>
                  <input type="number" value={formData.threshold} onChange={e => setFormData({ ...formData, threshold: parseInt(e.target.value) })} />
                </div>
              </div>

              <div className="form-group">
                <label>Unit</label>
                <select value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })}>
                  <option>pcs</option><option>kg</option><option>litre</option><option>pack</option><option>box</option>
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

// --- SALES ---
function Sales() {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [saleData, setSaleData] = useState({ productId: '', qty: 1, customer: 'Walk-in' });
  const { getToken } = useAuth();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      
      const [sRes, pRes] = await Promise.all([
        axios.get(`${API_URL}/sales`, { headers }),
        axios.get(`${API_URL}/products`, { headers })
      ]);
      setSales(sRes.data);
      setProducts(pRes.data);
    } catch (err) {
      console.error("Sales fetch error:", err);
    }
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
      const token = await getToken();
      await axios.post(`${API_URL}/sales`, payload, { headers: { Authorization: `Bearer ${token}` } });
      setShowModal(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Error recording sale');
    }
  };

  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);

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
                <td><strong>KES {Number(s.total).toLocaleString()}</strong></td>
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
                <select required value={saleData.productId} onChange={e => setSaleData({...saleData, productId: e.target.value})}>
                  <option value="">Select Product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} (KES {p.price})</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" min="1" required value={saleData.qty} onChange={e => setSaleData({...saleData, qty: parseInt(e.target.value)})} />
                </div>
                <div className="form-group">
                  <label>Customer</label>
                  <input value={saleData.customer} onChange={e => setSaleData({...saleData, customer: e.target.value})} />
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

// --- STOCK MOVES ---
function StockMoves() {
  const [moves, setMoves] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [moveData, setMoveData] = useState({ productId: '', type: 'in', qty: 0, note: '' });
  const { getToken } = useAuth();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      
      const [mRes, pRes] = await Promise.all([
        axios.get(`${API_URL}/stock-moves`, { headers }),
        axios.get(`${API_URL}/products`, { headers })
      ]);
      setMoves(mRes.data);
      setProducts(pRes.data);
    } catch (err) {
      console.error("Stock moves fetch error:", err);
    }
  };

  const handleMove = async (e) => {
    e.preventDefault();
    try {
      const token = await getToken();
      await axios.post(`${API_URL}/stock-moves`, moveData, { headers: { Authorization: `Bearer ${token}` } });
      setShowModal(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Error recording movement');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this stock movement?")) return;
    try {
      const token = await getToken();
      await axios.delete(`${API_URL}/stock-moves/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "Failed to delete stock movement");
    }
  };

  return (
    <div>
      <div className="topbar-actions">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Record Movement</button>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Note</th><th>Actions</th></tr></thead>
          <tbody>
            {moves.map(m => (
              <tr key={m.id}>
                <td>{new Date(m.date).toLocaleDateString()}</td>
                <td>{m.productName || "-"}</td>
                <td>
                  <span className={`badge ${m.type === "in" ? "badge-success" : "badge-danger"}`}>
                    {m.type === "in" ? "Stock In" : "Stock Out"}
                  </span>
                </td>
                <td>{m.qty}</td>
                <td>{m.note}</td>
                <td>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(m.id)}>Delete</button>
                </td>
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
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} (Current: {p.stock})</option>)}
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

// --- CATEGORIES ---
function Categories() {
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const { getToken } = useAuth();
  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setError('');

    try {
      const token = await getToken();
      const res = await axios.get(`${API_URL}/categories`, { headers: { Authorization: `Bearer ${token}` } });
      setCategories(res.data);
    } catch (requestError) {
      console.error('Categories fetch error:', requestError);
      setCategories([]);
      setError(requestError.response?.data?.error || 'Unable to load categories.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this category?')) {
      try {
        const token = await getToken();
        await axios.delete(`${API_URL}/categories/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        await fetchData();
      } catch (requestError) {
        alert(requestError.response?.data?.error || 'Unable to delete this category.');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = await getToken();
      if (editingId) {
        await axios.put(`${API_URL}/categories/${editingId}`, formData, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post(`${API_URL}/categories`, formData, { headers: { Authorization: `Bearer ${token}` } });
      }
      setShowModal(false);
      setEditingId(null);
      setFormData({ name: "", description: "" });
      await fetchData();
    } catch (requestError) {
      alert(requestError.response?.data?.error || 'Unable to save this category.');
    }
  };

  return (
    <div>
      <div className="topbar-actions">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Add Category</button>
      </div>
      <div className="card">
        {error && <div className="alert-banner admin-alert">{error}</div>}
        {isLoading ? (
          <div className="empty">Loading categories...</div>
        ) : (
          <table className="table">
            <thead><tr><th>Name</th><th>Description</th><th>Actions</th></tr></thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.description}</td>
                  <td>
                    <button className="btn btn-sm" onClick={() => { setEditingId(c.id); setFormData(c); setShowModal(true); }}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.id)}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
                <input value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
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

// --- SUPPLIERS ---
function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', contact: '', phone: '', email: '', addr: '' });
  const { getToken } = useAuth();
  
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = await getToken();
      const res = await axios.get(`${API_URL}/suppliers`, { headers: { Authorization: `Bearer ${token}` } });
      setSuppliers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Delete this supplier?')) {
      try {
        const token = await getToken();
        await axios.delete(`${API_URL}/suppliers/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        fetchData();
      } catch (err) {
        alert(err.response?.data?.error || 'Error deleting supplier');
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = await getToken();
    try {
      if (editingId) {
        await axios.put(`${API_URL}/suppliers/${editingId}`, formData, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post(`${API_URL}/suppliers`, formData, { headers: { Authorization: `Bearer ${token}` } });
      }
      fetchData();
      setShowModal(false);
      setEditingId(null);
      setFormData({ name: '', contact: '', phone: '', email: '', addr: '' });
    } catch (err) {
      alert(err.response?.data?.error || 'Error saving supplier');
    }
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
              <tr key={s.id}>
                <td><strong>{s.name}</strong><br/><small>{s.addr}</small></td>
                <td>{s.contact}</td>
                <td>{s.phone}</td>
                <td>{s.email}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => { setEditingId(s.id); setFormData(s); setShowModal(true); }}>Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.id)}>Del</button>
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

// --- ALERTS ---
function Alerts() {
  const [lowStockItems, setLowStockItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const { getToken } = useAuth();

  useEffect(() => {
    void fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setError('');

    try {
      const token = await getToken();
      const res = await axios.get(`${API_URL}/products`, { headers: { Authorization: `Bearer ${token}` } });
      const low = res.data.filter(p => p.stock <= p.threshold);
      setLowStockItems(low);
    } catch (requestError) {
      console.error('Alerts fetch error:', requestError);
      setLowStockItems([]);
      setError(requestError.response?.data?.error || 'Unable to load low stock alerts.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h2>Low Stock Alerts</h2>
      {error && <div className="alert-banner admin-alert">{error}</div>}
      {isLoading ? (
        <div className="empty">Loading low stock alerts...</div>
      ) : lowStockItems.length === 0 ? (
        <div className="empty">All products are well-stocked!</div>
      ) : (
        <div className="card">
          <table className="table">
            <thead><tr><th>Product</th><th>Stock</th><th>Threshold</th><th>Deficit</th></tr></thead>
            <tbody>
              {lowStockItems.map(p => (
                <tr key={p.id}>
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
function AppShell() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <div className="app loading-screen">Loading...</div>;
  }

  if (!isSignedIn) {
    return <LandingPageSimple />;
  }

  return (
    <ProtectedRoute>
      <AppContent />
    </ProtectedRoute>
  );
}

function App() {
  return (
    <ClerkProvider publishableKey="pk_test_ZGVmaW5pdGUtbWFrby0yMi5jbGVyay5hY2NvdW50cy5kZXYk">
      <QueryClientProvider client={queryClient}>
        <AppShell />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
