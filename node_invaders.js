import { app } from "../../../scripts/app.js";
import { NodeInvadersGame } from "./game.js";

const EXTENSION_NAME = "Comfy.NodeInvaders.Game.Panel";
const PANEL_ID = "nodeinvaders-panel";
const BUTTON_ID = "nodeinvaders-toggle-button";
const STYLE_ID = "nodeinvaders-style";

let gamePanel = null;
let gameButton = null;
let gameInstance = null;
let resizeHandler = null;
let currentMode = "api";

export function setGameMode(mode) {
    if (mode !== "api" && mode !== "all") return;
    if (currentMode !== mode) {
        currentMode = mode;
        clearNodeTypesCache();
    }
}

export function getGameMode() {
    return currentMode;
}
export const BOSS_TYPE = {
    name: "BOSS",
    typeCandidates: [],
    color: "#1a0033",
    header: "#3b0764",
    accent: "#f0abfc",
    stroke: "#c084fc",
    hp: 32,
    size: 320,
    speed: 22,
    seek: 6,
    orbit: 5,
    wobble: 0.4,
    wobbleSpeed: 0.8,
    canShoot: true,
    fireInterval: 0.85,
    points: 50,
    weight: 0,
    portsIn: 0,
    portsOut: 0,
    isBoss: true
};

const NODE_TYPES = [
    {
        name: "KSampler",
        typeCandidates: ["KSampler"],
        color: "#ff5e5b",
        header: "#3a1414",
        accent: "#ffd166",
        stroke: "#ffb3b1",
        hp: 6,
        size: 86,
        speed: 40,
        seek: 14,
        orbit: 4,
        wobble: 0.4,
        wobbleSpeed: 1.2,
        canShoot: false,
        fireInterval: 3.2,
        points: 3,
        weight: 1.1,
        portsIn: 3,
        portsOut: 2
    },
    {
        name: "CLIP",
        typeCandidates: ["CLIPTextEncode", "CLIPTextEncodeSDXL", "CLIPTextEncodeSDXLRefiner", "CLIPSetLastLayer"],
        color: "#72d884",
        header: "#0f2b1f",
        accent: "#b6ff70",
        stroke: "#a6f4bf",
        hp: 2,
        size: 50,
        speed: 125,
        seek: 8,
        orbit: 18,
        wobble: 1.8,
        wobbleSpeed: 3.2,
        canShoot: true,
        fireInterval: 1.6,
        points: 2,
        weight: 2.2,
        portsIn: 2,
        portsOut: 1
    },
    {
        name: "VAE",
        typeCandidates: ["VAEDecode", "VAEEncode", "VAELoader"],
        color: "#4ea8de",
        header: "#0d1b2a",
        accent: "#8be9fd",
        stroke: "#7fc7ff",
        hp: 5,
        size: 102,
        speed: 32,
        seek: 10,
        orbit: 0,
        wobble: 0.3,
        wobbleSpeed: 0.8,
        canShoot: false,
        fireInterval: 3.4,
        points: 3,
        weight: 1.0,
        portsIn: 4,
        portsOut: 2
    },
    {
        name: "Load Image",
        typeCandidates: ["LoadImage", "LoadImageMask"],
        color: "#f6bd60",
        header: "#3a2a14",
        accent: "#ffd27d",
        stroke: "#ffe0a3",
        hp: 3,
        size: 72,
        speed: 70,
        seek: 9,
        orbit: 8,
        wobble: 1.0,
        wobbleSpeed: 2.2,
        canShoot: false,
        fireInterval: 2.8,
        points: 2,
        weight: 1.6,
        portsIn: 2,
        portsOut: 2
    },
    {
        name: "ControlNet",
        typeCandidates: ["ControlNetLoader", "ControlNetApply", "ControlNetApplyAdvanced", "ControlNet"],
        color: "#48cae4",
        header: "#0b2530",
        accent: "#80ffea",
        stroke: "#9be5ff",
        hp: 4,
        size: 78,
        speed: 62,
        seek: 10,
        orbit: -16,
        wobble: 0.8,
        wobbleSpeed: 2.0,
        canShoot: true,
        fireInterval: 2.0,
        points: 3,
        weight: 1.4,
        portsIn: 3,
        portsOut: 3
    },
    {
        name: "LoRA",
        typeCandidates: ["LoraLoader", "LoraLoaderModelOnly", "LoraLoaderStack", "LoraLoaderSimple", "LoraLoaderTags"],
        color: "#ff9f1c",
        header: "#3a2100",
        accent: "#ffbf69",
        stroke: "#ffd29b",
        hp: 3,
        size: 64,
        speed: 92,
        seek: 12,
        orbit: 12,
        wobble: 1.2,
        wobbleSpeed: 2.6,
        canShoot: true,
        fireInterval: 2.3,
        points: 2,
        weight: 1.8,
        portsIn: 2,
        portsOut: 2
    },
    {
        name: "Empty Latent",
        typeCandidates: ["EmptyLatentImage", "EmptyLatent"],
        color: "#9aa0a6",
        header: "#202124",
        accent: "#e8eaed",
        stroke: "#c7c9cc",
        hp: 1,
        size: 44,
        speed: 85,
        seek: 14,
        orbit: -4,
        wobble: 2.4,
        wobbleSpeed: 3.4,
        canShoot: false,
        fireInterval: 2.6,
        points: 1,
        weight: 3.0,
        portsIn: 1,
        portsOut: 1
    }
];

export function rand(min, max) {
    return Math.random() * (max - min) + min;
}

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}
function darkenColor(hex, amount = 0.3) {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.round(Math.max(0, Math.min(255, (num >> 16) - amount * 255)));
    const g = Math.round(Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) - amount * 255)));
    const b = Math.round(Math.max(0, Math.min(255, (num & 0x0000FF) - amount * 255)));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
function lightenColor(hex, amount = 0.3) {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.round(Math.min(255, (num >> 16) + amount * 255));
    const g = Math.round(Math.min(255, ((num >> 8) & 0x00FF) + amount * 255));
    const b = Math.round(Math.min(255, (num & 0x0000FF) + amount * 255));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
function createTypeFromNodeName(nodeName) {
    const hue = Math.random() * 360;
    const sat = 60 + Math.random() * 40;
    const light = 40 + Math.random() * 30;
    const colorHex = hslToHex(hue, sat, light);
    const headerHex = darkenColor(colorHex, 0.5);
    const accentHex = lightenColor(colorHex, 0.4);
    const strokeHex = lightenColor(colorHex, 0.2);
    const hash = nodeName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const baseHp = 1 + (hash % 6);
    const baseSize = 44 + (hash % 60);
    const baseSpeed = 30 + (hash % 100);

    return {
        name: nodeName,
        typeCandidates: [nodeName],
        color: colorHex,
        header: headerHex,
        accent: accentHex,
        stroke: strokeHex,
        hp: baseHp,
        size: baseSize,
        speed: baseSpeed,
        seek: 8 + (hash % 8),
        orbit: (hash % 20) - 10,
        wobble: 0.3 + (hash % 200) / 100,
        wobbleSpeed: 0.8 + (hash % 300) / 100,
        canShoot: (hash % 3) === 0,
        fireInterval: 1.6 + (hash % 200) / 100,
        points: Math.max(1, Math.floor(baseHp / 2)),
        weight: 1.0,
        portsIn: 1 + (hash % 4),
        portsOut: 1 + (hash % 3)
    };
}
let allNodeTypesCache = null;

export function clearNodeTypesCache() {
    allNodeTypesCache = null;
}
function isApiNode(nodeName, nodeDef) {
    if (nodeDef?.category) {
        const cat = String(nodeDef.category).toLowerCase().trim();
        if (cat.startsWith("api")) return true;
        if (cat.includes("/api/") || cat.includes("api node") || cat.includes("api-")) return true;
    }
    const lower = nodeName.toLowerCase();
    const apiVendors = [
        "openai", "anthropic", "stability", "stabilityai",
        "gemini", "veo", "imagen", "luma", "kling",
        "runway", "minimax", "ideogram", "recraft",
        "pika", "bfl", "fluxapi", "blackforestlabs",
        "tripo", "rodin"
    ];
    for (const vendor of apiVendors) {
        if (lower.includes(vendor)) return true;
    }
    return false;
}
function hasComplexJsUi(nodeName, nodeDef) {
    if (!nodeDef) return false;
    const proto = nodeDef.prototype;
    if (proto) {
        const drawHooks = [
            "onDrawForeground",
            "onDrawBackground",
            "onDrawTitle",
            "onDrawTitleBar"
        ];
        for (const hook of drawHooks) {
            if (Object.prototype.hasOwnProperty.call(proto, hook)) return true;
        }
        if (Object.prototype.hasOwnProperty.call(proto, "addDOMWidget")) return true;
    }
    const lower = nodeName.toLowerCase();
    const heavyUiNames = [
        "preview", "previewimage",
        "showimage", "imageshow",
        "saveimage", "saveanimatedwebp", "saveanimatedpng",
        "loadvideo", "savevideo",
        "imagecrop", "imagepad",
        "maskeditor", "imageinpaint"
    ];
    for (const pat of heavyUiNames) {
        if (lower === pat || lower.includes(pat)) return true;
    }
    return false;
}
function isCustomNode(nodeName, nodeDef) {
    if (nodeDef?.category) {
        const category = nodeDef.category.toLowerCase();
        if (category.includes('custom') ||
            category.includes('extension') ||
            category.includes('plugin')) {
            return true;
        }
    }
    const nameLower = nodeName.toLowerCase();
    const customPatterns = [
        'custom',
        'extension',
        'plugin',
        'addon',
        'thirdparty',
        'third-party'
    ];

    for (const pattern of customPatterns) {
        if (nameLower.includes(pattern)) {
            return true;
        }
    }
    if (nodeDef?.meta?.author &&
        !nodeDef.meta.author.toLowerCase().includes('comfyui') &&
        !nodeDef.meta.author.toLowerCase().includes('comfy')) {
        return true;
    }

    return false;
}

function isInternalNode(nodeName) {
    return nodeName.startsWith('_') ||
        nodeName.includes('Reroute') ||
        nodeName === 'Note' ||
        nodeName.includes('PrimitiveNode') ||
        nodeName === 'Primitive';
}

function getAllAvailableNodeTypes() {
    if (allNodeTypesCache) {
        return allNodeTypesCache;
    }

    const registered = getRegisteredNodeTypes();
    const allTypes = [];

    if (currentMode === "api") {
        for (const nodeName in registered) {
            if (isInternalNode(nodeName)) continue;
            const nodeDef = registered[nodeName];
            if (!isApiNode(nodeName, nodeDef)) continue;
            const typeInfo = createTypeFromNodeName(nodeName);
            typeInfo.isApiNode = true;
            allTypes.push(typeInfo);
        }
        if (allTypes.length === 0) {
            for (const type of NODE_TYPES) {
                const available = pickAvailableNodeType(type.typeCandidates);
                if (available) {
                    allTypes.push({ ...type, typeCandidates: [available] });
                }
            }
        }
    } else {
        for (const type of NODE_TYPES) {
            const available = pickAvailableNodeType(type.typeCandidates);
            if (available) {
                allTypes.push({ ...type, typeCandidates: [available] });
            }
        }

        for (const nodeName in registered) {
            const alreadyIncluded = NODE_TYPES.some(type =>
                type.typeCandidates.includes(nodeName)
            );
            if (alreadyIncluded) continue;
            if (isInternalNode(nodeName)) continue;

            const nodeDef = registered[nodeName];
            if (isCustomNode(nodeName, nodeDef)) continue;
            if (hasComplexJsUi(nodeName, nodeDef)) continue;

            allTypes.push(createTypeFromNodeName(nodeName));
        }
    }

    allNodeTypesCache = allTypes;
    return allTypes;
}

export function pickWeightedType() {
    const allTypes = getAllAvailableNodeTypes();

    if (allTypes.length === 0) {
        let total = 0;
        for (const type of NODE_TYPES) {
            total += type.weight;
        }
        let roll = Math.random() * total;
        for (const type of NODE_TYPES) {
            if (roll < type.weight) {
                return type;
            }
            roll -= type.weight;
        }
        return NODE_TYPES[0];
    }
    let total = 0;
    for (const type of allTypes) {
        total += type.weight || 1.0;
    }
    let roll = Math.random() * total;
    for (const type of allTypes) {
        const weight = type.weight || 1.0;
        if (roll < weight) {
            return type;
        }
        roll -= weight;
    }
    return allTypes[0];
}

export function getLiteGraph() {
    return window.LiteGraph || globalThis.LiteGraph;
}

function getRegisteredNodeTypes() {
    const liteGraph = getLiteGraph();
    return liteGraph?.registered_node_types || {};
}

export function pickAvailableNodeType(candidates) {
    const registered = getRegisteredNodeTypes();
    for (const candidate of candidates) {
        if (registered?.[candidate]) {
            return candidate;
        }
    }
    return null;
}

export function createGraphNode(typeName) {
    const liteGraph = getLiteGraph();
    if (!liteGraph?.createNode) {
        return null;
    }
    return liteGraph.createNode(typeName);
}

function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
#${PANEL_ID} {
    display: none;
    z-index: 60;
    pointer-events: none;
}

#${PANEL_ID} * {
    box-sizing: border-box;
}

#nodeinvaders-container {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: auto;
    background: transparent;
    color: #eaf2ff;
    font-family: "Segoe UI Variable", "Segoe UI", Inter, ui-sans-serif, system-ui, sans-serif;
    user-select: none;
}

#nodeinvaders-canvas {
    width: 100%;
    height: 100%;
    display: block;
}

#nodeinvaders-ui {
    position: absolute;
    top: 72px;
    left: 50%;
    transform: translateX(-50%);
    width: min(760px, calc(100vw - 180px));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    z-index: 4;
    pointer-events: none;
}

.ni-brand {
    font-family: "Segoe UI Variable Display", "Segoe UI", Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 13px;
    font-weight: 850;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    background: linear-gradient(120deg, #4ade80 0%, #60a5fa 50%, #c084fc 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
    text-shadow: 0 0 14px rgba(96, 165, 250, 0.38);
    filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.72));
}

.ni-mode-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 7px;
    background: rgba(7, 10, 16, 0.78);
    border: 1px solid rgba(192, 132, 252, 0.45);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #f0abfc;
    width: fit-content;
    backdrop-filter: blur(6px);
}

.ni-mode-pill::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f0abfc;
    box-shadow: 0 0 8px #f0abfc;
}

.ni-stats {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    max-width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(6, 9, 15, 0.88), rgba(15, 18, 30, 0.8));
    border: 1px solid rgba(120, 140, 180, 0.22);
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(8px);
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.04em;
    white-space: nowrap;
}

.ni-stat {
    position: relative;
}

.ni-stat + .ni-stat::before {
    content: "";
    position: absolute;
    left: -7px;
    top: 2px;
    bottom: 2px;
    width: 1px;
    background: linear-gradient(180deg, transparent, rgba(192, 132, 252, 0.35), transparent);
}

.ni-stat {
    display: flex;
    gap: 6px;
    align-items: center;
}

.ni-value {
    color: #ffd166;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
}

.ni-lives {
    min-width: 56px;
    gap: 4px;
}

.ni-life {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    height: 15px;
    font-size: 14px;
    line-height: 1;
    transform: translateY(-1px);
    text-shadow: 0 0 10px rgba(255, 94, 91, 0.75);
}

.ni-life.on {
    color: #ff5e5b;
}

.ni-life.off {
    color: rgba(255, 255, 255, 0.22);
    text-shadow: none;
}

.ni-hint {
    max-width: min(680px, 100%);
    padding: 5px 10px;
    border-radius: 7px;
    background: rgba(5, 8, 13, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(234, 242, 255, 0.72);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1.25;
    text-align: center;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(7px);
}

@media (max-width: 760px) {
    #nodeinvaders-ui {
        top: 64px;
        width: calc(100vw - 96px);
    }

    .ni-stats {
        flex-wrap: wrap;
        row-gap: 5px;
    }

    .ni-hint {
        display: none;
    }
}

.ni-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
        radial-gradient(ellipse at 20% 0%, rgba(96, 165, 250, 0.18) 0%, transparent 55%),
        radial-gradient(ellipse at 80% 100%, rgba(192, 132, 252, 0.18) 0%, transparent 55%),
        linear-gradient(140deg, rgba(6, 10, 18, 0.94), rgba(10, 20, 34, 0.92));
    z-index: 5;
    overflow: hidden;
}

.ni-overlay::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(
        0deg,
        rgba(255, 255, 255, 0.025) 0,
        rgba(255, 255, 255, 0.025) 1px,
        transparent 1px,
        transparent 3px
    );
    pointer-events: none;
    z-index: 1;
}

.ni-overlay.is-hidden {
    display: none;
}

.ni-card {
    position: relative;
    z-index: 2;
    width: 92vw;
    max-width: 720px;
    padding: 32px 36px;
    border-radius: 22px;
    border: 1px solid rgba(192, 132, 252, 0.25);
    background:
        linear-gradient(180deg, rgba(20, 22, 40, 0.95) 0%, rgba(10, 12, 22, 0.95) 100%);
    box-shadow:
        0 25px 60px rgba(0, 0, 0, 0.6),
        0 0 80px rgba(96, 165, 250, 0.15),
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
    text-align: left;
    animation: ni-fade-up 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.ni-card::before {
    content: "";
    position: absolute;
    inset: -1px;
    border-radius: 22px;
    padding: 1px;
    background: linear-gradient(135deg, rgba(74, 222, 128, 0.4), rgba(96, 165, 250, 0.3), rgba(192, 132, 252, 0.4));
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
            mask-composite: exclude;
    pointer-events: none;
    opacity: 0.6;
}

.ni-title {
    font-family: "Segoe UI Variable Display", "Segoe UI", Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 42px;
    font-weight: 900;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 8px;
    background: linear-gradient(120deg, #4ade80 0%, #60a5fa 50%, #c084fc 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
    filter: drop-shadow(0 0 18px rgba(96, 165, 250, 0.45));
}

.ni-subtitle {
    font-size: 12px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(192, 132, 252, 0.85);
    margin-bottom: 22px;
}

.ni-section-label {
    font-size: 11px;
    letter-spacing: 2.4px;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.55);
    margin: 6px 0 10px;
}

.ni-modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 20px;
}

@media (max-width: 600px) {
    .ni-modes { grid-template-columns: 1fr; }
}

.ni-mode {
    position: relative;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    cursor: pointer;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
    text-align: left;
    color: inherit;
    font-family: inherit;
}

.ni-mode:hover {
    transform: translateY(-2px);
    border-color: rgba(192, 132, 252, 0.5);
    background: rgba(192, 132, 252, 0.06);
}

.ni-mode.is-active {
    border-color: rgba(74, 222, 128, 0.7);
    background: linear-gradient(135deg, rgba(74, 222, 128, 0.12), rgba(96, 165, 250, 0.08));
    box-shadow: 0 0 30px rgba(74, 222, 128, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.ni-mode-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
}

.ni-mode-name {
    font-family: "Segoe UI Variable Display", "Segoe UI", Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 18px;
    font-weight: 850;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #eaf2ff;
}

.ni-mode-badge {
    font-size: 10px;
    letter-spacing: 1.6px;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(74, 222, 128, 0.18);
    border: 1px solid rgba(74, 222, 128, 0.5);
    color: #4ade80;
    opacity: 0;
    transition: opacity 0.15s ease;
}

.ni-mode.is-active .ni-mode-badge {
    opacity: 1;
}

.ni-mode-desc {
    font-size: 12px;
    line-height: 1.45;
    color: rgba(234, 242, 255, 0.7);
}

.ni-mode-tag {
    margin-top: 8px;
    font-size: 10px;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: rgba(255, 209, 102, 0.85);
}

.ni-mode[data-mode="api"] .ni-mode-name {
    background: linear-gradient(120deg, #f0abfc, #c084fc);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
}

.ni-mode[data-mode="all"] .ni-mode-name {
    background: linear-gradient(120deg, #4ade80, #60a5fa);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
}

.ni-tip-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 8px;
    margin-bottom: 22px;
    font-size: 12px;
    color: rgba(234, 242, 255, 0.78);
}

.ni-tip-list span {
    display: block;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.05);
}

.ni-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
}

.ni-button {
    padding: 10px 18px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: linear-gradient(135deg, #ff5e5b, #ff9f1c);
    color: #0b0f18;
    font-weight: bold;
    letter-spacing: 1px;
    cursor: pointer;
    text-transform: uppercase;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.ni-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 24px rgba(255, 95, 92, 0.35);
}

.ni-secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #f0f4ff;
}

.ni-overview {
    display: flex;
    gap: 12px;
    margin: 16px 0 20px;
    font-size: 13px;
}

.ni-overview div {
    padding: 8px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    min-width: 120px;
}

.ni-overview strong {
    display: block;
    font-size: 18px;
    color: #ffd166;
}

.ni-reason {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1.4px;
    opacity: 0.7;
    margin-bottom: 16px;
}

@keyframes ni-fade-up {
    0% { opacity: 0; transform: translateY(12px); }
    100% { opacity: 1; transform: translateY(0); }
}

#nodeinvaders-skills {
    position: absolute;
    right: 18px;
    top: 50%;
    transform: translateY(-34%);
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 4;
    pointer-events: none;
}

.ni-skill {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    width: 74px;
    min-height: 74px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(7, 10, 16, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.16);
    backdrop-filter: blur(8px);
    transition: all 0.2s ease;
}

.ni-skill.ready {
    border-color: #4ade80;
    box-shadow: 0 0 20px rgba(74, 222, 128, 0.4);
    animation: ni-pulse 1.5s ease infinite;
}

.ni-skill.active {
    border-color: #60a5fa;
    box-shadow: 0 0 25px rgba(96, 165, 250, 0.6);
    animation: ni-pulse-fast 0.8s ease infinite;
}

.ni-skill-icon {
    font-size: 24px;
    line-height: 1;
}

.ni-skill-label {
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.9);
}

.ni-skill-progress {
    font-size: 12px;
    font-weight: bold;
    color: #ffd166;
    min-height: 16px;
    text-align: center;
}

@media (max-height: 720px) {
    #nodeinvaders-skills {
        top: auto;
        right: 72px;
        bottom: 22px;
        transform: none;
        flex-direction: row;
    }
}

.ni-skill.ready .ni-skill-progress {
    color: #4ade80;
}

.ni-skill.active .ni-skill-progress {
    color: #60a5fa;
}

@keyframes ni-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
}

@keyframes ni-pulse-fast {
    0%, 100% { transform: scale(1); box-shadow: 0 0 25px rgba(96, 165, 250, 0.6); }
    50% { transform: scale(1.08); box-shadow: 0 0 35px rgba(96, 165, 250, 0.8); }
}

@keyframes ni-button-pulse {
    0%, 100% { box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5), 0 0 0 0px rgba(96, 165, 250, 0); }
    50% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 0 12px 2px rgba(96, 165, 250, 0.25); }
}

#nodeinvaders-toggle-button {
    position: fixed;
    top: 158px;
    right: 8px;
    z-index: 10000;
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: rgba(10, 14, 24, 0.85);
    color: #eaf2ff;
    cursor: pointer;
    backdrop-filter: blur(16px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    box-shadow: 
        0 4px 15px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05),
        inset 0 1px 1px rgba(255, 255, 255, 0.1);
    padding: 0;
    outline: none;
    animation: ni-button-pulse 3s infinite ease-in-out;
}

#nodeinvaders-toggle-button::before {
    content: "";
    position: absolute;
    inset: -1px;
    border-radius: 14px;
    padding: 1px;
    background: linear-gradient(135deg, #4ade80, #60a5fa, #c084fc);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0.35;
    transition: opacity 0.3s ease;
}

#nodeinvaders-toggle-button:hover {
    transform: translateY(-2px) scale(1.04);
    background: rgba(20, 24, 38, 0.88);
    border-color: rgba(255, 255, 255, 0.15);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55), 0 0 18px rgba(96, 165, 250, 0.25);
}

#nodeinvaders-toggle-button:hover::before {
    opacity: 0.85;
}

#nodeinvaders-toggle-button:active {
    transform: translateY(0) scale(0.96);
}

.ni-control-label {
    font-family: "Segoe UI Variable Display", "Segoe UI", Inter, system-ui, sans-serif;
    font-size: 17px;
    font-weight: 900;
    letter-spacing: 0.02em;
    background: linear-gradient(135deg, #4ade80, #60a5fa, #c084fc);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 8px rgba(96, 165, 250, 0.35));
    user-select: none;
}

.ni-control-tooltip {
    position: absolute;
    top: 58px;
    right: 0;
    background: rgba(8, 10, 16, 0.96);
    color: #eaf2ff;
    padding: 7px 12px;
    border-radius: 9px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    opacity: 0;
    transform: translateY(-8px);
    transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
    pointer-events: none;
    border: 1px solid rgba(192, 132, 252, 0.25);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(10px);
}

#nodeinvaders-toggle-button:hover .ni-control-tooltip {
    opacity: 1;
    transform: translateY(0);
}

`;

    document.head.appendChild(style);
}

function getCanvasBounds() {
    const container = document.getElementById("graph-canvas-container")
        || document.querySelector(".graph-canvas-container")
        || document.querySelector("canvas")?.parentElement;

    if (container) {
        const rect = container.getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height,
            container,
            rect
        };
    }

    return {
        width: window.innerWidth,
        height: window.innerHeight,
        container: null,
        rect: null
    };
}

function createGamePanel() {
    const bounds = getCanvasBounds();
    const panel = document.createElement("div");
    panel.id = PANEL_ID;

    if (bounds.container) {
        panel.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:none;";
    } else {
        panel.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;display:none;";
    }

    panel.innerHTML = `
        <div id="nodeinvaders-container">
            <canvas id="nodeinvaders-canvas"></canvas>
            <div id="nodeinvaders-ui">
                <div class="ni-brand">Node Invaders</div>
                <div class="ni-mode-pill" id="ni-mode-pill">API Nodes Only</div>
                <div class="ni-stats">
                    <div class="ni-stat">Score <span class="ni-value" id="ni-score">0</span></div>
                    <div class="ni-stat">Time <span class="ni-value" id="ni-time">0.0</span>s</div>
                    <div class="ni-stat">Destroyed <span class="ni-value" id="ni-kills">0</span></div>
                    <div class="ni-stat ni-lives" id="ni-lives" aria-label="Lives"></div>
                </div>
                <div class="ni-hint">Mouse to aim. Hold click or Space to fire. WASD or arrows to drift. Right click for skills. Esc closes.</div>
            </div>
            <div id="nodeinvaders-skills">
                <div class="ni-skill" id="ni-rocket-skill">
                    <div class="ni-skill-icon">🚀</div>
                    <div class="ni-skill-label">Rocket</div>
                    <div class="ni-skill-progress" id="ni-rocket-progress">10</div>
                </div>
                <div class="ni-skill" id="ni-laser-skill">
                    <div class="ni-skill-icon">⚡</div>
                    <div class="ni-skill-label">Laser</div>
                    <div class="ni-skill-progress" id="ni-laser-progress">20</div>
                </div>
                <div class="ni-skill" id="ni-nova-skill">
                    <div class="ni-skill-icon">✦</div>
                    <div class="ni-skill-label">Nova</div>
                    <div class="ni-skill-progress" id="ni-nova-progress">40</div>
                </div>
            </div>
            <div id="nodeinvaders-start" class="ni-overlay">
                <div class="ni-card">
                    <div class="ni-title">Node Invaders</div>
                    <div class="ni-subtitle">ComfyUI Arcade Shooter</div>

                    <div class="ni-section-label">Choose Your Battlefield</div>
                    <div class="ni-modes">
                        <button type="button" class="ni-mode is-active" data-mode="api">
                            <div class="ni-mode-head">
                                <span class="ni-mode-name">API Invasion</span>
                                <span class="ni-mode-badge">Default</span>
                            </div>
                            <div class="ni-mode-desc">Only <strong>api/*</strong> nodes spawn. Cleaner pool, steadier pacing.</div>
                            <div class="ni-mode-tag">Recommended · Spicy</div>
                        </button>
                        <button type="button" class="ni-mode" data-mode="all">
                            <div class="ni-mode-head">
                                <span class="ni-mode-name">Total Chaos</span>
                                <span class="ni-mode-badge">Hard</span>
                            </div>
                            <div class="ni-mode-desc">A wider node pool with faster spawns, more pressure, and earlier bosses.</div>
                            <div class="ni-mode-tag">Hard mode</div>
                        </button>
                    </div>

                    <div class="ni-tip-list">
                        <span>🎯 Mouse aims, click / Space fires.</span>
                        <span>🛞 WASD or arrows to drift.</span>
                        <span>💥 Right-click triggers skills when ready.</span>
                        <span>👹 Beware the <strong>Boss</strong> — it bites back.</span>
                    </div>

                    <div class="ni-actions">
                        <button class="ni-button" id="ni-start-btn">Launch Run</button>
                        <button class="ni-button ni-secondary" id="ni-close-btn">Close</button>
                    </div>
                </div>
            </div>
            <div id="nodeinvaders-over" class="ni-overlay is-hidden">
                <div class="ni-card">
                    <div class="ni-title">Run Over</div>
                    <div class="ni-subtitle">Can you feel it?</div>
                    <div class="ni-reason" id="ni-over-reason">Enemy impact</div>
                    <div class="ni-overview">
                        <div><strong id="ni-over-score">0</strong>Score</div>
                        <div><strong id="ni-over-time">0.0s</strong>Time</div>
                        <div><strong id="ni-over-kills">0</strong>Destroyed</div>
                    </div>
                    <div class="ni-actions">
                        <button class="ni-button" id="ni-restart-btn">Restart</button>
                        <button class="ni-button ni-secondary" id="ni-exit-btn">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (bounds.container) {
        const style = window.getComputedStyle(bounds.container);
        if (style.position === "static") {
            bounds.container.style.position = "relative";
        }
        bounds.container.appendChild(panel);
    } else {
        document.body.appendChild(panel);
    }

    gamePanel = panel;
    const root = panel.querySelector("#nodeinvaders-container");
    gameInstance = new NodeInvadersGame(root);
    gameInstance.setToggleGamePanel(toggleGamePanel);
    gameInstance.mount();
    return panel;
}

function createControlButton() {
    if (document.getElementById(BUTTON_ID)) {
        gameButton = document.getElementById(BUTTON_ID);
        return gameButton;
    }

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";

    const label = document.createElement("span");
    label.className = "ni-control-label";
    label.textContent = "NI";
    button.appendChild(label);

    const tooltip = document.createElement("div");
    tooltip.className = "ni-control-tooltip";
    tooltip.textContent = "Node Invaders";
    button.appendChild(tooltip);

    button.addEventListener("click", toggleGamePanel);
    document.body.appendChild(button);
    gameButton = button;
    return button;
}

async function toggleGamePanel() {
    if (!gamePanel) {
        createGamePanel();
    }

    const isVisible = gamePanel.style.display !== "none";
    if (!isVisible) {
        gamePanel.style.display = "block";
        if (gameButton) {
            const label = gameButton.querySelector(".ni-control-label");
            if (label) label.textContent = "X";
            const tooltip = gameButton.querySelector(".ni-control-tooltip");
            if (tooltip) {
                tooltip.textContent = "Close Node Invaders";
            }
        }
        gameInstance?.setVisible(true);
        gameInstance?.resize();
    } else {
        gamePanel.style.display = "none";
        if (gameButton) {
            const label = gameButton.querySelector(".ni-control-label");
            if (label) label.textContent = "NI";
            const tooltip = gameButton.querySelector(".ni-control-tooltip");
            if (tooltip) {
                tooltip.textContent = "Node Invaders";
            }
        }
        gameInstance?.setVisible(false);
    }
}

app.registerExtension({
    name: EXTENSION_NAME,
    async setup() {
        injectStyles();
        createControlButton();
        resizeHandler = () => {
            if (gameInstance) {
                gameInstance.resize();
            }
        };
        window.addEventListener("resize", resizeHandler);
    },
    async beforeUnload() {
        if (resizeHandler) {
            window.removeEventListener("resize", resizeHandler);
            resizeHandler = null;
        }
        if (gameInstance) {
            gameInstance.setVisible(false);
            gameInstance.detachEvents();
            gameInstance = null;
        }
        if (gamePanel) {
            gamePanel.remove();
            gamePanel = null;
        }
        if (gameButton) {
            gameButton.remove();
            gameButton = null;
        }
        const style = document.getElementById(STYLE_ID);
        if (style) {
            style.remove();
        }
    }
});
