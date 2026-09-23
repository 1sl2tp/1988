let enginePromise = null;

function wasmUrl(path) {
  return new URL(path, self.location.href).href;
}

async function getEngine() {
  if (!enginePromise) {
    importScripts(wasmUrl('./newpipe/browser-wrapper.wasm-runtime.js'));
    enginePromise = self.TeaVM.wasmGC.load(wasmUrl('./newpipe/browser-wrapper.wasm'));
  }
  return enginePromise;
}

self.onmessage = async (event) => {
  const { requestId, relay, videoId } = event.data || {};
  if (!requestId || !relay || !videoId) return;

  try {
    const engine = await getEngine();
    const mediaUrl = engine.exports.getFirstProgressiveStreamUrl(
      relay,
      'https://www.youtube.com/watch?v=' + encodeURIComponent(videoId)
    );

    if (!mediaUrl || String(mediaUrl).startsWith('ERROR:')) {
      throw new Error(String(mediaUrl || 'empty_newpipe_url'));
    }

    self.postMessage({ requestId, ok: true, mediaUrl: String(mediaUrl) });
  } catch (error) {
    self.postMessage({ requestId, ok: false, error: String(error) });
  }
};
