const PLAYLIST_URL = "https://play.natztv.my.id";

let player;
let ui;

const UI = {
    video: document.getElementById('video'),
    container: document.getElementById('videoContainer'),
    topbarTitle: document.getElementById('topbar-title'),
    channelList: document.getElementById('channel-list'),
    search: document.getElementById('search'),
    toast: document.getElementById('toast'),
    unmuteHint: document.getElementById('unmuteHint')
};

const ICONS = {
    "World Cup 2026": "🏆", "Sports": "⚽", "Movies": "🎬", "News": "📰", "Entertainment": "🎭",
    "TV Lokal": "📺", "Music": "🎵", "Kids": "🧸", "Unsorted": "📺"
};

async function loadExternalPlaylist() {
    try {
        const response = await fetch(PLAYLIST_URL);
        if (!response.ok) throw new Error("Gagal terhubung ke server playlist");
        const data = await response.json();
        
        window.CHANNELS = data
            .filter(c => c.enabled !== false)
            .sort((a, b) => (a.order || 999) - (b.order || 999));
    } catch (error) {
        console.error("Error loading playlist:", error);
        showToast("Gagal memuat daftar channel");
        window.CHANNELS = []; 
    }
}

async function initApp() {
    await loadExternalPlaylist();

    shaka.polyfill.installAll();
    if (!shaka.Player.isBrowserSupported()) return alert("Browser tidak didukung.");

    player = new shaka.Player(UI.video);
    ui = new shaka.ui.Overlay(player, UI.container, UI.video);
    
    // UI Config Bawaan Shaka
    ui.configure({
        controlPanelElements: ['play_pause', 'mute', 'volume', 'time_and_duration', 'spacer', 'quality', 'language', 'fullscreen'],
        addSeekBar: false // Matikan bar progress karena ini tayangan Live
    });

    player.addEventListener('error', e => console.error("Error Player:", e.detail));

    player.getNetworkingEngine().registerRequestFilter((type, request) => {
        const ch = window.CURRENT_CHANNEL;
        if (!ch) return;

        if (type === shaka.net.NetworkingEngine.RequestType.MANIFEST || 
            type === shaka.net.NetworkingEngine.RequestType.SEGMENT) {
            if (ch.headers) {
                for (const h in ch.headers) {
                    request.headers[h] = ch.headers[h];
                }
            }
        }
    });

    renderPlaylist();
    UI.search.addEventListener('input', renderPlaylist);

    // KUNCI UNMUTE: Mematikan mute dan menggagalkan trigger pause bawaan Shaka
    UI.container.addEventListener('click', (e) => {
        if (UI.video.muted) {
            UI.video.muted = false;
            UI.unmuteHint.style.display = 'none';
            
            // Berikan jeda 10 milidetik untuk memaksa video jalan kembali 
            // setelah tidak sengaja ter-pause oleh event bawaan Shaka UI
            setTimeout(() => {
                if (UI.video.paused) {
                    UI.video.play().catch(() => {});
                }
            }, 10);
        }
    });

    // LOAD CHANNEL PERTAMA OTOMATIS
    if (window.CHANNELS?.length > 0) {
        loadChannel(window.CHANNELS[0]);
    }
}

function renderPlaylist() {
    UI.channelList.innerHTML = '';
    const query = UI.search.value.toLowerCase();
    const channels = window.CHANNELS || [];
    const fragment = document.createDocumentFragment();
    const groups = {};

    channels.forEach(ch => {
        if (query && !ch.name.toLowerCase().includes(query)) return;
        const g = ch.group || "Unsorted";
        if (!groups[g]) groups[g] = [];
        groups[g].push(ch);
    });

    Object.keys(groups).forEach(groupName => {
        const header = document.createElement('div');
        header.className = 'group-header';
        header.innerHTML = `<span>${ICONS[groupName] || ICONS["Unsorted"]}</span> ${groupName}`;
        
        const isCollapsed = localStorage.getItem(`collapse_${groupName}`) === 'true';
        const listWrapper = document.createElement('div');
        listWrapper.style.display = isCollapsed ? 'none' : 'block';

        header.onclick = () => {
            const willCollapse = listWrapper.style.display === 'block';
            listWrapper.style.display = willCollapse ? 'none' : 'block';
            localStorage.setItem(`collapse_${groupName}`, willCollapse);
        };

        fragment.appendChild(header);

        groups[groupName].forEach(ch => {
            const item = document.createElement('li');
            item.className = 'channel-item';
            item.innerHTML = `
                <img class="ch-logo" src="${ch.logo || ''}" onerror="this.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='">
                <span class="ch-name">${ch.name}</span>
            `;
            item.onclick = () => {
                document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                loadChannel(ch);
            };
            listWrapper.appendChild(item);
        });
        fragment.appendChild(listWrapper);
    });
    UI.channelList.appendChild(fragment);
}

async function loadChannel(ch) {
    try {
        window.CURRENT_CHANNEL = ch; 
        UI.topbarTitle.textContent = "Sedang tayang: " + ch.name;

        // Reset Hint jika ganti channel
        if (UI.video.muted) UI.unmuteHint.style.display = 'block';

        const playerConfig = {
            abr: { enabled: true },
            drm: { clearKeys: {} }
        };

        // Konfigurasi Clearkey
        if (ch.drm && ch.drm.type === 'clearkey' && ch.drm.key) {
            const [kid, key] = ch.drm.key.split(':');
            if(kid && key) {
                playerConfig.drm.clearKeys[hexToBase64(kid)] = hexToBase64(key);
            }
        }

        if (Object.keys(playerConfig.drm.clearKeys).length === 0) delete playerConfig.drm.clearKeys;
        if (Object.keys(playerConfig.drm).length === 0) delete playerConfig.drm;

        await player.configure(playerConfig);
        
        // ==========================================
        // FIX ERROR 4001: DETEKSI MIME-TYPE
        // ==========================================
        let mimeType = null;
        if (ch.url.toLowerCase().includes('.mpd')) {
            mimeType = 'application/dash+xml';
        } else if (ch.url.toLowerCase().includes('.m3u8')) {
            mimeType = 'application/vnd.apple.mpegurl';
        }

        // Tambahkan mimeType sebagai parameter ketiga untuk memaksa identitas file
        await player.load(ch.url, null, mimeType);
        
        UI.video.play().catch(() => {});
    } catch (e) {
        showToast("Gagal memuat tayangan");
        console.error("Kesalahan pemuatan channel:", e);
    }
}

function hexToBase64(hex) {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function showToast(msg) {
    UI.toast.textContent = msg;
    UI.toast.classList.add('show');
    setTimeout(() => UI.toast.classList.remove('show'), 2000);
}

document.addEventListener('DOMContentLoaded', initApp);