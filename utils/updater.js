import { Linking } from 'react-native';
import RNFS from 'react-native-fs';

const GITHUB_OWNER = 'qutlawsoasis-debug';
const GITHUB_REPO = 'AirTag';
const CURRENT_VERSION = require('../package.json').version;

export async function checkForUpdate(onUpdateAvailable) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
    );
    if (!res.ok) return;

    const data = await res.json();
    const latestVersion = data.tag_name.replace(/^v/, '');

    if (latestVersion === CURRENT_VERSION) return;

    const apkAsset = data.assets?.find(a => a.name.endsWith('.apk'));
    if (!apkAsset) return;

    onUpdateAvailable({
      version: latestVersion,
      downloadUrl: apkAsset.browser_download_url,
    });
  } catch (e) {
    console.log('Update check failed:', e);
  }
}

export async function downloadUpdate(url, version, onProgress) {
  const destPath = `${RNFS.DownloadDirectoryPath}/AirTag-${version}.apk`;

  const job = RNFS.downloadFile({
    fromUrl: url,
    toFile: destPath,
    progress: (res) => {
      const progress = res.bytesWritten / res.contentLength;
      onProgress(progress);
    },
    progressDivider: 1,
  });

  await job.promise;
  await Linking.openURL(`file://${destPath}`);
}
