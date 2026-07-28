import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, PermissionsAndroid, Platform } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

const manager = new BleManager();

// Из main.cpp ESP32
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHAR_UUID_NAME = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const CHAR_UUID_BEEP = "beb5483e-36e1-4688-b7f5-ea07361b26a9";

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [targetName, setTargetName] = useState('');
  const [statusMsg, setStatusMsg] = useState('Не подключено');

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
    setStatusMsg('Подключение...');
    manager.stopDeviceScan();
    setIsScanning(false);
    
    device.connect()
      .then((d) => d.discoverAllServicesAndCharacteristics())
      .then(async (d) => {
        setIsConnected(true);
        setConnectedDevice(d);
        setStatusMsg('Подключено: Radar-01');

        // Читаем текущее имя
        const characteristic = await d.readCharacteristicForService(SERVICE_UUID, CHAR_UUID_NAME);
        const name = Buffer.from(characteristic.value, 'base64').toString('utf8');
        setTargetName(name);

        d.onDisconnected((error, disconnectedDevice) => {
          setIsConnected(false);
          setConnectedDevice(null);
          setStatusMsg('Отключено');
        });
      })
      .catch((error) => {
        console.warn(error);
        setStatusMsg('Ошибка подключения');
      });
  };

  const scanAndConnect = () => {
    setIsScanning(true);
    setStatusMsg('Поиск Radar-01...');
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.warn(error);
        setIsScanning(false);
        setStatusMsg('Ошибка поиска');
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
        if (!isConnected) setStatusMsg('Радар не найден');
      }
    }, 10000);
  };

  const sendName = async () => {
    if (!connectedDevice) return;
    try {
      const base64Name = Buffer.from(targetName).toString('base64');
      await connectedDevice.writeCharacteristicWithResponseForService(SERVICE_UUID, CHAR_UUID_NAME, base64Name);
      Alert.alert("Успех", "Имя успешно обновлено на радаре!");
    } catch (e) {
      console.warn(e);
      Alert.alert("Ошибка", "Не удалось отправить имя");
    }
  };

  const triggerBeep = async () => {
    if (!connectedDevice) return;
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
        <Text style={styles.title}>Radar Control</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, isConnected ? styles.dotConnected : styles.dotDisconnected]} />
          <Text style={styles.statusText}>{statusMsg}</Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Connect Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Соединение</Text>
          <Text style={styles.cardSubtitle}>Подключитесь к ESP32 по Bluetooth</Text>
          <TouchableOpacity 
            style={[styles.primaryBtn, isConnected && styles.hidden]} 
            onPress={scanAndConnect}
            disabled={isScanning}
          >
            <Text style={styles.btnText}>{isScanning ? "Поиск..." : "Найти Радар"}</Text>
          </TouchableOpacity>
        </View>

        {/* Settings Card */}
        <View style={[styles.card, !isConnected && styles.disabled]}>
          <Text style={styles.cardTitle}>Настройки цели</Text>
          <Text style={styles.cardSubtitle}>Измените имя, отображаемое на экране</Text>
          <View style={styles.inputGroup}>
            <TextInput 
              style={styles.input} 
              value={targetName}
              onChangeText={setTargetName}
              placeholder="Имя цели (напр. Olya)"
              placeholderTextColor="rgba(255,255,255,0.4)"
              maxLength={10}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={sendName}>
              <Text style={styles.saveBtnText}>Сохранить</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Actions Card */}
        <View style={[styles.card, !isConnected && styles.disabled]}>
          <Text style={styles.cardTitle}>Действия</Text>
          <Text style={styles.cardSubtitle}>Отправить команду на радар</Text>
          <TouchableOpacity style={styles.actionBtn} onPress={triggerBeep}>
            <Text style={styles.btnText}>🔔 Включить пищалку</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotConnected: {
    backgroundColor: '#30D158',
    shadowColor: '#30D158',
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  dotDisconnected: {
    backgroundColor: '#FF453A',
  },
  statusText: {
    color: 'rgba(235, 235, 245, 0.6)',
    fontSize: 14,
  },
  content: {
    padding: 20,
    gap: 20,
  },
  card: {
    backgroundColor: 'rgba(28, 28, 30, 0.6)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  disabled: {
    opacity: 0.4,
  },
  hidden: {
    display: 'none',
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: 'rgba(235, 235, 245, 0.6)',
    fontSize: 14,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: '#0A84FF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  actionBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  btnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
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
  },
  saveBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  saveBtnText: {
    color: '#0A84FF',
    fontWeight: '600',
    fontSize: 16,
  }
});
