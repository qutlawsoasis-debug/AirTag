import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, 
  TextInput, PermissionsAndroid, Platform, Alert, ActivityIndicator
} from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import Toast from 'react-native-toast-message';
import { checkForUpdate, downloadUpdate } from './utils/updater';
import { 
  useFonts, 
  Outfit_400Regular, 
  Outfit_500Medium, 
  Outfit_600SemiBold 
} from '@expo-google-fonts/outfit';

const CURRENT_VERSION = require('./package.json').version;
const manager = new BleManager();

const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHAR_UUID_NAME = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const CHAR_UUID_BEEP = "beb5483e-36e1-4688-b7f5-ea07361b26a9";
const CHAR_UUID_TARGET_ID = "beb5483e-36e1-4688-b7f5-ea07361b26a0";

export default function App() {
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
  });

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
        bottomOffset: 120
      });
    } catch (e) {
      console.warn(e);
      Toast.show({
        type: 'error',
        text1: 'ОШИБКА СВЯЗИ',
        position: 'bottom',
        bottomOffset: 120
      });
    }
  };

  const handleChannelSelect = (ch) => {
    setTargetId(ch);
    syncSettings(ch, targetName);
  };

  const triggerBeep = async () => {
    if (!connectedDevice) {
      Toast.show({ type: 'error', text1: 'СВЯЗЬ НЕ УСТАНОВЛЕНА', position: 'bottom', bottomOffset: 120 });
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

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#141416', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#4ade80" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      
      <View style={styles.topBlock}>
        <Text style={styles.topSmallText}>ESP32-C3 · BLE</Text>
        <Text style={styles.title}>AirTag</Text>
        
        <TouchableOpacity style={styles.statusRow} onPress={toggleConnection} activeOpacity={0.7}>
          <View style={[styles.dot, { backgroundColor: isConnected ? '#4ade80' : '#44444a' }]} />
          <Text style={[styles.statusText, { color: isConnected ? '#4ade80' : '#888890' }]}>
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
            placeholderTextColor="#55555c"
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

      {/* Footer pinned to bottom */}
      <View style={styles.footer}>
        {updateInfo ? (
          <View style={styles.updateBanner}>
            <Text style={styles.updateTextLeft}>
              Доступно <Text style={styles.updateVersion}>v{updateInfo.version}</Text>
            </Text>
            {!downloading ? (
              <TouchableOpacity onPress={handleDownload} style={styles.updateBtn}>
                <Text style={styles.updateBtnText}>Обновить</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.updateBtn}>
                <Text style={styles.updateBtnText}>{Math.round(progress * 100)}%</Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.versionText}>AirTag v{CURRENT_VERSION}</Text>
        )}
      </View>

      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#141416', // Сделали чуть светлее, не глухой черный
  },
  topBlock: {
    paddingTop: 64,
    paddingHorizontal: 24,
  },
  topSmallText: {
    fontFamily: 'Outfit_500Medium',
    color: '#888890',
    fontSize: 13,
    letterSpacing: 0.8,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'Outfit_600SemiBold',
    color: '#ffffff',
    fontSize: 34,
    letterSpacing: -1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 10,
  },
  statusText: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#232326', // Более явный разделитель
    marginHorizontal: 24,
    marginTop: 32,
    marginBottom: 32,
  },
  section: {
    paddingHorizontal: 24,
  },
  sectionLabel: {
    fontFamily: 'Outfit_600SemiBold',
    color: '#66666e',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowLabel: {
    fontFamily: 'Outfit_500Medium',
    color: '#a0a0a5',
    fontSize: 16,
  },
  channelGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  channelBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333338', // Ярче граница
    backgroundColor: '#1c1c1e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  channelBtnActive: {
    borderColor: '#ffffff',
    backgroundColor: '#ffffff',
  },
  channelText: {
    fontFamily: 'Outfit_600SemiBold',
    color: '#888890',
    fontSize: 14,
  },
  channelTextActive: {
    color: '#000000',
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#202024',
    marginVertical: 4,
  },
  input: {
    fontFamily: 'Outfit_500Medium',
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: '#44444a', // Заметная линия
    color: '#ffffff', // Белый текст вместо серого
    fontSize: 16,
    textAlign: 'right',
    width: 150,
    paddingVertical: 4,
    paddingHorizontal: 0,
    height: 34,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: '#333338',
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 32,
    marginHorizontal: 24,
  },
  actionTextLeft: {
    fontFamily: 'Outfit_500Medium',
    color: '#d0d0d5',
    fontSize: 16,
  },
  actionTextRight: {
    fontFamily: 'Outfit_500Medium',
    color: '#55555c',
    fontSize: 16,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  versionText: {
    fontFamily: 'Outfit_500Medium',
    color: '#55555c',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  updateBanner: {
    width: '100%',
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: '#333338',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  updateTextLeft: {
    fontFamily: 'Outfit_500Medium',
    color: '#a0a0a5',
    fontSize: 14,
  },
  updateVersion: {
    fontFamily: 'Outfit_600SemiBold',
    color: '#ffffff',
  },
  updateBtn: {
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  updateBtnText: {
    fontFamily: 'Outfit_600SemiBold',
    color: '#000000',
    fontSize: 13,
  }
});
