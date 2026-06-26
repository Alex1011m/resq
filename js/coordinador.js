import { db } from './firebase-config.js';
import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const typeMap = {
    'collapse': 'Derrumbe / Colapso',
    'flood': 'Inundación',
    'medical': 'Emergencia Médica',
    'supplies': 'Falta de Insumos',
    'other': 'Otro'
};

let allPeopleReports = []; // Para poder filtrar localmente

const renderEmergency = (r, date) => {
    let rescuersHTML = '';
    if (r.rescuers && r.rescuers.present) {
        rescuersHTML = `<div class="report-rescuers">🧑‍🚒 Rescatistas: ${r.rescuers.current} (Req: ${r.rescuers.needed})</div>`;
    }
    const sevStr = r.sev ? `<br>⚠️ Severidad: ${r.sev}/5` : '';
    let extraHTML = '';
    if (r.imageBase64) {
        extraHTML += `<div><img src="${r.imageBase64}" class="report-image" alt="Foto Adjunta"></div>`;
    }

    return `
        <div class="report-item sev-${r.sev || 1}">
            <div class="report-header">
                <span class="report-type">${typeMap[r.type] || r.type}</span>
                <span class="report-date">${date}</span>
            </div>
            <div class="report-details">
                📍 Lat: ${r.loc.lat.toFixed(4)}, Lng: ${r.loc.lng.toFixed(4)}
                ${sevStr}
            </div>
            ${rescuersHTML}
            ${extraHTML}
            <div style="font-size: 0.7rem; color: #666; margin-top: 5px;">ID: ${r.id} | Nube ☁️</div>
        </div>
    `;
};

const renderHospital = (r, date) => {
    let extraHTML = `<div style="color: #81c784; font-weight: bold;">🏥 Hospital: ${r.hospital.name}</div>`;
    if (r.imageBase64) {
        extraHTML += `<div><img src="${r.imageBase64}" class="report-image" alt="Lista Adjunta"></div>`;
    }

    return `
        <div class="report-item sev-2">
            <div class="report-header">
                <span class="report-type">Lista de Hospital</span>
                <span class="report-date">${date}</span>
            </div>
            ${extraHTML}
            <div style="font-size: 0.7rem; color: #666; margin-top: 5px;">ID: ${r.id} | Nube ☁️</div>
        </div>
    `;
};

const renderPerson = (r, date) => {
    let locStr = r.person.location ? `<br>📍 Destino: ${r.person.location}` : '';
    let extraHTML = `<div style="color: #4fc3f7">👤 Nombre: <b>${r.person.name || 'Desconocido'}</b><br>Estado: ${r.person.status}${locStr}</div>`;
    
    if (r.imageBase64) {
        extraHTML += `<div><img src="${r.imageBase64}" class="report-image" alt="Foto Persona"></div>`;
    }

    return `
        <div class="report-item sev-1">
            <div class="report-header">
                <span class="report-type">Persona Encontrada</span>
                <span class="report-date">${date}</span>
            </div>
            ${extraHTML}
            <div style="font-size: 0.7rem; color: #666; margin-top: 5px;">ID: ${r.id} | Nube ☁️</div>
        </div>
    `;
};

const renderPeopleFeed = (filterText = '') => {
    const listEl = document.getElementById('feed-personas');
    const term = filterText.toLowerCase();
    
    const filtered = allPeopleReports.filter(r => {
        if (!term) return true;
        const name = (r.person.name || '').toLowerCase();
        const loc = (r.person.location || '').toLowerCase();
        return name.includes(term) || loc.includes(term);
    });

    if (filtered.length === 0) {
        listEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary)">No hay personas registradas o no hay coincidencias.</p>';
    } else {
        listEl.innerHTML = filtered.map(r => renderPerson(r, new Date(r.t_event).toLocaleString())).join('');
    }
    attachImageModals(listEl);
};

const attachImageModals = (container) => {
    container.querySelectorAll('.report-image').forEach(img => {
        img.addEventListener('click', (e) => {
            const modal = document.getElementById('image-modal');
            const modalImg = document.getElementById('modal-img');
            modalImg.src = e.target.src;
            modal.classList.add('active');
        });
    });
};

// Inicialización del Mapa (Leaflet)
const map = L.map('map').setView([20.59, -100.39], 10); // Coordenada base
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
}).addTo(map);

let currentMarkers = [];

const q = query(collection(db, "reports"), orderBy("t_event", "desc"));

onSnapshot(q, (snapshot) => {
    let totalRescuers = 0;
    let neededRescuers = 0;
    
    let emergenciesHTML = '';
    let hospitalsHTML = '';
    let galleryHTML = '';
    allPeopleReports = [];

    // Limpiar marcadores viejos del mapa
    currentMarkers.forEach(m => map.removeLayer(m));
    currentMarkers = [];

    snapshot.forEach((doc) => {
        const r = doc.data();
        const date = new Date(r.t_event).toLocaleString();
        
        // Stats Generales
        if (r.rescuers && r.rescuers.present) {
            totalRescuers += r.rescuers.current || 0;
            neededRescuers += r.rescuers.needed || 0;
        }

        // Clasificación
        if (r.type === 'person') {
            allPeopleReports.push(r);
        } else if (r.type === 'hospital') {
            hospitalsHTML += renderHospital(r, date);
        } else {
            // Emergencias Generales
            emergenciesHTML += renderEmergency(r, date);
        }

        // Si tiene imagen y es hospital o persona, inyectar a la galería visual
        if (r.imageBase64 && (r.type === 'person' || r.type === 'hospital')) {
            galleryHTML += `<img src="${r.imageBase64}" class="gallery-img" alt="Foto">`;
        }

        // Crear Marcador en el Mapa
        if (r.loc && r.loc.lat && r.loc.lng) {
            let iconColor = 'red';
            if (r.type === 'hospital') iconColor = 'green';
            if (r.type === 'person') iconColor = 'blue';

            // Usamos un marcador circular sencillo nativo de Leaflet
            const marker = L.circleMarker([r.loc.lat, r.loc.lng], {
                color: iconColor,
                fillColor: iconColor,
                fillOpacity: 0.7,
                radius: 8
            }).addTo(map);

            const popupText = `<b>${typeMap[r.type] || r.type}</b><br>${new Date(r.t_event).toLocaleString()}`;
            marker.bindPopup(popupText);
            currentMarkers.push(marker);
        }
    });

    // Auto-centrar el mapa para que abarque todos los pines reportados
    if (currentMarkers.length > 0) {
        const group = new L.featureGroup(currentMarkers);
        map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 14 });
    }

    document.getElementById('total-reports').innerText = snapshot.size;
    document.getElementById('total-rescuers').innerText = totalRescuers;
    document.getElementById('needed-rescuers').innerText = neededRescuers;

    const emEl = document.getElementById('feed-emergencias');
    const hospEl = document.getElementById('feed-hospitales');
    const galleryEl = document.getElementById('gallery-grid');

    emEl.innerHTML = emergenciesHTML || '<p style="text-align: center; color: var(--text-secondary)">No hay emergencias tácticas.</p>';
    hospEl.innerHTML = hospitalsHTML || '<p style="text-align: center; color: var(--text-secondary)">No hay listas de hospitales.</p>';
    galleryEl.innerHTML = galleryHTML || '<p style="text-align: center; color: var(--text-secondary); width: 100%;">No hay fotos subidas recientemente.</p>';

    // Render Personas
    renderPeopleFeed(document.getElementById('search-person').value);
    
    // Attach modals to other panels
    attachImageModals(emEl);
    attachImageModals(hospEl);
    
    // Attach modal to gallery photos manually since it uses different class name
    galleryEl.querySelectorAll('.gallery-img').forEach(img => {
        img.addEventListener('click', (e) => {
            const modal = document.getElementById('image-modal');
            const modalImg = document.getElementById('modal-img');
            modalImg.src = e.target.src;
            modal.classList.add('active');
        });
    });

}, (error) => {
    console.error("Error escuchando Firestore:", error);
    document.getElementById('conn-status').className = 'status-badge offline';
    document.getElementById('conn-status').innerText = 'Error de conexión';
});

// Listener del Buscador de Personas
document.getElementById('search-person').addEventListener('input', (e) => {
    renderPeopleFeed(e.target.value);
});
