const { addonBuilder, getRouter } = require('stremio-addon-sdk');

// Configuração do Manifesto do Addon
const manifest = {
    id: 'org.cdnlivetv.addon',
    version: '1.0.0',
    name: 'CDN Live TV',
    description: 'Assista a centenas de canais de TV ao vivo diretamente no Stremio.',
    resources: ['catalog', 'stream'],
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

// Cache em memória (dura enquanto a instância serverless estiver quente)
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
        const response = await fetch('https://api.cdnlivetv.tv/api/v1/channels/?user=cdnlivetv&plan=free');
        const json = await response.json();
        channelsCache.data = json.channels || [];
        channelsCache.lastFetched = now;
        return channelsCache.data;
    } catch (error) {
        console.error('Erro ao buscar canais da API:', error);
        return channelsCache.data;
    }
}

// Handler do Catálogo
builder.defineCatalogHandler(async ({ type, id }) => {
    if (type === 'tv' && id === 'cdn_live_channels') {
        const channels = await fetchChannels();
        
        const metas = channels.map((channel, index) => ({
            id: `cdn_${index}`,
            type: 'tv',
            name: channel.name,
            poster: channel.image,
            background: channel.image,
            description: `País: ${channel.code.toUpperCase()} | Status: ${channel.status.toUpperCase()} | Espectadores: ${channel.viewers}`
        }));

        return { metas };
    }
    return { metas: [] };
});

// Handler de Stream
builder.defineStreamHandler(async ({ id }) => {
    if (id.startsWith('cdn_')) {
        const index = parseInt(id.replace('cdn_', ''), 10);
        const channels = await fetchChannels();
        const channel = channels[index];

        if (channel && channel.url) {
            return {
                streams: [
                    {
                        title: `${channel.name} (${channel.code.toUpperCase()})`,
                        url: channel.url
                    }
                ]
            };
        }
    }
    return { streams: [] };
});

// Exporta o router compatível com funções serverless da Vercel
const addonInterface = builder.getInterface();
const router = getRouter(addonInterface);

module.exports = (req, res) => {
    router(req, res, () => {
        res.statusCode = 404;
        res.end();
    });
};
