import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, PermissionsAndroid, Platform } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { Feather } from '@expo/vector-icons';
import UpdateBanner from './UpdateBanner';

const manager = new BleManager();

// Из main.cpp ESP32
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHAR_UUID_NAME = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const CHAR_UUID_BEEP = "beb5483e-36e1-4688-b7f5-ea07361b26a9";
const CHAR_UUID_TARGET_ID = "beb5483e-36e1-4688-b7f5-ea07361b26a0";

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [targetName, setTargetName] = useState('');
  const [targetId, setTargetId] = useState('B'); // По умолчанию B
  const [statusMsg, setStatusMsg] = useState('АВТОНОМНЫЙ РЕЖИМ');

  useEffect(() => {
    requestPermissions();
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
    setStatusMsg('СИНХРОНИЗАЦИЯ...');
    manager.stopDeviceScan();
    setIsScanning(false);
    
    device.connect()
      .then((d) => d.discoverAllServicesAndCharacteristics())
      .then(async (d) => {
        setIsConnected(true);
        setConnectedDevice(d);
        setStatusMsg('СВЯЗЬ УСТАНОВЛЕНА');

        // Читаем текущее имя
        const charName = await d.readCharacteristicForService(SERVICE_UUID, CHAR_UUID_NAME);
        const name = Buffer.from(charName.value, 'base64').toString('utf8');
        setTargetName(name);

        // Читаем текущий ID
        const charId = await d.readCharacteristicForService(SERVICE_UUID, CHAR_UUID_TARGET_ID);
        const idStr = Buffer.from(charId.value, 'base64').toString('utf8');
        if (idStr) setTargetId(idStr);

        d.onDisconnected((error, disconnectedDevice) => {
          setIsConnected(false);
          setConnectedDevice(null);
          setStatusMsg('АВТОНОМНЫЙ РЕЖИМ');
        });
      })
      .catch((error) => {
        console.warn(error);
        setStatusMsg('ОШИБКА ПРОТОКОЛА');
      });
  };

  const scanAndConnect = () => {
    setIsScanning(true);
    setStatusMsg('ПОИСК СИГНАЛА...');
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.warn(error);
        setIsScanning(false);
        setStatusMsg('ОЖИДАНИЕ СИГНАЛА РАДАРА');
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
        if (!isConnected) setStatusMsg('ОЖИДАНИЕ СИГНАЛА РАДАРА');
      }
    }, 10000);
  };

  const syncSettings = async () => {
    if (!connectedDevice) return;
    try {
      // Отправляем имя
      const base64Name = Buffer.from(targetName).toString('base64');
      await connectedDevice.writeCharacteristicWithResponseForService(SERVICE_UUID, CHAR_UUID_NAME, base64Name);
      
      // Отправляем ID
      const base64Id = Buffer.from(targetId).toString('base64');
      await connectedDevice.writeCharacteristicWithResponseForService(SERVICE_UUID, CHAR_UUID_TARGET_ID, base64Id);
      
      Alert.alert("Синхронизация успешна", "Параметры цели загружены в радар.");
    } catch (e) {
      console.warn(e);
      Alert.alert("Ошибка связи", "Не удалось загрузить параметры.");
    }
  };

  const triggerBeep = async () => {
    if (!connectedDevice) {
      Alert.alert("Ошибка", "Связь не установлена");
      return;
    }
    try {
      const payload = Buffer.from("1").toString('base64');
      await connectedDevice.writeCharacteristicWithoutResponseForService(SERVICE_UUID, CHAR_UUID_BEEP, payload);
    } catch (e) {
      console.warn(e);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>T-RADAR</Text>
          <Feather name="crosshair" size={24} color="#0A84FF" />
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, isConnected ? styles.badgeConnected : styles.badgeDisconnected]}>
            <View style={[styles.pulse, isConnected ? styles.pulseConnected : styles.pulseDisconnected]} />
            <Text style={[styles.statusText, isConnected ? styles.textConnected : styles.textDisconnected]}>
              {statusMsg}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        {/* Connect Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Блок Управления</Text>
          <Text style={styles.cardSubtitle}>Шифрованный канал связи BLE</Text>
          <TouchableOpacity 
            style={[styles.primaryBtn, isConnected && styles.hidden]} 
            onPress={scanAndConnect}
            disabled={isScanning}
          >
            <Feather name="radio" size={18} color="#FFF" style={styles.btnIcon} />
            <Text style={styles.btnText}>{isScanning ? "ИДЕТ ПОИСК..." : "УСТАНОВИТЬ СВЯЗЬ"}</Text>
          </TouchableOpacity>
        </View>

        {/* Settings Card */}
        <View 
          style={[styles.card, !isConnected && styles.disabled]} 
          pointerEvents={isConnected ? "auto" : "none"}
        >
          <Text style={styles.cardTitle}>Параметры Цели</Text>
          <Text style={styles.cardSubtitle}>Настройка радиочастотного маяка</Text>
          
          <Text style={styles.label}>КАНАЛ (ID)</Text>
          <View style={styles.channelGroup}>
            {['A', 'B', 'C'].map(ch => (
              <TouchableOpacity 
                key={ch} 
                style={[styles.channelBtn, targetId === ch && styles.channelBtnActive]}
                onPress={() => setTargetId(ch)}
              >
                <Text style={[styles.channelText, targetId === ch && styles.channelTextActive]}>{ch}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>ПОЗЫВНОЙ</Text>
          <View style={styles.inputGroup}>
            <TextInput 
              style={styles.input} 
              value={targetName}
              onChangeText={setTargetName}
              placeholder="Напр. ALPHA"
              placeholderTextColor="rgba(255,255,255,0.3)"
              maxLength={10}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={syncSettings}>
              <Feather name="upload" size={18} color="#0A84FF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Actions Card */}
        <View 
          style={[styles.card, !isConnected && styles.disabled]}
          pointerEvents={isConnected ? "auto" : "none"}
        >
          <Text style={styles.cardTitle}>Протоколы</Text>
          <Text style={styles.cardSubtitle}>Активные команды оборудования</Text>
          <TouchableOpacity style={styles.actionBtn} onPress={triggerBeep}>
            <Feather name="volume-2" size={18} color="#FFF" style={styles.btnIcon} />
            <Text style={styles.btnText}>АКУСТИЧЕСКИЙ ПЕЛЕНГ</Text>
          </TouchableOpacity>
        </View>
      </View>
      <UpdateBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  statusRow: {
    marginTop: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  badgeDisconnected: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderColor: 'rgba(255, 69, 58, 0.3)',
  },
  badgeConnected: {
    backgroundColor: 'rgba(48, 209, 88, 0.1)',
    borderColor: 'rgba(48, 209, 88, 0.3)',
  },
  pulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  pulseDisconnected: {
    backgroundColor: '#FF453A',
    shadowColor: '#FF453A',
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  pulseConnected: {
    backgroundColor: '#30D158',
    shadowColor: '#30D158',
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  textDisconnected: {
    color: '#FF453A',
  },
  textConnected: {
    color: '#30D158',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  card: {
    backgroundColor: '#0F0F12',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  disabled: {
    opacity: 0.3,
  },
  hidden: {
    display: 'none',
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  cardSubtitle: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    marginBottom: 20,
  },
  primaryBtn: {
    backgroundColor: '#0A84FF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnIcon: {
    marginRight: 10,
  },
  btnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  label: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  channelGroup: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  channelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  channelBtnActive: {
    backgroundColor: 'rgba(10, 132, 255, 0.1)',
    borderColor: '#0A84FF',
  },
  channelText: {
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '700',
  },
  channelTextActive: {
    color: '#0A84FF',
  },
  inputGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: 'rgba(10, 132, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(10, 132, 255, 0.3)',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 12,
  }
});
