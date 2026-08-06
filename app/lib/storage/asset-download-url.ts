// One read path for every uploaded asset. An absent key and an unreachable
// object both mean "no file" to every surface that shows one, and neither may
// throw into a loader: a single broken object must not blank a whole detail
// view (#571).
export async function loadOptionalAssetDownloadUrl(input: {
  createSignedUrl: (storageKey: string) => Promise<string>;
  storageKey: string | null;
}) {
  if (!input.storageKey) {
    return null;
  }

  try {
    return await input.createSignedUrl(input.storageKey);
  } catch {
    return null;
  }
}
