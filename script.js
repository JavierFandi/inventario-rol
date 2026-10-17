// 1. Importar librerías de Firebase directamente (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, setDoc, increment } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 2. Configuración de Firebase
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
let uidActual = null; // Guarda el ID único del jugador logueado
let slotDestino = { r: 1, c: 1 };
let totalBronceActual = 0;
let itemSeleccionadoParaEdicion = null;
let fichasActuales = { Avar: 0 };
let listaItemsActuales = [];
let resolverDialogoActual = null;

// --- RUTAS PRIVADAS POR USUARIO EN FIRESTORE ---
function refColeccionInventario() {
    return collection(db, "usuarios", uidActual, "inventario");
}

function refDocInventario(itemId) {
    return doc(db, "usuarios", uidActual, "inventario", itemId);
}

function refDocConfig(documento) {
    return doc(db, "usuarios", uidActual, "config", documento);
}

// --- SISTEMA DE DIÁLOGOS PERSONALIZADOS ---

function cerrarDialogo(resultado = false) {
    const modal = document.getElementById('dialog-modal');
    const okBtn = document.getElementById('dialog-ok-btn');
    const cancelBtn = document.getElementById('dialog-cancel-btn');

    if (modal) modal.style.display = 'none';
    if (okBtn) okBtn.onclick = null;
    if (cancelBtn) cancelBtn.onclick = null;

    if (resolverDialogoActual) {
        const resolve = resolverDialogoActual;
        resolverDialogoActual = null;
        resolve(resultado);
    }
}

function mostrarDialogo({ titulo = "Aviso", mensaje = "", esConfirmacion = false, textoOk = "Aceptar" }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('dialog-modal');
        const titleEl = document.getElementById('dialog-title');
        const msgEl = document.getElementById('dialog-message');
        const okBtn = document.getElementById('dialog-ok-btn');
        const cancelBtn = document.getElementById('dialog-cancel-btn');

        if (!modal) {
            resolve(esConfirmacion ? confirm(mensaje) : (alert(mensaje), true));
            return;
        }

        resolverDialogoActual = resolve;

        titleEl.textContent = titulo;
        msgEl.textContent = mensaje;
        okBtn.textContent = textoOk;

        okBtn.className = esConfirmacion ? 'btn btn-danger' : 'btn btn-primary';
        cancelBtn.style.display = esConfirmacion ? 'inline-block' : 'none';

        okBtn.onclick = () => cerrarDialogo(true);
        cancelBtn.onclick = () => cerrarDialogo(false);

        modal.style.display = 'block';
        okBtn.focus();
    });
}

function mostrarAlerta(mensaje, titulo = "Aviso") {
    return mostrarDialogo({ titulo, mensaje, esConfirmacion: false, textoOk: "Aceptar" });
}

function mostrarConfirmacion(mensaje, titulo = "Confirmar") {
    return mostrarDialogo({ titulo, mensaje, esConfirmacion: true, textoOk: "Eliminar" });
}

// --- SISTEMA DE USUARIOS ---
onAuthStateChanged(auth, async (user) => {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');

    dibujarCuadriculaFondo();

    if (user) {
        uidActual = user.uid; // Asignamos el ID único de este jugador
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        userInfo.style.display = 'inline-block';
        userInfo.textContent = `Jugador: ${user.displayName}`;

        await cargarMonedas();
        await cargarInventario();
        await cargarFichas();
    } else {
        uidActual = null;
        loginBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        userInfo.style.display = 'none';

        document.querySelectorAll('.item').forEach(e => e.remove());
        listaItemsActuales = [];
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
        await mostrarAlerta("Error al iniciar sesión: " + error.message, "Error de Sesión");
    }
}

async function cerrarSesion() {
    try {
        await signOut(auth);
    } catch (error) {
        await mostrarAlerta("Error al cerrar sesión: " + error.message, "Error de Sesión");
    }
}

// --- CUADRÍCULA Y VALIDACIONES ---

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

function validarEspacioCompleto(r, c, w, h, tipo, idIgnorar = null) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
        return "El ancho y el alto deben ser números enteros mayores o iguales a 1.";
    }

    if (r + h - 1 > ROWS || c + w - 1 > COLS) {
        return "El ítem se sale de los límites del inventario.";
    }

    for (let fila = r; fila < r + h; fila++) {
        for (let col = c; col < c + w; col++) {
            let errorZona = validarColorZona(fila, col, tipo);
            if (errorZona) return errorZona;
        }
    }

    for (const otro of listaItemsActuales) {
        if (otro.id === idIgnorar) continue;

        const seSolapanFilas = r < (otro.r + otro.h) && (r + h) > otro.r;
        const seSolapanCols  = c < (otro.c + otro.w) && (c + w) > otro.c;

        if (seSolapanFilas && seSolapanCols) {
            return `El espacio choca con "${otro.nombre}".`;
        }
    }

    return null;
}

// --- CONEXIÓN FIREBASE: INVENTARIO POR USUARIO ---

function actualizarItemEnDOM(item) {
    const div = document.querySelector(`.item[data-id="${item.id}"]`);
    if (!div) return;

    div.textContent = item.nombre;

    let textoExtra = "";
    if (item.tipo === 'carcaj') {
        textoExtra = `${item.flechas} fl.`;
    } else if (item.estadistica) {
        textoExtra = `[${item.estadistica}]`;
    } else if (item.tipo === 'general' && (item.cantidad || 1) > 1) {
        textoExtra = `(x${item.cantidad})`;
    }

    if (textoExtra) {
        const span = document.createElement('span');
        span.textContent = textoExtra;
        div.appendChild(span);
    }

    div.style.gridRow = `${item.r} / span ${item.h}`;
    div.style.gridColumn = `${item.c} / span ${item.w}`;
}

async function cargarInventario() {
    if (!uidActual) return;
    const querySnapshot = await getDocs(refColeccionInventario());

    document.querySelectorAll('.item').forEach(e => e.remove());
    const grid = document.getElementById('inventory-grid');
    listaItemsActuales = [];

    querySnapshot.forEach((documento) => {
        let item = documento.data();
        item.id = documento.id;
        listaItemsActuales.push(item);

        let div = document.createElement('div');
        div.className = 'item';
        div.dataset.id = item.id;

        div.onclick = (e) => {
            e.stopPropagation();
            abrirInspectModal(item);
        };

        grid.appendChild(div);
        actualizarItemEnDOM(item);
    });
}

async function guardarItem() {
    if (!uidActual) return mostrarAlerta("Debes iniciar sesión primero.", "Sesión Requerida");

    const tipo = document.getElementById('item-type').value;
    const w = (tipo === 'carcaj') ? 2 : parseInt(document.getElementById('item-w').value, 10);
    const h = (tipo === 'carcaj') ? 1 : parseInt(document.getElementById('item-h').value, 10);

    let errorEspacio = validarEspacioCompleto(slotDestino.r, slotDestino.c, w, h, tipo);
    if (errorEspacio) return mostrarAlerta(errorEspacio, "Ubicación Inválida");

    let flechas = 0, tamano = null, estadistica = null, cantidad = null;
    if (tipo === 'carcaj') {
        tamano = document.getElementById('quiver-size').value;
        flechas = parseInt(document.getElementById('quiver-arrows').value, 10) || 0;
        let max = (tamano === 'chico') ? 10 : (tamano === 'mediano') ? 20 : 50;
        if (flechas < 0 || flechas > max) {
            return mostrarAlerta(`El carcaj ${tamano} solo puede llevar entre 0 y ${max} flechas.`, "Capacidad Excedida");
        }
    } else if (tipo === 'arma' || tipo === 'armadura') {
        estadistica = document.getElementById('item-stat').value.trim();
    } else if (tipo === 'general') {
        cantidad = parseInt(document.getElementById('general-quantity').value, 10) || 1;
        if (cantidad < 1) return mostrarAlerta("La cantidad inicial debe ser al menos 1.", "Cantidad Inválida");
    }

    const data = {
        nombre: document.getElementById('item-name').value.trim() || "Objeto Desconocido",
        tipo: tipo,
        w: w,
        h: h,
        r: slotDestino.r,
        c: slotDestino.c,
        estadistica: estadistica,
        tamano: tamano,
        flechas: flechas,
        cantidad: cantidad
    };

    try {
        await addDoc(refColeccionInventario(), data);
        cerrarModal();
        await cargarInventario();
    } catch (error) {
        await mostrarAlerta("Error de guardado en la nube: " + error.message, "Error");
    }
}

async function eliminarItemSeleccionado() {
    if (!uidActual || !itemSeleccionadoParaEdicion) return;
    const confirmar = await mostrarConfirmacion(
        `¿Seguro que quieres eliminar "${itemSeleccionadoParaEdicion.nombre}"?`,
        "Eliminar Ítem"
    );
    if (!confirmar) return;

    try {
        await deleteDoc(refDocInventario(itemSeleccionadoParaEdicion.id));
        cerrarInspectModal();
        await cargarInventario();
    } catch (error) {
        await mostrarAlerta("Error al eliminar: " + error.message, "Error");
    }
}

async function cambiarFlechas(cantidad) {
    let item = itemSeleccionadoParaEdicion;
    if (!uidActual || !item || item.tipo !== 'carcaj') return;

    let max = (item.tamano === 'chico') ? 10 : (item.tamano === 'mediano') ? 20 : 50;
    let nuevasFlechas = item.flechas + cantidad;
    if (nuevasFlechas < 0 || nuevasFlechas > max) return;

    item.flechas = nuevasFlechas;
    document.getElementById('inspect-arrows').textContent = nuevasFlechas;

    try {
        await updateDoc(refDocInventario(item.id), { flechas: nuevasFlechas });
        actualizarItemEnDOM(item);
    } catch (error) {
        await mostrarAlerta("Error actualizando flechas: " + error.message, "Error");
    }
}

// --- CONEXIÓN FIREBASE: MONEDAS POR USUARIO ---

async function cargarMonedas() {
    if (!uidActual) return;
    const docRef = refDocConfig("billetera");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        totalBronceActual = docSnap.data().total_bronce;
    } else {
        await setDoc(docRef, { total_bronce: 0 }); // Billetera inicial en 0 para nuevos jugadores
        totalBronceActual = 0;
    }
    actualizarUIMonedas();
}

async function procesarMonedas(operacion) {
    if (!uidActual) return mostrarAlerta("Debes iniciar sesión primero.", "Sesión Requerida");

    let oro = parseInt(document.getElementById('input-gold').value, 10) || 0;
    let plata = parseInt(document.getElementById('input-silver').value, 10) || 0;
    let bronce = parseInt(document.getElementById('input-bronze').value, 10) || 0;

    if (oro < 0 || plata < 0 || bronce < 0) {
        return mostrarAlerta("Ingresa números positivos.", "Cantidad Inválida");
    }

    let totalConvertido = (oro * 100) + (plata * 10) + bronce;
    if (totalConvertido === 0) return cerrarModalMonedas();

    if (operacion === 'restar' && totalConvertido > totalBronceActual) {
        return mostrarAlerta("Fondos insuficientes.", "Billetera");
    }

    const delta = (operacion === 'sumar') ? totalConvertido : -totalConvertido;

    try {
        await updateDoc(refDocConfig("billetera"), { total_bronce: increment(delta) });
        totalBronceActual += delta;
        actualizarUIMonedas();
        cerrarModalMonedas();
    } catch (e) {
        await mostrarAlerta("Error al guardar monedas: " + e.message, "Error");
    }
}

function actualizarUIMonedas() {
    document.getElementById('val-oro').textContent = Math.floor(totalBronceActual / 100);
    document.getElementById('val-plata').textContent = Math.floor((totalBronceActual % 100) / 10);
    document.getElementById('val-bronce').textContent = totalBronceActual % 10;
}

// --- CONEXIÓN FIREBASE: FICHAS POR USUARIO ---

async function cargarFichas() {
    if (!uidActual) return;
    const docRef = refDocConfig("fichas");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        fichasActuales = docSnap.data();
        if (fichasActuales.Avar === undefined) fichasActuales.Avar = 0;
    } else {
        await setDoc(docRef, { Avar: 0 });
        fichasActuales = { Avar: 0 };
    }
    actualizarUIFichas();
}

async function procesarFichas(operacion) {
    if (!uidActual) return mostrarAlerta("Debes iniciar sesión primero.", "Sesión Requerida");

    let cantidad = parseInt(document.getElementById('input-fichas-Avar').value, 10) || 0;

    if (cantidad < 0) return mostrarAlerta("Ingresa números positivos.", "Cantidad Inválida");
    if (cantidad === 0) return cerrarModalFichas();

    if (operacion === 'restar' && cantidad > fichasActuales.Avar) {
        return mostrarAlerta("Fichas insuficientes.", "Fichas Avar");
    }

    const delta = (operacion === 'sumar') ? cantidad : -cantidad;

    try {
        await updateDoc(refDocConfig("fichas"), { Avar: increment(delta) });
        fichasActuales.Avar += delta;
        actualizarUIFichas();
        cerrarModalFichas();
    } catch (e) {
        await mostrarAlerta("Error al guardar fichas: " + e.message, "Error");
    }
}

function actualizarUIFichas() {
    document.getElementById('val-fichas-Avar').textContent = fichasActuales.Avar;
}

function abrirModalFichas() {
    if (!uidActual) return mostrarAlerta("Inicia sesión para gestionar tus fichas.", "Sesión Requerida");
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
    const inputW = document.getElementById('item-w');
    const inputH = document.getElementById('item-h');

    contStats.style.display = 'none';
    contQuiver.style.display = 'none';
    if (contGeneral) contGeneral.style.display = 'none';

    inputW.disabled = false;
    inputH.disabled = false;

    if (tipo === 'arma') {
        contStats.style.display = 'block';
        document.getElementById('extra-stat-label').textContent = 'Daño del Arma:';
    } else if (tipo === 'armadura') {
        contStats.style.display = 'block';
        document.getElementById('extra-stat-label').textContent = 'Clase de Armadura (CA):';
    } else if (tipo === 'carcaj') {
        contQuiver.style.display = 'block';
        inputW.value = '2';
        inputH.value = '1';
        inputW.disabled = true;
        inputH.disabled = true;
    } else if (tipo === 'general') {
        if (contGeneral) contGeneral.style.display = 'block';
    }
}

function abrirModal(r, c) {
    if (!uidActual) return mostrarAlerta("Inicia sesión con Google para agregar objetos a tu inventario.", "Sesión Requerida");
    slotDestino = { r, c };
    document.getElementById('item-name').value = '';
    document.getElementById('item-type').value = 'general';
    document.getElementById('item-w').value = '1';
    document.getElementById('item-h').value = '1';
    document.getElementById('item-stat').value = '';
    document.getElementById('quiver-size').value = 'chico';
    document.getElementById('quiver-arrows').value = '0';
    if (document.getElementById('general-quantity')) document.getElementById('general-quantity').value = '1';
    mostrarCamposEspeciales();
    document.getElementById('add-modal').style.display = 'block';
}

function cerrarModal() { document.getElementById('add-modal').style.display = 'none'; }

function abrirModalMonedas() {
    if (!uidActual) return mostrarAlerta("Inicia sesión para gestionar tu billetera.", "Sesión Requerida");
    document.getElementById('input-gold').value = '0';
    document.getElementById('input-silver').value = '0';
    document.getElementById('input-bronze').value = '0';
    document.getElementById('coin-modal').style.display = 'block';
}

function cerrarModalMonedas() { document.getElementById('coin-modal').style.display = 'none'; }

function abrirInspectModal(item) {
    itemSeleccionadoParaEdicion = item;
    document.getElementById('inspect-name').textContent = item.nombre;
    document.getElementById('inspect-type').textContent = item.tipo;

    const statBox = document.getElementById('inspect-stat-box');
    if (item.estadistica) {
        statBox.style.display = 'block';
        document.getElementById('inspect-stat').textContent = item.estadistica;
    } else {
        statBox.style.display = 'none';
    }

    const quiverBox = document.getElementById('inspect-quiver-box');
    if (item.tipo === 'carcaj') {
        quiverBox.style.display = 'block';
        document.getElementById('inspect-arrows').textContent = item.flechas;
        document.getElementById('inspect-max-arrows').textContent = (item.tamano === 'chico') ? 10 : (item.tamano === 'mediano') ? 20 : 50;
    } else {
        quiverBox.style.display = 'none';
    }

    const generalBox = document.getElementById('inspect-general-box');
    if (item.tipo === 'general') {
        generalBox.style.display = 'block';
        document.getElementById('inspect-cantidad').textContent = item.cantidad || 1;
    } else {
        generalBox.style.display = 'none';
    }

    document.getElementById('inspect-modal').style.display = 'block';
}

function cerrarInspectModal() {
    document.getElementById('inspect-modal').style.display = 'none';
    itemSeleccionadoParaEdicion = null;
}

// --- SISTEMA DE CANTIDADES Y EDICIÓN ---

async function cambiarCantidad(cambio) {
    let item = itemSeleccionadoParaEdicion;
    if (!uidActual || !item || item.tipo !== 'general') return;

    let nuevaCantidad = (item.cantidad || 1) + cambio;
    if (nuevaCantidad < 1) return;

    item.cantidad = nuevaCantidad;
    document.getElementById('inspect-cantidad').textContent = nuevaCantidad;

    try {
        await updateDoc(refDocInventario(item.id), { cantidad: nuevaCantidad });
        actualizarItemEnDOM(item);
    } catch (error) {
        await mostrarAlerta("Error actualizando cantidad: " + error.message, "Error");
    }
}

function abrirModalEdicion() {
    if (!itemSeleccionadoParaEdicion) return;
    let item = itemSeleccionadoParaEdicion;

    const inputEditW = document.getElementById('edit-item-w');
    const inputEditH = document.getElementById('edit-item-h');

    document.getElementById('edit-item-name').value = item.nombre;
    inputEditW.value = (item.tipo === 'carcaj') ? 2 : item.w;
    inputEditH.value = (item.tipo === 'carcaj') ? 1 : item.h;

    inputEditW.disabled = (item.tipo === 'carcaj');
    inputEditH.disabled = (item.tipo === 'carcaj');

    const contStats = document.getElementById('edit-extra-stats-container');
    if (item.tipo === 'arma' || item.tipo === 'armadura') {
        contStats.style.display = 'block';
        document.getElementById('edit-extra-stat-label').textContent = item.tipo === 'arma' ? 'Daño del Arma:' : 'Clase de Armadura (CA):';
        document.getElementById('edit-item-stat').value = item.estadistica || '';
    } else {
        contStats.style.display = 'none';
    }

    document.getElementById('inspect-modal').style.display = 'none';
    document.getElementById('edit-modal').style.display = 'block';
}

function cerrarModalEdicion() {
    document.getElementById('edit-modal').style.display = 'none';
    itemSeleccionadoParaEdicion = null;
}

async function guardarEdicion() {
    let item = itemSeleccionadoParaEdicion;
    if (!uidActual || !item) return;

    let nuevoNombre = document.getElementById('edit-item-name').value.trim() || "Objeto Desconocido";
    let nuevoW = (item.tipo === 'carcaj') ? 2 : parseInt(document.getElementById('edit-item-w').value, 10);
    let nuevoH = (item.tipo === 'carcaj') ? 1 : parseInt(document.getElementById('edit-item-h').value, 10);

    let errorEspacio = validarEspacioCompleto(item.r, item.c, nuevoW, nuevoH, item.tipo, item.id);
    if (errorEspacio) return mostrarAlerta(errorEspacio, "Ubicación Inválida");

    let nuevaEstadistica = item.estadistica;
    if (item.tipo === 'arma' || item.tipo === 'armadura') {
        nuevaEstadistica = document.getElementById('edit-item-stat').value.trim();
    }

    try {
        await updateDoc(refDocInventario(item.id), {
            nombre: nuevoNombre,
            w: nuevoW,
            h: nuevoH,
            estadistica: nuevaEstadistica
        });

        item.nombre = nuevoNombre;
        item.w = nuevoW;
        item.h = nuevoH;
        item.estadistica = nuevaEstadistica;

        actualizarItemEnDOM(item);
        cerrarModalEdicion();
    } catch (error) {
        await mostrarAlerta("Error al actualizar: " + error.message, "Error");
    }
}

// --- CIERRE DE MODALES (TECLA ESCAPE Y CLIC AFUERA) ---

function obtenerModalAbierto() {
    const dialogModal = document.getElementById('dialog-modal');
    if (dialogModal && dialogModal.style.display === 'block') {
        return dialogModal;
    }

    return Array.from(document.querySelectorAll('.modal'))
        .find(m => m.style.display === 'block');
}

function cerrarModalActivo() {
    const modal = obtenerModalAbierto();
    if (!modal) return;
    if (modal.id === 'dialog-modal') cerrarDialogo(false);
    else if (modal.id === 'inspect-modal') cerrarInspectModal();
    else if (modal.id === 'edit-modal') cerrarModalEdicion();
    else modal.style.display = 'none';
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarModalActivo();
});

document.addEventListener('pointerdown', (e) => {
    const modal = obtenerModalAbierto();
    if (modal && !modal.contains(e.target)) {
        e.stopPropagation();
        e.preventDefault();
        cerrarModalActivo();
    }
}, true);

// 5. Exponer las funciones a la ventana global
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
window.abrirModalEdicion = abrirModalEdicion;
window.cerrarModalEdicion = cerrarModalEdicion;
window.guardarEdicion = guardarEdicion;
window.iniciarSesion = iniciarSesion;
window.cerrarSesion = cerrarSesion;
window.abrirModalFichas = abrirModalFichas;
window.cerrarModalFichas = cerrarModalFichas;
window.procesarFichas = procesarFichas;