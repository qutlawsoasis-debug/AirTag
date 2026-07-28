import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';

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
  console.log('downloadUpdate called', url, version);
  
  const destPath = FileSystem.cacheDirectory + `AirTag-${version}.apk`;
  console.log('destPath:', destPath);

  try {
    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      destPath,
      {},
      (progress) => {
        const percent = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
        console.log('progress:', percent);
        onProgress(percent);
      }
    );

    console.log('starting download...');
    const result = await downloadResumable.downloadAsync();
    console.log('download complete:', result);

    console.log('getting content uri...');
    const contentUri = await FileSystem.getContentUriAsync(destPath);
    console.log('contentUri:', contentUri);

    console.log('launching intent...');
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: 'application/vnd.android.package-archive',
    });
    console.log('intent launched');
  } catch (e) {
    console.error('downloadUpdate error:', e);
    throw e;
  }
}
