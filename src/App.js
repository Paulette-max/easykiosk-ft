import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { 
  ClerkProvider, 
  SignInButton, 
  SignUpButton, 
  UserButton, 
  useAuth,
  useUser,
  RedirectToSignIn
} from '@clerk/react';
import axios from 'axios';
import './App.css';


const queryClient = new QueryClient();

const API_URL = "http://localhost:5000/api";
const ADMIN_SESSION_STORAGE_KEY = 'easykiosk_admin_session';
const ADMIN_API_URL = `${API_URL}/admin`;

function loadAdminSession() {
  try {
    const storedSession = window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    return storedSession ? JSON.parse(storedSession) : null;
  } catch {
    return null;
  }
}

function saveAdminSession(session) {
  window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearAdminSession() {
  window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
}

function buildAdminHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const parsedDate = new Date(value);

  return Number.isNaN(parsedDate.getTime()) ? '-' : parsedDate.toLocaleString();
}

function getUserDisplayName(user) {
  return user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || 'Admin';
}

function isAdministratorUser(user) {
  const roleValue = user?.publicMetadata?.role || user?.unsafeMetadata?.role || user?.publicMetadata?.isAdmin;

  return roleValue === 'admin' || roleValue === true || roleValue === 'true';
}


// --- AUTH GUARD COMPONENT ---
// This wraps the main app content. If the user isn't signed in, it redirects to sign-in.
const ProtectedRoute = ({ children }) => {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient(); 
  
  useEffect(() => {
    if (!isSignedIn) {
      queryClient.clear(); // React Query
    }
  }, [isSignedIn, queryClient]);

  if (!isLoaded) {
    return <div className="app" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (!isSignedIn) {
    // Redirect to Clerk's hosted sign-in page
    return <RedirectToSignIn />;
  }

  return children;

  
};

function ProtectedApp({ onAdminAccess }) {
  const { userId } = useAuth();

  return <AppContent key={userId} onAdminAccess={onAdminAccess} />;
}

function AppShell() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [adminSession, setAdminSession] = useState(() => loadAdminSession());
  const [adminEntryMode, setAdminEntryMode] = useState('none');

  useEffect(() => {
    if (adminSession) {
      saveAdminSession(adminSession);
    } else {
      clearAdminSession();
    }
  }, [adminSession]);

  const handleAdminSignedIn = (session) => {
    setAdminEntryMode('none');
    setAdminSession(session);
  };

  const handleAdminSignOut = () => {
    setAdminEntryMode('none');
    setAdminSession(null);
  };

  const openAdminConsole = async () => {
    if (isAdministratorUser(user)) {
      const token = await getToken();

      setAdminSession({
        token: token || '',
        username: getUserDisplayName(user),
        role: 'admin',
        source: 'clerk'
      });
      setAdminEntryMode('none');
      return;
    }

    setAdminEntryMode('signin');
  };

  if (!isLoaded) {
    return <div className="app loading-screen">Loading...</div>;
  }

  if (adminSession) {
    return (
      <AdminConsole
        session={adminSession}
        onSignOut={handleAdminSignOut}
      />
    );
  }

  if (isSignedIn) {
    if (adminEntryMode === 'signin') {
      return <LandingPage onAdminSignedIn={handleAdminSignedIn} initialEntryMode="admin" />;
    }

    return (
      <ProtectedRoute>
        <ProtectedApp onAdminAccess={openAdminConsole} />
      </ProtectedRoute>
    );
  }

  return <LandingPage onAdminSignedIn={handleAdminSignedIn} initialEntryMode="choose" />;
}

// --- LANDING PAGE (Public) ---
function LandingPage({ onAdminSignedIn, initialEntryMode = 'choose' }) {
  const [entryMode, setEntryMode] = useState(initialEntryMode);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleAdminSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await axios.post(`${ADMIN_API_URL}/login`, credentials);
      const session = {
        token: response.data?.token || response.data?.accessToken || '',
        username: response.data?.username || credentials.username,
        role: 'admin'
      };

      onAdminSignedIn(session);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to sign in as admin. Check the username and password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="entry-screen">
      <div className="entry-card">
        <div className="entry-brand">
          <div className="entry-mark">EasyKiosk</div>
          <h1>Inventory management for the whole kiosk team</h1>
          <p>Choose your access path first, then sign in with the right account type.</p>
        </div>

        {entryMode === 'choose' && (
          <div className="entry-choice-grid">
            <button type="button" className="entry-choice" onClick={() => setEntryMode('user')}>
              <span className="entry-choice-kicker">Staff or customer</span>
              <strong>Regular user login</strong>
              <small>Go to the Clerk sign in and sign up flow.</small>
            </button>
            <button type="button" className="entry-choice entry-choice-admin" onClick={() => setEntryMode('admin')}>
              <span className="entry-choice-kicker">Management</span>
              <strong>Admin access</strong>
              <small>Enter the admin username and password to manage users.</small>
            </button>
          </div>
        )}

        {entryMode === 'user' && (
          <div className="entry-panel">
            <p className="entry-panel-title">Continue as a regular user</p>
            <div className="entry-actions">
              <SignInButton mode="modal">
                <button className="btn btn-primary entry-action-btn">Sign In</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="btn entry-action-btn">Sign Up</button>
              </SignUpButton>
            </div>
            <button type="button" className="entry-back" onClick={() => setEntryMode('choose')}>
              Back
            </button>
          </div>
        )}

        {entryMode === 'admin' && (
          <form className="entry-panel entry-form" onSubmit={handleAdminSubmit}>
            <p className="entry-panel-title">Admin sign in</p>
            <div className="form-group">
              <label className="form-label">Admin username</label>
              <input
                required
                autoComplete="username"
                value={credentials.username}
                onChange={(event) => setCredentials({ ...credentials, username: event.target.value })}
                placeholder="Enter admin username"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Admin password</label>
              <input
                required
                type="password"
                autoComplete="current-password"
                value={credentials.password}
                onChange={(event) => setCredentials({ ...credentials, password: event.target.value })}
                placeholder="Enter admin password"
              />
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="entry-actions">
              <button type="submit" className="btn btn-primary entry-action-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Enter admin console'}
              </button>
            </div>
            <button type="button" className="entry-back" onClick={() => setEntryMode('choose')}>
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function AdminConsole({ session, onSignOut }) {
  return (
    <div className="app admin-app">
      <div className="sidebar admin-sidebar">
        <div className="logo">Easy<span>Kiosk</span></div>
        <div className="admin-badge">Admin console</div>
        <nav>
          <div className="nav-item active">
            <span>👥</span> Users
          </div>
          <div className="nav-item" onClick={onSignOut} role="button" tabIndex={0}>
            <span>↩</span> Sign out
          </div>
        </nav>
      </div>

      <div className="main">
        <div className="topbar">
          <div>
            <div className="topbar-title">Admin users</div>
            <div className="topbar-subtitle">Signed in as {session.username}</div>
          </div>
          <button className="btn" onClick={onSignOut}>Sign out</button>
        </div>

        <div className="content">
          <AdminUsersPanel session={session} />
        </div>
      </div>
    </div>
  );
}

function AdminUsersPanel({ session }) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionId, setActionId] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  const fetchUsers = async () => {
    setError('');
    setIsLoading(true);

    try {
      const response = await axios.get(`${ADMIN_API_URL}/users`, {
        headers: buildAdminHeaders(session.token)
      });

      setUsers(Array.isArray(response.data) ? response.data : response.data?.users || []);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to load admin users. Confirm the admin API is available.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const refreshUsers = async () => {
    setIsRefreshing(true);
    await fetchUsers();
  };

  const openUserDetails = async (user) => {
    setSelectedUser(user);
    setDetailsLoading(true);

    try {
      const response = await axios.get(`${ADMIN_API_URL}/users/${user.id}`, {
        headers: buildAdminHeaders(session.token)
      });

      setSelectedUser(response.data);
    } catch {
      setSelectedUser(user);
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
      if (action === 'delete') {
        await axios.delete(`${ADMIN_API_URL}/users/${user.id}`, {
          headers: buildAdminHeaders(session.token)
        });
      } else {
        await axios.patch(`${ADMIN_API_URL}/users/${user.id}/${action}`, {}, {
          headers: buildAdminHeaders(session.token)
        });
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
          <button className="btn" onClick={refreshUsers} disabled={isRefreshing}>
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
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
                        <button className="btn btn-sm" onClick={() => openUserDetails(user)}>
                          View
                        </button>
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
                  <div>
                    <span className="detail-label">Name</span>
                    <strong>{selectedUser.name || selectedUser.fullName || 'Unnamed user'}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Email</span>
                    <strong>{selectedUser.email || '-'}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Phone</span>
                    <strong>{selectedUser.phone || '-'}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Role</span>
                    <strong>{selectedUser.role || 'User'}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Status</span>
                    <strong>{selectedUser.status || 'active'}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Created</span>
                    <strong>{formatDate(selectedUser.createdAt)}</strong>
                  </div>
                  <div>
                    <span className="detail-label">Last login</span>
                    <strong>{formatDate(selectedUser.lastLoginAt)}</strong>
                  </div>
                  <div>
                    <span className="detail-label">User ID</span>
                    <strong>{selectedUser.id}</strong>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={() => setSelectedUser(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- MAIN APP CONTENT (Protected) ---
function AppContent({ onAdminAccess }) {
  const [activePage, setActivePage] = useState('dashboard');
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  
  
useEffect(() => {
    if (!isSignedIn) {
        queryClient.clear();
    }
}, [isSignedIn, queryClient]);

  return (
    <div className="app">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      <div className="main">
        <div className="topbar">
          <div className="topbar-title">{activePage.charAt(0).toUpperCase() + activePage.slice(1)}</div>
          
          {/* Auth Controls in Top Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button type="button" className="admin-link" onClick={onAdminAccess}>
              Admin
            </button>
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

function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const { getToken } = useAuth();
  const [formData, setFormData] = useState({
    name: '', sku: '', catId: '', supplierId: '', price: 0, cost: 0, stock: 0, threshold: 10, unit: 'pcs'
  });

  useEffect(() => {
    fetchData();
  }, []);


  const fetchData = async () => {
    const token = await getToken();

const [pRes, cRes, sRes] = await Promise.all([
    axios.get(`${API_URL}/products`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    }),
    axios.get(`${API_URL}/categories`, {
    headers: {
        Authorization: `Bearer ${token}`,
    },
}),
    axios.get(`${API_URL}/suppliers`, {
    headers: {
        Authorization: `Bearer ${token}`,
    },
})
]);
    setProducts(pRes.data);
    setSuppliers(sRes.data);
    setCategories(cRes.data);
  }; 

  const handleDelete = async (id) => {
    if (window.confirm('Delete this product?')) {
      const token = await getToken();
      await axios.delete(`${API_URL}/products/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
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

    const token = await getToken();

const config = {
  headers: {
    Authorization: `Bearer ${token}`,
  },
};

if (editingId) {
  await axios.put(
    `${API_URL}/products/${editingId}`,
    payload,
    config
  );
} else {
  await axios.post(
    `${API_URL}/products`,
    payload,
    config
  );
}
    setShowModal(false);
    setEditingId(null);
    setFormData({ name: '', sku: '', catId: '', supplierId: '', price: 0, cost: 0, stock: 0, threshold: 10, unit: 'pcs' });
    fetchData();
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

    await axios.delete(`${API_URL}/stock-moves/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

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
    <span
      className={`badge ${
        m.type === "in" ? "badge-success" : "badge-danger"
      }`}
    >
      {m.type === "in" ? "Stock In" : "Stock Out"}
    </span>
  </td>

  <td>{m.qty}</td>

  <td>{m.note}</td>

  <td>
    <button
      className="btn btn-sm btn-danger"
      onClick={() => handleDelete(m.id)}
    >
      Delete
    </button>
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

function Categories() {
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const { getToken } = useAuth();
  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const token = await getToken();

  const res = await axios.get(`${API_URL}/categories`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  setCategories(res.data);
};

  const handleDelete = async (id) => {
    const token = await getToken();
    if (window.confirm('Delete this category?')) {
      await axios.delete(`${API_URL}/categories/${id}`, {
        headers:{
            Authorization:`Bearer ${token}`
        }
    });
      fetchData();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

  const token = await getToken();

  if (editingId) {
    await axios.put(
      `${API_URL}/categories/${editingId}`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } else {
    await axios.post(
      `${API_URL}/categories`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  }

  setShowModal(false);
  setEditingId(null);
  setFormData({
    name: "",
    description: "",
  });

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
    const token = await getToken();

const res = await axios.get(
    `${API_URL}/suppliers`,
    {
        headers:{
            Authorization:`Bearer ${token}`
        }
    }
);
    setSuppliers(res.data);
  };

  const handleDelete = async (id) => {
  if (window.confirm('Delete this supplier?')) {
    try {
      const token = await getToken();
      await axios.delete(`${API_URL}/suppliers/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) {
      // Display the specific error message from the backend
      alert(err.response?.data?.error || 'Error deleting supplier');
    }
  }
};


  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = await getToken();

if (editingId) {
    await axios.put(
        `${API_URL}/suppliers/${editingId}`,
        formData,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );
} else {
    await axios.post(
        `${API_URL}/suppliers`,
        formData,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );
}
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

function Alerts() {
  const [lowStockItems, setLowStockItems] = useState([]);
  const { getToken } = useAuth();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const token = await getToken();

    const res = await axios.get(
    `${API_URL}/products`,
    {
        headers:{
            Authorization:`Bearer ${token}`
        }
    }
);
    const low = res.data.filter(p => p.stock <= p.threshold);
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
