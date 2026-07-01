"use client";

import { useEffect, useRef, useState } from "react";

interface SpotifyPanelProps {
  open: boolean;
  onToggle: () => void;
}

interface Track {
  uri: string;
  name: string;
  artists: string;
  albumArt?: string;
  durationMs: number;
}

interface NowPlaying {
  trackName: string;
  artist: string;
  albumArt?: string;
  isPlaying: boolean;
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: any;
  }
}

export default function SpotifyPanel({ open, onToggle }: SpotifyPanelProps) {
  const [token, setToken] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const playerRef = useRef<any>(null);

  // Check URL hash for Spotify access token (after OAuth redirect)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash && hash.includes("access_token")) {
      const params = new URLSearchParams(hash.substring(1));
      const t = params.get("access_token");
      if (t) {
        setToken(t);
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    }
  }, []);

  // Initialize Spotify Web Playback SDK when token arrives
  useEffect(() => {
    if (!token) return;
    if (typeof window === "undefined") return;

    const initPlayer = () => {
      if (!window.Spotify || !window.Spotify.Player) return;
      const player = new window.Spotify.Player({
        name: "LUDO Game",
        getOAuthToken: (cb: (t: string) => void) => cb(token),
        volume: 0.7,
      });
      playerRef.current = player;
      player.connect();
      player.on("ready", ({ device_id }: { device_id: string }) => {
        setDeviceId(device_id);
      });
      player.on("player_state_changed", (state: any) => {
        if (state && state.item) {
          setNowPlaying({
            trackName: state.item.name,
            artist: state.item.artists.map((a: any) => a.name).join(", "),
            albumArt: state.item.album?.images?.[0]?.url,
            isPlaying: !state.paused,
          });
        }
      });
    };

    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
      const s = document.createElement("script");
      s.src = "https://sdk.scdn.co/spotify-player.js";
      document.head.appendChild(s);
    }

    fetchNowPlaying();

    const poll = setInterval(() => {
      if (token) fetchNowPlaying();
    }, 5000);
    return () => clearInterval(poll);
  }, [token]);

  const startAuth = () => {
    if (!clientId) return;
    const redirectUri = encodeURIComponent(
      window.location.origin + window.location.pathname,
    );
    const scopes = encodeURIComponent(
      "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private",
    );
    window.location.href = `https://accounts.spotify.com/authorize?response_type=token&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&show_dialog=false`;
  };

  const fetchNowPlaying = async () => {
    if (!token) return;
    try {
      const res = await fetch("https://api.spotify.com/v1/me/player", {
        headers: { Authorization: "Bearer " + token },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.item) {
          setNowPlaying({
            trackName: data.item.name,
            artist: data.item.artists.map((a: any) => a.name).join(", "),
            albumArt: data.item.album?.images?.[0]?.url,
            isPlaying: !data.is_playing ? false : true,
          });
        }
      }
    } catch {}
  };

  const doSearch = async () => {
    const q = search.trim();
    if (!q || !token) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8`,
        { headers: { Authorization: "Bearer " + token } },
      );
      const data = await res.json();
      setResults(
        (data.tracks?.items || []).map((t: any) => ({
          uri: t.uri,
          name: t.name,
          artists: t.artists.map((a: any) => a.name).join(", "),
          albumArt: t.album?.images?.[0]?.url,
          durationMs: t.duration_ms,
        })),
      );
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const playTrack = async (track: Track) => {
    if (!token) return;
    try {
      let url = "https://api.spotify.com/v1/me/player/play";
      if (deviceId) url += `?device_id=${deviceId}`;
      await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: [track.uri] }),
      });
      setTimeout(fetchNowPlaying, 500);
    } catch {}
  };

  const togglePlay = async () => {
    if (!token || !nowPlaying) return;
    const action = nowPlaying.isPlaying ? "pause" : "play";
    let url = `https://api.spotify.com/v1/me/player/${action}`;
    if (deviceId) url += `?device_id=${deviceId}`;
    try {
      await fetch(url, {
        method: "PUT",
        headers: { Authorization: "Bearer " + token },
      });
      setTimeout(fetchNowPlaying, 300);
    } catch {}
  };

  const next = async () => {
    if (!token) return;
    let url = "https://api.spotify.com/v1/me/player/next";
    if (deviceId) url += `?device_id=${deviceId}`;
    try {
      await fetch(url, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });
      setTimeout(fetchNowPlaying, 300);
    } catch {}
  };

  const prev = async () => {
    if (!token) return;
    let url = "https://api.spotify.com/v1/me/player/previous";
    if (deviceId) url += `?device_id=${deviceId}`;
    try {
      await fetch(url, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });
      setTimeout(fetchNowPlaying, 300);
    } catch {}
  };

  const setVolume = async (val: number) => {
    if (!token) return;
    const v = Math.round(val);
    if (playerRef.current) {
      playerRef.current.setVolume(v / 100).catch(() => {});
    }
    let url = `https://api.spotify.com/v1/me/player/volume?volume_percent=${v}`;
    if (deviceId) url += `&device_id=${deviceId}`;
    try {
      await fetch(url, {
        method: "PUT",
        headers: { Authorization: "Bearer " + token },
      });
    } catch {}
  };

  const disconnect = () => {
    setToken(null);
    setDeviceId(null);
    if (playerRef.current) {
      try {
        playerRef.current.disconnect();
      } catch {}
      playerRef.current = null;
    }
    setNowPlaying(null);
  };

  return (
    <div
      className={`spotify-panel fixed bottom-0 right-0 z-50 ${
        open ? "" : "collapsed"
      }`}
    >
      <button
        onClick={onToggle}
        className="absolute -top-12 right-0 w-12 h-12 rounded-t-xl flex items-center justify-center text-xl text-white transition-colors tv-focusable"
        style={{ background: "#1db954" }}
        aria-label={open ? "Hide music panel" : "Show music panel"}
        title={open ? "Hide music" : "Show music"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
        </svg>
      </button>
      <div
        className="p-4 sp-scroll overflow-y-auto"
        style={{
          background: "#121212",
          border: "1px solid #282828",
          borderBottom: "none",
          borderRadius: "12px 0 0 0",
          width: "min(360px, 92vw)",
          maxHeight: "70vh",
        }}
      >
        {!token ? (
          <div>
            <p className="text-xs mb-3" style={{ color: "#b3b3b3" }}>
              Connect your Spotify account to play music while you play.
            </p>
            <input
              type="text"
              placeholder="Spotify Client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg mb-2"
              style={{
                background: "#282828",
                border: "1px solid #3a3a3a",
                color: "#fff",
                outline: "none",
              }}
            />
            <button
              onClick={startAuth}
              className="text-xs px-3 py-2 rounded-lg font-semibold w-full tv-focusable"
              style={{ background: "#1db954", color: "#fff", border: "none" }}
            >
              Connect Spotify
            </button>
            <p className="text-xs mt-3" style={{ color: "#666" }}>
              Get a Client ID at{" "}
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#1db954" }}
              >
                developer.spotify.com
              </a>
              . Add this page&apos;s URL as a redirect URI in your app settings.
            </p>
          </div>
        ) : (
          <div>
            {nowPlaying && (
              <div
                className="flex items-center gap-3 mb-4 p-3 rounded-lg"
                style={{ background: "#1a1a1a" }}
              >
                {nowPlaying.albumArt && (
                  <img
                    src={nowPlaying.albumArt}
                    alt=""
                    className="w-12 h-12 rounded-md object-cover"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-semibold truncate"
                    style={{ color: "#fff" }}
                  >
                    {nowPlaying.trackName}
                  </div>
                  <div
                    className="text-xs truncate"
                    style={{ color: "#b3b3b3" }}
                  >
                    {nowPlaying.artist}
                  </div>
                </div>
                <button
                  onClick={disconnect}
                  className="text-xs tv-focusable"
                  style={{ color: "#666", background: "none", border: "none" }}
                  title="Disconnect"
                  aria-label="Disconnect Spotify"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="relative mb-3">
              <input
                type="text"
                placeholder="Search songs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") doSearch();
                }}
                className="w-full text-xs px-3 py-2 pl-9 rounded-full"
                style={{
                  background: "#282828",
                  border: "1px solid #3a3a3a",
                  color: "#fff",
                  outline: "none",
                }}
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#666"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>

            <div
              className="space-y-1 mb-4 sp-scroll overflow-y-auto"
              style={{ maxHeight: 200 }}
            >
              {searching && (
                <div className="text-xs p-2" style={{ color: "#666" }}>
                  Searching...
                </div>
              )}
              {!searching && results.length === 0 && search && (
                <div className="text-xs p-2" style={{ color: "#666" }}>
                  No results
                </div>
              )}
              {results.map((t, i) => (
                <button
                  key={i}
                  onClick={() => playTrack(t)}
                  className="sp-track w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors tv-focusable"
                  style={{ background: "transparent", border: "none" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#282828")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  {t.albumArt && (
                    <img
                      src={t.albumArt}
                      alt=""
                      className="w-10 h-10 rounded object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm truncate"
                      style={{ color: "#fff" }}
                    >
                      {t.name}
                    </div>
                    <div
                      className="text-xs truncate"
                      style={{ color: "#b3b3b3" }}
                    >
                      {t.artists}
                    </div>
                  </div>
                  <span className="text-xs" style={{ color: "#666" }}>
                    {formatDuration(t.durationMs)}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-2 mb-3">
              <button
                onClick={prev}
                className="tv-focusable"
                style={{
                  background: "none",
                  border: "none",
                  color: "#b3b3b3",
                  fontSize: 18,
                  padding: 8,
                  borderRadius: "50%",
                  cursor: "pointer",
                }}
                aria-label="Previous track"
              >
                ⏮
              </button>
              <button
                onClick={togglePlay}
                className="tv-focusable"
                style={{
                  background: "none",
                  border: "none",
                  color: "#fff",
                  fontSize: 22,
                  padding: 8,
                  borderRadius: "50%",
                  cursor: "pointer",
                }}
                aria-label={nowPlaying?.isPlaying ? "Pause" : "Play"}
              >
                {nowPlaying?.isPlaying ? "⏸" : "▶"}
              </button>
              <button
                onClick={next}
                className="tv-focusable"
                style={{
                  background: "none",
                  border: "none",
                  color: "#b3b3b3",
                  fontSize: 18,
                  padding: 8,
                  borderRadius: "50%",
                  cursor: "pointer",
                }}
                aria-label="Next track"
              >
                ⏭
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "#666" }}>
                🔉
              </span>
              <input
                type="range"
                min={0}
                max={100}
                defaultValue={70}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: "#1db954" }}
              />
              <span className="text-xs" style={{ color: "#666" }}>
                🔊
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
