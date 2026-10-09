// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./inventario.db', (err) => {
    if (err) console.error(err.message);
    console.log('Conectado a la base de datos SQLite.');
});

db.serialize(() => {
    
    db.run(`CREATE TABLE IF NOT EXISTS ItemCatalogo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT, tipo TEXT, w INTEGER, h INTEGER,
        estadistica TEXT, tamano TEXT
    )`);
    
    
    db.run(`CREATE TABLE IF NOT EXISTS Inventario (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER, r INTEGER, c INTEGER,
        flechas INTEGER DEFAULT 0,
        FOREIGN KEY(item_id) REFERENCES ItemCatalogo(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS Monedero (id INTEGER PRIMARY KEY, total_bronce INTEGER DEFAULT 0)`);
    db.run(`INSERT OR IGNORE INTO Monedero (id, total_bronce) VALUES (1, 4300)`);
});

app.get('/api/inventario', (req, res) => {
    const query = `
        SELECT i.id as inv_id, i.r, i.c, i.flechas, c.id as cat_id, c.nombre, c.tipo, c.w, c.h, c.estadistica, c.tamano 
        FROM Inventario i JOIN ItemCatalogo c ON i.item_id = c.id
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/inventario', (req, res) => {
    const { nombre, tipo, w, h, r, c, estadistica, tamano, flechas } = req.body;
    db.run(`INSERT INTO ItemCatalogo (nombre, tipo, w, h, estadistica, tamano) VALUES (?, ?, ?, ?, ?, ?)`, 
        [nombre, tipo, w, h, estadistica, tamano], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run(`INSERT INTO Inventario (item_id, r, c, flechas) VALUES (?, ?, ?, ?)`, 
            [this.lastID, r, c, flechas], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});


app.delete('/api/inventario/:id', (req, res) => {
    db.run(`DELETE FROM Inventario WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});


app.put('/api/inventario/:id', (req, res) => {
    const { flechas } = req.body;
    db.run(`UPDATE Inventario SET flechas = ? WHERE id = ?`, [flechas, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});


app.get('/api/monedas', (req, res) => { /* ... igual ... */
    db.get(`SELECT total_bronce FROM Monedero WHERE id = 1`, [], (err, row) => {
        res.json({ total_bronce: row ? row.total_bronce : 0 });
    });
});

app.post('/api/monedas', (req, res) => { /* ... igual ... */
    const { total_bronce } = req.body;
    db.run(`UPDATE Monedero SET total_bronce = ? WHERE id = 1`, [total_bronce], function(err) {
        res.json({ success: true });
    });
});

app.listen(3000, () => { console.log('Servidor corriendo en http://localhost:3000'); });