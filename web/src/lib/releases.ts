export const RELEASES_URL = "https://github.com/Youssef2430/clui/releases";
export const LEGACY_INTEL_DOWNLOAD_URL = `${RELEASES_URL}/download/v0.1.17/Clui-0.1.17.dmg`;
export const LATEST_RELEASE_API =
  "https://api.github.com/repos/Youssef2430/clui/releases/latest";

export type MacArchitecture = "arm64" | "x64";

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  state?: string;
};

export function findMacDownload(
  release: { assets?: ReleaseAsset[] },
  architecture: MacArchitecture,
): string | undefined {
  // Earlier Clui releases omitted the architecture suffix on Intel DMGs.
  const names =
    architecture === "arm64"
      ? [/^(?:glui|clui)-.+-arm64\.dmg$/i]
      : [
          /^(?:glui|clui)-.+-(?:x64|x86_64)\.dmg$/i,
          /^(?:glui|clui)-\d+\.\d+\.\d+\.dmg$/i,
        ];
  if (!Array.isArray(release.assets)) return undefined;
  for (const name of names) {
    const asset = release.assets.find(
      (asset) =>
        name.test(asset.name) &&
        (!asset.state || asset.state === "uploaded") &&
        asset.browser_download_url?.startsWith(`${RELEASES_URL}/download/`),
    );
    if (asset) return asset.browser_download_url;
  }
}
