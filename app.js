// BLE UUIDs - Must match ESP32 code exactly
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHAR_UUID_NAME = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const CHAR_UUID_BEEP = "beb5483e-36e1-4688-b7f5-ea07361b26a9";

let bleDevice = null;
let bleServer = null;
let bleService = null;
let charName = null;
let charBeep = null;

// UI Elements
const connectBtn = document.getElementById('connect-btn');
const statusDot = document.getElementById('bt-status-dot');
const statusText = document.getElementById('bt-status-text');
const targetCard = document.getElementById('target-card');
const actionsCard = document.getElementById('actions-card');
const saveNameBtn = document.getElementById('save-name-btn');
const targetNameInput = document.getElementById('target-name-input');
const beepBtn = document.getElementById('beep-btn');

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => {
        console.log("Service Worker Registered");
    });
}

connectBtn.addEventListener('click', async () => {
    try {
        statusText.innerText = "Scanning...";
        
        // Request Bluetooth Device
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'Radar-01' }],
            optionalServices: [SERVICE_UUID]
        });

        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);

        // Connect to GATT Server
        statusText.innerText = "Connecting...";
        bleServer = await bleDevice.gatt.connect();

        // Get Service
        bleService = await bleServer.getPrimaryService(SERVICE_UUID);

        // Get Characteristics
        charName = await bleService.getCharacteristic(CHAR_UUID_NAME);
        charBeep = await bleService.getCharacteristic(CHAR_UUID_BEEP);

        // Read current target name
        const value = await charName.readValue();
        const decoder = new TextDecoder('utf-8');
        targetNameInput.value = decoder.decode(value);

        updateUIConnected();
        
    } catch (error) {
        console.error(error);
        statusText.innerText = "Connection Failed";
        setTimeout(onDisconnected, 2000);
    }
});

function onDisconnected() {
    statusDot.className = 'dot disconnected';
    statusText.innerText = "Not Connected";
    connectBtn.innerText = "Connect Radar";
    connectBtn.style.display = 'block';
    
    targetCard.classList.add('disabled');
    actionsCard.classList.add('disabled');
}

function updateUIConnected() {
    statusDot.className = 'dot connected';
    statusText.innerText = "Connected to Radar-01";
    connectBtn.style.display = 'none';
    
    targetCard.classList.remove('disabled');
    actionsCard.classList.remove('disabled');
}

// Send new target name to ESP32
saveNameBtn.addEventListener('click', async () => {
    if (!charName) return;
    
    const newName = targetNameInput.value.trim();
    if (newName.length === 0) return;
    
    try {
        const encoder = new TextEncoder('utf-8');
        await charName.writeValue(encoder.encode(newName));
        saveNameBtn.innerText = "Saved!";
        setTimeout(() => saveNameBtn.innerText = "Save", 2000);
    } catch (error) {
        console.error("Error writing name", error);
    }
});

// Send Beep command to ESP32
beepBtn.addEventListener('click', async () => {
    if (!charBeep) return;
    
    try {
        // Send a simple '1' to trigger beep
        const encoder = new TextEncoder('utf-8');
        await charBeep.writeValue(encoder.encode("1"));
        
        beepBtn.style.transform = "scale(0.95)";
        setTimeout(() => beepBtn.style.transform = "scale(1)", 150);
    } catch (error) {
        console.error("Error triggering beep", error);
    }
});
