import React, { useState, useEffect, useRef } from 'react';
import { 
  Music, 
  Download, 
  Play, 
  Pause, 
  Check, 
  AlertCircle, 
  Loader2, 
  FolderArchive, 
  Search, 
  Sparkles,
  CheckSquare,
  Square,
  MinusSquare,
  X,
  PlayCircle,
  PauseCircle,
  StopCircle,
  Key,
  Info,
  SlidersHorizontal
} from 'lucide-react';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playlist, setPlaylist] = useState(null);
  const [filterText, setFilterText] = useState('');
  
  // Spotify Developer Credentials (Optional, unlocks > 100 tracks pagination)
  const [clientId, setClientId] = useState(() => localStorage.getItem('spotify_client_id') || '');
  const [clientSecret, setClientSecret] = useState(() => localStorage.getItem('spotify_client_secret') || '');
  const [showSettings, setShowSettings] = useState(false);

  // Selection state: Set of track ids
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Track download states: { [trackId]: { status: 'idle' | 'downloading' | 'done' | 'error', filename?: string, display_name?: string, downloadUrl?: string } }
  const [trackStates, setTrackStates] = useState({});

  // Batch download state: 'idle' | 'running' | 'paused'
  const [batchState, setBatchState] = useState('idle');
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, currentTitle: '' });

  // Refs for pause/cancel synchronization in asynchronous loops
  const isPausedRef = useRef(false);
  const isCancelledRef = useRef(false);
  const resumeResolverRef = useRef(null);

  // Audio preview playback
  const [playingTrackId, setPlayingTrackId] = useState(null);
  const audioRef = useRef(new Audio());

  useEffect(() => {
    const audio = audioRef.current;
    const handleEnded = () => setPlayingTrackId(null);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
    };
  }, []);

  const saveCredentials = (newId, newSecret) => {
    setClientId(newId);
    setClientSecret(newSecret);
    localStorage.setItem('spotify_client_id', newId.trim());
    localStorage.setItem('spotify_client_secret', newSecret.trim());
  };

  const togglePreview = (track) => {
    if (!track.preview_url) return;
    
    if (playingTrackId === track.id) {
      audioRef.current.pause();
      setPlayingTrackId(null);
    } else {
      audioRef.current.src = track.preview_url;
      audioRef.current.play().catch(e => console.log('Audio playback prevented:', e));
      setPlayingTrackId(track.id);
    }
  };

  const handleFetchPlaylist = async (customUrl) => {
    const targetUrl = customUrl || url;
    if (!targetUrl.trim()) {
      setError('Por favor ingresa una URL válida de Spotify.');
      return;
    }

    setLoading(true);
    setError('');
    setPlaylist(null);
    setTrackStates({});
    setSelectedIds(new Set());

    try {
      const res = await fetch('/api/playlist/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: targetUrl.trim(),
          client_id: clientId.trim() || undefined,
          client_secret: clientSecret.trim() || undefined
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Error al obtener la playlist');
      }

      setPlaylist(data);
      if (data.tracks && data.tracks.length > 0) {
        setSelectedIds(new Set(data.tracks.map(t => t.id)));
      }
    } catch (err) {
      setError(err.message || 'Error de conexión con el backend.');
    } finally {
      setLoading(false);
    }
  };

  // Selection handlers
  const toggleSelectTrack = (trackId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!playlist || !playlist.tracks) return;
    setSelectedIds(new Set(playlist.tracks.map(t => t.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleSelectGroup = (count) => {
    if (!playlist || !playlist.tracks) return;
    const slice = playlist.tracks.slice(0, count).map(t => t.id);
    setSelectedIds(new Set(slice));
  };

  // Single track download
  const handleDownloadTrack = async (track) => {
    setTrackStates(prev => ({
      ...prev,
      [track.id]: { status: 'downloading' }
    }));

    try {
      const res = await fetch('/api/download/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: track.title,
          artist: track.artist,
          album: track.album || (playlist ? playlist.title : ''),
          cover_url: track.cover_url || (playlist ? playlist.image : ''),
          spotify_id: track.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Fallo en la descarga');
      }

      setTrackStates(prev => ({
        ...prev,
        [track.id]: { 
          status: 'done', 
          filename: data.filename, 
          display_name: data.display_name,
          downloadUrl: data.download_url 
        }
      }));

      return {
        filename: data.filename,
        display_name: data.display_name,
        downloadUrl: data.download_url
      };
    } catch (err) {
      setTrackStates(prev => ({
        ...prev,
        [track.id]: { status: 'error', errorMsg: err.message }
      }));
      return null;
    }
  };

  const triggerBrowserDownload = (downloadUrl, filename) => {
    const a = document.createElement('a');
    a.href = downloadUrl;
    if (filename) a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Wait if paused helper
  const checkPauseOrCancel = async () => {
    while (isPausedRef.current && !isCancelledRef.current) {
      await new Promise(resolve => {
        resumeResolverRef.current = resolve;
        setTimeout(resolve, 300);
      });
    }
    return !isCancelledRef.current;
  };

  // Batch download handler
  const handleStartBatchDownload = async (targetTracks, groupName = 'playlist') => {
    if (!targetTracks || targetTracks.length === 0) return;

    isPausedRef.current = false;
    isCancelledRef.current = false;
    setBatchState('running');
    setBatchProgress({ current: 0, total: targetTracks.length, currentTitle: 'Iniciando...' });

    const downloadedFiles = [];

    for (let i = 0; i < targetTracks.length; i++) {
      const canProceed = await checkPauseOrCancel();
      if (!canProceed || isCancelledRef.current) {
        break;
      }

      const track = targetTracks[i];
      setBatchProgress({
        current: i + 1,
        total: targetTracks.length,
        currentTitle: `${track.artist} - ${track.title}`
      });

      if (trackStates[track.id]?.status === 'done') {
        downloadedFiles.push(trackStates[track.id].filename);
        continue;
      }

      const trackRes = await handleDownloadTrack(track);
      if (trackRes && trackRes.filename) {
        downloadedFiles.push(trackRes.filename);
      }
    }

    if (isCancelledRef.current) {
      setBatchState('idle');
      setBatchProgress({ current: 0, total: 0, currentTitle: '' });
      return;
    }

    if (downloadedFiles.length > 0) {
      setBatchProgress(prev => ({ ...prev, currentTitle: 'Generando archivo ZIP...' }));
      try {
        const zipRes = await fetch('/api/download/zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filenames: downloadedFiles,
            playlist_name: groupName.replace(/[^a-zA-Z0-9_-]/g, '_')
          }),
        });
        const zipData = await zipRes.json();
        if (zipRes.ok && zipData.download_url) {
          triggerBrowserDownload(zipData.download_url, zipData.filename);
        }
      } catch (err) {
        console.error('Error generando ZIP:', err);
      }
    }

    setBatchState('idle');
    setBatchProgress({ current: 0, total: 0, currentTitle: '' });
  };

  const handlePauseBatch = () => {
    isPausedRef.current = true;
    setBatchState('paused');
  };

  const handleResumeBatch = () => {
    isPausedRef.current = false;
    setBatchState('running');
    if (resumeResolverRef.current) {
      resumeResolverRef.current();
      resumeResolverRef.current = null;
    }
  };

  const handleCancelBatch = () => {
    isCancelledRef.current = true;
    isPausedRef.current = false;
    setBatchState('idle');
    if (resumeResolverRef.current) {
      resumeResolverRef.current();
      resumeResolverRef.current = null;
    }
  };

  const filteredTracks = playlist?.tracks?.filter(t => 
    t.title.toLowerCase().includes(filterText.toLowerCase()) ||
    t.artist.toLowerCase().includes(filterText.toLowerCase())
  ) || [];

  const selectedTracksList = playlist?.tracks?.filter(t => selectedIds.has(t.id)) || [];
  const completedCount = Object.values(trackStates).filter(s => s.status === 'done').length;

  const allFilteredSelected = filteredTracks.length > 0 && filteredTracks.every(t => selectedIds.has(t.id));
  const someFilteredSelected = filteredTracks.some(t => selectedIds.has(t.id)) && !allFilteredSelected;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', paddingBottom: batchState !== 'idle' || selectedIds.size > 0 ? 90 : 0 }}>
      {/* Navbar Header */}
      <header style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(12, 13, 17, 0.85)',
        backdropFilter: 'blur(16px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '16px 24px'
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              background: 'linear-gradient(135deg, #1db954, #1ed760)',
              width: 40,
              height: 40,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(29, 185, 84, 0.4)'
            }}>
              <Music color="#000" size={22} strokeWidth={2.5} />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
                Spotify Downloader
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: 'rgba(29, 185, 84, 0.15)',
                  color: '#1ed760',
                  padding: '2px 8px',
                  borderRadius: 9999,
                  border: '1px solid rgba(29, 185, 84, 0.3)'
                }}>
                  320 kbps MP3 + ZIP
                </span>
              </h1>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Descarga por grupo con Pausa / Reanudar e ID incremental</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              style={{
                background: (clientId && clientSecret) ? 'rgba(29, 185, 84, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                color: (clientId && clientSecret) ? '#1ed760' : 'var(--text-secondary)',
                border: (clientId && clientSecret) ? '1px solid rgba(29, 185, 84, 0.4)' : '1px solid var(--border-subtle)',
                borderRadius: 9999,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer'
              }}
              title="Configurar credenciales gratuitas de Spotify Developer para playlists mayores a 100 canciones"
            >
              <Key size={14} />
              <span>{(clientId && clientSecret) ? 'API Activa (+100)' : 'Configurar API (+100)'}</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1ed760' }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#1ed760',
                boxShadow: '0 0 10px #1ed760'
              }} />
              <span>Servidor Activo</span>
            </div>
          </div>
        </div>
      </header>

      {/* API Credentials Modal / Drawer */}
      {showSettings && (
        <div style={{
          background: 'rgba(18, 20, 27, 0.98)',
          borderBottom: '1px solid rgba(29, 185, 84, 0.3)',
          padding: '24px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)'
        }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Key size={18} color="#1ed760" />
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Desbloquear más de 100 canciones (Spotify Developer API)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="btn-icon"
                style={{ width: 28, height: 28 }}
              >
                <X size={16} />
              </button>
            </div>
            
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
              Por defecto, Spotify limita las consultas públicas a <strong>100 canciones</strong>. Si tienes una playlist con más de 300 o 500 canciones, puedes ingresar aquí tu <strong>Client ID</strong> y <strong>Client Secret</strong> gratuitos desde el <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{ color: '#1ed760', textDecoration: 'underline' }}>Spotify Developer Dashboard</a> para habilitar la paginación completa.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Spotify Client ID</label>
                <input
                  type="text"
                  placeholder="Ej. 271089e082be4301827170..."
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  style={{
                    width: '100%',
                    height: 38,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    padding: '0 12px',
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Spotify Client Secret</label>
                <input
                  type="password"
                  placeholder="Ej. a8b4c2d1e9f0..."
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  style={{
                    width: '100%',
                    height: 38,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    padding: '0 12px',
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {(clientId || clientSecret) && (
                <button
                  type="button"
                  onClick={() => saveCredentials('', '')}
                  className="btn-secondary"
                  style={{ height: 36, padding: '0 14px', fontSize: 12, color: '#f87171' }}
                >
                  Borrar Credenciales
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  saveCredentials(clientId, clientSecret);
                  setShowSettings(false);
                }}
                className="btn-primary"
                style={{ height: 36, padding: '0 18px', fontSize: 12 }}
              >
                Guardar y Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 20px', width: '100%', flex: 1 }}>
        {/* Search Panel */}
        <div className="glass-panel" style={{ padding: '32px', marginBottom: 32 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8, letterSpacing: '-0.02em' }}>
            Descarga Canciones de Playlists de Spotify
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24, maxWidth: 650 }}>
            Pega el enlace de cualquier playlist, álbum o pista pública. Puedes seleccionar canciones individualmente o por grupos y descargarlas empaquetadas en un archivo <strong>ZIP</strong>.
          </p>

          <form onSubmit={(e) => { e.preventDefault(); handleFetchPlaylist(); }} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px', position: 'relative' }}>
              <input
                type="text"
                placeholder="https://open.spotify.com/playlist/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                style={{
                  width: '100%',
                  height: 52,
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 14,
                  padding: '0 18px',
                  color: '#fff',
                  fontSize: 15,
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--spotify-green)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ height: 52, padding: '0 28px', fontSize: 15 }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Analizando...</span>
                </>
              ) : (
                <>
                  <Search size={18} />
                  <span>Obtener Canciones</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Examples */}
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Probar ejemplo:</span>
            <button
              type="button"
              onClick={() => {
                const sampleUrl = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
                setUrl(sampleUrl);
                handleFetchPlaylist(sampleUrl);
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 9999,
                color: 'var(--text-secondary)',
                padding: '4px 12px',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Sparkles size={13} color="#1ed760" />
              Today's Top Hits
            </button>
          </div>

          {error && (
            <div style={{
              marginTop: 20,
              padding: '14px 18px',
              borderRadius: 12,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 14
            }}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Playlist View */}
        {playlist && (
          <div>
            {/* Playlist Header Card */}
            <div className="glass-panel" style={{
              padding: 28,
              marginBottom: 20,
              display: 'flex',
              gap: 24,
              alignItems: 'center',
              flexWrap: 'wrap',
              background: 'linear-gradient(180deg, rgba(29, 185, 84, 0.08) 0%, rgba(21, 23, 30, 0.7) 100%)'
            }}>
              {playlist.image ? (
                <img
                  src={playlist.image}
                  alt={playlist.title}
                  style={{
                    width: 140,
                    height: 140,
                    borderRadius: 14,
                    objectFit: 'cover',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
                  }}
                />
              ) : (
                <div style={{
                  width: 140,
                  height: 140,
                  borderRadius: 14,
                  background: '#24283b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Music size={48} color="var(--text-muted)" />
                </div>
              )}

              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: '#1ed760', textTransform: 'uppercase' }}>
                  {playlist.type || 'Playlist'}
                </div>
                <h2 style={{ fontSize: 28, fontWeight: 800, margin: '4px 0 8px', letterSpacing: '-0.02em' }}>
                  {playlist.title}
                </h2>
                {playlist.subtitle && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12 }}>
                    {playlist.subtitle}
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                  <span>{playlist.tracks.length} canciones cargadas</span>
                  <span>•</span>
                  <span>{completedCount} descargadas</span>
                  <span>•</span>
                  <span style={{ color: '#1ed760', fontWeight: 600 }}>{selectedIds.size} seleccionadas</span>
                </div>
              </div>

              {/* Action Buttons in Header */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => handleStartBatchDownload(selectedTracksList, `${playlist.title}_grupo`)}
                  disabled={batchState !== 'idle' || selectedIds.size === 0}
                  className="btn-primary"
                  style={{ height: 46, padding: '0 22px' }}
                >
                  <FolderArchive size={18} />
                  <span>Descargar Seleccionadas en ZIP ({selectedIds.size})</span>
                </button>
              </div>
            </div>

            {/* Notice if capped at 100 tracks */}
            {playlist.is_limited && (
              <div style={{
                marginBottom: 20,
                padding: '12px 18px',
                borderRadius: 12,
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                color: '#facc15',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <Info size={18} style={{ flexShrink: 0 }} />
                  <span>
                    Mostrando las primeras <strong>100 canciones</strong> (tope de la consulta pública de Spotify). Para cargar más de 300 canciones, configura tus credenciales gratuitas de desarrollador.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  style={{
                    background: '#facc15',
                    color: '#000',
                    fontWeight: 700,
                    fontSize: 12,
                    padding: '5px 14px',
                    borderRadius: 9999,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Desbloquear +100 canciones
                </button>
              </div>
            )}

            {/* Selection Toolbar & Filter Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              gap: 16,
              flexWrap: 'wrap'
            }}>
              {/* Group selection pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Seleccionar:</span>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 9999,
                    color: '#fff',
                    padding: '4px 10px',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  Todas ({playlist.tracks.length})
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectGroup(10)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 9999,
                    color: 'var(--text-secondary)',
                    padding: '4px 10px',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  Primeras 10
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectGroup(25)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 9999,
                    color: 'var(--text-secondary)',
                    padding: '4px 10px',
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  Primeras 25
                </button>
                {playlist.tracks.length > 50 && (
                  <button
                    type="button"
                    onClick={() => handleSelectGroup(50)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 9999,
                      color: 'var(--text-secondary)',
                      padding: '4px 10px',
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Primeras 50
                  </button>
                )}
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#f87171',
                      padding: '4px 8px',
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Deseleccionar
                  </button>
                )}
              </div>

              {/* Filter Search Input */}
              <div style={{ position: 'relative', width: 280 }}>
                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Filtrar por título o artista..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  style={{
                    width: '100%',
                    height: 38,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 9999,
                    padding: '0 14px 0 38px',
                    color: '#fff',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Tracklist Table */}
            <div className="glass-panel" style={{ overflow: 'hidden' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '36px 48px 36px 1fr 100px 130px',
                padding: '12px 18px',
                borderBottom: '1px solid var(--border-subtle)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-muted)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                alignItems: 'center'
              }}>
                {/* Select All Checkbox */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (allFilteredSelected) {
                        handleDeselectAll();
                      } else {
                        handleSelectAll();
                      }
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#1ed760', cursor: 'pointer', display: 'flex' }}
                    title={allFilteredSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                  >
                    {allFilteredSelected ? (
                      <CheckSquare size={18} />
                    ) : someFilteredSelected ? (
                      <MinusSquare size={18} />
                    ) : (
                      <Square size={18} color="var(--text-muted)" />
                    )}
                  </button>
                </div>

                {/* Incremental ID column header */}
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>#</div>

                {/* Preview column header */}
                <div style={{ textAlign: 'center' }}>Demo</div>

                {/* Title & Artist */}
                <div>Título & Artista</div>

                {/* Duration */}
                <div style={{ textAlign: 'center' }}>Duración</div>

                {/* Action */}
                <div style={{ textAlign: 'right' }}>Descarga</div>
              </div>

              {filteredTracks.map((track, index) => {
                const trackNumber = index + 1;
                const trackState = trackStates[track.id] || { status: 'idle' };
                const isPlaying = playingTrackId === track.id;
                const isSelected = selectedIds.has(track.id);

                return (
                  <div
                    key={track.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '36px 48px 36px 1fr 100px 130px',
                      padding: '10px 18px',
                      alignItems: 'center',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      backgroundColor: isSelected ? 'rgba(29, 185, 84, 0.04)' : 'transparent',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isSelected ? 'rgba(29, 185, 84, 0.04)' : 'transparent';
                    }}
                  >
                    {/* Checkbox */}
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleSelectTrack(track.id)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}
                      >
                        {isSelected ? (
                          <CheckSquare size={18} color="#1ed760" />
                        ) : (
                          <Square size={18} color="var(--text-muted)" />
                        )}
                      </button>
                    </div>

                    {/* Incremental ID (1 to n) */}
                    <div style={{
                      textAlign: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      color: isPlaying ? '#1ed760' : 'var(--text-muted)'
                    }}>
                      {trackNumber}
                    </div>

                    {/* Dedicated Preview Play Button */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      {track.preview_url ? (
                        <button
                          type="button"
                          onClick={() => togglePreview(track)}
                          className="btn-icon"
                          style={{
                            width: 30,
                            height: 30,
                            background: isPlaying ? 'var(--spotify-green)' : 'rgba(255, 255, 255, 0.06)',
                            color: isPlaying ? '#000' : '#fff'
                          }}
                          title={isPlaying ? 'Pausar preview' : 'Escuchar preview (30s)'}
                        >
                          {isPlaying ? <Pause size={13} /> : <Play size={13} style={{ marginLeft: 2 }} />}
                        </button>
                      ) : (
                        <span style={{ color: 'rgba(255, 255, 255, 0.15)', fontSize: 12 }}>—</span>
                      )}
                    </div>

                    {/* Track Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, paddingRight: 16 }}>
                      {track.cover_url && (
                        <img
                          src={track.cover_url}
                          alt={track.title}
                          style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                        />
                      )}
                      <div style={{ minWidth: 0, overflow: 'hidden' }}>
                        <div style={{
                          fontWeight: 600,
                          fontSize: 14,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: isPlaying ? '#1ed760' : '#fff'
                        }}>
                          {track.title}
                        </div>
                        <div style={{
                          fontSize: 13,
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {track.artist}
                        </div>
                      </div>
                    </div>

                    {/* Duration */}
                    <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
                      <span>{track.duration_formatted}</span>
                    </div>

                    {/* Action Button */}
                    <div style={{ textAlign: 'right' }}>
                      {trackState.status === 'idle' && (
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await handleDownloadTrack(track);
                            if (res && res.downloadUrl) {
                              triggerBrowserDownload(res.downloadUrl, res.display_name || res.filename);
                            }
                          }}
                          className="btn-secondary"
                          style={{ padding: '6px 14px', fontSize: 12 }}
                        >
                          <Download size={14} />
                          <span>MP3</span>
                        </button>
                      )}

                      {trackState.status === 'downloading' && (
                        <button
                          type="button"
                          disabled
                          className="btn-secondary"
                          style={{ padding: '6px 14px', fontSize: 12, opacity: 0.8 }}
                        >
                          <Loader2 size={14} className="animate-spin" color="#1ed760" />
                          <span>Descargando...</span>
                        </button>
                      )}

                      {trackState.status === 'done' && (
                        <button
                          type="button"
                          onClick={() => triggerBrowserDownload(trackState.downloadUrl, trackState.display_name || trackState.filename)}
                          style={{
                            background: 'rgba(29, 185, 84, 0.15)',
                            color: '#1ed760',
                            border: '1px solid rgba(29, 185, 84, 0.3)',
                            padding: '6px 14px',
                            borderRadius: 9999,
                            fontSize: 12,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            cursor: 'pointer'
                          }}
                        >
                          <Check size={14} />
                          <span>Guardar</span>
                        </button>
                      )}

                      {trackState.status === 'error' && (
                        <button
                          type="button"
                          onClick={() => handleDownloadTrack(track)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            padding: '6px 12px',
                            borderRadius: 9999,
                            fontSize: 12,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            cursor: 'pointer'
                          }}
                        >
                          <AlertCircle size={14} />
                          <span>Reintentar</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Floating Batch Control Bar */}
      {(batchState !== 'idle' || selectedIds.size > 0) && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: 820,
          background: 'rgba(18, 20, 27, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(29, 185, 84, 0.4)',
          borderRadius: 18,
          padding: '14px 24px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7), 0 0 20px rgba(29, 185, 84, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          zIndex: 100,
          flexWrap: 'wrap'
        }}>
          {/* Left: Info / Progress */}
          <div style={{ flex: '1 1 240px' }}>
            {batchState === 'idle' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  background: 'var(--spotify-green)',
                  color: '#000',
                  fontWeight: 800,
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 9999
                }}>
                  {selectedIds.size}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  canciones seleccionadas para descargar en ZIP
                </span>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {batchState === 'running' ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1ed760', fontSize: 13, fontWeight: 700 }}>
                        <Loader2 size={15} className="animate-spin" /> Descargando ({batchProgress.current} de {batchProgress.total})
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#facc15', fontSize: 13, fontWeight: 700 }}>
                        <PauseCircle size={15} /> Descarga Pausada ({batchProgress.current} de {batchProgress.total})
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {Math.round((batchProgress.current / (batchProgress.total || 1)) * 100)}%
                  </span>
                </div>
                {/* Progress track */}
                <div style={{ width: '100%', height: 6, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(batchProgress.current / (batchProgress.total || 1)) * 100}%`,
                    height: '100%',
                    background: batchState === 'paused' ? '#facc15' : 'linear-gradient(90deg, #1db954, #1ed760)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                {batchProgress.currentTitle && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {batchProgress.currentTitle}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {batchState === 'idle' ? (
              <>
                <button
                  type="button"
                  onClick={() => handleStartBatchDownload(selectedTracksList, `${playlist?.title || 'playlist'}_grupo`)}
                  disabled={selectedIds.size === 0}
                  className="btn-primary"
                  style={{ height: 42, padding: '0 20px', fontSize: 13 }}
                >
                  <FolderArchive size={16} />
                  <span>Descargar Grupo en ZIP</span>
                </button>

                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="btn-secondary"
                  style={{ height: 42, padding: '0 14px', fontSize: 13 }}
                  title="Limpiar selección"
                >
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                {batchState === 'running' ? (
                  <button
                    type="button"
                    onClick={handlePauseBatch}
                    className="btn-secondary"
                    style={{ height: 42, padding: '0 18px', fontSize: 13, color: '#facc15', borderColor: 'rgba(250, 204, 21, 0.4)' }}
                  >
                    <PauseCircle size={16} />
                    <span>Pausar</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleResumeBatch}
                    className="btn-primary"
                    style={{ height: 42, padding: '0 18px', fontSize: 13 }}
                  >
                    <PlayCircle size={16} />
                    <span>Reanudar</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCancelBatch}
                  className="btn-secondary"
                  style={{ height: 42, padding: '0 14px', fontSize: 13, color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  title="Cancelar descarga en grupo"
                >
                  <StopCircle size={16} />
                  <span>Cancelar</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{
        marginTop: 'auto',
        borderTop: '1px solid var(--border-subtle)',
        padding: '24px',
        textAlign: 'center',
        fontSize: 13,
        color: 'var(--text-muted)'
      }}>
        Desarrollado con React + FastAPI + yt-dlp • Soporta paginación ilimitada • Para uso educativo y personal
      </footer>
    </div>
  );
}
