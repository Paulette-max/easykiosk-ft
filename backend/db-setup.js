require('dotenv').config();
const mysql = require('mysql2/promise');

async function setupDatabase() {
  let conn;
  try {
    const DB_HOST = process.env.DB_HOST || 'localhost';
    const DB_USER = process.env.DB_USER || 'root';
    const DB_PASSWORD = process.env.DB_PASSWORD || '';
    const DB_NAME = process.env.DB_NAME || 'easykiosk_db';

    // Connect without specifying database first to create it
    conn = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD
    });

    await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
    console.log('Database ensured.');

    // Close the initial connection before reconnecting to the specific DB
    await conn.end();

    // Reconnect to the specific database
    conn = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      multipleStatements: false
    });

    // Create Tables
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        contact VARCHAR(100),
        phone VARCHAR(50),
        email VARCHAR(100),
        addr TEXT
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        sku VARCHAR(50) UNIQUE NOT NULL,
        catId INT,
        supplierId INT,
        price DECIMAL(10, 2) DEFAULT 0,
        cost DECIMAL(10, 2) DEFAULT 0,
        stock INT DEFAULT 0,
        threshold INT DEFAULT 10,
        unit VARCHAR(20) DEFAULT 'pcs',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (catId) REFERENCES categories(id) ON DELETE SET NULL ON UPDATE CASCADE,
        FOREIGN KEY (supplierId) REFERENCES suppliers(id) ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS stock_moves (
        id INT AUTO_INCREMENT PRIMARY KEY,
        productId INT NOT NULL,
        type ENUM('in', 'out') NOT NULL,
        qty INT NOT NULL,
        note TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        productId INT NOT NULL,
        qty INT NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        customer VARCHAR(100) DEFAULT 'Walk-in',
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        total DECIMAL(10, 2) NOT NULL,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    // Seed Data (Only if empty)
    const [catCountRows] = await conn.execute('SELECT COUNT(*) AS count FROM categories');
    const catCount = catCountRows[0]?.count ?? 0;

    if (catCount === 0) {
      // Insert categories (multi-row)
      await conn.execute(
        'INSERT INTO categories (name, description) VALUES (?, ?), (?, ?), (?, ?), (?, ?), (?, ?)',
        [
          'Beverages', 'Drinks',
          'Bakery', 'Bread',
          'Dairy', 'Milk',
          'Groceries', 'Staples',
          'Household', 'Cleaning'
        ]
      );

      // Insert suppliers (multi-row)
      await conn.execute(
        'INSERT INTO suppliers (name, contact, phone, email, addr) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)',
        [
          'Nairobi Beverages Ltd', 'James Kamau', '+254 712 345678', 'james@nbl.co.ke', 'Industrial Area',
          'Unga Group', 'Sarah Wanjiku', '+254 723 456789', 'sarah@ungagroup.com', 'Ruaraka',
          'Brookside Dairy', 'Peter Njoroge', '+254 734 567890', 'peter@brookside.co.ke', 'Ruiru',
          'Bidco Africa', 'Ann Muthoni', '+254 745 678901', 'ann@bidco.co.ke', 'Thika Road'
        ]
      );

      // Retrieve IDs for mapping
      const [catRows] = await conn.execute('SELECT id, name FROM categories');
      const [supRows] = await conn.execute('SELECT id, name FROM suppliers');

      const catsMap = {};
      catRows.forEach(c => { catsMap[c.name] = c.id; });

      const supsMap = {};
      supRows.forEach(s => { supsMap[s.name] = s.id; });

      // Insert products (multi-row)
      await conn.execute(
        `INSERT INTO products (name, sku, catId, supplierId, price, cost, stock, threshold, unit)
         VALUES
         (?, ?, ?, ?, ?, ?, ?, ?, ?),
         (?, ?, ?, ?, ?, ?, ?, ?, ?),
         (?, ?, ?, ?, ?, ?, ?, ?, ?),
         (?, ?, ?, ?, ?, ?, ?, ?, ?),
         (?, ?, ?, ?, ?, ?, ?, ?, ?),
         (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Coca-Cola 500ml', 'BEV-001', catsMap['Beverages'], supsMap['Nairobi Beverages Ltd'], 50, 30, 45, 10, 'pcs',
          'Mineral Water 1L', 'BEV-002', catsMap['Beverages'], supsMap['Nairobi Beverages Ltd'], 30, 18, 8, 15, 'pcs',
          'Bread Loaf', 'BAK-001', catsMap['Bakery'], supsMap['Unga Group'], 60, 40, 20, 10, 'pcs',
          'Milk 500ml', 'DAI-001', catsMap['Dairy'], supsMap['Brookside Dairy'], 55, 40, 5, 12, 'pcs',
          'Sugar 1kg', 'GRO-001', catsMap['Groceries'], supsMap['Unga Group'], 130, 100, 30, 5, 'kg',
          'Laundry Soap', 'HHG-001', catsMap['Household'], supsMap['Bidco Africa'], 45, 28, 3, 8, 'pcs'
        ]
      );

      console.log('Data seeded.');
    } else {
      console.log('Data already exists, skipping seed.');
    }

  } catch (err) {
    console.error('Setup error:', err);
    process.exitCode = 1;
  } finally {
    if (conn) {
      try { await conn.end(); } catch (e) { /* ignore close errors */ }
    }
  }
}

setupDatabase();
