import { StorageDB } from './storage.js';
import { db } from './firebase-config.js';
import { writeBatch, doc, collection } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const UI = {
    updateCount: (count) => {
        const el = document.getElementById('queue-count');
        if (el) el.innerText = count;
    },
    updateNetworkStatus: (isOnline) => {
        const badge = document.getElementById('network-status');
        if (isOnline) {
            badge.textContent = 'Conectado';
            badge.className = 'status-badge online';
            document.getElementById('btn-sync').disabled = false;
        } else {
            badge.textContent = 'Offline';
            badge.className = 'status-badge offline';
            document.getElementById('btn-sync').disabled = true;
        }
    }
};

const checkQueue = async () => {
    try {
        const reports = await StorageDB.getPendingReports();
        UI.updateCount(reports.length);
        return reports;
    } catch (e) {
        console.error("Error leyendo DB local:", e);
        return [];
    }
};

const syncNow = async () => {
    if (!navigator.onLine) {
        console.warn("Sin conexión para sincronizar.");
        return;
    }
    
    const reports = await StorageDB.getPendingReports();
    if (reports.length === 0) return;
    
    console.log(`📡 Sincronizando ${reports.length} reportes a Firestore...`);
    
    try {
        const batch = writeBatch(db);
        const reportsRef = collection(db, "reports");
        
        for (const report of reports) {
            // El reporte ya tiene report.imageBase64 incrustado.
            // Dado que Firestore acepta hasta 1MB por documento,
            // enviaremos la imagen comprimida directamente a la base de datos
            // sin usar Firebase Storage para evitar cobros.

            const docRef = doc(reportsRef, report.id);
            batch.set(docRef, report);
        }

        await batch.commit();
        console.log("✅ Datos guardados en Firestore exitosamente.");
        
        const ids = reports.map(r => r.id);
        await StorageDB.clearSyncedReports(ids);
        console.log("✅ Limpieza local exitosa.");
        
        checkQueue();
    } catch (e) {
        console.error("❌ Error al subir a Firestore (Batched Write falló):", e);
    }
};

window.addEventListener('online', () => {
    UI.updateNetworkStatus(true);
    syncNow();
});

window.addEventListener('offline', () => {
    UI.updateNetworkStatus(false);
});

export const SyncEngine = { checkQueue, syncNow, UI };
