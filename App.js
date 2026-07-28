import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, 
  TextInput, PermissionsAndroid, Platform, Alert
} from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import Toast from 'react-native-toast-message';
import { checkForUpdate, downloadUpdate } from './utils/updater';

const manager = new BleManager();

const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHAR_UUID_NAME = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const CHAR_UUID_BEEP = "beb5483e-36e1-4688-b7f5-ea07361b26a9";
const CHAR_UUID_TARGET_ID = "beb5483e-36e1-4688-b7f5-ea07361b26a0";

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  
  const [targetName, setTargetName] = useState('');
  const [targetId, setTargetId] = useState('B');
  
  // Обновления
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    requestPermissions();
    checkForUpdate((info) => setUpdateInfo(info));
    return () => manager.destroy();
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
    }
  };

  const connectToDevice = (device) => {
    manager.stopDeviceScan();
    setIsScanning(false);
    
    device.connect()
      .then((d) => d.discoverAllServicesAndCharacteristics())
      .then(async (d) => {
        setIsConnected(true);
        setConnectedDevice(d);

        const charName = await d.readCharacteristicForService(SERVICE_UUID, CHAR_UUID_NAME);
        const name = Buffer.from(charName.value, 'base64').toString('utf8');
        setTargetName(name);

        const charId = await d.readCharacteristicForService(SERVICE_UUID, CHAR_UUID_TARGET_ID);
        const idStr = Buffer.from(charId.value, 'base64').toString('utf8');
        if (idStr) setTargetId(idStr);

        d.onDisconnected((error, disconnectedDevice) => {
          setIsConnected(false);
          setConnectedDevice(null);
        });
      })
      .catch((error) => {
        console.warn(error);
        Toast.show({ type: 'error', text1: 'ОШИБКА СВЯЗИ', position: 'bottom', bottomOffset: 60 });
      });
  };

  const toggleConnection = () => {
    if (isConnected) {
      connectedDevice?.cancelConnection();
      return;
    }
    
    if (isScanning) {
      manager.stopDeviceScan();
      setIsScanning(false);
      return;
    }

    setIsScanning(true);
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.warn(error);
        setIsScanning(false);
        return;
      }
      if (device && device.name === 'Radar-01') {
        connectToDevice(device);
      }
    });
    
    setTimeout(() => {
      if (isScanning) {
        manager.stopDeviceScan();
        setIsScanning(false);
      }
    }, 10000);
  };

  const syncSettings = async (newId = targetId, newName = targetName) => {
    if (!connectedDevice) return;
    try {
      if (newName) {
        const base64Name = Buffer.from(newName).toString('base64');
        await connectedDevice.writeCharacteristicWithResponseForService(SERVICE_UUID, CHAR_UUID_NAME, base64Name);
      }
      
      if (newId) {
        const base64Id = Buffer.from(newId).toString('base64');
        await connectedDevice.writeCharacteristicWithResponseForService(SERVICE_UUID, CHAR_UUID_TARGET_ID, base64Id);
      }
      
      Toast.show({
        type: 'success',
        text1: 'СИНХРОНИЗАЦИЯ УСПЕШНА',
        position: 'bottom',
        bottomOffset: 60
      });
    } catch (e) {
      console.warn(e);
      Toast.show({
        type: 'error',
        text1: 'ОШИБКА СВЯЗИ',
        position: 'bottom',
        bottomOffset: 60
      });
    }
  };

  const handleChannelSelect = (ch) => {
    setTargetId(ch);
    syncSettings(ch, targetName);
  };

  const triggerBeep = async () => {
    if (!connectedDevice) {
      Toast.show({ type: 'error', text1: 'СВЯЗЬ НЕ УСТАНОВЛЕНА', position: 'bottom', bottomOffset: 60 });
      return;
    }
    try {
      const payload = Buffer.from("1").toString('base64');
      await connectedDevice.writeCharacteristicWithoutResponseForService(SERVICE_UUID, CHAR_UUID_BEEP, payload);
    } catch (e) {
      console.warn(e);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadUpdate(
        updateInfo.downloadUrl,
        updateInfo.version,
        (p) => setProgress(p)
      );
    } catch (e) {
      setDownloading(false);
      setProgress(0);
      Alert.alert('Ошибка скачивания/установки', String(e.message || e));
    }
  };

  return (
    <View style={styles.container}>
      
      <View style={styles.topBlock}>
        <Text style={styles.topSmallText}>ESP32-C3 · BLE</Text>
        <Text style={styles.title}>AirTag</Text>
        
        <TouchableOpacity style={styles.statusRow} onPress={toggleConnection} activeOpacity={0.7}>
          <View style={[styles.dot, { backgroundColor: isConnected ? '#4ade80' : '#3a3a3a' }]} />
          <Text style={[styles.statusText, { color: isConnected ? '#4ade80' : '#555555' }]}>
            {isScanning ? "Идёт поиск..." : (isConnected ? "Radar-01 · подключён" : "Нет подключения")}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <View style={styles.section} pointerEvents={isConnected ? "auto" : "none"}>
        <Text style={styles.sectionLabel}>ПАРАМЕТРЫ</Text>
        
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Канал</Text>
          <View style={styles.channelGroup}>
            {['A', 'B', 'C'].map(ch => (
              <TouchableOpacity 
                key={ch} 
                style={[styles.channelBtn, targetId === ch && styles.channelBtnActive]}
                onPress={() => handleChannelSelect(ch)}
              >
                <Text style={[styles.channelText, targetId === ch && styles.channelTextActive]}>{ch}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.rowDivider} />

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Название</Text>
          <TextInput 
            style={styles.input} 
            value={targetName}
            onChangeText={(t) => setTargetName(t.replace(/[^A-Za-z0-9 ]/g, ''))}
            onEndEditing={() => syncSettings(targetId, targetName)}
            placeholder="ALPHA"
            placeholderTextColor="#333333"
            maxLength={10}
            returnKeyType="done"
          />
        </View>
      </View>

      <TouchableOpacity 
        style={[styles.actionBtn, { opacity: isConnected ? 1 : 0.3 }]} 
        onPress={triggerBeep}
        activeOpacity={0.7}
      >
        <Text style={styles.actionTextLeft}>Пиковый сигнал</Text>
        <Text style={styles.actionTextRight}>→</Text>
      </TouchableOpacity>

      {updateInfo && (
        <View style={styles.updateBanner}>
          <Text style={styles.updateTextLeft}>
            Обновление <Text style={styles.updateVersion}>{updateInfo.version}</Text>
          </Text>
          {!downloading ? (
            <TouchableOpacity onPress={handleDownload}>
              <Text style={styles.updateBtnText}>Скачать →</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.updateBtnText}>{Math.round(progress * 100)}%</Text>
          )}
        </View>
      )}

      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0c0c',
  },
  topBlock: {
    paddingTop: 56,
    paddingHorizontal: 24,
  },
  topSmallText: {
    color: '#555555',
    fontSize: 13,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  title: {
    color: '#f5f5f5',
    fontSize: 30,
    fontWeight: '500',
    letterSpacing: -1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  statusText: {
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginHorizontal: 24,
    marginTop: 28,
    marginBottom: 28,
  },
  section: {
    paddingHorizontal: 24,
  },
  sectionLabel: {
    color: '#444444',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowLabel: {
    color: '#666666',
    fontSize: 15,
  },
  channelGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  channelBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#222222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelBtnActive: {
    borderColor: '#f5f5f5',
  },
  channelText: {
    color: '#555555',
    fontSize: 13,
  },
  channelTextActive: {
    color: '#f5f5f5',
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#161616',
    marginVertical: 4,
  },
  input: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: '#222222',
    color: '#f5f5f5',
    fontSize: 15,
    textAlign: 'right',
    width: 140,
    padding: 0,
    height: 30,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: '#1e1e1e',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
    marginHorizontal: 24,
  },
  actionTextLeft: {
    color: '#888888',
    fontSize: 15,
  },
  actionTextRight: {
    color: '#333333',
    fontSize: 15,
  },
  updateBanner: {
    backgroundColor: '#111111',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginHorizontal: 24,
  },
  updateTextLeft: {
    color: '#555555',
    fontSize: 13,
  },
  updateVersion: {
    color: '#888888',
  },
  updateBtnText: {
    color: '#f5f5f5',
    fontSize: 13,
  }
});
