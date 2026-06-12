// 1. Elemen Utama DOM
const videoElement = document.getElementById('video-player');
const videoWrapper = document.getElementById('video-wrapper');
const channelListEl = document.getElementById('channel-list');
const loadingOverlay = document.getElementById('loading-overlay');
const errorOverlay = document.getElementById('error-overlay');
const brandingScreen = document.getElementById('branding-screen');
const mainPlayerWrapper = document.getElementById('main-player-wrapper');

const prevCategoryBtn = document.getElementById('prev-category-btn');
const nextCategoryBtn = document.getElementById('next-category-btn');
const currentCategoryBox = document.getElementById('current-category-box');

// Elemen Custom UI Controls
const playBtn = document.getElementById('play-btn');
const muteBtn = document.getElementById('mute-btn');
const volumeSlider = document.getElementById('volume-slider');
const fullscreenBtn = document.getElementById('fullscreen-btn');

// Kumpulan Menu Dropdown
const qualityBtn = document.getElementById('quality-btn');
const qualityLabel = document.getElementById('quality-label');
const qualityMenu = document.getElementById('quality-menu');

const subtitleBox = document.getElementById('subtitle-box');
const subtitleBtn = document.getElementById('subtitle-btn');
const subtitleMenu = document.getElementById('subtitle-menu');

// 2. URL Playlist & State
const PLAYLIST_URL = "https://playweb.natztv.my.id";
let channels = []; 
let groups = []; 
let currentGroupIndex = 0; 
let currentPlayingUrl = ''; 
let controlsTimeout = null;

let shakaPlayerInstance = null;
let hlsInstance = null;

// 3. Init Aplikasi
async function initApp() {
    shaka.polyfill.installAll();
    setupCustomControls();
    setupVideoNativeEvents(); 
    setupAutoHideControls(); 
    
    try {
        const response = await fetch(PLAYLIST_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        channels = await response.json();
        
        setupFilterOptions(); 
        renderChannels('all');
    } catch (error) {
        console.error("Gagal memuat playlist:", error);
        channelListEl.innerHTML = `<p style="text-align:center;color:#f87171;padding:20px;font-size:0.8rem;">Gagal mengambil data playlist.</p>`;
    }
}

// 4. Logika Pengendali Kontrol Kustom Video
function setupCustomControls() {
    playBtn.addEventListener('click', () => {
        if (videoElement.paused) videoElement.play();
        else videoElement.pause();
    });

    videoElement.addEventListener('play', () => playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>');
    videoElement.addEventListener('pause', () => playBtn.innerHTML = '<i class="fa-solid fa-play"></i>');

    muteBtn.addEventListener('click', () => {
        videoElement.muted = !videoElement.muted;
        updateVolumeIcon();
    });

    volumeSlider.addEventListener('input', (e) => {
        videoElement.volume = e.target.value;
        videoElement.muted = (e.target.value == 0);
        updateVolumeIcon();
    });

    fullscreenBtn.addEventListener('click', () => {
        if (videoElement.webkitEnterFullscreen && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            videoElement.webkitEnterFullscreen();
            return;
        }

        const isFullscreenActive = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;

        if (!isFullscreenActive) {
            const requestFS = videoWrapper.requestFullscreen || videoWrapper.webkitRequestFullscreen || videoWrapper.mozRequestFullScreen || videoWrapper.msRequestFullscreen;
            if (requestFS) {
                requestFS.call(videoWrapper).then(() => {
                    if (screen.orientation && screen.orientation.lock) {
                        screen.orientation.lock('landscape').catch(() => {});
                    }
                }).catch(err => console.error(err));
            }
        } else {
            const exitFS = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msFullscreenElement;
            if (exitFS) exitFS.call(document);
        }
    });

    function closeAllMenus() {
        qualityMenu.classList.add('hidden');
        subtitleMenu.classList.add('hidden');
    }

    qualityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = qualityMenu.classList.contains('hidden');
        closeAllMenus();
        if (isHidden) qualityMenu.classList.remove('hidden');
        resetControlsTimeout(); 
    });

    subtitleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = subtitleMenu.classList.contains('hidden');
        closeAllMenus();
        if (isHidden) subtitleMenu.classList.remove('hidden');
        resetControlsTimeout();
    });

    document.addEventListener('click', closeAllMenus);

    prevCategoryBtn.addEventListener('click', () => {
        if (groups.length === 0) return;
        currentGroupIndex = (currentGroupIndex - 1 + groups.length) % groups.length;
        updateCategoryUI();
    });

    nextCategoryBtn.addEventListener('click', () => {
        if (groups.length === 0) return;
        currentGroupIndex = (currentGroupIndex + 1) % groups.length;
        updateCategoryUI();
    });
}

function setupAutoHideControls() {
    videoWrapper.addEventListener('mousemove', resetControlsTimeout);
    videoWrapper.addEventListener('click', resetControlsTimeout);
    videoWrapper.addEventListener('touchstart', resetControlsTimeout, {passive: true});
    videoElement.addEventListener('play', resetControlsTimeout);
    videoElement.addEventListener('pause', resetControlsTimeout); 
}

function resetControlsTimeout() {
    videoWrapper.classList.add('show-controls'); 
    clearTimeout(controlsTimeout);

    const isMenuOpen = !qualityMenu.classList.contains('hidden') || !subtitleMenu.classList.contains('hidden');

    if (!videoElement.paused && !isMenuOpen) {
        controlsTimeout = setTimeout(() => {
            videoWrapper.classList.remove('show-controls'); 
        }, 3000);
    }
}

function updateVolumeIcon() {
    if (videoElement.muted || videoElement.volume === 0) muteBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
    else if (videoElement.volume < 0.5) muteBtn.innerHTML = '<i class="fa-solid fa-volume-low"></i>';
    else muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
}

function setupVideoNativeEvents() {
    videoElement.addEventListener('playing', hideLoader);
    videoElement.addEventListener('timeupdate', () => { if (videoElement.currentTime > 0) hideLoader(); });
    videoElement.addEventListener('waiting', () => { loadingOverlay.classList.remove('hidden'); });
    videoElement.addEventListener('error', () => { if(videoElement.error) triggerErrorDisplay(videoElement.error); });

    const onFullscreenChange = () => {
        const isFS = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        if (isFS) {
            fullscreenBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
        } else {
            fullscreenBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
            if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('mozfullscreenchange', onFullscreenChange);
    document.addEventListener('MSFullscreenChange', onFullscreenChange);
}

function hideLoader() {
    if (!loadingOverlay.classList.contains('hidden')) loadingOverlay.classList.add('hidden');
}

function triggerErrorDisplay(err) {
    hideLoader();
    errorOverlay.classList.remove('hidden');
    let code = "UNKNOWN_ERROR";
    if (err && err.details) code = `HLS_${err.details.toUpperCase()}`;
    else if (err && err.code && typeof err.code === 'number' && !err.MEDIA_ERR_NETWORK) code = `SHAKA_ERR_${err.code}`;
    else if (videoElement.error) {
        const nativeCodes = {1: 'ABORTED', 2: 'NETWORK', 3: 'DECODE', 4: 'SRC_NOT_SUPPORTED'};
        code = `NATIVE_${nativeCodes[videoElement.error.code] || 'ERROR'}`;
    }
    document.getElementById('error-message').textContent = `Code: [ ${code} ]`;
}

// Setup Kategori & List Channel
function setupFilterOptions() {
    groups = ['all', ...new Set(channels.map(c => c.group).filter(Boolean))];
    currentGroupIndex = 0; 
    updateCategoryUI();
}

function updateCategoryUI() {
    const activeGroup = groups[currentGroupIndex];
    currentCategoryBox.textContent = activeGroup === 'all' ? 'Semua Channel' : activeGroup;
    renderChannels(activeGroup);
}

function renderChannels(filterGroup) {
    channelListEl.innerHTML = '';
    const filteredChannels = filterGroup === 'all' ? channels : channels.filter(c => c.group === filterGroup);

    if (filteredChannels.length === 0) {
        channelListEl.innerHTML = '<p style="text-align:center; padding:20px; color:#475569; font-size:0.8rem;">Tidak ada saluran.</p>';
        return;
    }

    filteredChannels.forEach((channel) => {
        const card = document.createElement('div');
        const isCurrentlyPlaying = (channel.url === currentPlayingUrl);
        card.className = isCurrentlyPlaying ? 'channel-card active' : 'channel-card';
        
        card.onclick = () => playChannel(channel, card);
        const logoUrl = channel.logo || channel.icon || channel.logo_url || '';
        const fallbackSVG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0NSIgaGVpZ2h0PSI0NSI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzE1MTkyYiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iUG9wcGlucywgYXJpYWwiIGZvbnQtc2l6ZT0iMTFweCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiM5NGEzYjgiIGR5PSIuM2VtIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5UVjwvdGV4dD48L3N2Zz4=";

        card.innerHTML = `
            <img src="${logoUrl}" alt="${channel.name}" class="channel-logo" onerror="this.onerror=null;this.src='${fallbackSVG}'">
            <div class="channel-details">
                <h3>${channel.name}</h3>
                <p>${channel.group || 'Umum'}</p>
            </div>
        `;
        channelListEl.appendChild(card);
    });
}

// Play Channel Eksekutor
async function playChannel(channel, cardElement) {
    currentPlayingUrl = channel.url; 

    if (!brandingScreen.classList.contains('hidden')) {
        brandingScreen.classList.add('hidden');
        mainPlayerWrapper.classList.remove('hidden');
    }

    document.querySelectorAll('.channel-card').forEach(c => c.classList.remove('active'));
    if(cardElement) cardElement.classList.add('active');

    errorOverlay.classList.add('hidden');
    loadingOverlay.classList.remove('hidden');
    qualityLabel.textContent = 'Auto';
    qualityMenu.innerHTML = ''; 
    subtitleBox.style.display = 'none'; 

    await destroyPlayers();

    try {
        const isMpd = channel.url.toLowerCase().includes('.mpd');
        if (isMpd) {
            await initShakaPlayer(channel);
        } else {
            await initHlsPlayer(channel);
        }
    } catch (error) {
        console.error("Stream Error:", error);
        triggerErrorDisplay(error);
    }
}

// ==========================================
// MURNI LOGIKA SHAKA PLAYER ANDA
// ==========================================
async function initShakaPlayer(channel) {
    if (!shakaPlayerInstance) {
        shakaPlayerInstance = new shaka.Player(videoElement); // Init native
        shakaPlayerInstance.addEventListener('error', (e) => {
            console.error("Shaka Player Error:", e.detail);
            if (e.detail && e.detail.severity === 2) triggerErrorDisplay(e.detail);
        });
    }

    // Injeksi Headers sesuai format Anda
    shakaPlayerInstance.getNetworkingEngine().clearAllRequestFilters();
    shakaPlayerInstance.getNetworkingEngine().registerRequestFilter((type, request) => {
        if (channel.headers && (type === shaka.net.NetworkingEngine.RequestType.MANIFEST || type === shaka.net.NetworkingEngine.RequestType.SEGMENT)) {
            for (const h in channel.headers) {
                request.headers[h] = channel.headers[h];
            }
        }
    });

    // Konversi Clearkey DRM sesuai format Anda
    const config = { abr: { enabled: true }, drm: { clearKeys: {} } }; 
    if (channel.drm && channel.drm.type === 'clearkey' && channel.drm.key) {
        const [keyId, key] = channel.drm.key.split(':');
        if (keyId && key) {
            config.drm.clearKeys[hexToBase64Url(keyId)] = hexToBase64Url(key);
        }
    }
    if (Object.keys(config.drm.clearKeys).length === 0) delete config.drm.clearKeys;
    if (Object.keys(config.drm).length === 0) delete config.drm;
    
    await shakaPlayerInstance.configure(config);
    
    // PEMAKSAAN MIME-TYPE (Penangkal Error Disk Cache & 4001)
    let mimeType = null;
    if (channel.url.toLowerCase().includes('.mpd')) mimeType = 'application/dash+xml';
    else if (channel.url.toLowerCase().includes('.m3u8')) mimeType = 'application/vnd.apple.mpegurl';

    await shakaPlayerInstance.load(channel.url, null, mimeType);
    
    videoElement.play().catch(()=>{});
    buildShakaQualityMenu();
    buildShakaSubtitleMenu(); 
}

function buildShakaQualityMenu() {
    qualityMenu.innerHTML = '';
    let tracks = shakaPlayerInstance.getVariantTracks();
    tracks = tracks.filter((track, idx, self) => idx === self.findIndex((t) => t.height === track.height));
    tracks.sort((a, b) => b.height - a.height);

    const autoBtn = document.createElement('button');
    autoBtn.className = 'quality-item active';
    autoBtn.textContent = 'Auto';
    autoBtn.onclick = () => {
        shakaPlayerInstance.configure({ abr: { enabled: true } });
        qualityLabel.textContent = 'Auto';
        setActiveItem(qualityMenu, autoBtn);
    };
    qualityMenu.appendChild(autoBtn);

    tracks.forEach(track => {
        if (!track.height) return;
        const btn = document.createElement('button');
        btn.className = 'quality-item';
        btn.textContent = `${track.height}p`;
        btn.onclick = () => {
            shakaPlayerInstance.configure({ abr: { enabled: false } });
            shakaPlayerInstance.selectVariantTrack(track, true);
            qualityLabel.textContent = `${track.height}p`;
            setActiveItem(qualityMenu, btn);
        };
        qualityMenu.appendChild(btn);
    });
}

function buildShakaSubtitleMenu() {
    subtitleMenu.innerHTML = '';
    const tracks = shakaPlayerInstance.getTextTracks();

    if (tracks.length > 0) {
        subtitleBox.style.display = 'block';
        const offBtn = document.createElement('button');
        offBtn.className = 'quality-item active';
        offBtn.textContent = 'Off';
        offBtn.onclick = () => {
            shakaPlayerInstance.setTextTrackVisibility(false);
            setActiveItem(subtitleMenu, offBtn);
        };
        subtitleMenu.appendChild(offBtn);

        tracks.forEach(track => {
            const btn = document.createElement('button');
            btn.className = 'quality-item';
            btn.textContent = track.language || track.label || `Track ${track.id}`;
            btn.onclick = () => {
                shakaPlayerInstance.setTextTrackVisibility(true);
                shakaPlayerInstance.selectTextTrack(track);
                setActiveItem(subtitleMenu, btn);
            };
            subtitleMenu.appendChild(btn);
        });
    } else {
        subtitleBox.style.display = 'none';
    }
}

// ==========================================
// MURNI LOGIKA HLS ANDA
// ==========================================
async function initHlsPlayer(channel) {
    return new Promise((resolve, reject) => {
        if (Hls.isSupported()) {
            hlsInstance = new Hls({ 
                maxMaxBufferLength: 30, 
                liveSyncDurationCount: 3,
                xhrSetup: function (xhr, url) {
                    if (channel.headers) {
                        for (const h in channel.headers) {
                            xhr.setRequestHeader(h, channel.headers[h]);
                        }
                    }
                }
            });
            
            hlsInstance.loadSource(channel.url);
            hlsInstance.attachMedia(videoElement);
            
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                videoElement.play().catch(()=>{});
                buildHlsQualityMenu();
                buildHlsSubtitleMenu(); 
                resolve();
            });

            hlsInstance.on(Hls.Events.ERROR, (ev, data) => { 
                if (data.fatal) reject(data); 
            });
        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            videoElement.src = channel.url;
            videoElement.addEventListener('loadedmetadata', function onLoaded() { 
                videoElement.play().catch(()=>{}); 
                videoElement.removeEventListener('loadedmetadata', onLoaded); 
                resolve(); 
            });
        } else {
            reject(new Error("Format Tidak didukung"));
        }
    });
}

function buildHlsQualityMenu() {
    qualityMenu.innerHTML = '';
    const levels = hlsInstance.levels;

    if (!levels || levels.length <= 1) {
        qualityLabel.textContent = 'Normal';
        return;
    }

    const autoBtn = document.createElement('button');
    autoBtn.className = 'quality-item active';
    autoBtn.textContent = 'Auto';
    autoBtn.onclick = () => {
        hlsInstance.currentLevel = -1; 
        qualityLabel.textContent = 'Auto';
        setActiveItem(qualityMenu, autoBtn);
    };
    qualityMenu.appendChild(autoBtn);

    for (let i = levels.length - 1; i >= 0; i--) {
        const level = levels[i];
        const resHeight = level.height || (level.attrs && level.attrs.RESOLUTION ? level.attrs.RESOLUTION.split('x')[1] : null);
        if (!resHeight) continue;

        const btn = document.createElement('button');
        btn.className = 'quality-item';
        btn.textContent = `${resHeight}p`;
        const currentIdx = i;
        btn.onclick = () => {
            hlsInstance.currentLevel = currentIdx;
            qualityLabel.textContent = `${resHeight}p`;
            setActiveItem(qualityMenu, btn);
        };
        qualityMenu.appendChild(btn);
    }
}

function buildHlsSubtitleMenu() {
    subtitleMenu.innerHTML = '';
    const tracks = hlsInstance.subtitleTracks;

    if (tracks && tracks.length > 0) {
        subtitleBox.style.display = 'block';

        const offBtn = document.createElement('button');
        offBtn.className = 'quality-item active';
        offBtn.textContent = 'Off';
        offBtn.onclick = () => {
            hlsInstance.subtitleTrack = -1;
            setActiveItem(subtitleMenu, offBtn);
        };
        subtitleMenu.appendChild(offBtn);

        tracks.forEach((track, index) => {
            const btn = document.createElement('button');
            btn.className = 'quality-item';
            btn.textContent = track.name || track.lang || `Track ${index + 1}`;
            btn.onclick = () => {
                hlsInstance.subtitleTrack = index;
                setActiveItem(subtitleMenu, btn);
            };
            subtitleMenu.appendChild(btn);
        });
    } else {
        subtitleBox.style.display = 'none';
    }
}

function setActiveItem(menuElement, selectedBtn) {
    menuElement.querySelectorAll('.quality-item').forEach(b => b.classList.remove('active'));
    selectedBtn.classList.add('active');
}

async function destroyPlayers() {
    videoElement.pause();
    errorOverlay.classList.add('hidden'); 
    
    if (shakaPlayerInstance) {
        await shakaPlayerInstance.destroy();
        shakaPlayerInstance = null;
    }
    if (hlsInstance) { 
        hlsInstance.destroy(); 
        hlsInstance = null; 
    }
    videoElement.removeAttribute('src'); 
    videoElement.load();
}

// Logika Asli Hex to Base64Url
function hexToBase64Url(hex) {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

document.addEventListener('DOMContentLoaded', initApp);
