require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const {
    clerkMiddleware,
    requireAuth,
    getAuth,
} = require("@clerk/express");

const app = express();
const PORT = process.env.PORT || 5000;

// --- MIDDLEWARE ---
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(clerkMiddleware());

// --- DATABASE CONNECTION ---
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'easykiosk',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

pool.getConnection()
  .then(connection => {
    console.log('Successfully connected to MySQL Database');
    connection.release();
  })
  .catch(err => {
    console.error('Error connecting to MySQL:', err.message);
  });

// --- HELPERS ---

async function getProductWithDetails(whereClause = '', params = []) {
  const sql = `
    SELECT 
      products.*,
      categories.id AS category_id,
      categories.name AS category_name,
      suppliers.id AS supplier_id,
      suppliers.name AS supplier_name,
      suppliers.contact AS supplier_contact,
      suppliers.phone AS supplier_phone,
      suppliers.email AS supplier_email,
      suppliers.addr AS supplier_addr
    FROM products
    LEFT JOIN categories ON products.catId = categories.id
    LEFT JOIN suppliers ON products.supplierId = suppliers.id
    ${whereClause}
  `;
  const [rows] = await pool.execute(sql, params);
  return rows.map(row => ({
    ...row,
    category: row.category_id ? { id: row.category_id, name: row.category_name } : null,
    supplier: row.supplier_id ? {
      id: row.supplier_id,
      name: row.supplier_name,
      contact: row.supplier_contact,
      phone: row.supplier_phone,
      email: row.supplier_email,
      addr: row.supplier_addr
    } : null
  }));
}

// Helper to check if user is an Admin in our DB
async function isAdmin(clerkUserId) {
  const [rows] = await pool.execute(
    'SELECT * FROM admin_users WHERE clerkUserId = ? AND status = ?',
    [clerkUserId, 'active']
  );
  return rows.length > 0 && rows.role === 'Admin';
}

// Middleware to require Admin Role
const requireAdmin = async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    
    const adminStatus = await isAdmin(userId);
    if (!adminStatus) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    next();
  } catch (err) {
    console.error('Admin check error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// --- ROUTES ---

app.get('/', (req, res) => {
  res.send('Welcome to EasyKiosk API!');
});

// --- PRODUCTS ---
app.get("/api/products", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const products = await getProductWithDetails("WHERE products.userId = ?", [userId]);
    res.json(products);
  } catch (err) {
    console.error("GET /api/products error:", err);
    res.status(500).json({ error: "Database error fetching products", details: err.message });
  }
});

app.post('/api/products', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { name, sku, catId, supplierId, price, cost, stock, threshold, unit } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Name and Price are required' });

    const [result] = await pool.execute(
      'INSERT INTO products (name, sku, catId, supplierId, price, cost, stock, threshold, unit, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, sku, catId, supplierId, price, cost, stock || 0, threshold || 10, unit || 'pcs', userId]
    );
    
    const newProduct = await getProductWithDetails('WHERE products.id = ? AND products.userId = ?', [result.insertId, userId]);
    res.status(201).json(newProduct);
  } catch (err) {
    console.error('POST /api/products error:', err);
    res.status(500).json({ error: 'Database error creating product', details: err.message });
  }
});

app.put("/api/products/:id", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { name, sku, catId, supplierId, price, cost, stock, threshold, unit } = req.body;

    const [result] = await pool.execute(
      `UPDATE products SET name=?, sku=?, catId=?, supplierId=?, price=?, cost=?, stock=?, threshold=?, unit=? WHERE id=? AND userId=?`,
      [name, sku, catId, supplierId, price, cost, stock, threshold, unit, req.params.id, userId]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: "Product not found" });

    const product = await getProductWithDetails("WHERE products.id=? AND products.userId=?", [req.params.id, userId]);
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', requireAuth(), async (req, res) => { 
  try {
    const { userId } = getAuth(req);
    const productId = req.params.id;

    const [salesCount] = await pool.execute('SELECT COUNT(*) as count FROM sales WHERE productId = ? AND userId = ?', [productId, userId]);
    if (salesCount.count > 0) return res.status(400).json({ error: 'Cannot delete product. There are sales records associated with this product.' });

    const [movesCount] = await pool.execute('SELECT COUNT(*) as count FROM stock_moves WHERE productId = ? AND userId = ?', [productId, userId]);
    if (movesCount.count > 0) return res.status(400).json({ error: 'Cannot delete product. There are stock movement records associated with this product.' });

    const [result] = await pool.execute('DELETE FROM products WHERE id = ? AND userId = ?', [productId, userId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });
    
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/products/:id error:', err);
    res.status(500).json({ error: 'Database error deleting product', details: err.message });
  }
});

// --- CATEGORIES ---
app.get('/api/categories', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const [rows] = await pool.execute("SELECT * FROM categories WHERE userId = ?", [userId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { name, description } = req.body;
    const [result] = await pool.execute(`INSERT INTO categories (name, description, userId) VALUES (?, ?, ?)`, [name, description, userId]);
    res.json({ id: result.insertId, name, description });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', requireAuth(), async (req, res) => { 
  try {
    const { userId } = getAuth(req);
    const categoryId = req.params.id;

    const [countResult] = await pool.execute('SELECT COUNT(*) as count FROM products WHERE catId = ? AND userId = ?', [categoryId, userId]);
    if (countResult.count > 0) return res.status(400).json({ error: 'Cannot delete category. There are products associated with this category.' });

    const [result] = await pool.execute('DELETE FROM categories WHERE id = ? AND userId = ?', [categoryId, userId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Category not found' });
    
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/categories/:id error:', err);
    res.status(500).json({ error: 'Database error deleting category', details: err.message });
  }
});

// --- SUPPLIERS ---
app.get('/api/suppliers', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const [rows] = await pool.execute('SELECT * FROM suppliers WHERE userId = ?', [userId]);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/suppliers error:', err);
    res.status(500).json({ error: 'Database error fetching suppliers', details: err.message });
  }
});

app.post('/api/suppliers', requireAuth(), async (req, res) => {
  try {
    const { name, contact, phone, email, addr } = req.body;
    const { userId } = getAuth(req);
    const [result] = await pool.execute('INSERT INTO suppliers (name, contact, phone, email, addr, userId) VALUES (?, ?, ?, ?, ?, ?)', [name, contact, phone, email, addr || '', userId]);
    res.status(201).json({ id: result.insertId, name, contact, phone, email, addr, userId });
  } catch (err) {
    console.error('POST /api/suppliers error:', err);
    res.status(500).json({ error: 'Database error creating supplier', details: err.message });
  }
});

app.delete('/api/suppliers/:id', requireAuth(), async (req, res) => { 
  try {
    const { userId } = getAuth(req);
    const supplierId = req.params.id;

    const [countResult] = await pool.execute('SELECT COUNT(*) as count FROM products WHERE supplierId = ? AND userId = ?', [supplierId, userId]);
    if (countResult.count > 0) return res.status(400).json({ error: 'Cannot delete supplier. There are products associated with this supplier.' });

    const [result] = await pool.execute('DELETE FROM suppliers WHERE id = ? AND userId = ?', [supplierId, userId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Supplier not found' });
    
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/suppliers/:id error:', err);
    res.status(500).json({ error: 'Database error deleting supplier', details: err.message });
  }
});

// --- STOCK MOVES ---
app.get('/api/stock-moves', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const [rows] = await pool.execute(
      'SELECT sm.*, p.name as productName FROM stock_moves sm JOIN products p ON sm.productId = p.id WHERE sm.userId = ? ORDER BY sm.date DESC',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/stock-moves error:', err);
    res.status(500).json({ error: 'Database error fetching stock moves', details: err.message });
  }
});

app.post('/api/stock-moves', requireAuth(), async (req, res) => {
  const connection = await pool.getConnection();
  const { userId } = getAuth(req);
  try {
    await connection.beginTransaction();
    const { productId, type, qty, note } = req.body;
    
    if (type === 'in') {
      await connection.execute('UPDATE products SET stock = stock + ? WHERE id = ? AND userId = ?', [qty, productId, userId]);
    } else {
      const [[product]] = await connection.execute('SELECT stock FROM products WHERE id = ? AND userId = ?', [productId, userId]);
      if (!product) throw new Error('Product not found');
      if (product.stock < qty) throw new Error('Insufficient stock');
      await connection.execute('UPDATE products SET stock = stock - ? WHERE id = ? AND userId = ?', [qty, productId, userId]);
    }

    await connection.execute('INSERT INTO stock_moves (productId, type, qty, note, userId) VALUES (?, ?, ?, ?, ?)', [productId, type, qty, note || '', userId]);
    await connection.commit();
    res.status(201).json({ success: true });
  } catch (err) {
    await connection.rollback();
    console.error('POST /api/stock-moves error:', err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

app.delete("/api/stock-moves/:id", requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const [result] = await pool.execute("DELETE FROM stock_moves WHERE id = ? AND userId = ?", [req.params.id, userId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Stock movement not found" });
    res.json({ message: "Stock movement deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- SALES ---
app.get('/api/sales', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const [rows] = await pool.execute(
      'SELECT s.*, p.name as productName FROM sales s JOIN products p ON s.productId = p.id WHERE s.userId = ? ORDER BY s.date DESC',
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/sales error:', err);
    res.status(500).json({ error: 'Database error fetching sales', details: err.message });
  }
});

app.post('/api/sales', requireAuth(), async (req, res) => {
  const connection = await pool.getConnection();
  const { userId } = getAuth(req);
  try {
    await connection.beginTransaction();
    const { productId, qty, price, customer } = req.body;
    const total = qty * price;

    const [[product]] = await connection.execute('SELECT stock FROM products WHERE id = ? AND userId = ?', [productId, userId]);
    if (!product) throw new Error('Product not found');
    if (product.stock < qty) throw new Error('Insufficient stock');

    await connection.execute('UPDATE products SET stock = stock - ? WHERE id = ? AND userId = ?', [qty, productId, userId]);
    await connection.execute('INSERT INTO sales (productId, qty, price, customer, total, userId) VALUES (?, ?, ?, ?, ?, ?)', [productId, qty, price, customer, total, userId]);
    await connection.execute('INSERT INTO stock_moves (productId, type, qty, note, userId) VALUES (?, ?, ?, ?, ?)', [productId, 'out', qty, `Sale to ${customer}`, userId]);

    await connection.commit();
    res.status(201).json({ success: true, total });
  } catch (err) {
    await connection.rollback();
    console.error('POST /api/sales error:', err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

app.delete('/api/sales/:id', requireAuth(), async (req, res) => {
  const connection = await pool.getConnection();
  const { userId } = getAuth(req);
  
  try {
    await connection.beginTransaction();
    const [[sale]] = await connection.execute('SELECT * FROM sales WHERE id = ? AND userId = ?', [req.params.id, userId]);
    if (!sale) {
      await connection.rollback();
      return res.status(404).json({ error: 'Sale not found' });
    }

    await connection.execute('UPDATE products SET stock = stock + ? WHERE id = ? AND userId = ?', [sale.qty, sale.productId, userId]);
    
    // Delete related stock move
    await connection.execute(
      'DELETE FROM stock_moves WHERE productId = ? AND type = ? AND qty = ? AND note LIKE ? AND userId = ? LIMIT 1',
      [sale.productId, 'out', sale.qty, `%Sale to ${sale.customer}%`, userId]
    );

    await connection.execute('DELETE FROM sales WHERE id = ? AND userId = ?', [req.params.id, userId]);
    await connection.commit();
    res.json({ message: 'Sale deleted and stock restored successfully' });

  } catch (err) {
    await connection.rollback();
    console.error('DELETE /api/sales/:id error:', err);
    res.status(500).json({ error: 'Failed to delete sale', details: err.message });
  } finally {
    connection.release();
  }
});

// --- ADMIN ROUTES (Merged from second server) ---

// Get all admin users (Protected by Admin Role)
app.get('/api/admin/users', requireAuth(), requireAdmin, async (req, res) => {
  try {
    // Note: This fetches ALL admin users regardless of userId because admins manage everyone
    const [rows] = await pool.execute('SELECT * FROM admin_users ORDER BY createdAt DESC');
    res.json(rows);
  } catch (err) {
    console.error('GET /api/admin/users error:', err);
    res.status(500).json({ error: 'Database error fetching admin users', details: err.message });
  }
});

// Deactivate User
app.patch('/api/admin/users/:id/deactivate', requireAuth(), requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const [result] = await pool.execute('UPDATE admin_users SET status = ? WHERE id = ?', ['inactive', id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deactivated' });
  } catch (err) {
    console.error('PATCH deactivate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reactivate User
app.patch('/api/admin/users/:id/reactivate', requireAuth(), requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const [result] = await pool.execute('UPDATE admin_users SET status = ? WHERE id = ?', ['active', id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User reactivated' });
  } catch (err) {
    console.error('PATCH reactivate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete Admin User
app.delete('/api/admin/users/:id', requireAuth(), requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const [result] = await pool.execute('DELETE FROM admin_users WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('DELETE admin user error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
