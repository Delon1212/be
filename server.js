const express = require('express');
const db = require('./db');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// ==================== SETUP MULTER ====================
const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

const uploadDirs = {
    products: 'uploads/products',
    users: 'uploads/users',
    payments: 'uploads/payments',
    temp: 'uploads/temp'
};

Object.values(uploadDirs).forEach(dir => ensureDir(dir));

const productStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDirs.products),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const userStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDirs.users),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'user-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const paymentStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDirs.payments),
    filename: (req, file, cb) => {
        const orderId = req.body.order_id || 'unknown';
        cb(null, `payment-${orderId}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const uploadProduct = multer({ storage: productStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadUser = multer({ storage: userStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadPayment = multer({ storage: paymentStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// ==================== AUTH MIDDLEWARE ====================

function isAdmin(req, res, next) {
    const userId = req.query.user_id || req.body.user_id || req.headers['x-user-id'];
    
    console.log('🔐 [isAdmin] Request:', {
        method: req.method,
        path: req.path,
        userId: userId
    });
    
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: User ID required' });
    }
    
    db.query('SELECT role FROM users WHERE user_id = ?', [userId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).json({ error: 'Unauthorized: User not found' });
        }
        
        if (results[0].role === 'admin') {
            next();
        } else {
            res.status(403).json({ error: 'Forbidden: Admin access only' });
        }
    });
}

// ==================== HELPERS ====================
let idCounters = { PRD: 0, USR: 0, ORD: 0 };

function loadExistingIds() {
    const tables = [
        { prefix: 'PRD', table: 'products', field: 'product_id' },
        { prefix: 'USR', table: 'users', field: 'user_id' },
        { prefix: 'ORD', table: 'orders', field: 'order_id' }
    ];
    
    tables.forEach(({ prefix, table, field }) => {
        const query = `SELECT ${field} FROM ${table} ORDER BY ${field} DESC LIMIT 1`;
        db.query(query, (err, results) => {
            if (!err && results.length > 0) {
                const lastId = results[0][field];
                const lastNumber = parseInt(lastId.substring(3)) || 0;
                idCounters[prefix] = lastNumber;
            }
        });
    });
}

function generateId(prefix, callback) {
    let tableName, idField;
    
    switch(prefix) {
        case 'PRD': tableName = 'products'; idField = 'product_id'; break;
        case 'USR': tableName = 'users'; idField = 'user_id'; break;
        case 'ORD': tableName = 'orders'; idField = 'order_id'; break;
        default: callback(prefix + '0001'); return;
    }
    
    const query = `SELECT ${idField} FROM ${tableName} ORDER BY ${idField} DESC LIMIT 1`;
    
    db.query(query, (err, results) => {
        if (err || results.length === 0) {
            callback(prefix + '0001');
        } else {
            const lastId = results[0][idField];
            const lastNumber = parseInt(lastId.substring(3)) || 0;
            const newNumber = (lastNumber + 1).toString().padStart(4, '0');
            callback(prefix + newNumber);
        }
    });
}

function deleteOldFile(filePath) {
    if (filePath) {
        const fullPath = path.join(__dirname, 'uploads', filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log('Deleted old file:', fullPath);
        }
    }
}

// Cron job: batalkan order expired (24 jam)
function cancelExpiredOrders() {
    console.log('🔄 Checking for expired orders...');
    
    db.query('SELECT order_id FROM orders WHERE status = "pending" AND expires_at < NOW()', (err, expiredOrders) => {
        if (err) {
            console.error('Error checking expired orders:', err);
            return;
        }
        
        if (expiredOrders.length === 0) {
            console.log('✅ No expired orders found');
            return;
        }
        
        console.log(`⚠️ Found ${expiredOrders.length} expired orders`);
        
        db.query(`
            UPDATE products p
            JOIN order_items oi ON p.product_id = oi.product_id
            JOIN orders o ON oi.order_id = o.order_id
            SET p.stok_barang = p.stok_barang + oi.quantity,
                p.reserved_stock = p.reserved_stock - oi.quantity
            WHERE o.status = 'pending' AND o.expires_at < NOW()
        `, (err) => {
            if (err) console.error('Error restoring stock:', err);
            
            db.query(`
                UPDATE orders SET status = 'cancelled' 
                WHERE status = 'pending' AND expires_at < NOW()
            `, (err) => {
                if (err) console.error('Error updating order status:', err);
                else console.log(`✅ ${expiredOrders.length} expired orders cancelled, stock restored`);
            });
        });
    });
}

setInterval(cancelExpiredOrders, 3600000);
setTimeout(cancelExpiredOrders, 5000);
setTimeout(loadExistingIds, 1000);

// ==================== SHIPPING CONFIGURATION ====================

const SHIPPING_CONFIG = {
    zones: {
        1: { 
            name: 'Zona 1 (Banten)', 
            provinces: ['Banten'], 
            cost: 15000, 
            days: '1-2 hari' 
        },
        2: { 
            name: 'Zona 2 (Jabodetabek + Jabar)', 
            provinces: ['DKI Jakarta', 'Jawa Barat'], 
            cost: 20000, 
            days: '2-3 hari' 
        },
        3: { 
            name: 'Zona 3 (Jateng, Jatim, Yogya)', 
            provinces: ['Jawa Tengah', 'Jawa Timur', 'DI Yogyakarta'], 
            cost: 30000, 
            days: '3-5 hari' 
        },
        4: { 
            name: 'Zona 4 (Luar Jawa)', 
            provinces: [
                'Sumatera Utara', 'Sumatera Barat', 'Sumatera Selatan', 
                'Riau', 'Kepulauan Riau', 'Jambi', 'Bengkulu', 'Lampung', 
                'Bangka Belitung', 'Kalimantan Barat', 'Kalimantan Timur', 
                'Kalimantan Selatan', 'Kalimantan Tengah', 'Kalimantan Utara',
                'Sulawesi Utara', 'Sulawesi Selatan', 'Sulawesi Tengah', 
                'Sulawesi Tenggara', 'Sulawesi Barat', 'Gorontalo', 'Bali',
                'Nusa Tenggara Barat', 'Nusa Tenggara Timur'
            ], 
            cost: 50000, 
            days: '5-7 hari' 
        },
        5: { 
            name: 'Zona 5 (Papua, Maluku)', 
            provinces: ['Papua', 'Papua Barat', 'Papua Tengah', 'Papua Pegunungan', 'Papua Selatan', 'Maluku', 'Maluku Utara'], 
            cost: 80000, 
            days: '7-14 hari' 
        }
    },
    free_shipping_min: 1500000,
    discount_shipping_min: 950000,
    discount_percent: 0.5
};

function getZone(province) {
    for (const [zoneId, zone] of Object.entries(SHIPPING_CONFIG.zones)) {
        if (zone.provinces.includes(province)) return parseInt(zoneId);
    }
    return 4;
}

function calculateShippingCost(province, totalAmount) {
    const zone = getZone(province);
    const zoneData = SHIPPING_CONFIG.zones[zone];
    const baseCost = zoneData.cost;
    
    let shippingCost = baseCost;
    let isFree = false;
    let discountPercent = 0;
    
    if (totalAmount >= SHIPPING_CONFIG.free_shipping_min) {
        shippingCost = 0;
        isFree = true;
    } else if (totalAmount >= SHIPPING_CONFIG.discount_shipping_min) {
        shippingCost = Math.ceil(baseCost * (1 - SHIPPING_CONFIG.discount_percent));
        discountPercent = SHIPPING_CONFIG.discount_percent * 100;
    }
    
    return {
        shippingCost,
        zone,
        zoneName: zoneData.name,
        estimatedDays: zoneData.days,
        isFree,
        discountPercent,
        baseCost
    };
}

// ==================== SEED DATA PRODUK ====================
function seedProducts() {
    const products = [
        { product_id: 'PRD0001', name_product: 'Parfum Pria Musk', deskripsi: 'Wanginya maskulin dan tahan lama', harga_pcs: 150000, stok_barang: 50 },
        { product_id: 'PRD0002', name_product: 'Parfum Wanita Floral', deskripsi: 'Aroma bunga yang fresh dan manis', harga_pcs: 175000, stok_barang: 45 },
        { product_id: 'PRD0003', name_product: 'Parfum Unisex Fresh', deskripsi: 'Aroma segar cocok untuk semua', harga_pcs: 120000, stok_barang: 60 },
        { product_id: 'PRD0004', name_product: 'Parfum Premium Oud', deskripsi: 'Aroma kayu elegan untuk acara formal', harga_pcs: 350000, stok_barang: 30 },
        { product_id: 'PRD0005', name_product: 'Parfum Sporty', deskripsi: 'Wanginya energik untuk aktivitas olahraga', harga_pcs: 130000, stok_barang: 40 }
    ];
    
    products.forEach(product => {
        db.query('INSERT IGNORE INTO products (product_id, name_product, deskripsi, harga_pcs, stok_barang) VALUES (?, ?, ?, ?, ?)',
            [product.product_id, product.name_product, product.deskripsi, product.harga_pcs, product.stok_barang],
            (err) => {
                if (err && err.code !== 'ER_DUP_ENTRY') {
                    console.error('Error seeding product:', err);
                }
            });
    });
    console.log('🌱 Products seeded');
}

// ==================== FRONTEND ROUTES ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/pages/:page', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', req.params.page)));
app.get('/api/test', (req, res) => res.json({ message: 'API is working!', timestamp: new Date() }));

// ==================== SHIPPING API ====================

app.post('/api/shipping/calculate', (req, res) => {
    const { province, total_amount } = req.body;
    
    if (!province) {
        return res.status(400).json({ error: 'Provinsi diperlukan' });
    }
    
    const result = calculateShippingCost(province, total_amount || 0);
    
    res.json({
        success: true,
        data: {
            zone: result.zone,
            zone_name: result.zoneName,
            base_cost: result.baseCost,
            shipping_cost: result.shippingCost,
            estimated_days: result.estimatedDays,
            is_free: result.isFree,
            discount_percent: result.discountPercent
        }
    });
});

// ==================== PRODUCTS ROUTES (URUTAN DIPERBAIKI) ====================

// GET all products
app.get('/api/products', (req, res) => {
    db.query('SELECT * FROM products ORDER BY created_at DESC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// ✅ SEARCH PRODUCTS (HARUS SEBELUM /:id)
app.get('/api/products/search', (req, res) => {
    const { q, min_price, max_price, sort } = req.query;
    
    console.log('🔍 Search request:', { q, min_price, max_price, sort });
    
    let query = 'SELECT * FROM products WHERE 1=1';
    let params = [];
    
    if (q && q.trim() !== '') {
        query += ' AND (name_product LIKE ? OR deskripsi LIKE ?)';
        const searchTerm = `%${q.trim()}%`;
        params.push(searchTerm, searchTerm);
    }
    
    if (min_price && parseInt(min_price) > 0) {
        query += ' AND harga_pcs >= ?';
        params.push(parseInt(min_price));
    }
    
    if (max_price && parseInt(max_price) > 0 && parseInt(max_price) < 9999999) {
        query += ' AND harga_pcs <= ?';
        params.push(parseInt(max_price));
    }
    
    switch(sort) {
        case 'price_asc': query += ' ORDER BY harga_pcs ASC'; break;
        case 'price_desc': query += ' ORDER BY harga_pcs DESC'; break;
        case 'name_asc': query += ' ORDER BY name_product ASC'; break;
        case 'newest': query += ' ORDER BY created_at DESC'; break;
        default: query += ' ORDER BY created_at DESC';
    }
    
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error searching products:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log(`🔍 Search found ${results.length} products`);
        res.json({
            success: true,
            count: results.length,
            products: results,
            keyword: q || ''
        });
    });
});

// GET single product (HARUS SETELAH SEARCH)
app.get('/api/products/:id', (req, res) => {
    db.query('SELECT * FROM products WHERE product_id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length === 0) return res.status(404).json({ error: 'Product not found' });
        res.json(results[0]);
    });
});

// POST create product
app.post('/api/products', uploadProduct.single('foto'), (req, res) => {
    const { name_product, deskripsi, harga_pcs, stok_barang } = req.body;
    const foto = req.file ? `products/${req.file.filename}` : null;
    
    generateId('PRD', (productId) => {
        db.query('INSERT INTO products (product_id, name_product, deskripsi, harga_pcs, stok_barang, foto) VALUES (?, ?, ?, ?, ?, ?)',
            [productId, name_product, deskripsi, harga_pcs, stok_barang, foto],
            (err) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                res.status(201).json({ message: 'Product created', product_id: productId });
            });
    });
});

// PUT update product
app.put('/api/products/:id', uploadProduct.single('foto'), (req, res) => {
    const { name_product, deskripsi, harga_pcs, stok_barang } = req.body;
    const foto = req.file ? `products/${req.file.filename}` : null;
    
    db.query('SELECT foto FROM products WHERE product_id = ?', [req.params.id], (err, results) => {
        const oldFoto = results?.[0]?.foto;
        
        let query = 'UPDATE products SET name_product = ?, deskripsi = ?, harga_pcs = ?, stok_barang = ?';
        let params = [name_product, deskripsi, harga_pcs, stok_barang];
        
        if (foto) {
            query += ', foto = ?';
            params.push(foto);
        }
        query += ' WHERE product_id = ?';
        params.push(req.params.id);
        
        db.query(query, params, (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (foto && oldFoto) deleteOldFile(oldFoto);
            res.json({ message: 'Product updated' });
        });
    });
});

// DELETE product
app.delete('/api/products/:id', (req, res) => {
    db.query('SELECT foto FROM products WHERE product_id = ?', [req.params.id], (err, results) => {
        if (results?.[0]?.foto) deleteOldFile(results[0].foto);
        db.query('DELETE FROM products WHERE product_id = ?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Product deleted' });
        });
    });
});

// ==================== PRODUCT IMAGES ROUTES ====================
app.get('/api/products/:productId/images', (req, res) => {
    const { productId } = req.params;
    db.query(
        'SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC',
        [productId],
        (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(results);
        }
    );
});

app.post('/api/products/:productId/images', uploadProduct.single('image'), (req, res) => {
    const { productId } = req.params;
    const { is_primary } = req.body;
    const image_url = req.file ? `products/${req.file.filename}` : null;
    
    if (!image_url) {
        return res.status(400).json({ error: 'Image file required' });
    }
    
    if (is_primary === '1' || is_primary === 1) {
        db.query('UPDATE product_images SET is_primary = 0 WHERE product_id = ?', [productId]);
    }
    
    db.query(
        'INSERT INTO product_images (product_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, (SELECT IFNULL(MAX(sort_order), 0) + 1 FROM product_images WHERE product_id = ?))',
        [productId, image_url, is_primary || 0, productId],
        (err, result) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.status(201).json({ message: 'Image added', image_id: result.insertId, image_url });
        }
    );
});

app.delete('/api/products/images/:imageId', (req, res) => {
    const { imageId } = req.params;
    
    db.query('SELECT image_url FROM product_images WHERE image_id = ?', [imageId], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length > 0 && results[0].image_url) {
            deleteOldFile(results[0].image_url);
        }
        
        db.query('DELETE FROM product_images WHERE image_id = ?', [imageId], (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Image deleted' });
        });
    });
});

app.put('/api/products/images/:imageId/primary', (req, res) => {
    const { imageId } = req.params;
    
    db.query('SELECT product_id FROM product_images WHERE image_id = ?', [imageId], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ error: 'Image not found' });
        
        const productId = results[0].product_id;
        
        db.query('UPDATE product_images SET is_primary = 0 WHERE product_id = ?', [productId], (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            
            db.query('UPDATE product_images SET is_primary = 1 WHERE image_id = ?', [imageId], (err) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                res.json({ message: 'Primary image updated' });
            });
        });
    });
});

// ==================== USERS ROUTES ====================
app.get('/api/users', (req, res) => {
    db.query('SELECT user_id, username, email, full_name, phone, provinsi, kota, kecamatan, kode_pos, address, foto, created_at, role FROM users', (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

app.get('/api/users/:id', (req, res) => {
    db.query('SELECT user_id, username, email, full_name, phone, provinsi, kota, kecamatan, kode_pos, address, foto, role FROM users WHERE user_id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(results[0]);
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT user_id, username, email, full_name, phone, address, foto, role FROM users WHERE username = ? AND password = ?', 
        [username, password], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length === 0) return res.status(401).json({ error: 'Invalid username or password' });
        res.json({ message: 'Login successful', user: results[0] });
    });
});

app.post('/api/users', uploadUser.single('foto'), (req, res) => {
    const { username, email, password, full_name, phone, provinsi, kota, kecamatan, kode_pos, address } = req.body;
    const foto = req.file ? `users/${req.file.filename}` : null;
    
    db.query('SELECT * FROM users WHERE username = ? OR email = ?', [username, email], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length > 0) return res.status(400).json({ error: 'Username or email already exists' });
        
        generateId('USR', (userId) => {
            db.query(`INSERT INTO users (user_id, username, email, password, full_name, phone, provinsi, kota, kecamatan, kode_pos, address, foto, role) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')`,
                [userId, username, email, password, full_name, phone, provinsi, kota, kecamatan, kode_pos, address, foto],
                (err) => {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    db.query('SELECT user_id, username, email, full_name, phone, provinsi, kota, kecamatan, kode_pos, address, foto, role FROM users WHERE user_id = ?', 
                        [userId], (err, userResults) => {
                        res.status(201).json({ message: 'User created', user: userResults?.[0] || { user_id: userId } });
                    });
                });
        });
    });
});

app.put('/api/users/:id', uploadUser.single('foto'), (req, res) => {
    const { username, email, full_name, phone, provinsi, kota, kecamatan, kode_pos, address } = req.body;
    const foto = req.file ? `users/${req.file.filename}` : null;
    
    db.query('SELECT foto FROM users WHERE user_id = ?', [req.params.id], (err, results) => {
        const oldFoto = results?.[0]?.foto;
        
        let query = 'UPDATE users SET username = ?, email = ?, full_name = ?, phone = ?, provinsi = ?, kota = ?, kecamatan = ?, kode_pos = ?, address = ?';
        let params = [username, email, full_name, phone, provinsi, kota, kecamatan, kode_pos, address];
        
        if (foto) {
            query += ', foto = ?';
            params.push(foto);
        }
        query += ' WHERE user_id = ?';
        params.push(req.params.id);
        
        db.query(query, params, (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (foto && oldFoto) deleteOldFile(oldFoto);
            
            db.query('SELECT user_id, username, email, full_name, phone, provinsi, kota, kecamatan, kode_pos, address, foto, role FROM users WHERE user_id = ?', 
                [req.params.id], (err, userResults) => {
                res.json({ message: 'User updated', user: userResults?.[0] });
            });
        });
    });
});

// ==================== CART ROUTES ====================

// Get cart by user ID
app.get('/api/cart/:userId', (req, res) => {
    const { userId } = req.params;
    
    db.query('SELECT * FROM cart WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, results) => {
        if (err) {
            console.error('Error fetching cart:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Check if product exists in cart
app.get('/api/cart/check/:userId/:productId', (req, res) => {
    const { userId, productId } = req.params;
    
    db.query('SELECT cart_id, quantity FROM cart WHERE user_id = ? AND product_id = ?', [userId, productId], (err, results) => {
        if (err) {
            console.error('Error checking cart:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (results.length > 0) {
            res.json({ exists: true, cart_id: results[0].cart_id, quantity: results[0].quantity });
        } else {
            res.json({ exists: false });
        }
    });
});

// Add item to cart
app.post('/api/cart', (req, res) => {
    const { user_id, product_id, product_name, price, quantity, stock } = req.body;
    
    console.log('🛒 Add to cart:', { user_id, product_id, product_name, price, quantity });
    
    db.query('SELECT * FROM cart WHERE user_id = ? AND product_id = ?', [user_id, product_id], (err, results) => {
        if (err) {
            console.error('Error checking cart:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (results.length > 0) {
            const newQuantity = results[0].quantity + quantity;
            if (newQuantity > stock) {
                return res.status(400).json({ error: 'Stok tidak mencukupi' });
            }
            
            db.query('UPDATE cart SET quantity = ? WHERE cart_id = ?', [newQuantity, results[0].cart_id], (err) => {
                if (err) {
                    console.error('Error updating cart:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                res.json({ message: 'Cart updated successfully', cart_id: results[0].cart_id });
            });
        } else {
            db.query('INSERT INTO cart (user_id, product_id, product_name, price, quantity, stock) VALUES (?, ?, ?, ?, ?, ?)',
                [user_id, product_id, product_name, price, quantity, stock],
                (err, result) => {
                    if (err) {
                        console.error('Error adding to cart:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    res.status(201).json({ message: 'Item added to cart', cart_id: result.insertId });
                });
        }
    });
});

// Update cart item quantity
app.put('/api/cart/:cartId', (req, res) => {
    const { quantity, user_id } = req.body;
    const { cartId } = req.params;
    
    db.query('UPDATE cart SET quantity = ? WHERE cart_id = ? AND user_id = ?', [quantity, cartId, user_id], (err) => {
        if (err) {
            console.error('Error updating cart:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'Cart updated successfully' });
    });
});

// Remove item from cart
app.delete('/api/cart/:cartId', (req, res) => {
    const { cartId } = req.params;
    const { user_id } = req.body;
    
    db.query('DELETE FROM cart WHERE cart_id = ? AND user_id = ?', [cartId, user_id], (err) => {
        if (err) {
            console.error('Error removing from cart:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'Item removed from cart' });
    });
});

// Clear all cart items for a user
app.delete('/api/cart/clear/:userId', (req, res) => {
    const { userId } = req.params;
    
    db.query('DELETE FROM cart WHERE user_id = ?', [userId], (err) => {
        if (err) {
            console.error('Error clearing cart:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'Cart cleared successfully' });
    });
});

// ==================== ORDERS ROUTES ====================

app.post('/api/orders', (req, res) => {
    const { user_id, items, total_amount, address, province, city, postalCode } = req.body;
    
    console.log('📦 Received order request:', { user_id, total_amount, itemsCount: items?.length });
    
    if (!user_id) return res.status(400).json({ error: 'User ID diperlukan' });
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Item pesanan tidak boleh kosong' });
    if (!total_amount || total_amount <= 0) return res.status(400).json({ error: 'Total amount tidak valid' });
    
    db.query('SELECT COUNT(*) as count FROM orders WHERE user_id = ? AND status = "pending"', [user_id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (result[0].count >= 3) {
            return res.status(400).json({ error: 'Anda memiliki 3 pesanan pending. Selesaikan pembayaran terlebih dahulu.' });
        }
        
        generateId('ORD', (orderId) => {
            const orderNumber = 'ORD' + Date.now();
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);
            
            let stockError = null;
            
            function checkAndReserveStock(index) {
                if (stockError) return;
                if (index >= items.length) {
                    createOrder();
                    return;
                }
                
                const item = items[index];
                if (!item.product_id) {
                    stockError = `Product ID untuk ${item.product_name} tidak valid`;
                    return res.status(400).json({ error: stockError });
                }
                
                db.query('SELECT stok_barang, reserved_stock FROM products WHERE product_id = ?', [item.product_id], (err, results) => {
                    if (err || results.length === 0) {
                        stockError = `Produk ${item.product_name} tidak ditemukan`;
                        return res.status(400).json({ error: stockError });
                    }
                    
                    const availableStock = results[0].stok_barang;
                    if (availableStock < item.quantity) {
                        stockError = `Stok ${item.product_name} tidak mencukupi (tersisa ${availableStock})`;
                        return res.status(400).json({ error: stockError });
                    }
                    
                    db.query('UPDATE products SET stok_barang = stok_barang - ?, reserved_stock = reserved_stock + ? WHERE product_id = ?',
                        [item.quantity, item.quantity, item.product_id], (err) => {
                        if (err) {
                            stockError = `Gagal reserve stok ${item.product_name}`;
                            return res.status(500).json({ error: stockError });
                        }
                        checkAndReserveStock(index + 1);
                    });
                });
            }
            
            function createOrder() {
                db.query(`INSERT INTO orders 
                    (order_id, order_number, user_id, total_amount, status, expires_at, address, provinsi, kota, kode_pos) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [orderId, orderNumber, user_id, total_amount, 'pending', expiresAt, address || null, province || null, city || null, postalCode || null],
                    (err) => {
                    if (err) {
                        console.error('Error creating order:', err);
                        return res.status(500).json({ error: 'Database error: ' + err.message });
                    }
                    
                    let itemIndex = 0;
                    
                    function insertNextItem() {
                        if (itemIndex >= items.length) {
                            if (address && province && city && postalCode) {
                                db.query('UPDATE users SET address = ?, provinsi = ?, kota = ?, kode_pos = ? WHERE user_id = ?',
                                    [address, province, city, postalCode, user_id]);
                            }
                            
                            console.log('✅ Order created:', orderId);
                            console.log(`📍 Address saved: ${address}, ${province}, ${city}, ${postalCode}`);
                            
                            return res.status(201).json({ 
                                message: 'Order created successfully', 
                                order_id: orderId, 
                                order_number: orderNumber,
                                expires_at: expiresAt
                            });
                        }
                        
                        const item = items[itemIndex];
                        db.query('INSERT INTO order_items (order_id, product_id, product_name, price_per_item, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
                            [orderId, item.product_id, item.product_name, item.price_per_item, item.quantity, item.subtotal], (err) => {
                            if (err) {
                                console.error('Error creating order item:', err);
                                return res.status(500).json({ error: 'Error creating order items: ' + err.message });
                            }
                            itemIndex++;
                            insertNextItem();
                        });
                    }
                    
                    insertNextItem();
                });
            }
            
            checkAndReserveStock(0);
        });
    });
});

// GET ALL ORDERS - ONLY ADMIN
app.get('/api/orders', isAdmin, (req, res) => {
    console.log('📋 Admin fetching all orders');
    db.query('SELECT * FROM orders ORDER BY created_at DESC', (err, results) => {
        if (err) {
            console.error('Error fetching orders:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        console.log(`📋 Found ${results.length} orders`);
        res.json(results);
    });
});

// Get user orders
app.get('/api/orders/user/:userId', (req, res) => {
    db.query('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.params.userId], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

// Get order details
app.get('/api/orders/:orderId', (req, res) => {
    db.query('SELECT * FROM orders WHERE order_id = ?', [req.params.orderId], (err, orderResults) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (orderResults.length === 0) return res.status(404).json({ error: 'Order not found' });
        
        db.query('SELECT * FROM order_items WHERE order_id = ?', [req.params.orderId], (err, itemsResults) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ order: orderResults[0], items: itemsResults });
        });
    });
});

// UPDATE ORDER STATUS - ONLY ADMIN
app.put('/api/orders/:orderId/status', isAdmin, (req, res) => {
    const { status } = req.body;
    const orderId = req.params.orderId;
    
    console.log(`📝 Updating order ${orderId} status to: ${status}`);
    
    const validStatus = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatus.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
    }
    
    db.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, orderId], (err, result) => {
        if (err) {
            console.error('Error updating order status:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        console.log(`✅ Order ${orderId} status updated to ${status}`);
        res.json({ message: 'Order status updated successfully' });
    });
});

// Debug endpoint
app.get('/api/debug/order/:orderId', (req, res) => {
    db.query('SELECT * FROM orders WHERE order_id = ?', [req.params.orderId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results[0] || { message: 'Order not found' });
    });
});

// ==================== PAYMENT CONFIRMATIONS ====================
app.post('/api/payment-confirmations', uploadPayment.single('bukti_transfer'), (req, res) => {
    console.log('\n=== PAYMENT CONFIRMATION RECEIVED ===');
    console.log('Request body:', req.body);
    console.log('Uploaded file:', req.file);
    
    const { order_id, user_id, nama_pengirim, bank_pengirim, jumlah_transfer, tanggal_transfer, total_belanja, items } = req.body;
    const bukti_transfer = req.file ? `payments/${req.file.filename}` : null;
    
    if (!order_id) return res.status(400).json({ error: 'Order ID diperlukan' });
    if (!user_id) return res.status(400).json({ error: 'User ID diperlukan' });
    if (!nama_pengirim) return res.status(400).json({ error: 'Nama pengirim diperlukan' });
    if (!bank_pengirim) return res.status(400).json({ error: 'Bank pengirim diperlukan' });
    if (!jumlah_transfer || jumlah_transfer <= 0) return res.status(400).json({ error: 'Jumlah transfer tidak valid' });
    if (!tanggal_transfer) return res.status(400).json({ error: 'Tanggal transfer diperlukan' });
    if (!bukti_transfer) return res.status(400).json({ error: 'Bukti transfer diperlukan' });
    
    db.query('SELECT order_id, total_amount, status, expires_at FROM orders WHERE order_id = ?', [order_id], (err, orderData) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (orderData.length === 0) return res.status(404).json({ error: 'Order tidak ditemukan' });
        
        const order = orderData[0];
        const expectedAmount = parseInt(order.total_amount);
        const sentAmount = parseInt(jumlah_transfer);
        
        console.log(`Order: expected=${expectedAmount}, sent=${sentAmount}, status=${order.status}`);
        
        if (sentAmount !== expectedAmount) {
            return res.status(400).json({ 
                error: `Jumlah transfer harus Rp ${expectedAmount.toLocaleString('id-ID')}` 
            });
        }
        
        if (order.status !== 'pending') {
            return res.status(400).json({ error: `Order sudah ${order.status}. Tidak dapat dikonfirmasi lagi.` });
        }
        
        const insertQuery = `INSERT INTO payment_confirmations 
            (order_id, user_id, nama_pengirim, bank_pengirim, jumlah_transfer, tanggal_transfer, bukti_transfer, total_belanja, items, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`;
        
        const params = [order_id, user_id, nama_pengirim, bank_pengirim, sentAmount, tanggal_transfer, bukti_transfer, total_belanja || expectedAmount, items || null];
        
        db.query(insertQuery, params, (err, result) => {
            if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
            
            db.query('UPDATE orders SET status = "paid", payment_date = NOW() WHERE order_id = ?', [order_id]);
            
            console.log(`✅ Payment saved with ID: ${result.insertId}`);
            res.status(201).json({ message: 'Payment confirmation submitted successfully', id: result.insertId });
        });
    });
});

app.get('/api/payment-confirmations/order/:orderId', (req, res) => {
    db.query('SELECT * FROM payment_confirmations WHERE order_id = ? ORDER BY created_at DESC', [req.params.orderId], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

app.get('/api/payment-confirmations', isAdmin, (req, res) => {
    db.query('SELECT * FROM payment_confirmations ORDER BY created_at DESC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

app.put('/api/payment-confirmations/:id/verify', isAdmin, (req, res) => {
    const { status } = req.body;
    const paymentId = req.params.id;
    
    if (!status || !['verified', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    
    db.query('UPDATE payment_confirmations SET status = ? WHERE id = ?', [status, paymentId], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        db.query('SELECT order_id FROM payment_confirmations WHERE id = ?', [paymentId], (err, results) => {
            if (!err && results.length > 0) {
                const orderStatus = status === 'verified' ? 'processing' : 'cancelled';
                db.query('UPDATE orders SET status = ? WHERE order_id = ?', [orderStatus, results[0].order_id]);
                
                if (status === 'rejected') {
                    db.query(`
                        UPDATE products p
                        JOIN order_items oi ON p.product_id = oi.product_id
                        SET p.stok_barang = p.stok_barang + oi.quantity,
                            p.reserved_stock = p.reserved_stock - oi.quantity
                        WHERE oi.order_id = ?
                    `, [results[0].order_id]);
                }
            }
        });
        
        res.json({ message: `Payment ${status} successfully` });
    });
});

// ==================== CONTACT ROUTES ====================
app.post('/api/contact', (req, res) => {
    const { name, email, message } = req.body;
    
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Semua field harus diisi' });
    }
    
    db.query('INSERT INTO contacts (name, email, message, status) VALUES (?, ?, ?, "unread")',
        [name, email, message],
        (err, result) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.status(201).json({ message: 'Pesan terkirim' });
        });
});

app.get('/api/contacts', isAdmin, (req, res) => {
    db.query('SELECT * FROM contacts ORDER BY created_at DESC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

app.put('/api/contacts/:id/status', isAdmin, (req, res) => {
    const { status } = req.body;
    db.query('UPDATE contacts SET status = ? WHERE id = ?', [status, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Status updated' });
    });
});

app.delete('/api/contacts/:id', isAdmin, (req, res) => {
    db.query('DELETE FROM contacts WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Contact deleted' });
    });
});

// Error handler untuk multer
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Ukuran file terlalu besar. Maksimal 10MB.' });
        }
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

// Start server
app.listen(PORT, async () => {
    console.log(`\n✅ Server running on http://localhost:${PORT}`);
    console.log(`📱 Frontend: http://localhost:${PORT}`);
    console.log(`🔌 API Test: http://localhost:${PORT}/api/test`);
    console.log(`📦 Products API: http://localhost:${PORT}/api/products`);
    console.log(`🔍 Search API: http://localhost:${PORT}/api/products/search?q=parfum`);
    console.log(`🛒 Cart API: http://localhost:${PORT}/api/cart/{userId}`);
    console.log(`🚚 Shipping API: http://localhost:${PORT}/api/shipping/calculate`);
    console.log('\n📁 Upload folders:');
    console.log('   📂 uploads/products/');
    console.log('   📂 uploads/users/');
    console.log('   📂 uploads/payments/');
    console.log('\n⏰ Cron job aktif: Pengecekan order expired setiap 1 jam');
    console.log('\n🔒 Admin endpoints protected with role-based access');
    console.log('\n📝 Default login:');
    console.log('   Admin - Username: admin, Password: admin123');
    console.log('   User  - Username: budi, Password: budi123');
    console.log('   User  - Username: siti, Password: siti123\n');
    
    setTimeout(() => {
        seedProducts();
    }, 2000);
});