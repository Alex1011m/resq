import { LocationAPI } from './location.js';
import { StorageDB } from './storage.js';
import { SyncEngine } from './sync.js';
import { compressImage } from './image-utils.js';

let currentLocation = null;

// Persistencia en LocalStorage para mostrar el feed en UI
const getLocalHistory = () => JSON.parse(localStorage.getItem('resq_history') || '[]');
const addToHistory = (report) => {
    const history = getLocalHistory();
    // Clonar el reporte para no modificar el original que va a Firestore
    const localReport = JSON.parse(JSON.stringify(report));
    
    // Si tiene imagen, guardamos un indicador pequeño en lugar del texto gigante
    // para evitar que el localStorage (caché visual) tire el error QuotaExceededError
    if (localReport.imageBase64) {
        localReport.hasImage = true;
        delete localReport.imageBase64;
    }
    
    history.push(localReport);
    localStorage.setItem('resq_history', JSON.stringify(history));
};

const updateHistoryList = (filterType = null) => {
    const list = document.getElementById('reports-list');
    let reports = getLocalHistory();
    
    // Filtrar por tipo si se especifica
    if (filterType === 'incident') {
        reports = reports.filter(r => ['collapse', 'flood', 'medical', 'supplies', 'other'].includes(r.type));
    } else if (filterType === 'person') {
        reports = reports.filter(r => r.type === 'person');
    } else if (filterType === 'hospital') {
        reports = reports.filter(r => r.type === 'hospital');
    }
    
    // El más nuevo más arriba
    reports.sort((a, b) => b.t_event - a.t_event);
    
    if (reports.length === 0) {
        list.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 1rem;">No hay reportes recientes.</p>';
        return;
    }

    const typeMap = {
        'collapse': 'Derrumbe / Colapso',
        'flood': 'Inundación',
        'medical': 'Emergencia Médica',
        'supplies': 'Falta de Insumos',
        'person': 'Persona Encontrada',
        'hospital': 'Lista de Hospital',
        'other': 'Otro'
    };

    list.innerHTML = reports.map(r => {
        const date = new Date(r.t_event).toLocaleString();
        let extraHTML = '';
        if (r.rescuers && r.rescuers.present) {
            extraHTML += `<div class="report-rescuers">🧑‍🚒 Rescatistas: ${r.rescuers.current} (Req: ${r.rescuers.needed})</div>`;
        }
        if (r.person) {
            let locStr = r.person.location ? `<br>📍 Destino: ${r.person.location}` : '';
            extraHTML += `<div style="color: #4fc3f7">👤 Nombre: ${r.person.name || 'Desconocido'} - Estado: ${r.person.status}${locStr}</div>`;
        }
        if (r.hospital) {
            extraHTML += `<div style="color: #81c784">🏥 Hospital: ${r.hospital.name}</div>`;
        }
        if (r.hasImage || r.imageUrl || r.imageBase64) {
            extraHTML += `<div><span style="display:inline-block; margin-top:5px; padding: 4px 8px; background:#444; border-radius:4px; font-size:0.8rem;">📸 Imagen adjunta (Subiendo a la nube)</span></div>`;
        }

        const sevStr = r.sev ? `<br>⚠️ Severidad: ${r.sev}/5` : '';
        const lat = r.loc ? r.loc.lat : 0;
        const lng = r.loc ? r.loc.lng : 0;

        return `
            <div class="report-item sev-${r.sev || 1}">
                <div class="report-header">
                    <span class="report-type">${typeMap[r.type] || r.type}</span>
                    <span class="report-date">${date}</span>
                </div>
                <div class="report-details">
                    📍 Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}
                    ${sevStr}
                </div>
                ${extraHTML}
            </div>
        `;
    }).join('');
};

const handleImagePreview = async (fileInput, previewImgElement) => {
    const file = fileInput.files[0];
    if (!file) {
        previewImgElement.style.display = 'none';
        return null;
    }
    try {
        const compressedBase64 = await compressImage(file);
        previewImgElement.src = compressedBase64;
        previewImgElement.style.display = 'block';
        return compressedBase64;
    } catch (e) {
        console.error("Error comprimiendo imagen", e);
        return null;
    }
};

const initApp = async () => {
    // 0. UI Bindings (Tabs) - Movemos al principio para garantizar interactividad incluso si falla la BD
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.currentTarget;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            targetBtn.classList.add('active');
            const targetId = targetBtn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
            
            // Actualizar el feed local para mostrar solo lo de la pestaña activa
            const contextType = document.querySelector(`#${targetId} #form-context`).value;
            updateHistoryList(contextType);
            
            // Reset location context when switching tabs
            currentLocation = null;
            document.querySelectorAll('.btn-submit').forEach(b => b.disabled = true);
            document.querySelectorAll('.loc-status').forEach(s => s.innerText = '📍 Capturar Ubicación');
            document.querySelectorAll('.loc-data').forEach(s => s.innerText = '');
        });
    });

    // 1. Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error('Error al registrar SW:', err));
    }

    // 2. Set Initial Status
    try {
        SyncEngine.UI.updateNetworkStatus(navigator.onLine);
        await SyncEngine.checkQueue();
        updateHistoryList('incident'); // Por defecto abre en incidencias
    } catch(err) {
        console.error("Error cargando historial local:", err);
    }

    // Sub-forms UI Bindings
    document.getElementById('has-rescuers').addEventListener('change', (e) => {
        document.getElementById('rescuers-details').style.display = e.target.checked ? 'block' : 'none';
    });

    // Image Previews
    let currentPersonImageBase64 = null;
    let currentHospitalImageBase64 = null;

    document.getElementById('person-photo').addEventListener('change', async (e) => {
        currentPersonImageBase64 = await handleImagePreview(e.target, document.getElementById('person-preview'));
    });
    
    document.getElementById('hospital-photo').addEventListener('change', async (e) => {
        currentHospitalImageBase64 = await handleImagePreview(e.target, document.getElementById('hospital-preview'));
    });

    // Location Binding (applies to all forms)
    document.querySelectorAll('.btn-location').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const formSection = e.target.closest('section');
            const statusSpan = formSection.querySelector('.loc-status');
            const dataSmall = formSection.querySelector('.loc-data');
            const submitBtn = formSection.querySelector('.btn-submit');
            
            e.currentTarget.disabled = true;
            statusSpan.innerText = '⏳ Capturando...';
            
            try {
                const loc = await LocationAPI.captureLocation();
                currentLocation = loc;
                statusSpan.innerText = '✅ Ubicación Capturada';
                dataSmall.innerText = `Lat: ${loc.lat.toFixed(5)}, Lng: ${loc.lng.toFixed(5)} (Acc: ${Math.round(loc.acc)}m)`;
                submitBtn.disabled = false;
            } catch (err) {
                statusSpan.innerText = '❌ Error de Ubicación';
                dataSmall.innerText = err.message;
                e.currentTarget.disabled = false;
            }
        });
    });

    // Generic Submit Handler for all forms
    document.querySelectorAll('.app-form').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentLocation) return;

            const context = form.querySelector('#form-context').value;
            let report = {
                id: `rep_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                loc: { lat: currentLocation.lat, lng: currentLocation.lng },
                geo: currentLocation.geo,
                t_event: Date.now()
            };

            if (context === 'incident') {
                const hasRescuers = document.getElementById('has-rescuers').checked;
                report.type = document.getElementById('report-type').value;
                report.sev = parseInt(document.getElementById('severity').value, 10);
                if (hasRescuers) {
                    report.rescuers = {
                        present: true,
                        current: parseInt(document.getElementById('current-rescuers').value, 10),
                        needed: parseInt(document.getElementById('needed-rescuers').value, 10)
                    };
                }
            } else if (context === 'person') {
                report.type = 'person';
                report.person = {
                    name: document.getElementById('person-name').value,
                    status: document.getElementById('person-status').value,
                    location: document.getElementById('person-location').value
                };
                if (currentPersonImageBase64) report.imageBase64 = currentPersonImageBase64;
            } else if (context === 'hospital') {
                report.type = 'hospital';
                report.hospital = {
                    name: document.getElementById('hospital-name').value
                };
                if (currentHospitalImageBase64) report.imageBase64 = currentHospitalImageBase64;
            }

            try {
                await StorageDB.saveReportOffline(report);
                addToHistory(report);
                updateHistoryList(context);
                
                alert("Reporte guardado. Se enviará al recuperar conexión.");
                
                // Reset this specific form
                form.reset();
                currentLocation = null;
                form.querySelector('.btn-submit').disabled = true;
                form.querySelector('.loc-status').innerText = '📍 Capturar Ubicación';
                form.querySelector('.loc-data').innerText = '';
                
                // Clear previews
                if(context === 'person') {
                    currentPersonImageBase64 = null;
                    document.getElementById('person-preview').style.display = 'none';
                }
                if(context === 'hospital') {
                    currentHospitalImageBase64 = null;
                    document.getElementById('hospital-preview').style.display = 'none';
                }
                
                await SyncEngine.checkQueue();
                if (navigator.onLine) SyncEngine.syncNow();
                
            } catch (err) {
                console.error("Error al guardar:", err);
                alert("Hubo un error al guardar el reporte.");
            }
        });
    });

    document.getElementById('btn-sync').addEventListener('click', () => {
        SyncEngine.syncNow();
    });
};

document.addEventListener('DOMContentLoaded', initApp);
