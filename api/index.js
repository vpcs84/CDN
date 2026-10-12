const { addonBuilder, getRouter } = require('stremio-addon-sdk');

// Configuração do Manifesto do Addon
const manifest = {
    id: 'org.cdnlivetv.addon',
    version: '1.0.6',
    name: 'CDN Live TV',
    description: 'Assista a centenas de canais de TV ao vivo diretamente no Stremio.',
    resources: ['catalog', 'meta', 'stream'],
    types: ['tv'],
    catalogs: [
        {
            type: 'tv',
            id: 'cdn_live_channels',
            name: 'Canais Ao Vivo'
        }
    ],
    idPrefixes: ['cdn_']
};

const builder = new addonBuilder(manifest);

// Cache em memória (60 segundos)
let channelsCache = {
    data: [],
    lastFetched: 0
};
const CACHE_TTL = 60 * 1000;

async function fetchChannels() {
    const now = Date.now();
    if (channelsCache.data.length > 0 && (now - channelsCache.lastFetched) < CACHE_TTL) {
        return channelsCache.data;
    }

    try {
        const response = await fetch('https://api.cdnlivetv.tv/api/v1/channels/?user=cdnlivetv&plan=free', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const json = await response.json();
        channelsCache.data = json.channels || [];
        channelsCache.lastFetched = now;
        return channelsCache.data;
    } catch (error) {
        console.error('Erro ao buscar canais da API:', error);
        return channelsCache.data;
    }
}

// Proxy externo confiável para liberar os logotipos no Stremio
function getProxyImageUrl(url) {
    if (!url) return '';
    let fixedUrl = url;
    if (fixedUrl.startsWith('http://')) {
        fixedUrl = fixedUrl.replace('http://', 'https://');
    }
    return `https://images.weserv.nl/?url=${encodeURIComponent(fixedUrl)}`;
}

// Handler do Catálogo
builder.defineCatalogHandler(async ({ type, id }) => {
    if (type === 'tv' && id === 'cdn_live_channels') {
        const channels = await fetchChannels();
        
        const metas = channels.map((channel, index) => {
            const imgUrl = getProxyImageUrl(channel.image);

            return {
                id: `cdn_${index}`,
                type: 'tv',
                name: channel.name,
                poster: imgUrl,
                logo: imgUrl,
                posterShape: 'square', // Formato ideal para logos de TV
                description: `País: ${channel.code ? channel.code.toUpperCase() : 'N/A'} | Status: ${channel.status ? channel.status.toUpperCase() : 'ONLINE'} | Espectadores: ${channel.viewers || 0}`
            };
        });

        return { metas };
    }
    return { metas: [] };
});

// Handler de Metadados
builder.defineMetaHandler(async ({ type, id }) => {
    if (type === 'tv' && id.startsWith('cdn_')) {
        const index = parseInt(id.replace('cdn_', ''), 10);
        const channels = await fetchChannels();
        const channel = channels[index];

        if (channel) {
            const imgUrl = getProxyImageUrl(channel.image);

            return {
                meta: {
                    id: `cdn_${index}`,
                    type: 'tv',
                    name: channel.name,
                    poster: imgUrl,
                    logo: imgUrl,
                    posterShape: 'square',
                    background: imgUrl,
                    description: `País: ${channel.code ? channel.code.toUpperCase() : 'N/A'} | Status: ${channel.status ? channel.status.toUpperCase() : 'ONLINE'} | Espectadores: ${channel.viewers || 0}`
                }
            };
        }
    }
    return { meta: null };
});

// Handler de Stream (Link de reprodução externo)
builder.defineStreamHandler(async ({ id }) => {
    if (id.startsWith('cdn_')) {
        const index = parseInt(id.replace('cdn_', ''), 10);
        const channels = await fetchChannels();
        const channel = channels[index];

        if (channel && channel.url) {
            return {
                streams: [
                    {
                        title: `▶ Assistir ${channel.name} (${channel.code ? channel.code.toUpperCase() : 'LIVE'})`,
                        externalUrl: channel.url,
                        behaviorHints: {
                            notWebReady: true
                        }
                    }
                ]
            };
        }
    }
    return { streams: [] };
});

const addonInterface = builder.getInterface();
const router = getRouter(addonInterface);

module.exports = (req, res) => {
    // Página inicial amigável
    if (req.url === '/' || req.url === '') {
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const manifestUrl = `${protocol}://${host}/manifest.json`;
        const stremioUrl = `stremio://${host}/manifest.json`;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>CDN Live TV - Stremio Addon</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1015; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .card { background: #181b22; padding: 40px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); text-align: center; max-width: 450px; width: 100%; border: 1px solid #2f3542; }
                    h1 { color: #f2f2f2; margin-bottom: 10px; font-size: 24px; }
                    p { color: #a4b0be; font-size: 14px; margin-bottom: 25px; line-height: 1.5; }
                    .btn { display: inline-block; background: #7c4dff; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; transition: background 0.2s; margin-bottom: 15px; width: 100%; box-sizing: border-box; }
                    .btn:hover { background: #651fff; }
                    .manifest-link { font-size: 12px; color: #70a1ff; word-break: break-all; text-decoration: none; }
                    .manifest-link:hover { text-decoration: underline; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>📺 CDN Live TV Addon</h1>
                    <p>Addon atualizado com proxy de imagens otimizado!</p>
                    <a href="${stremioUrl}" class="btn">Instalar no Stremio</a>
                    <div style="margin-top: 15px;">
                        <span style="font-size: 12px; color: #a4b0be;">Manifesto:</span><br>
                        <a href="${manifestUrl}" class="manifest-link" target="_blank">${manifestUrl}</a>
                    </div>
                </div>
            </body>
            </html>
        `);
        return;
    }

    router(req, res, () => {
        res.statusCode = 404;
        res.end('Not found');
    });
};
