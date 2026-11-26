// Android WebViews ignore blob-URL downloads, so exports go through the system share sheet instead.
export const isAndroid = () => window.Capacitor?.isNativePlatform?.() === true;

export async function shareFile(name, content) {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const { uri } = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: name, files: [uri], dialogTitle: 'Save or share' });
}
