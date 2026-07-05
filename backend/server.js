const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 5000;
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';
const ADMIN_STORE_PATH = path.join(__dirname, 'admin-store.json');

let nextId = 1000;
let nextSessionId = 2000;

function createDefaultAdminStore() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const displayName = process.env.ADMIN_DISPLAY_NAME || 'Admin User';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');

  return {
    adminAccount: {
      username,
      displayName,
      salt,
      passwordHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

function writeAdminStore(store) {
  fs.writeFileSync(ADMIN_STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function loadAdminStore() {
  try {
    const rawStore = fs.readFileSync(ADMIN_STORE_PATH, 'utf8');
    const parsedStore = JSON.parse(rawStore);

    if (parsedStore?.adminAccount?.username && parsedStore?.adminAccount?.salt && parsedStore?.adminAccount?.passwordHash) {
      return parsedStore;
    }
  } catch (error) {
    console.warn('Admin store missing or invalid, recreating default admin account.');
  }

  const defaultStore = createDefaultAdminStore();
  writeAdminStore(defaultStore);
  return defaultStore;
}

function hashAdminPassword(password, salt) {
  return crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
}

function verifyAdminPassword(password, account) {
  try {
    const inputHash = Buffer.from(hashAdminPassword(password, account.salt), 'hex');
    const storedHash = Buffer.from(account.passwordHash, 'hex');

    return storedHash.length === inputHash.length && crypto.timingSafeEqual(storedHash, inputHash);
  } catch (error) {
    return false;
  }
}

const adminStore = loadAdminStore();

const state = {
  categories: [
    { id: 1, name: 'Beverages', description: 'Drinks and refreshments' },
    { id: 2, name: 'Snacks', description: 'Packaged snack items' },
  ],
  suppliers: [
    { id: 1, name: 'Nairobi Wholesalers', contact: 'Jane Doe', phone: '+254700000001', email: 'orders@nairobiwholesalers.example', addr: 'Industrial Area' },
    { id: 2, name: 'Fresh Foods Ltd', contact: 'John Kamau', phone: '+254700000002', email: 'sales@freshfoods.example', addr: 'Mombasa Road' },
  ],
  products: [
    { id: 1, name: 'Mineral Water', sku: 'WTR-001', catId: 1, supplierId: 1, price: 50, cost: 30, stock: 8, threshold: 10, unit: 'pcs' },
    { id: 2, name: 'Potato Crisps', sku: 'SNK-014', catId: 2, supplierId: 2, price: 80, cost: 55, stock: 22, threshold: 10, unit: 'pack' },
    { id: 3, name: 'Soda Can', sku: 'BEV-021', catId: 1, supplierId: 1, price: 70, cost: 45, stock: 6, threshold: 10, unit: 'pcs' },
  ],
  sales: [
    { id: 1, productId: 2, qty: 2, price: 80, customer: 'Walk-in', date: new Date(Date.now() - 86400000).toISOString() },
    { id: 2, productId: 1, qty: 1, price: 50, customer: 'Walk-in', date: new Date().toISOString() },
  ],
  stockMoves: [
    { id: 1, productId: 1, type: 'in', qty: 10, note: 'Opening stock', date: new Date(Date.now() - 172800000).toISOString() },
    { id: 2, productId: 3, type: 'out', qty: 2, note: 'Sales adjustment', date: new Date(Date.now() - 86400000).toISOString() },
  ],
  adminUsers: [
    { id: 1, name: 'Amina Admin', email: 'amina.admin@example.com', phone: '+254700000101', username: 'amina.admin', role: 'Admin', status: 'active', createdAt: new Date(Date.now() - 604800000).toISOString(), lastLoginAt: new Date().toISOString() },
    { id: 2, name: 'Brian User', email: 'brian.user@example.com', phone: '+254700000102', username: 'brian.user', role: 'User', status: 'inactive', createdAt: new Date(Date.now() - 302400000).toISOString(), lastLoginAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 3, name: 'Cynthia Cashier', email: 'cynthia.cashier@example.com', phone: '+254700000103', username: 'cynthia.cashier', role: 'User', status: 'active', createdAt: new Date(Date.now() - 259200000).toISOString(), lastLoginAt: new Date(Date.now() - 3600000).toISOString() },
  ],
  adminSessions: new Map(),
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let rawBody = '';

    req.on('data', (chunk) => {
      rawBody += chunk;
      if (rawBody.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function getAuthorizationToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function enrichProduct(product) {
  const category = state.categories.find((item) => item.id === product.catId) || null;
  const supplier = state.suppliers.find((item) => item.id === product.supplierId) || null;
  return { ...product, category, supplier };
}

function enrichSale(sale) {
  const product = state.products.find((item) => item.id === sale.productId);
  return {
    ...sale,
    productName: product ? product.name : 'Unknown',
    total: Number(sale.price || 0) * Number(sale.qty || 0),
  };
}

function enrichMove(move) {
  const product = state.products.find((item) => item.id === move.productId);
  return {
    ...move,
    productName: product ? product.name : 'Unknown',
  };
}

function applyProductLinks() {
  state.products = state.products.map(enrichProduct);
}

function ensureProductShape(product) {
  return {
    id: product.id,
    name: product.name || '',
    sku: product.sku || '',
    catId: Number(product.catId) || null,
    supplierId: Number(product.supplierId) || null,
    price: Number(product.price) || 0,
    cost: Number(product.cost) || 0,
    stock: Number(product.stock) || 0,
    threshold: Number(product.threshold) || 0,
    unit: product.unit || 'pcs',
  };
}

function readIdFromPath(urlPath, prefix) {
  const rawId = urlPath.slice(prefix.length).split('/')[0];
  return Number(rawId);
}

function authenticateAdmin(req) {
  const token = getAuthorizationToken(req);
  return token && state.adminSessions.has(token);
}

function handleCollectionRoute(req, res, collectionName, mapper) {
  const items = state[collectionName];

  if (req.method === 'GET') {
    sendJson(res, 200, items.map(mapper));
    return true;
  }

  return false;
}

async function handleProducts(req, res, pathname) {
  if (pathname === '/api/products' && req.method === 'GET') {
    sendJson(res, 200, state.products.map(enrichProduct));
    return;
  }

  if (pathname === '/api/products' && req.method === 'POST') {
    const body = await readBody(req);
    const product = ensureProductShape({ ...body, id: nextId++ });
    state.products.push(product);
    sendJson(res, 201, enrichProduct(product));
    return;
  }

  if (pathname.startsWith('/api/products/') && req.method === 'PUT') {
    const id = readIdFromPath(pathname, '/api/products/');
    const index = state.products.findIndex((item) => item.id === id);

    if (index === -1) {
      sendJson(res, 404, { error: 'Product not found' });
      return;
    }

    const body = await readBody(req);
    const updatedProduct = ensureProductShape({ ...state.products[index], ...body, id });
    state.products[index] = updatedProduct;
    sendJson(res, 200, enrichProduct(updatedProduct));
    return;
  }

  if (pathname.startsWith('/api/products/') && req.method === 'DELETE') {
    const id = readIdFromPath(pathname, '/api/products/');
    const originalLength = state.products.length;
    state.products = state.products.filter((item) => item.id !== id);

    if (state.products.length === originalLength) {
      sendJson(res, 404, { error: 'Product not found' });
      return;
    }

    sendJson(res, 200, { message: 'Product deleted' });
    return;
  }
}

async function handleCategories(req, res, pathname) {
  if (pathname === '/api/categories' && req.method === 'GET') {
    sendJson(res, 200, state.categories);
    return;
  }

  if (pathname === '/api/categories' && req.method === 'POST') {
    const body = await readBody(req);
    const category = { id: nextId++, name: body.name || '', description: body.description || '' };
    state.categories.push(category);
    sendJson(res, 201, category);
    return;
  }

  if (pathname.startsWith('/api/categories/') && req.method === 'PUT') {
    const id = readIdFromPath(pathname, '/api/categories/');
    const index = state.categories.findIndex((item) => item.id === id);

    if (index === -1) {
      sendJson(res, 404, { error: 'Category not found' });
      return;
    }

    const body = await readBody(req);
    state.categories[index] = { ...state.categories[index], ...body, id };
    sendJson(res, 200, state.categories[index]);
    return;
  }

  if (pathname.startsWith('/api/categories/') && req.method === 'DELETE') {
    const id = readIdFromPath(pathname, '/api/categories/');
    const originalLength = state.categories.length;
    state.categories = state.categories.filter((item) => item.id !== id);

    if (state.categories.length === originalLength) {
      sendJson(res, 404, { error: 'Category not found' });
      return;
    }

    sendJson(res, 200, { message: 'Category deleted' });
    return;
  }
}

async function handleSuppliers(req, res, pathname) {
  if (pathname === '/api/suppliers' && req.method === 'GET') {
    sendJson(res, 200, state.suppliers);
    return;
  }

  if (pathname === '/api/suppliers' && req.method === 'POST') {
    const body = await readBody(req);
    const supplier = {
      id: nextId++,
      name: body.name || '',
      contact: body.contact || '',
      phone: body.phone || '',
      email: body.email || '',
      addr: body.addr || '',
    };
    state.suppliers.push(supplier);
    sendJson(res, 201, supplier);
    return;
  }

  if (pathname.startsWith('/api/suppliers/') && req.method === 'PUT') {
    const id = readIdFromPath(pathname, '/api/suppliers/');
    const index = state.suppliers.findIndex((item) => item.id === id);

    if (index === -1) {
      sendJson(res, 404, { error: 'Supplier not found' });
      return;
    }

    const body = await readBody(req);
    state.suppliers[index] = { ...state.suppliers[index], ...body, id };
    sendJson(res, 200, state.suppliers[index]);
    return;
  }

  if (pathname.startsWith('/api/suppliers/') && req.method === 'DELETE') {
    const id = readIdFromPath(pathname, '/api/suppliers/');
    const originalLength = state.suppliers.length;
    state.suppliers = state.suppliers.filter((item) => item.id !== id);

    if (state.suppliers.length === originalLength) {
      sendJson(res, 404, { error: 'Supplier not found' });
      return;
    }

    sendJson(res, 200, { message: 'Supplier deleted' });
    return;
  }
}

async function handleSales(req, res, pathname) {
  if (pathname === '/api/sales' && req.method === 'GET') {
    sendJson(res, 200, state.sales.map(enrichSale));
    return;
  }

  if (pathname === '/api/sales' && req.method === 'POST') {
    const body = await readBody(req);
    const product = state.products.find((item) => item.id === Number(body.productId));

    if (!product) {
      sendJson(res, 400, { error: 'Product not found for sale' });
      return;
    }

    const sale = {
      id: nextId++,
      productId: product.id,
      qty: Number(body.qty) || 0,
      price: Number(body.price) || Number(product.price) || 0,
      customer: body.customer || 'Walk-in',
      date: new Date().toISOString(),
    };

    state.sales.unshift(sale);
    product.stock = Math.max(0, Number(product.stock) - Number(sale.qty));
    sendJson(res, 201, enrichSale(sale));
    return;
  }

  if (pathname.startsWith('/api/sales/') && req.method === 'DELETE') {
    const id = readIdFromPath(pathname, '/api/sales/');
    const originalLength = state.sales.length;
    state.sales = state.sales.filter((item) => item.id !== id);

    if (state.sales.length === originalLength) {
      sendJson(res, 404, { error: 'Sale not found' });
      return;
    }

    sendJson(res, 200, { message: 'Sale deleted' });
    return;
  }
}

async function handleStockMoves(req, res, pathname) {
  if (pathname === '/api/stock-moves' && req.method === 'GET') {
    sendJson(res, 200, state.stockMoves.map(enrichMove));
    return;
  }

  if (pathname === '/api/stock-moves' && req.method === 'POST') {
    const body = await readBody(req);
    const product = state.products.find((item) => item.id === Number(body.productId));

    if (!product) {
      sendJson(res, 400, { error: 'Product not found for stock movement' });
      return;
    }

    const movement = {
      id: nextId++,
      productId: product.id,
      type: body.type === 'out' ? 'out' : 'in',
      qty: Number(body.qty) || 0,
      note: body.note || '',
      date: new Date().toISOString(),
    };

    state.stockMoves.unshift(movement);
    product.stock = movement.type === 'in'
      ? Number(product.stock) + movement.qty
      : Math.max(0, Number(product.stock) - movement.qty);

    sendJson(res, 201, enrichMove(movement));
    return;
  }

  if (pathname.startsWith('/api/stock-moves/') && req.method === 'DELETE') {
    const id = readIdFromPath(pathname, '/api/stock-moves/');
    const originalLength = state.stockMoves.length;
    state.stockMoves = state.stockMoves.filter((item) => item.id !== id);

    if (state.stockMoves.length === originalLength) {
      sendJson(res, 404, { error: 'Stock movement not found' });
      return;
    }

    sendJson(res, 200, { message: 'Stock movement deleted' });
    return;
  }
}

async function handleAdmin(req, res, pathname) {
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const body = await readBody(req);
    const account = adminStore.adminAccount;

    if (!account || account.username !== body.username || !verifyAdminPassword(body.password, account)) {
      sendJson(res, 401, { error: 'Invalid admin username or password' });
      return;
    }

    const token = `admin-${nextSessionId++}`;
    state.adminSessions.set(token, { username: account.username, displayName: account.displayName });
    sendJson(res, 200, { token, username: account.username, displayName: account.displayName });
    return;
  }

  if (!authenticateAdmin(req)) {
    sendJson(res, 401, { error: 'Admin authentication required' });
    return;
  }

  if (pathname === '/api/admin/users' && req.method === 'GET') {
    sendJson(res, 200, state.adminUsers);
    return;
  }

  if (pathname.startsWith('/api/admin/users/') && req.method === 'GET') {
    const id = readIdFromPath(pathname, '/api/admin/users/');
    const user = state.adminUsers.find((item) => item.id === id);

    if (!user) {
      sendJson(res, 404, { error: 'User not found' });
      return;
    }

    sendJson(res, 200, user);
    return;
  }

  if (pathname.startsWith('/api/admin/users/') && req.method === 'DELETE') {
    const id = readIdFromPath(pathname, '/api/admin/users/');
    const originalLength = state.adminUsers.length;
    state.adminUsers = state.adminUsers.filter((item) => item.id !== id);

    if (state.adminUsers.length === originalLength) {
      sendJson(res, 404, { error: 'User not found' });
      return;
    }

    sendJson(res, 200, { message: 'User deleted' });
    return;
  }

  if (pathname.endsWith('/deactivate') && req.method === 'PATCH') {
    const id = readIdFromPath(pathname, '/api/admin/users/');
    const user = state.adminUsers.find((item) => item.id === id);

    if (!user) {
      sendJson(res, 404, { error: 'User not found' });
      return;
    }

    user.status = 'inactive';
    sendJson(res, 200, user);
    return;
  }

  if (pathname.endsWith('/reactivate') && req.method === 'PATCH') {
    const id = readIdFromPath(pathname, '/api/admin/users/');
    const user = state.adminUsers.find((item) => item.id === id);

    if (!user) {
      sendJson(res, 404, { error: 'User not found' });
      return;
    }

    user.status = 'active';
    sendJson(res, 200, user);
    return;
  }
}

async function router(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = requestUrl;

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (pathname === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname.startsWith('/api/products')) {
      await handleProducts(req, res, pathname);
      return;
    }

    if (pathname.startsWith('/api/categories')) {
      await handleCategories(req, res, pathname);
      return;
    }

    if (pathname.startsWith('/api/suppliers')) {
      await handleSuppliers(req, res, pathname);
      return;
    }

    if (pathname.startsWith('/api/sales')) {
      await handleSales(req, res, pathname);
      return;
    }

    if (pathname.startsWith('/api/stock-moves')) {
      await handleStockMoves(req, res, pathname);
      return;
    }

    if (pathname.startsWith('/api/admin')) {
      await handleAdmin(req, res, pathname);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('API error:', error);
    sendJson(res, 500, { error: error.message || 'Internal server error' });
  }
}

const server = http.createServer(router);

server.listen(PORT, () => {
  console.log(`EasyKiosk API running on http://localhost:${PORT}`);
});
