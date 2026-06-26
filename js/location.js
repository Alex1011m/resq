const geohash = (lat, lng) => {
    // A VERY simplified mock for demo purposes (actual geohash alg is more complex)
    // We just concatenate truncated values to simulate a 1KB string
    return `${lat.toFixed(3)}_${lng.toFixed(3)}`; 
};

const captureLocation = () => {
    return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) {
            reject(new Error("Geolocalización no soportada por el navegador."));
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            position => {
                const { latitude, longitude, accuracy } = position.coords;
                resolve({
                    lat: latitude,
                    lng: longitude,
                    geo: geohash(latitude, longitude),
                    acc: accuracy
                });
            },
            error => {
                console.warn("Fallo en GPS del navegador (Probablemente offline o Chromium bug). Usando coordenadas de respaldo para pruebas.", error);
                resolve({
                    lat: 19.4326, // Coordenadas mock (ej. CDMX)
                    lng: -99.1332,
                    geo: geohash(19.4326, -99.1332),
                    acc: 15
                });
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    });
};

export const LocationAPI = { captureLocation };
