import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, Animated
} from 'react-native';
import { checkForUpdate, downloadUpdate } from './utils/updater';

export default function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const slideAnim = useState(new Animated.Value(100))[0];

  useEffect(() => {
    checkForUpdate((info) => {
      setUpdateInfo(info);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  if (!updateInfo) return null;

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
    }
  };

  return (
    <Animated.View
      style={[
        styles.banner,
        { transform: [{ translateY: slideAnim }] }
      ]}
    >
      {!downloading ? (
        <>
          <Text style={styles.text}>
            Доступно обновление {updateInfo.version}
          </Text>
          <TouchableOpacity onPress={handleDownload} style={styles.button}>
            <Text style={styles.buttonText}>Скачать сейчас</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.text}>
            Загрузка... {Math.round(progress * 100)}%
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1c1c1e',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#2c2c2e',
    zIndex: 9999,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    flex: 1,
  },
  button: {
    backgroundColor: '#0a84ff',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#3a3a3c',
    borderRadius: 2,
    marginLeft: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0a84ff',
    borderRadius: 2,
  },
});
