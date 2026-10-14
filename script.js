// 1. Importar librerías de Firebase directamente (CDN)
// 1. Importar librerías de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, setDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 2. PEGA AQUÍ TU CONFIGURACIÓN DE FIREBASE (Reemplaza este bloque)
const firebaseConfig = {
  apiKey: "AIzaSyC1KwQiYN7B1Ej35AzmqkqdHuyPju1dTzs",
  authDomain: "inventario-rpg-7f98a.firebaseapp.com",
  projectId: "inventario-rpg-7f98a",
  storageBucket: "inventario-rpg-7f98a.firebasestorage.app",
  messagingSenderId: "224151251575",
  appId: "1:224151251575:web:eba97e7b032e0af8e8f472",
  measurementId: "G-23K05PE3QM"
};

// 3. Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// --- VARIABLES GLOBALES Y CONFIGURACIÓN ---
const ROWS = 8;
const COLS = 9;
let slotDestino = { r: 1, c: 1 };
let totalBronceActual = 0;
let itemSeleccionadoParaEdicion = null;
let fichasActuales = { Avar: 0 }; // Objeto preparado para más tipos de fichas
let listaItemsActuales = [];

// --- SISTEMA DE USUARIOS ---
onAuthStateChanged(auth, async (user) => {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');

    dibujarCuadriculaFondo(); 

    if (user) {
        // Usuario logueado normal (sin lista blanca)
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        userInfo.style.display = 'inline-block';
        userInfo.innerText = `Jugador: ${user.displayName}`;
        
        await cargarMonedas();
        await cargarInventario();
        await cargarFichas(); // <--- NUEVO
    } else {
        loginBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        userInfo.style.display = 'none';
        
        document.querySelectorAll('.item').forEach(e => e.remove());
        listaItemsActuales = []; // <--- LIMPIAR MEMORIA AL SALIR
        totalBronceActual = 0;
        fichasActuales = { Avar: 0 };
        actualizarUIMonedas();
        actualizarUIFichas();
    }
});

async function iniciarSesion() {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        alert("Error al iniciar sesión: " + error.message);
    }
}

async function cerrarSesion() {
    try {
        await signOut(auth);
    } catch (error) {
        alert("Error al cerrar sesión: " + error.message);
    }
}

function dibujarCuadriculaFondo() {
    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = ''; 
    for (let r = 1; r <= ROWS; r++) {
        for (let c = 1; c <= COLS; c++) {
            let slot = document.createElement('div');
            slot.className = 'slot ' + obtenerColorSlot(r, c);
            slot.style.gridRow = r;
            slot.style.gridColumn = c;
            slot.onclick = () => abrirModal(r, c);
            grid.appendChild(slot);
        }
    }
}

function obtenerColorSlot(r, c) {
    if (r <= 3) return 'bg-red';
    if (r === 4 || r === 5) return (c <= 5) ? 'bg-red' : 'bg-cyan';
    if (r >= 6) return (c <= 5) ? 'bg-green' : 'bg-cyan';
}

function validarColorZona(r, c, tipo) {
    let colorZ = obtenerColorSlot(r, c);
    if (colorZ === 'bg-red' && tipo !== 'general') return "La zona ROJA es solo para ítems Generales.";
    if (colorZ === 'bg-green' && tipo !== 'arma' && tipo !== 'carcaj') return "La zona VERDE es solo para Armas y Carcajs.";
    if (colorZ === 'bg-cyan' && tipo !== 'armadura') return "La zona CELESTE es solo para Armaduras.";
    return null;
}

// --- CONEXIÓN FIREBASE: INVENTARIO ---

async function cargarInventario() {
    const querySnapshot = await getDocs(collection(db, "inventario"));
    
    document.querySelectorAll('.item').forEach(e => e.remove());
    const grid = document.getElementById('inventory-grid');
    listaItemsActuales = []; 
    
    querySnapshot.forEach((documento) => {
        let item = documento.data();
        item.id = documento.id; 
        listaItemsActuales.push(item); 
        
        let div = document.createElement('div');
        div.className = 'item';
        div.dataset.id = item.id; // <--- CLAVE: Le asignamos su ID al elemento HTML
        
        div.onclick = (e) => {
            e.stopPropagation(); 
            abrirInspectModal(item);
        };
        
        grid.appendChild(div);
        
        // Pintamos su texto y tamaño usando la nueva función
        actualizarItemEnDOM(item); 
    });
}

function actualizarItemEnDOM(item) {
    // 1. Buscamos en la cuadrícula únicamente el div de este ítem por su ID
    const div = document.querySelector(`.item[data-id="${item.id}"]`);
    if (!div) return;

    // 2. Escribimos el nombre de forma segura (esto limpia también el contenido anterior del div)
    div.textContent = item.nombre;

    // 3. Calculamos si debe mostrar flechas, estadística o cantidad apilada
    let textoExtra = "";
    if (item.tipo === 'carcaj') {
        textoExtra = `${item.flechas} fl.`;
    } else if (item.estadistica) {
        textoExtra = `[${item.estadistica}]`;
    } else if (item.tipo === 'general' && (item.cantidad || 1) > 1) {
        textoExtra = `(x${item.cantidad})`;
    }

    // 4. Si tiene texto extra, creamos el <span> que tu CSS estiliza en dorado
    if (textoExtra) {
        const span = document.createElement('span');
        span.textContent = textoExtra;
        div.appendChild(span);
    }

    // 5. Actualizamos su posición y tamaño (útil si cambiaste ancho o alto al editar)
    div.style.gridRow = `${item.r} / span ${item.h}`;
    div.style.gridColumn = `${item.c} / span ${item.w}`;
}

async function guardarItem() {
    const tipo = document.getElementById('item-type').value;
    const w = parseInt(document.getElementById('item-w').value);
    const h = parseInt(document.getElementById('item-h').value);

    // Reemplaza a validarColorZona: revisa límites, colores de todas las celdas y colisiones
    let error = validarEspacioCompleto(slotDestino.r, slotDestino.c, w, h, tipo);
    if (error) return alert(error);

    let flechas = 0, tamano = null, estadistica = null, cantidad = null; 
    if (tipo === 'carcaj') {
        tamano = document.getElementById('quiver-size').value;
        flechas = parseInt(document.getElementById('quiver-arrows').value) || 0;
        let max = (tamano === 'chico') ? 10 : (tamano === 'mediano') ? 20 : 50;
        if (flechas > max) return alert(`El carcaj ${tamano} solo puede llevar ${max} flechas.`);
    } else if (tipo === 'arma' || tipo === 'armadura') {
        estadistica = document.getElementById('item-stat').value;
    } else if (tipo === 'general') {
        cantidad = parseInt(document.getElementById('general-quantity').value) || 1;
    }

    const data = {
        nombre: document.getElementById('item-name').value || "Objeto Desconocido",
        tipo: tipo,
        w: parseInt(document.getElementById('item-w').value),
        h: parseInt(document.getElementById('item-h').value),
        r: slotDestino.r,
        c: slotDestino.c,
        estadistica: estadistica,
        tamano: tamano,
        flechas: flechas,
        cantidad: cantidad
    };

    try {
        await addDoc(collection(db, "inventario"), data);
        cerrarModal();
        cargarInventario(); 
    } catch (error) {
        alert("Error de guardado en la nube: " + error.message);
    }
}

async function eliminarItemSeleccionado() {
    if (!confirm(`¿Seguro que quieres eliminar ${itemSeleccionadoParaEdicion.nombre}?`)) return;
    try {
        await deleteDoc(doc(db, "inventario", itemSeleccionadoParaEdicion.id));
        cerrarInspectModal();
        cargarInventario();
    } catch (error) {
        alert("Error al eliminar: " + error.message);
    }
}

async function cambiarFlechas(cantidad) {
    let item = itemSeleccionadoParaEdicion;
    let max = (item.tamano === 'chico') ? 10 : (item.tamano === 'mediano') ? 20 : 50;
    let nuevasFlechas = item.flechas + cantidad;
    if (nuevasFlechas < 0 || nuevasFlechas > max) return; 
    
    item.flechas = nuevasFlechas;
    document.getElementById('inspect-arrows').textContent = nuevasFlechas;

    try {
        await updateDoc(doc(db, "inventario", item.id), { flechas: nuevasFlechas });
        actualizarItemEnDOM(item); // <--- Reemplaza a cargarInventario()
    } catch (error) {
        alert("Error actualizando flechas: " + error.message);
    }
}

// --- CONEXIÓN FIREBASE: MONEDAS ---

async function cargarMonedas() {
    const docRef = doc(db, "config", "billetera");
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
        totalBronceActual = docSnap.data().total_bronce;
    } else {
        await setDoc(docRef, { total_bronce: 4300 }); // Crea la billetera si no existe
        totalBronceActual = 4300;
    }
    actualizarUIMonedas();
}

async function procesarMonedas(operacion) {
    let oro = parseInt(document.getElementById('input-gold').value) || 0;
    let plata = parseInt(document.getElementById('input-silver').value) || 0;
    let bronce = parseInt(document.getElementById('input-bronze').value) || 0;

    if (oro < 0 || plata < 0 || bronce < 0) return alert("Ingresa números positivos.");
    
    let totalConvertido = (oro * 100) + (plata * 10) + bronce;
    if (totalConvertido === 0) return cerrarModalMonedas();

    if (operacion === 'sumar'){
        const delta = totalConvertido;
    } 
    else if (operacion === 'restar') {
        if (totalConvertido > totalBronceActual) return alert("Fondos insuficientes.");
        const delta = -totalConvertido;
    }

    try {
        await updateDoc(doc(db, "config", "billetera"), { total_bronce: increment(delta) });
        actualizarUIMonedas();
        cerrarModalMonedas();
    } catch (e) {
        alert("Error al guardar monedas: " + e.message);
    }
}

function actualizarUIMonedas() {
    document.getElementById('val-oro').innerText = Math.floor(totalBronceActual / 100);
    document.getElementById('val-plata').innerText = Math.floor((totalBronceActual % 100) / 10);
    document.getElementById('val-bronce').innerText = totalBronceActual % 10;
}

// --- CONEXIÓN FIREBASE: FICHAS ---

async function cargarFichas() {
    const docRef = doc(db, "config", "fichas");
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
        fichasActuales = docSnap.data();
        if (fichasActuales.Avar === undefined) fichasActuales.Avar = 0;
    } else {
        await setDoc(docRef, { Avar: 0 }); // Crea el documento de fichas
        fichasActuales = { Avar: 0 };
    }
    actualizarUIFichas();
}

async function procesarFichas(operacion) {
    let cantidad = parseInt(document.getElementById('input-fichas-Avar').value) || 0;

    if (cantidad < 0) return alert("Ingresa números positivos.");
    if (cantidad === 0) return cerrarModalFichas();

    if (operacion === 'sumar') {
        fichasActuales.Avar += cantidad;
    } else if (operacion === 'restar') {
        if (cantidad > fichasActuales.Avar) return alert("Fichas insuficientes.");
        fichasActuales.Avar -= cantidad;
    }

    try {
        await updateDoc(doc(db, "config", "fichas"), { Avar: fichasActuales.Avar });
        actualizarUIFichas();
        cerrarModalFichas();
    } catch (e) {
        alert("Error al guardar fichas: " + e.message);
    }
}

function actualizarUIFichas() {
    document.getElementById('val-fichas-Avar').innerText = fichasActuales.Avar;
}

// LÓGICA DE INTERFAZ FICHAS
function abrirModalFichas() {
    document.getElementById('input-fichas-Avar').value = '0';
    document.getElementById('token-modal').style.display = 'block';
}

function cerrarModalFichas() { 
    document.getElementById('token-modal').style.display = 'none'; 
}

// --- LÓGICA DE INTERFAZ (MODALES) ---

function mostrarCamposEspeciales() {
    const tipo = document.getElementById('item-type').value;
    const contStats = document.getElementById('extra-stats-container');
    const contQuiver = document.getElementById('quiver-container');
    const contGeneral = document.getElementById('general-quantity-container');
    
    contStats.style.display = 'none';
    contQuiver.style.display = 'none';
    if(contGeneral) contGeneral.style.display = 'none';

    if (tipo === 'arma') {
        contStats.style.display = 'block';
        document.getElementById('extra-stat-label').innerText = 'Daño del Arma:';
    } else if (tipo === 'armadura') {
        contStats.style.display = 'block';
        document.getElementById('extra-stat-label').innerText = 'Clase de Armadura (CA):';
    } else if (tipo === 'carcaj') {
        contQuiver.style.display = 'block';
    } else if (tipo === 'general') {
        if(contGeneral) contGeneral.style.display = 'block';
    }
}

function abrirModal(r, c) {
    slotDestino = { r, c };
    document.getElementById('item-name').value = '';
    document.getElementById('item-type').value = 'general';
    document.getElementById('item-w').value = '1';
    document.getElementById('item-h').value = '1';
    document.getElementById('item-stat').value = '';
    document.getElementById('quiver-size').value = 'chico';
    document.getElementById('quiver-arrows').value = '0';
    if(document.getElementById('general-quantity')) document.getElementById('general-quantity').value = '1';
    mostrarCamposEspeciales(); 
    document.getElementById('add-modal').style.display = 'block';
}

function cerrarModal() { document.getElementById('add-modal').style.display = 'none'; }
function abrirModalMonedas() {
    document.getElementById('input-gold').value = '0';
    document.getElementById('input-silver').value = '0';
    document.getElementById('input-bronze').value = '0';
    document.getElementById('coin-modal').style.display = 'block';
}
function cerrarModalMonedas() { document.getElementById('coin-modal').style.display = 'none'; }

function abrirInspectModal(item) {
    itemSeleccionadoParaEdicion = item;
    document.getElementById('inspect-name').innerText = item.nombre;
    document.getElementById('inspect-type').innerText = item.tipo;
    
    const statBox = document.getElementById('inspect-stat-box');
    if (item.estadistica) {
        statBox.style.display = 'block';
        document.getElementById('inspect-stat').innerText = item.estadistica;
    } else statBox.style.display = 'none';

    const quiverBox = document.getElementById('inspect-quiver-box');
    if (item.tipo === 'carcaj') {
        quiverBox.style.display = 'block';
        document.getElementById('inspect-arrows').innerText = item.flechas;
        document.getElementById('inspect-max-arrows').innerText = (item.tamano === 'chico') ? 10 : (item.tamano === 'mediano') ? 20 : 50;
    } else quiverBox.style.display = 'none';

    // NUEVO: Control de caja para Cantidad General
    const generalBox = document.getElementById('inspect-general-box');
    if (item.tipo === 'general') {
        generalBox.style.display = 'block';
        document.getElementById('inspect-cantidad').innerText = item.cantidad || 1;
    } else {
        generalBox.style.display = 'none';
    }

    document.getElementById('inspect-modal').style.display = 'block';
}

function cerrarInspectModal() {
    document.getElementById('inspect-modal').style.display = 'none';
    itemSeleccionadoParaEdicion = null;
}

// --- NUEVO: SISTEMA DE CANTIDADES Y EDICIÓN ---

async function cambiarCantidad(cambio) {
    let item = itemSeleccionadoParaEdicion;
    if (item.tipo !== 'general') return;
    
    let nuevaCantidad = (item.cantidad || 1) + cambio;
    if (nuevaCantidad < 1) return; 
    
    item.cantidad = nuevaCantidad;
    document.getElementById('inspect-cantidad').textContent = nuevaCantidad;

    try {
        await updateDoc(doc(db, "inventario", item.id), { cantidad: nuevaCantidad });
        actualizarItemEnDOM(item); // <--- Reemplaza a cargarInventario()
    } catch (error) {
        alert("Error actualizando cantidad: " + error.message);
    }
}

function abrirModalEdicion() {
    if (!itemSeleccionadoParaEdicion) return;
    let item = itemSeleccionadoParaEdicion;
    
    document.getElementById('edit-item-name').value = item.nombre;
    document.getElementById('edit-item-w').value = item.w;
    document.getElementById('edit-item-h').value = item.h;
    
    const contStats = document.getElementById('edit-extra-stats-container');
    if (item.tipo === 'arma' || item.tipo === 'armadura') {
        contStats.style.display = 'block';
        document.getElementById('edit-extra-stat-label').innerText = item.tipo === 'arma' ? 'Daño del Arma:' : 'Clase de Armadura (CA):';
        document.getElementById('edit-item-stat').value = item.estadistica || '';
    } else {
        contStats.style.display = 'none';
    }
    
    // ERROR CORREGIDO: Ocultamos el modal a mano en lugar de llamar a cerrarInspectModal()
    document.getElementById('inspect-modal').style.display = 'none';
    document.getElementById('edit-modal').style.display = 'block';
}

function cerrarModalEdicion() {
    document.getElementById('edit-modal').style.display = 'none';
}

async function guardarEdicion() {
    let item = itemSeleccionadoParaEdicion;
    if (!item) return;
    
    let nuevoNombre = document.getElementById('edit-item-name').value.trim() || "Objeto Desconocido";
    let nuevoW = parseInt(document.getElementById('edit-item-w').value);
    let nuevoH = parseInt(document.getElementById('edit-item-h').value);
    
    // Si ya agregaste la validación de espacio completo, va aquí:
    let error = validarEspacioCompleto(item.r, item.c, nuevoW, nuevoH, item.tipo, item.id);
    if (error) return alert(error);

    let nuevaEstadistica = item.estadistica;
    if (item.tipo === 'arma' || item.tipo === 'armadura') {
        nuevaEstadistica = document.getElementById('edit-item-stat').value;
    }

    try {
        await updateDoc(doc(db, "inventario", item.id), { 
            nombre: nuevoNombre,
            w: nuevoW,
            h: nuevoH,
            estadistica: nuevaEstadistica
        });

        // Actualizamos el objeto en la memoria local
        item.nombre = nuevoNombre;
        item.w = nuevoW;
        item.h = nuevoH;
        item.estadistica = nuevaEstadistica;

        // Actualizamos solo este ítem en la cuadrícula y cerramos el modal
        actualizarItemEnDOM(item); // <--- Reemplaza a cargarInventario()
        cerrarModalEdicion();
    } catch (error) {
        alert("Error al actualizar: " + error.message);
    }
}

function validarEspacioCompleto(r, c, w, h, tipo, idIgnorar = null) {
    // 1. Validar que sean enteros positivos
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
        return "El ancho y el alto deben ser números enteros mayores o iguales a 1.";
    }

    // 2. Validar que no se salga de la cuadrícula (8x9)
    if (r + h - 1 > ROWS || c + w - 1 > COLS) {
        return "El ítem se sale de los límites del inventario.";
    }

    // 3. Validar que TODAS las casillas que ocupa pertenezcan a la zona correcta
    for (let fila = r; fila < r + h; fila++) {
        for (let col = c; col < c + w; col++) {
            let errorZona = validarColorZona(fila, col, tipo);
            if (errorZona) return errorZona;
        }
    }

    // 4. Validar que no pise a otro ítem existente
    for (const otro of listaItemsActuales) {
        if (otro.id === idIgnorar) continue; // Ignorarse a sí mismo al editar

        const seSolapanFilas = r < (otro.r + otro.h) && (r + h) > otro.r;
        const seSolapanCols  = c < (otro.c + otro.w) && (c + w) > otro.c;

        if (seSolapanFilas && seSolapanCols) {
            return `El espacio choca con "${otro.nombre}".`;
        }
    }

    return null; // Todo válido
}

function obtenerModalAbierto() {
    return Array.from(document.querySelectorAll('.modal'))
        .find(m => m.style.display === 'block');
}

function cerrarModalActivo() {
    const modal = obtenerModalAbierto();
    if (!modal) return;
    if (modal.id === 'inspect-modal') cerrarInspectModal();
    else if (modal.id === 'edit-modal') cerrarModalEdicion();
    else modal.style.display = 'none';
}

// Cerrar con tecla Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarModalActivo();
});

// Cerrar al hacer clic fuera del modal (y evitar clics fantasma en la cuadrícula)
document.addEventListener('pointerdown', (e) => {
    const modal = obtenerModalAbierto();
    if (modal && !modal.contains(e.target)) {
        e.stopPropagation();
        e.preventDefault();
        cerrarModalActivo();
    }
}, true); // true = fase de captura, intercepta el clic antes de que llegue al slot

// 5. Exponer las funciones a la ventana global (necesario por usar type="module")
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.guardarItem = guardarItem;
window.mostrarCamposEspeciales = mostrarCamposEspeciales;
window.abrirModalMonedas = abrirModalMonedas;
window.cerrarModalMonedas = cerrarModalMonedas;
window.procesarMonedas = procesarMonedas;
window.abrirInspectModal = abrirInspectModal;
window.cerrarInspectModal = cerrarInspectModal;
window.eliminarItemSeleccionado = eliminarItemSeleccionado;
window.cambiarFlechas = cambiarFlechas;
window.cambiarCantidad = cambiarCantidad;

window.iniciarSesion = iniciarSesion;
window.cerrarSesion = cerrarSesion;

window.abrirModalFichas = abrirModalFichas;
window.cerrarModalFichas = cerrarModalFichas;
window.procesarFichas = procesarFichas;

window.cambiarCantidad = cambiarCantidad;
window.abrirModalEdicion = abrirModalEdicion;
window.cerrarModalEdicion = cerrarModalEdicion;
window.guardarEdicion = guardarEdicion;