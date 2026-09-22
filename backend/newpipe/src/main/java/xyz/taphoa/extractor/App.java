package xyz.taphoa.extractor;

import com.google.gson.Gson;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.schabi.newpipe.extractor.MediaFormat;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException;
import org.schabi.newpipe.extractor.localization.ContentCountry;
import org.schabi.newpipe.extractor.localization.Localization;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamInfo;
import org.schabi.newpipe.extractor.stream.VideoStream;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;

public final class App {
    private static final Gson GSON = new Gson();
    private static final long CACHE_MS = 45_000L;
    private static final Map<String, CachedStream> CACHE = new ConcurrentHashMap<>();

    public static void main(String[] args) throws Exception {
        NewPipe.init(new JdkDownloader(), new Localization("vi", "VN"), new ContentCountry("VN"));

        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "10000"));
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        server.createContext("/health", App::health);
        server.createContext("/stream", App::stream);
        server.createContext("/media", App::media);
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        System.out.println("1988 NewPipe extractor listening on :" + port);
    }

    private static void health(HttpExchange ex) throws IOException {
        if (preflight(ex)) return;
        json(ex, 200, Map.of("ok", true, "source", "newpipe", "extractor", "0.26.5"));
    }

    private static void stream(HttpExchange ex) throws IOException {
        if (preflight(ex)) return;
        try {
            String id = videoId(ex);
            StreamInfo info = getInfo(id);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", true);
            out.put("source", "newpipe");
            out.put("data", payload(id, info));
            json(ex, 200, out);
        } catch (Exception e) {
            e.printStackTrace();
            json(ex, 502, Map.of("ok", false, "error", "extract_failed"));
        }
    }

    private static void media(HttpExchange ex) throws IOException {
        if (preflight(ex)) return;
        try {
            String id = videoId(ex);
            Map<String, String> q = query(ex.getRequestURI().getRawQuery());
            String kind = q.getOrDefault("kind", "video").toLowerCase(Locale.ROOT);
            StreamInfo info = getInfo(id);
            String target;
            if ("audio".equals(kind)) {
                target = bestAudio(info);
                if (target == null || target.isBlank()) target = clean(info.getHlsUrl());
            } else {
                target = bestVideo(info);
                if (target == null || target.isBlank()) target = clean(info.getHlsUrl());
            }
            if (target == null || target.isBlank()) {
                json(ex, 404, Map.of("ok", false, "error", "no_media"));
                return;
            }
            cors(ex.getResponseHeaders());
            ex.getResponseHeaders().set("Cache-Control", "no-store");
            ex.getResponseHeaders().set("Location", target);
            ex.sendResponseHeaders(302, -1);
            ex.close();
        } catch (Exception e) {
            e.printStackTrace();
            json(ex, 502, Map.of("ok", false, "error", "media_failed"));
        }
    }

    private static StreamInfo getInfo(String id) throws Exception {
        CachedStream cached = CACHE.get(id);
        long now = System.currentTimeMillis();
        if (cached != null && now - cached.at < CACHE_MS) return cached.info;
        StreamInfo info = StreamInfo.getInfo("https://www.youtube.com/watch?v=" + id);
        CACHE.put(id, new CachedStream(now, info));
        if (CACHE.size() > 100) {
            CACHE.entrySet().removeIf(e -> now - e.getValue().at > CACHE_MS);
        }
        return info;
    }

    private static Map<String, Object> payload(String id, StreamInfo info) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", id);
        data.put("title", info.getName());
        data.put("uploader", info.getUploaderName());
        data.put("duration", info.getDuration());
        data.put("streamType", String.valueOf(info.getStreamType()));
        data.put("hls", clean(info.getHlsUrl()));
        data.put("dash", clean(info.getDashMpdUrl()));
        data.put("sources", videoRows(info.getVideoStreams()));
        data.put("videoOnlySources", videoRows(info.getVideoOnlyStreams()));
        data.put("audioSources", audioRows(info.getAudioStreams()));
        return data;
    }

    private static List<Map<String, Object>> videoRows(List<VideoStream> streams) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (streams == null) return rows;
        streams.stream()
                .filter(s -> s != null && s.isUrl() && clean(s.getContent()) != null)
                .sorted(videoComparator())
                .forEach(s -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("url", s.getContent());
                    row.put("mimeType", mime(s.getFormat()));
                    row.put("format", s.getFormat() == null ? "" : s.getFormat().name());
                    row.put("quality", s.getResolution());
                    row.put("width", s.getWidth());
                    row.put("height", s.getHeight());
                    row.put("fps", s.getFps());
                    row.put("bitrate", s.getBitrate());
                    row.put("codec", s.getCodec());
                    rows.add(row);
                });
        return rows;
    }

    private static List<Map<String, Object>> audioRows(List<AudioStream> streams) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (streams == null) return rows;
        streams.stream()
                .filter(s -> s != null && s.isUrl() && clean(s.getContent()) != null)
                .sorted(audioComparator())
                .forEach(s -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("url", s.getContent());
                    row.put("mimeType", mime(s.getFormat()));
                    row.put("format", s.getFormat() == null ? "" : s.getFormat().name());
                    row.put("bitrate", Math.max(s.getAverageBitrate(), s.getBitrate()));
                    row.put("codec", s.getCodec());
                    rows.add(row);
                });
        return rows;
    }

    private static String bestVideo(StreamInfo info) {
        if (info.getVideoStreams() == null) return null;
        return info.getVideoStreams().stream()
                .filter(s -> s != null && s.isUrl() && clean(s.getContent()) != null)
                .sorted(videoComparator())
                .map(VideoStream::getContent)
                .findFirst().orElse(null);
    }

    private static String bestAudio(StreamInfo info) {
        if (info.getAudioStreams() == null) return null;
        return info.getAudioStreams().stream()
                .filter(s -> s != null && s.isUrl() && clean(s.getContent()) != null)
                .sorted(audioComparator())
                .map(AudioStream::getContent)
                .findFirst().orElse(null);
    }

    private static Comparator<VideoStream> videoComparator() {
        return Comparator
                .comparingInt((VideoStream s) -> isMp4(s.getFormat()) ? 1 : 0).reversed()
                .thenComparingInt(VideoStream::getHeight).reversed()
                .thenComparingInt(VideoStream::getBitrate).reversed();
    }

    private static Comparator<AudioStream> audioComparator() {
        return Comparator
                .comparingInt((AudioStream s) -> isMp4(s.getFormat()) ? 1 : 0).reversed()
                .thenComparingInt(s -> Math.max(s.getAverageBitrate(), s.getBitrate())).reversed();
    }

    private static boolean isMp4(MediaFormat f) {
        return f == MediaFormat.MPEG_4 || f == MediaFormat.M4A;
    }

    private static String mime(MediaFormat f) {
        return f == null ? "" : String.valueOf(f.getMimeType());
    }

    private static String videoId(HttpExchange ex) {
        String id = query(ex.getRequestURI().getRawQuery()).getOrDefault("id", "");
        if (!id.matches("[A-Za-z0-9_-]{11}")) throw new IllegalArgumentException("invalid video id");
        return id;
    }

    private static Map<String, String> query(String raw) {
        Map<String, String> out = new HashMap<>();
        if (raw == null || raw.isBlank()) return out;
        for (String part : raw.split("&")) {
            int p = part.indexOf('=');
            String k = p < 0 ? part : part.substring(0, p);
            String v = p < 0 ? "" : part.substring(p + 1);
            out.put(URLDecoder.decode(k, StandardCharsets.UTF_8), URLDecoder.decode(v, StandardCharsets.UTF_8));
        }
        return out;
    }

    private static boolean preflight(HttpExchange ex) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
            cors(ex.getResponseHeaders());
            ex.sendResponseHeaders(204, -1);
            ex.close();
            return true;
        }
        return false;
    }

    private static void json(HttpExchange ex, int status, Object body) throws IOException {
        byte[] bytes = GSON.toJson(body).getBytes(StandardCharsets.UTF_8);
        Headers h = ex.getResponseHeaders();
        cors(h);
        h.set("Content-Type", "application/json; charset=utf-8");
        h.set("Cache-Control", "no-store");
        ex.sendResponseHeaders(status, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }

    private static void cors(Headers h) {
        h.set("Access-Control-Allow-Origin", "*");
        h.set("Access-Control-Allow-Methods", "GET,OPTIONS");
        h.set("Access-Control-Allow-Headers", "Content-Type,Range");
        h.set("Access-Control-Expose-Headers", "Location,Content-Range,Accept-Ranges");
    }

    private static String clean(String value) {
        if (value == null || value.isBlank()) return null;
        return value;
    }

    private record CachedStream(long at, StreamInfo info) {}

    private static final class JdkDownloader extends Downloader {
        private final HttpClient client = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.ALWAYS)
                .connectTimeout(Duration.ofSeconds(12))
                .build();

        @Override
        public Response execute(Request request) throws IOException, ReCaptchaException {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(request.url()))
                    .timeout(Duration.ofSeconds(20));

            boolean hasUserAgent = false;
            for (Map.Entry<String, List<String>> entry : request.headers().entrySet()) {
                String name = entry.getKey();
                if (name == null) continue;
                if (name.equalsIgnoreCase("host") || name.equalsIgnoreCase("content-length")
                        || name.equalsIgnoreCase("connection") || name.equalsIgnoreCase("accept-encoding")) {
                    continue;
                }
                if (name.equalsIgnoreCase("user-agent")) hasUserAgent = true;
                for (String value : entry.getValue()) {
                    if (value != null) builder.header(name, value);
                }
            }
            if (!hasUserAgent) {
                builder.header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/132 Safari/537.36");
            }
            builder.header("Accept-Encoding", "identity");

            String method = request.httpMethod().toUpperCase(Locale.ROOT);
            byte[] data = request.dataToSend();
            if ("HEAD".equals(method)) {
                builder.method("HEAD", HttpRequest.BodyPublishers.noBody());
            } else if (data != null) {
                builder.method(method, HttpRequest.BodyPublishers.ofByteArray(data));
            } else {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            }

            try {
                HttpResponse<byte[]> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
                byte[] body = response.body() == null ? new byte[0] : response.body();
                String encoding = response.headers().firstValue("content-encoding").orElse("");
                if ("gzip".equalsIgnoreCase(encoding)) body = gunzip(body);
                String text = new String(body, StandardCharsets.UTF_8);
                return new Response(response.statusCode(), "", response.headers().map(), text, response.uri().toString());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("request interrupted", e);
            }
        }

        private static byte[] gunzip(byte[] source) throws IOException {
            try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(source));
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                gzip.transferTo(out);
                return out.toByteArray();
            }
        }
    }
}
