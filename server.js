const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PORT = 3000;
const ADMIN_TOKEN = "admin-token-autorizado-123";
const DATA_FILE = path.join(__dirname, 'contas.json');
const DELIVERIES_FILE = path.join(__dirname, 'entregas.json');

// --- Estrutura Inicial ---
function getInitialData() {
    return {
        pixKey: "sua-chave-pix-aqui",
        discordUrl: "https://discord.gg/ed389sxwKu",
        supportEmail: "suporte@ruangamestore.com",
        announcement: "⚡ PROMOÇÃO DE BOAS-VINDAS! Aproveite nossas ofertas de Blox Fruits!",
        bgImage: "",
        products: [],
        stock: []
    };
}

// Inicializa contas.json
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(getInitialData(), null, 2));
}

// Inicializa entregas.json
if (!fs.existsSync(DELIVERIES_FILE)) {
    fs.writeFileSync(DELIVERIES_FILE, JSON.stringify([], null, 2));
}

function readData() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        const fresh = getInitialData();
        fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2));
        return fresh;
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function readDeliveries() {
    try {
        return JSON.parse(fs.readFileSync(DELIVERIES_FILE, 'utf8'));
    } catch (e) {
        fs.writeFileSync(DELIVERIES_FILE, JSON.stringify([], null, 2));
        return [];
    }
}

function writeDeliveries(deliveries) {
    fs.writeFileSync(DELIVERIES_FILE, JSON.stringify(deliveries, null, 2));
}

function checkAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    const bodyAuth = req.body && req.body.auth;
    if (authHeader === ADMIN_TOKEN || bodyAuth === ADMIN_TOKEN) {
        return next();
    }
    return res.status(403).json({ error: "Acesso negado. Token inválido." });
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
}

// ==================== ROTAS PÚBLICAS ====================

app.get('/api/products', (req, res) => {
    const data = readData();
    const productsWithStock = data.products.map(p => {
        const availableStock = data.stock.filter(s => Number(s.productId) === Number(p.id) && !s.sold).length;
        return {
            id: p.id,
            name: p.name,
            price: p.price,
            image: p.image || "https://via.placeholder.com/300x180?text=RUAN+GAME+STORE",
            stockCount: availableStock
        };
    });

    res.json({
        storeName: "RUAN GAME STORE",
        products: productsWithStock,
        pixKey: data.pixKey || "",
        discordUrl: data.discordUrl || "https://discord.gg/ed389sxwKu",
        supportEmail: data.supportEmail || "suporte@ruangamestore.com",
        announcement: data.announcement || "",
        bgImage: data.bgImage || ""
    });
});

// Criar Pedido (Registra em entregas.json como PENDENTE)
app.post('/api/orders/create', (req, res) => {
    const { items, customerName, customerEmail } = req.body;
    const data = readData();

    if (!customerEmail || !isValidEmail(customerEmail)) {
        return res.status(400).json({ error: "Informe um e-mail válido para a entrega!" });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Carrinho vazio!" });
    }

    for (const item of items) {
        const available = data.stock.filter(s => Number(s.productId) === Number(item.id) && !s.sold).length;
        if (available < item.qty) {
            return res.status(400).json({ error: `Estoque insuficiente para: ${item.name}` });
        }
    }

    const orderId = "RGS-" + Math.floor(100000 + Math.random() * 900000);
    const total = items.reduce((acc, i) => acc + (Number(i.price) * Number(i.qty)), 0);

    const newDelivery = {
        orderId: orderId,
        customerName: customerName || "Cliente RUAN STORE",
        customerEmail: customerEmail.trim(),
        items: items,
        total: total,
        status: "PENDENTE",
        deliveredCredentials: [],
        createdAt: new Date().toLocaleString("pt-BR"),
        deliveredAt: null
    };

    const deliveries = readDeliveries();
    deliveries.push(newDelivery);
    writeDeliveries(deliveries);

    res.json({
        success: true,
        orderId: newDelivery.orderId,
        total: newDelivery.total,
        pixKey: data.pixKey,
        supportEmail: data.supportEmail
    });
});

// ==================== ROTAS ADMIN ====================

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === "Heitor Ruan.app") { // Altere a senha se desejar
        return res.json({ success: true, token: ADMIN_TOKEN });
    }
    res.status(401).json({ success: false, message: "Senha incorreta." });
});

app.get('/api/admin/data', checkAuth, (req, res) => {
    const data = readData();
    const deliveries = readDeliveries();

    const productsWithStock = data.products.map(p => ({
        ...p,
        stockCount: data.stock.filter(s => Number(s.productId) === Number(p.id) && !s.sold).length
    }));

    res.json({
        pixKey: data.pixKey,
        discordUrl: data.discordUrl,
        supportEmail: data.supportEmail,
        announcement: data.announcement,
        bgImage: data.bgImage,
        products: productsWithStock,
        deliveries: deliveries
    });
});

// Configurações Globais (Incluindo Avisos e Fundo)
app.post('/api/admin/config-store', checkAuth, (req, res) => {
    const { pixKey, discordUrl, supportEmail, announcement, bgImage } = req.body;
    const data = readData();

    if (pixKey !== undefined) data.pixKey = pixKey;
    if (discordUrl !== undefined) data.discordUrl = discordUrl;
    if (supportEmail !== undefined) data.supportEmail = supportEmail;
    if (announcement !== undefined) data.announcement = announcement;
    if (bgImage !== undefined) data.bgImage = bgImage;

    writeData(data);
    res.json({ success: true, message: "Configurações da loja salvas com sucesso!" });
});

// Adicionar Estoque / Produto
app.post('/api/admin/add-stock', checkAuth, (req, res) => {
    const { productId, name, price, image, accounts } = req.body;
    const data = readData();
    let targetId = productId ? Number(productId) : null;

    if (!targetId) {
        if (!name || !price) {
            return res.status(400).json({ error: "Preencha o nome e o preço do produto." });
        }
        const newProduct = {
            id: Date.now(),
            name: name.trim(),
            price: parseFloat(price),
            image: image ? image.trim() : "https://via.placeholder.com/300x180?text=RUAN+GAME+STORE"
        };
        data.products.push(newProduct);
        targetId = newProduct.id;
    }

    let added = 0;
    if (accounts && Array.isArray(accounts)) {
        accounts.forEach(acc => {
            if (acc && acc.trim() !== "") {
                data.stock.push({
                    id: Date.now() + Math.random(),
                    productId: targetId,
                    credentials: acc.trim(),
                    sold: false
                });
                added++;
            }
        });
    }

    writeData(data);
    res.json({ success: true, message: `Estoque atualizado! (${added} contas inseridas)` });
});

// Editar Produto
app.post('/api/admin/edit-product', checkAuth, (req, res) => {
    const { id, name, price, image } = req.body;
    const data = readData();
    const product = data.products.find(p => Number(p.id) === Number(id));

    if (!product) return res.status(404).json({ error: "Produto não encontrado." });

    if (name) product.name = name.trim();
    if (price) product.price = parseFloat(price);
    if (image !== undefined) product.image = image.trim();

    writeData(data);
    res.json({ success: true, message: "Produto alterado com sucesso!" });
});

// Excluir Produto
app.post('/api/admin/delete-product', checkAuth, (req, res) => {
    const { id } = req.body;
    const data = readData();

    data.products = data.products.filter(p => Number(p.id) !== Number(id));
    data.stock = data.stock.filter(s => Number(s.productId) !== Number(id));

    writeData(data);
    res.json({ success: true, message: "Produto e estoques excluídos." });
});

// Dar Baixa e Aprovar Entrega no entregas.json
app.post('/api/admin/approve-delivery', checkAuth, (req, res) => {
    const { orderId } = req.body;
    const data = readData();
    const deliveries = readDeliveries();

    const delivery = deliveries.find(d => d.orderId === orderId);

    if (!delivery) {
        return res.status(404).json({ error: "Entrega não encontrada." });
    }

    if (delivery.status === "ENTREGUE") {
        return res.status(400).json({ error: "Este pedido já teve baixa realizada!" });
    }

    const deliveredAccounts = [];

    for (const item of delivery.items) {
        for (let i = 0; i < item.qty; i++) {
            const idx = data.stock.findIndex(s => Number(s.productId) === Number(item.id) && !s.sold);
            if (idx !== -1) {
                data.stock[idx].sold = true;
                deliveredAccounts.push({
                    productName: item.name,
                    credentials: data.stock[idx].credentials
                });
            } else {
                deliveredAccounts.push({
                    productName: item.name,
                    credentials: "ERRO: Estoque insuficiente no momento da baixa!"
                });
            }
        }
    }

    delivery.status = "ENTREGUE";
    delivery.deliveredCredentials = deliveredAccounts;
    delivery.deliveredAt = new Date().toLocaleString("pt-BR");

    writeData(data);
    writeDeliveries(deliveries);

    res.json({
        success: true,
        message: `Baixa dada no pedido ${orderId}!`,
        customerEmail: delivery.customerEmail,
        deliveredCredentials: deliveredAccounts
    });
});

app.listen(PORT, () => console.log(`RUAN GAME STORE rodando em http://localhost:${PORT}`));