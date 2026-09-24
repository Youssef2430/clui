import {
  findMacDownload,
  LATEST_RELEASE_API,
  RELEASES_URL,
} from "../../lib/releases";

export async function GET(request: Request) {
  const architecture = new URL(request.url).searchParams.get("arch") ?? "arm64";
  if (architecture !== "arm64" && architecture !== "x64") {
    return new Response("Choose Apple Silicon (arm64) or Intel (x64).", {
      status: 400,
    });
  }

  let destination = `${RELEASES_URL}/latest`;
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "glui-website",
      },
      // Share release metadata across visitors without tying downloads to a deploy.
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      destination =
        findMacDownload(await response.json(), architecture) ?? destination;
    }
  } catch {
    // GitHub's release page remains usable during API outages or rate limiting.
  }

  return new Response(null, {
    status: 307,
    headers: { Location: destination, "Cache-Control": "no-store" },
  });
}
