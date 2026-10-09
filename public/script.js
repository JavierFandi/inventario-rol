const ROWS = 8;
const COLS = 9;
let slotDestino = { r: 1, c: 1 };
let totalBronceActual = 0;

// Inicializa al cargar la página
window.onload = async () => {
    dibujarCuadriculaFondo();
    await cargarMonedas();
    await cargarInventario();
};

function dibujarCuadriculaFondo() {
    const grid = document.getElementById('inventory-grid');
    // IMPORTANTE: Limpiamos el grid antes de dibujarlo para que no se dupliquen al recargar
    grid.innerHTML = ''; 

    for (let r = 1; r <= ROWS; r++) {
        for (let c = 1; c <= COLS; c++) {
            let slot = document.createElement('div');
            slot.className = 'slot ' + obtenerColorSlot(r, c);
            
            // ESTAS DOS LÍNEAS SON LA CLAVE: Fuerzan al fondo a quedarse en su lugar
            slot.style.gridRow = r;
            slot.style.gridColumn = c;
            
            slot.onclick = () => abrirModal(r, c);
            grid.appendChild(slot);
        }
    }
}

// Distribución de colores basada en tu imagen
function obtenerColorSlot(r, c) {
    if (r <= 3) return 'bg-red';
    if (r === 4 || r === 5) return (c <= 5) ? 'bg-red' : 'bg-cyan';
    if (r >= 6) return (c <= 5) ? 'bg-green' : 'bg-cyan';
}

// --- LOGICA DE BASE DE DATOS ---

async function cargarInventario() {
    const response = await fetch('/api/inventario');
    const items = await response.json();
    
    document.querySelectorAll('.item').forEach(e => e.remove());
    const grid = document.getElementById('inventory-grid');
    
    items.forEach(item => {
        let div = document.createElement('div');
        div.className = 'item';
        
        // Si es carcaj, mostrar la cantidad de flechas visualmente
        let textoExtra = "";
        if(item.tipo === 'carcaj') textoExtra = `<br><span style="color:#ff0">${item.flechas} fl.</span>`;
        if(item.estadistica) textoExtra = `<br><span style="color:#d4a373">[${item.estadistica}]</span>`;
        
        div.innerHTML = `${item.nombre} ${textoExtra}`;
        div.style.gridRow = `${item.r} / span ${item.h}`;
        div.style.gridColumn = `${item.c} / span ${item.w}`;
        
        // NUEVO: Al hacer clic en un ítem, abrir inspección
        div.onclick = (e) => {
            e.stopPropagation(); // <-- ESTO EVITA QUE SE ABRA EL MENÚ DE AÑADIR
            abrirInspectModal(item);
        };
        
        grid.appendChild(div);
    });
}

// Actualiza tu función abrirModal existente por esta:
function abrirModal(r, c) {
    slotDestino = { r, c };
    
    // Reiniciar los campos básicos
    document.getElementById('item-name').value = '';
    document.getElementById('item-type').value = 'general';
    document.getElementById('item-w').value = '1';
    document.getElementById('item-h').value = '1';
    
    // LA SOLUCIÓN: Limpiar el campo de estadística y los valores del carcaj
    document.getElementById('item-stat').value = '';
    document.getElementById('quiver-size').value = 'chico';
    document.getElementById('quiver-arrows').value = '0';
    
    // Forzar la actualización visual 
    mostrarCamposEspeciales(); 
    
    document.getElementById('add-modal').style.display = 'block';
}

function cerrarModal() {
    document.getElementById('add-modal').style.display = 'none';
}

async function guardarItem() {
    const tipo = document.getElementById('item-type').value;
    
    // VALIDACIÓN DE ZONA:
    let errorZona = validarColorZona(slotDestino.r, slotDestino.c, tipo);
    if(errorZona) return alert(errorZona);

    // Variables limpias por defecto
    let flechas = 0;
    let tamano = null;
    let estadistica = null; 

    // Lógica específica según el tipo
    if (tipo === 'carcaj') {
        tamano = document.getElementById('quiver-size').value;
        flechas = parseInt(document.getElementById('quiver-arrows').value) || 0;
        let max = (tamano === 'chico') ? 10 : (tamano === 'mediano') ? 20 : 50;
        if (flechas > max) return alert(`El carcaj ${tamano} solo puede llevar ${max} flechas.`);
        
    } else if (tipo === 'arma' || tipo === 'armadura') {
        // Solo capturamos la estadística si es un arma o armadura
        estadistica = document.getElementById('item-stat').value;
    }

    const data = {
        nombre: document.getElementById('item-name').value,
        tipo: tipo,
        w: parseInt(document.getElementById('item-w').value),
        h: parseInt(document.getElementById('item-h').value),
        r: slotDestino.r,
        c: slotDestino.c,
        estadistica: estadistica, // Ahora irá vacío si es un carcaj
        tamano: tamano,
        flechas: flechas
    };

    try {
        const response = await fetch('/api/inventario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            alert("Error en la Base de Datos: " + result.error);
            return;
        }

        cerrarModal();
        cargarInventario(); 
        
    } catch (error) {
        alert("Error de conexión con el servidor: " + error.message);
    }
}

// --- LOGICA DE MONEDAS ---

// --- NUEVA LÓGICA DE MONEDAS ---

function abrirModalMonedas() {
    // Reiniciar los campos a 0 cada vez que se abre
    document.getElementById('input-gold').value = '0';
    document.getElementById('input-silver').value = '0';
    document.getElementById('input-bronze').value = '0';
    
    document.getElementById('coin-modal').style.display = 'block';
}

function cerrarModalMonedas() {
    document.getElementById('coin-modal').style.display = 'none';
}

async function procesarMonedas(operacion) {
    // 1. Obtener los valores que el usuario escribió (si dejó vacío, cuenta como 0)
    let oroInput = parseInt(document.getElementById('input-gold').value) || 0;
    let plataInput = parseInt(document.getElementById('input-silver').value) || 0;
    let bronceInput = parseInt(document.getElementById('input-bronze').value) || 0;

    // Evitar que el usuario ponga números negativos directamente en la caja
    if (oroInput < 0 || plataInput < 0 || bronceInput < 0) {
        alert("Ingresa números positivos. Usa el botón 'Quitar' para restar.");
        return;
    }

    // 2. Convertir todo lo que el usuario ingresó a la unidad más pequeña (bronce)
    // Fórmula: 1 Oro = 100 Bronce | 1 Plata = 10 Bronce
    let totalConvertido = (oroInput * 100) + (plataInput * 10) + bronceInput;

    if (totalConvertido === 0) {
        cerrarModalMonedas();
        return; // No se hizo ningún cambio
    }

    // 3. Aplicar la suma o la resta matemática
    if (operacion === 'sumar') {
        totalBronceActual += totalConvertido;
    } else if (operacion === 'restar') {
        if (totalConvertido > totalBronceActual) {
            alert("No tienes suficientes monedas para realizar este pago.");
            return;
        }
        totalBronceActual -= totalConvertido;
    }

    // 4. Guardar en la Base de Datos SQLite
    await fetch('/api/monedas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_bronce: totalBronceActual })
    });

    // 5. Actualizar la interfaz (el código ya existente se encarga de re-convertir 
    // el total hacia arriba y actualizar los números en pantalla)
    actualizarUIMonedas();
    cerrarModalMonedas();
}

function actualizarUIMonedas() {
    // 1 Oro = 100 Bronce, 1 Plata = 10 Bronce
    let oro = Math.floor(totalBronceActual / 100);
    let plata = Math.floor((totalBronceActual % 100) / 10);
    let bronce = totalBronceActual % 10;

    document.getElementById('val-oro').innerText = oro;
    document.getElementById('val-plata').innerText = plata;
    document.getElementById('val-bronce').innerText = bronce;
}

async function modificarMonedas() {
    let cantidad = parseInt(prompt("¿Cuánto BRONCE deseas sumar o restar? (ej: 100 para 1 de Oro, -10 para quitar 1 Plata)"));
    if (isNaN(cantidad)) return;

    totalBronceActual += cantidad;
    if (totalBronceActual < 0) totalBronceActual = 0;

    await fetch('/api/monedas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_bronce: totalBronceActual })
    });

    actualizarUIMonedas();
}

// --- LOGICA DE INTERFAZ DEL MODAL ---

function mostrarCamposEspeciales() {
    const tipo = document.getElementById('item-type').value;
    const contStats = document.getElementById('extra-stats-container');
    const contQuiver = document.getElementById('quiver-container');
    
    contStats.style.display = 'none';
    contQuiver.style.display = 'none';

    if (tipo === 'arma') {
        contStats.style.display = 'block';
        document.getElementById('extra-stat-label').innerText = 'Daño del Arma:';
    } else if (tipo === 'armadura') {
        contStats.style.display = 'block';
        document.getElementById('extra-stat-label').innerText = 'Clase de Armadura (CA):';
    } else if (tipo === 'carcaj') {
        contQuiver.style.display = 'block';
    }
}

// NUEVA FUNCIÓN: Valida que el ítem vaya en el color correcto
function validarColorZona(r, c, tipo) {
    let colorZ = obtenerColorSlot(r, c);
    
    // Ahora la zona roja es EXCLUSIVA para general
    if (colorZ === 'bg-red' && tipo !== 'general') {
        return "La zona ROJA es solo para ítems Generales.";
    }
    
    // Ahora la zona verde acepta armas Y carcajs
    if (colorZ === 'bg-green' && tipo !== 'arma' && tipo !== 'carcaj') {
        return "La zona VERDE es solo para Armas y Carcajs.";
    }
    
    if (colorZ === 'bg-cyan' && tipo !== 'armadura') {
        return "La zona CELESTE es solo para Armaduras.";
    }
    
    return null; // Todo OK
}

let itemSeleccionadoParaEdicion = null;

function abrirInspectModal(item) {
    itemSeleccionadoParaEdicion = item;
    
    document.getElementById('inspect-name').innerText = item.nombre;
    document.getElementById('inspect-type').innerText = item.tipo;
    
    // Mostrar estadísticas si existen
    const statBox = document.getElementById('inspect-stat-box');
    if (item.estadistica) {
        statBox.style.display = 'block';
        document.getElementById('inspect-stat').innerText = item.estadistica;
    } else {
        statBox.style.display = 'none';
    }

    // Mostrar menú de flechas si es carcaj
    const quiverBox = document.getElementById('inspect-quiver-box');
    if (item.tipo === 'carcaj') {
        quiverBox.style.display = 'block';
        document.getElementById('inspect-arrows').innerText = item.flechas;
        document.getElementById('inspect-max-arrows').innerText = (item.tamano === 'chico') ? 10 : (item.tamano === 'mediano') ? 20 : 50;
    } else {
        quiverBox.style.display = 'none';
    }

    document.getElementById('inspect-modal').style.display = 'block';
}

function cerrarInspectModal() {
    document.getElementById('inspect-modal').style.display = 'none';
    itemSeleccionadoParaEdicion = null;
}

async function eliminarItemSeleccionado() {
    if (!confirm(`¿Seguro que quieres eliminar ${itemSeleccionadoParaEdicion.nombre}?`)) return;
    
    await fetch(`/api/inventario/${itemSeleccionadoParaEdicion.inv_id}`, { method: 'DELETE' });
    cerrarInspectModal();
    cargarInventario();
}

async function cambiarFlechas(cantidad) {
    let item = itemSeleccionadoParaEdicion;
    let max = (item.tamano === 'chico') ? 10 : (item.tamano === 'mediano') ? 20 : 50;
    
    let nuevasFlechas = item.flechas + cantidad;
    if (nuevasFlechas < 0 || nuevasFlechas > max) return; // Limitar mínimo y máximo
    
    item.flechas = nuevasFlechas;
    document.getElementById('inspect-arrows').innerText = nuevasFlechas;

    // Guardar en Base de Datos de inmediato
    await fetch(`/api/inventario/${item.inv_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flechas: nuevasFlechas })
    });
    
    cargarInventario(); // Refrescar vista de fondo
}