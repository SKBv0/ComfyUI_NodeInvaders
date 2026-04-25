/**
 * NodeInvaders - ComfyUI Space Invaders Game
 * A fully integrated arcade shooter where enemies are real ComfyUI nodes
 */

import { app } from "../../../scripts/app.js";
import {
    rand,
    clamp,
    pickWeightedType,
    getLiteGraph,
    pickAvailableNodeType,
    createGraphNode,
    clearNodeTypesCache,
    setGameMode,
    getGameMode,
    BOSS_TYPE
} from "./node_invaders.js";

const BOSS_IMAGE_URLS = [
    new URL("./boss2.png", import.meta.url).href,
    new URL("./boss.png", import.meta.url).href
];
let bossImages = null;

function getBossImages() {
    if (bossImages || typeof Image === "undefined") return bossImages;
    bossImages = BOSS_IMAGE_URLS.map(src => {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
        return img;
    });
    return bossImages;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    // Player settings
    PLAYER_SPEED: 340,
    PLAYER_RADIUS: 18,
    PLAYER_EDGE_MARGIN: 0.04,

    // Bullet settings
    BULLET_SPEED: 620,
    BULLET_LIFETIME: 2.5,
    SHOOT_COOLDOWN: 0.12,

    // Enemy settings
    SPAWN_BASE_INTERVAL: 0.85,
    SPAWN_INTERVAL_DECAY: 0.008,
    MIN_SPAWN_INTERVAL: 0.22,
    MAX_ENEMIES: 40,
    ENEMY_SPAWN_MARGIN: 220,
    ENEMY_BOUNDARY_MARGIN: 300,

    // Enemy bullet settings
    ENEMY_BULLET_SPEED: 210,
    ENEMY_BULLET_LIFETIME: 2.4,

    // Collision settings
    HIT_PADDING: 20,
    DEBUG_COLLISION: false,

    // Visual effects
    SHAKE_DURATION: 0.18,
    SHAKE_POWER: 8,
    FLASH_DURATION: 0.12,
    MUZZLE_FLASH_DURATION: 0.08,

    // Particle settings
    PARTICLE_EXHAUST_COUNT: 2,
    PARTICLE_MUZZLE_COUNT: 8,
    PARTICLE_EXPLOSION_COUNT: 45,
    PARTICLE_SPARK_COUNT: 20,
    PARTICLE_HIT_COUNT: 12,

    // Skill settings
    ROCKET_SKILL_KILLS_REQUIRED: 10,
    ROCKET_COUNT: 5,
    ROCKET_SPEED: 450,
    ROCKET_TURN_RATE: 4.5,
    ROCKET_LIFETIME: 3.0,
    ROCKET_EXPLOSION_RADIUS: 80,

    LASER_SKILL_KILLS_REQUIRED: 20,
    LASER_DURATION: 5.0,
    LASER_DAMAGE_PER_SECOND: 8,
    LASER_WIDTH: 12,
    NOVA_SKILL_KILLS_REQUIRED: 40,
    NOVA_BOSS_DAMAGE: 18,
    SKILL_READY_DELAY: 1.5,

    // Combo settings
    COMBO_WINDOW: 1.5,
    COMBO_MULTIPLIER: 0.5,

    // Milestone thresholds
    MILESTONES: [5, 10, 25, 50, 100],

    // Starfield settings
    STAR_COUNT: 120,
    STAR_PARALLAX: 0.15,  // How much stars move relative to camera

    // Delta time cap
    MAX_DELTA_TIME: 0.05,

    // Lives
    PLAYER_LIVES: 3,
    INVULN_DURATION: 2.4,
    INVULN_BLINK_HZ: 8,

    // Boss settings
    BOSS_FIRST_SPAWN_KILLS: 12,
    BOSS_KILL_INTERVAL: 20,
    BOSS_BULLET_SPEED: 260,
    BOSS_NODE_WIDTH: 520,
    BOSS_NODE_HEIGHT: 390,
    BOSS_DASH_MIN_INTERVAL: 1.2,
    BOSS_DASH_MAX_INTERVAL: 2.0,
    BOSS_DASH_DURATION: 0.2,
    BOSS_DASH_MIN_DISTANCE: 150,
    BOSS_DASH_MAX_DISTANCE: 330,
    BOSS_DASH_PLAYER_SAFE_DISTANCE: 360
};

function getDifficulty() {
    return getGameMode() === "all"
        ? {
            spawnRate: 0.68,
            spawnDecay: 1.25,
            minSpawn: 0.16,
            enemyCapBonus: 14,
            enemySpeed: 1.22,
            enemySeek: 1.16,
            enemyFireRate: 0.78,
            burstChance: 0.55,
            bossFirstKills: 8,
            bossInterval: 14
        }
        : {
            spawnRate: 1,
            spawnDecay: 1,
            minSpawn: CONFIG.MIN_SPAWN_INTERVAL,
            enemyCapBonus: 0,
            enemySpeed: 1,
            enemySeek: 1,
            enemyFireRate: 1,
            burstChance: 0.35,
            bossFirstKills: CONFIG.BOSS_FIRST_SPAWN_KILLS,
            bossInterval: CONFIG.BOSS_KILL_INTERVAL
        };
}

// ============================================================================
// COLLISION UTILITIES
// ============================================================================

/**
 * Check if a point is inside a rectangle
 */
function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/**
 * Check if two line segments intersect
 */
function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const rpx = bx - ax;
    const rpy = by - ay;
    const spx = dx - cx;
    const spy = dy - cy;
    const det = rpx * spy - rpy * spx;
    if (det === 0) return false;
    const t = ((cx - ax) * spy - (cy - ay) * spx) / det;
    const u = ((cx - ax) * rpy - (cy - ay) * rpx) / det;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Check if a line segment intersects a rectangle
 * Optimized version with early exit
 */
function lineIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
    // Quick bounding box check first
    const lineMinX = Math.min(x1, x2);
    const lineMaxX = Math.max(x1, x2);
    const lineMinY = Math.min(y1, y2);
    const lineMaxY = Math.max(y1, y2);

    // Early exit if line bounding box doesn't intersect rectangle
    if (lineMaxX < rx || lineMinX > rx + rw || lineMaxY < ry || lineMinY > ry + rh) {
        return false;
    }

    // Check if either endpoint is inside the rectangle
    if (pointInRect(x1, y1, rx, ry, rw, rh) || pointInRect(x2, y2, rx, ry, rw, rh)) {
        return true;
    }

    // Check intersection with each edge (only if line crosses rectangle bounds)
    const x3 = rx, y3 = ry;
    const x4 = rx + rw, y4 = ry;
    const x5 = rx + rw, y5 = ry + rh;
    const x6 = rx, y6 = ry + rh;
    return segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) ||
        segmentsIntersect(x1, y1, x2, y2, x4, y4, x5, y5) ||
        segmentsIntersect(x1, y1, x2, y2, x5, y5, x6, y6) ||
        segmentsIntersect(x1, y1, x2, y2, x6, y6, x3, y3);
}



/**
 * Get enemy's actual bounds (from node if available)
 * Results are cached per enemy to avoid repeated calculations
 */
function getEnemyBounds(enemy) {
    let x, y, w, h;

    if (enemy.node && enemy.node.pos) {
        // Use node's actual position and size
        x = enemy.node.pos[0];
        y = enemy.node.pos[1];

        // Get actual rendered size from node
        if (enemy.node.size && Array.isArray(enemy.node.size)) {
            w = enemy.node.size[0];
            h = enemy.node.size[1];
        } else if (typeof enemy.node.computeSize === 'function') {
            const computed = enemy.node.computeSize();
            w = computed[0];
            h = computed[1];
        } else {
            w = enemy.w;
            h = enemy.h;
        }
    } else {
        // Fallback to enemy's own tracking
        w = enemy.w;
        h = enemy.h;
        x = enemy.cx - w / 2;
        y = enemy.cy - h / 2;
    }

    const bounds = { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };

    return bounds;
}

/**
 * Check if a bullet hits an enemy (line-rect collision)
 * Uses node's actual position if available, falls back to enemy.cx/cy
 */
function bulletHitsEnemy(bullet, enemy) {
    const padding = CONFIG.HIT_PADDING;
    const bounds = getEnemyBounds(enemy);

    const rx = bounds.x - padding;
    const ry = bounds.y - padding;
    const rw = bounds.w + padding * 2;
    const rh = bounds.h + padding * 2;
    return lineIntersectsRect(bullet.prevX, bullet.prevY, bullet.x, bullet.y, rx, ry, rw, rh);
}

/**
 * Check circle-rectangle collision for player-enemy collision
 */
function circleRectCollision(cx, cy, radius, rx, ry, rw, rh) {
    const nearestX = Math.max(rx, Math.min(cx, rx + rw));
    const nearestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return (dx * dx + dy * dy) <= (radius * radius);
}

// ============================================================================
// PLAYER CLASS
// ============================================================================

class Player {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.angle = -Math.PI / 2;
        this.radius = CONFIG.PLAYER_RADIUS;
        this.speed = CONFIG.PLAYER_SPEED;
    }

    reset(centerX, centerY) {
        this.x = centerX;
        this.y = centerY;
        this.vx = 0;
        this.vy = 0;
        this.angle = -Math.PI / 2;
    }

    update(dt, input, view) {
        // Calculate aim direction - direct angle (no smoothing for instant response)
        const aim = this.getAimVector(input);
        // Direct angle assignment - uçak mouse'a direkt bakar
        this.angle = aim.angle;

        // Movement is fixed to screen/world axes; mouse only controls aim.
        let mx = 0;
        let my = 0;
        if (input.up) my -= 1;
        if (input.down) my += 1;
        if (input.left) mx -= 1;
        if (input.right) mx += 1;

        if (mx !== 0 || my !== 0) {
            const mag = Math.hypot(mx, my) || 1;
            this.vx = (mx / mag) * this.speed;
            this.vy = (my / mag) * this.speed;
        } else {
            // Deceleration
            this.vx *= 0.85;
            this.vy *= 0.85;
        }

        // Apply movement
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Constrain to play area (rectangular bounds matching viewport)
        const edgeMargin = CONFIG.PLAYER_EDGE_MARGIN;
        const minX = view.left + view.width * edgeMargin;
        const maxX = view.right - view.width * edgeMargin;
        const minY = view.top + view.height * edgeMargin;
        const maxY = view.bottom - view.height * edgeMargin;

        if (this.x < minX) { this.x = minX; this.vx = Math.max(0, this.vx); }
        else if (this.x > maxX) { this.x = maxX; this.vx = Math.min(0, this.vx); }
        if (this.y < minY) { this.y = minY; this.vy = Math.max(0, this.vy); }
        else if (this.y > maxY) { this.y = maxY; this.vy = Math.min(0, this.vy); }
    }

    getAimVector(input) {
        let dx = input.pointerX - this.x;
        let dy = input.pointerY - this.y;
        if (!input.pointerActive) {
            dx = 0;
            dy = -1;
        }
        const len = Math.hypot(dx, dy) || 1;
        return {
            x: dx / len,
            y: dy / len,
            angle: Math.atan2(dy, dx)
        };
    }

    draw(ctx, muzzleFlash, invulnTime = 0) {
        const thrust = Math.hypot(this.vx, this.vy);
        const thrustRatio = Math.min(thrust / this.speed, 1);
        const now = performance.now();

        // Invulnerability flicker — skip half the frames at high frequency
        if (invulnTime > 0) {
            const cycle = Math.floor(now * 0.012) & 1;
            if (cycle === 0) return;
        }

        ctx.save();
        ctx.translate(this.x, this.y);

        // Energy shield ring while invulnerable
        if (invulnTime > 0) {
            const pulse = 0.6 + 0.4 * Math.sin(now * 0.012);
            const r = 24 + pulse * 4;
            ctx.save();
            ctx.globalCompositeOperation = "screen";
            const grad = ctx.createRadialGradient(0, 0, 12, 0, 0, r + 8);
            grad.addColorStop(0, "rgba(96, 165, 250, 0)");
            grad.addColorStop(0.7, `rgba(96, 165, 250, ${0.35 * pulse})`);
            grad.addColorStop(1, "rgba(96, 165, 250, 0)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(180, 220, 255, ${0.7 * pulse})`;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.lineDashOffset = -now * 0.05;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        ctx.rotate(this.angle + Math.PI / 2);

        // ── Twin engine exhaust ──
        if (thrustRatio > 0.05) {
            const flameLength = 16 + thrustRatio * 30;
            const flicker = 1 + Math.sin(now * 0.02) * 0.18;

            for (const ex of [-5, 5]) {
                const flameWidth = 3 + thrustRatio * 2.5;

                const outer = ctx.createLinearGradient(ex, 12, ex, 12 + flameLength * flicker);
                outer.addColorStop(0, "rgba(160, 220, 255, 1)");
                outer.addColorStop(0.35, "rgba(96, 165, 250, 0.7)");
                outer.addColorStop(0.75, "rgba(80, 110, 220, 0.35)");
                outer.addColorStop(1, "rgba(60, 80, 200, 0)");
                ctx.fillStyle = outer;
                ctx.beginPath();
                ctx.moveTo(ex - flameWidth, 12);
                ctx.quadraticCurveTo(ex, 12 + flameLength * 0.55 * flicker, ex + flameWidth, 12);
                ctx.quadraticCurveTo(ex, 12 + flameLength * flicker, ex - flameWidth, 12);
                ctx.fill();

                const inner = ctx.createLinearGradient(ex, 11, ex, 11 + flameLength * 0.55 * flicker);
                inner.addColorStop(0, "rgba(255, 255, 255, 1)");
                inner.addColorStop(0.6, "rgba(200, 230, 255, 0.85)");
                inner.addColorStop(1, "rgba(150, 200, 255, 0)");
                ctx.fillStyle = inner;
                ctx.beginPath();
                ctx.moveTo(ex - flameWidth * 0.45, 11);
                ctx.quadraticCurveTo(ex, 11 + flameLength * 0.4 * flicker, ex + flameWidth * 0.45, 11);
                ctx.quadraticCurveTo(ex, 11 + flameLength * 0.6 * flicker, ex - flameWidth * 0.45, 11);
                ctx.fill();
            }
        }

        // ── Wing thruster glow ──
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const wingGlow = ctx.createRadialGradient(0, 4, 4, 0, 4, 24);
        wingGlow.addColorStop(0, "rgba(96, 165, 250, 0.55)");
        wingGlow.addColorStop(1, "rgba(96, 165, 250, 0)");
        ctx.fillStyle = wingGlow;
        ctx.beginPath();
        ctx.arc(0, 4, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // ── Ship hull ──
        const bodyGrad = ctx.createLinearGradient(0, -22, 0, 14);
        bodyGrad.addColorStop(0, "#f0f6ff");
        bodyGrad.addColorStop(0.5, "#a8c2e6");
        bodyGrad.addColorStop(1, "#4060a0");

        ctx.fillStyle = bodyGrad;
        ctx.strokeStyle = "rgba(120, 180, 255, 0.95)";
        ctx.lineWidth = 1.5;

        // Main fuselage — chevron-style fighter
        ctx.beginPath();
        ctx.moveTo(0, -22);          // Nose tip
        ctx.lineTo(3.5, -10);        // Upper hull edge
        ctx.lineTo(13, 6);           // Right wing tip
        ctx.lineTo(9, 12);           // Right wing trailing
        ctx.lineTo(6, 10);           // Right engine root
        ctx.lineTo(2, 13);           // Right engine outer
        ctx.lineTo(0, 9);            // Center notch
        ctx.lineTo(-2, 13);          // Left engine outer
        ctx.lineTo(-6, 10);          // Left engine root
        ctx.lineTo(-9, 12);          // Left wing trailing
        ctx.lineTo(-13, 6);          // Left wing tip
        ctx.lineTo(-3.5, -10);       // Upper hull edge
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Hull crease lines (panel detail)
        ctx.strokeStyle = "rgba(60, 90, 140, 0.6)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(0, 8);
        ctx.moveTo(-3.5, -8);
        ctx.lineTo(-9, 10);
        ctx.moveTo(3.5, -8);
        ctx.lineTo(9, 10);
        ctx.stroke();

        // ── Cockpit canopy ──
        const cockpitGrad = ctx.createLinearGradient(0, -10, 0, 4);
        cockpitGrad.addColorStop(0, "#a8d4ff");
        cockpitGrad.addColorStop(0.5, "#3b82f6");
        cockpitGrad.addColorStop(1, "#1e3a8a");
        ctx.fillStyle = cockpitGrad;
        ctx.strokeStyle = "rgba(180, 220, 255, 0.9)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.quadraticCurveTo(4, -7, 3, 2);
        ctx.quadraticCurveTo(0, 4, -3, 2);
        ctx.quadraticCurveTo(-4, -7, 0, -10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cockpit highlight
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.beginPath();
        ctx.ellipse(-1, -6, 1, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // ── Wing weapon pods ──
        ctx.fillStyle = "#1e293b";
        ctx.strokeStyle = "rgba(120, 180, 255, 0.7)";
        ctx.lineWidth = 0.8;
        for (const wx of [-9, 9]) {
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(wx - 1.5, -2, 3, 8, 1) :
                ctx.rect(wx - 1.5, -2, 3, 8);
            ctx.fill();
            ctx.stroke();
        }

        // ── Engine ports (twin) ──
        for (const ex of [-5, 5]) {
            const ringGrad = ctx.createRadialGradient(ex, 11, 0, ex, 11, 4);
            ringGrad.addColorStop(0, "#ffffff");
            ringGrad.addColorStop(0.4, "rgba(160, 220, 255, 0.9)");
            ringGrad.addColorStop(1, "rgba(96, 165, 250, 0)");
            ctx.fillStyle = ringGrad;
            ctx.beginPath();
            ctx.arc(ex, 11, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── Muzzle flash (paired wing-cannon flash) ──
        if (muzzleFlash) {
            ctx.save();
            ctx.globalCompositeOperation = "screen";
            for (const wx of [-9, 9, 0]) {
                const yOffset = wx === 0 ? -28 : -4;
                const sz = wx === 0 ? 8 : 5;
                const flashGrad = ctx.createRadialGradient(wx, yOffset, 0, wx, yOffset, sz * 2.5);
                flashGrad.addColorStop(0, "rgba(255, 255, 240, 1)");
                flashGrad.addColorStop(0.4, "rgba(255, 220, 120, 0.85)");
                flashGrad.addColorStop(1, "rgba(255, 150, 60, 0)");
                ctx.fillStyle = flashGrad;
                ctx.beginPath();
                ctx.arc(wx, yOffset, sz * 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            // Front muzzle spike
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.moveTo(0, -32);
            ctx.lineTo(3, -22);
            ctx.lineTo(-3, -22);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }
}

// ============================================================================
// BULLET CLASS
// ============================================================================

class Bullet {
    constructor(x, y, vx, vy, isEnemy = false) {
        this.x = x;
        this.y = y;
        this.prevX = x;
        this.prevY = y;
        this.vx = vx;
        this.vy = vy;
        this.life = isEnemy ? CONFIG.ENEMY_BULLET_LIFETIME : CONFIG.BULLET_LIFETIME;
        this.isEnemy = isEnemy;
        this.active = true;
    }

    update(dt) {
        this.prevX = this.x;
        this.prevY = this.y;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) {
            this.active = false;
        }
    }

    isOutOfBounds(view, padding = 160) {
        return this.x < view.left - padding ||
            this.x > view.right + padding ||
            this.y < view.top - padding ||
            this.y > view.bottom + padding;
    }

    draw(ctx) {
        ctx.save();

        const dist = Math.hypot(this.x - this.prevX, this.y - this.prevY);
        const trailLength = Math.min(dist, 25);

        if (this.isEnemy) {
            // Enemy bullet - red/orange theme
            // Outer glow
            ctx.shadowColor = "rgba(255, 60, 60, 1)";
            ctx.shadowBlur = 16;
            ctx.fillStyle = "rgba(255, 100, 100, 1)";
            ctx.beginPath();
            ctx.arc(this.x, this.y, 4.5, 0, Math.PI * 2);
            ctx.fill();

            // Core
            ctx.shadowBlur = 0;
            ctx.fillStyle = "rgba(255, 200, 120, 1)";
            ctx.beginPath();
            ctx.arc(this.x, this.y, 2.8, 0, Math.PI * 2);
            ctx.fill();

            // Bright center
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(this.x, this.y, 1.2, 0, Math.PI * 2);
            ctx.fill();

            // Gradient trail
            const dx = this.x - this.prevX;
            const dy = this.y - this.prevY;
            const angle = Math.atan2(dy, dx);
            const startX = this.x - Math.cos(angle) * trailLength;
            const startY = this.y - Math.sin(angle) * trailLength;

            const gradient = ctx.createLinearGradient(startX, startY, this.x, this.y);
            gradient.addColorStop(0, "rgba(255, 100, 100, 0)");
            gradient.addColorStop(0.3, "rgba(255, 120, 80, 0.4)");
            gradient.addColorStop(1, "rgba(255, 200, 120, 0.9)");

            ctx.strokeStyle = gradient;
            ctx.lineWidth = 3.5;
            ctx.lineCap = "round";
            ctx.shadowColor = "rgba(255, 60, 60, 0.8)";
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(this.x, this.y);
            ctx.stroke();
        } else {
            // Player bullet - bright yellow/white theme
            // Outer glow
            ctx.shadowColor = "rgba(255, 255, 150, 1)";
            ctx.shadowBlur = 20;
            ctx.fillStyle = "rgba(255, 255, 200, 1)";
            ctx.beginPath();
            ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
            ctx.fill();

            // Core
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#ffffaa";
            ctx.beginPath();
            ctx.arc(this.x, this.y, 2.8, 0, Math.PI * 2);
            ctx.fill();

            // Bright center
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(this.x, this.y, 1.4, 0, Math.PI * 2);
            ctx.fill();

            // Gradient trail
            const dx = this.x - this.prevX;
            const dy = this.y - this.prevY;
            const angle = Math.atan2(dy, dx);
            const startX = this.x - Math.cos(angle) * trailLength;
            const startY = this.y - Math.sin(angle) * trailLength;

            const gradient = ctx.createLinearGradient(startX, startY, this.x, this.y);
            gradient.addColorStop(0, "rgba(255, 255, 200, 0)");
            gradient.addColorStop(0.3, "rgba(255, 255, 180, 0.5)");
            gradient.addColorStop(1, "rgba(255, 255, 220, 1)");

            ctx.strokeStyle = gradient;
            ctx.lineWidth = 3.2;
            ctx.lineCap = "round";
            ctx.shadowColor = "rgba(255, 255, 150, 0.9)";
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(this.x, this.y);
            ctx.stroke();
        }

        ctx.restore();
    }
}

// ============================================================================
// ROCKET CLASS (Homing Missile)
// ============================================================================

class Rocket {
    constructor(x, y, targetEnemy) {
        this.x = x;
        this.y = y;
        this.prevX = x;
        this.prevY = y;
        this.target = targetEnemy;
        this.vx = 0;
        this.vy = -CONFIG.ROCKET_SPEED; // Start upward
        this.speed = CONFIG.ROCKET_SPEED;
        this.life = CONFIG.ROCKET_LIFETIME;
        this.active = true;
        this.angle = -Math.PI / 2;
    }

    update(dt, enemies) {
        this.prevX = this.x;
        this.prevY = this.y;

        // Find new target if current is dead or out of range
        if (!this.target || !this.target.active || this.target.hp <= 0) {
            this.target = this.findNearestEnemy(enemies);
        }

        // Homing behavior
        if (this.target && this.target.active) {
            const dx = this.target.cx - this.x;
            const dy = this.target.cy - this.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 0) {
                const targetAngle = Math.atan2(dy, dx);
                let angleDiff = targetAngle - this.angle;

                // Normalize angle difference to [-PI, PI]
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                // Turn towards target
                const maxTurn = CONFIG.ROCKET_TURN_RATE * dt;
                if (Math.abs(angleDiff) > maxTurn) {
                    this.angle += Math.sign(angleDiff) * maxTurn;
                } else {
                    this.angle = targetAngle;
                }
            }
        }

        // Move in current direction
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.life -= dt;
        if (this.life <= 0) {
            this.active = false;
        }
    }

    findNearestEnemy(enemies) {
        let nearest = null;
        let nearestDistSq = Infinity;

        for (const enemy of enemies) {
            if (!enemy.active || enemy.hp <= 0) continue;
            const dx = enemy.cx - this.x;
            const dy = enemy.cy - this.y;
            const distSq = dx * dx + dy * dy; // Use squared distance to avoid sqrt
            if (distSq < nearestDistSq) {
                nearestDistSq = distSq;
                nearest = enemy;
            }
        }

        return nearest;
    }

    isOutOfBounds(view, padding = 200) {
        return this.x < view.left - padding ||
            this.x > view.right + padding ||
            this.y < view.top - padding ||
            this.y > view.bottom + padding;
    }

    checkHit(enemy) {
        if (!enemy.active || enemy.hp <= 0) return false;
        const dx = enemy.cx - this.x;
        const dy = enemy.cy - this.y;
        const distSq = dx * dx + dy * dy;
        const radiusSq = CONFIG.ROCKET_EXPLOSION_RADIUS * CONFIG.ROCKET_EXPLOSION_RADIUS;
        return distSq < radiusSq;
    }

    draw(ctx) {
        ctx.save();

        const now = performance.now();
        const trailAngle = this.angle + Math.PI;
        const trailLength = 70;

        // ── Smoke trail (layered) ──
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (let layer = 4; layer >= 0; layer--) {
            const width = 4 + layer * 4;
            const alpha = 0.28 - layer * 0.05;
            const layerLength = trailLength - layer * 10;
            if (layerLength <= 0) continue;
            const startX = this.x + Math.cos(trailAngle) * layerLength;
            const startY = this.y + Math.sin(trailAngle) * layerLength;
            const gradient = ctx.createLinearGradient(startX, startY, this.x, this.y);
            gradient.addColorStop(0, "rgba(255, 80, 20, 0)");
            gradient.addColorStop(0.35, `rgba(255, 110, 40, ${alpha})`);
            gradient.addColorStop(0.75, `rgba(255, 190, 90, ${alpha * 1.4})`);
            gradient.addColorStop(1, `rgba(255, 245, 200, ${alpha * 2.2})`);
            ctx.strokeStyle = gradient;
            ctx.lineWidth = width;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(this.x, this.y);
            ctx.stroke();
        }
        ctx.restore();

        // Core bright streak
        const coreStartX = this.x + Math.cos(trailAngle) * 30;
        const coreStartY = this.y + Math.sin(trailAngle) * 30;
        const coreGradient = ctx.createLinearGradient(coreStartX, coreStartY, this.x, this.y);
        coreGradient.addColorStop(0, "rgba(255, 255, 200, 0)");
        coreGradient.addColorStop(0.5, "rgba(255, 255, 220, 0.85)");
        coreGradient.addColorStop(1, "rgba(255, 255, 255, 1)");
        ctx.strokeStyle = coreGradient;
        ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(255, 200, 100, 1)";
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(coreStartX, coreStartY);
        ctx.lineTo(this.x, this.y);
        ctx.stroke();

        // ── Lock-on reticle around target ──
        if (this.target && this.target.active) {
            ctx.save();
            ctx.globalCompositeOperation = "screen";
            const tx = this.target.cx;
            const ty = this.target.cy;
            const r = Math.max(this.target.w, this.target.h) * 0.65;
            const wobble = (Math.sin(now * 0.012) + 1) * 0.5;
            ctx.strokeStyle = `rgba(255, 80, 80, ${0.5 + wobble * 0.3})`;
            ctx.lineWidth = 1.5;
            // 4 corner brackets
            const brackets = [
                [-1, -1], [1, -1], [1, 1], [-1, 1]
            ];
            const bs = 8;
            for (const [sx, sy] of brackets) {
                const x = tx + sx * r;
                const y = ty + sy * r;
                ctx.beginPath();
                ctx.moveTo(x, y - sy * bs);
                ctx.lineTo(x, y);
                ctx.lineTo(x - sx * bs, y);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Rocket body
        ctx.shadowBlur = 0;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Outer glow halo
        ctx.shadowColor = "rgba(255, 100, 50, 1)";
        ctx.shadowBlur = 26;
        ctx.fillStyle = "rgba(255, 150, 50, 0.85)";
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();

        // Sleek missile body (gradient metal)
        ctx.shadowBlur = 10;
        const bodyGrad = ctx.createLinearGradient(-7, 0, 14, 0);
        bodyGrad.addColorStop(0, "#ff8a3c");
        bodyGrad.addColorStop(0.5, "#ffd166");
        bodyGrad.addColorStop(1, "#ffffff");
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.moveTo(14, 0);            // Nose tip
        ctx.lineTo(8, -3);
        ctx.lineTo(-3, -4);            // Top fin root
        ctx.lineTo(-7, -7);            // Top fin tip
        ctx.lineTo(-7, -1);
        ctx.lineTo(-9, 0);             // Tail center
        ctx.lineTo(-7, 1);
        ctx.lineTo(-7, 7);             // Bottom fin tip
        ctx.lineTo(-3, 4);             // Bottom fin root
        ctx.lineTo(8, 3);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(180, 60, 20, 0.7)";
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Hot tip core
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(4, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Engine exhaust burn
        const burn = ctx.createRadialGradient(-9, 0, 0, -9, 0, 5);
        burn.addColorStop(0, "rgba(255, 255, 255, 1)");
        burn.addColorStop(0.5, "rgba(255, 200, 100, 0.85)");
        burn.addColorStop(1, "rgba(255, 100, 30, 0)");
        ctx.fillStyle = burn;
        ctx.beginPath();
        ctx.arc(-9, 0, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// ============================================================================
// ENEMY CLASS
// ============================================================================

class Enemy {
    constructor(typeInfo, cx, cy, vx, vy, graph, graphCanvas) {
        this.name = typeInfo.name;
        this.color = typeInfo.color;
        this.header = typeInfo.header;
        this.accent = typeInfo.accent;
        this.stroke = typeInfo.stroke;
        this.hp = typeInfo.hp;
        this.maxHp = typeInfo.hp;
        this.isBoss = !!typeInfo.isBoss;
        this.bossImages = this.isBoss ? getBossImages() : null;
        if (this.isBoss) {
            this.w = CONFIG.BOSS_NODE_WIDTH;
            this.h = CONFIG.BOSS_NODE_HEIGHT;
        } else {
            this.w = typeInfo.size;
            this.h = Math.round(typeInfo.size * 0.62);
        }
        this.cx = cx;
        this.cy = cy;
        this.vx = vx;
        this.vy = vy;
        this.maxSpeed = typeInfo.speed + rand(-12, 16);
        this.seek = typeInfo.seek * rand(0.7, 1.3);
        this.orbit = typeInfo.orbit + rand(-8, 8);
        this.wobble = typeInfo.wobble * rand(0.6, 1.4);
        this.wobbleSpeed = typeInfo.wobbleSpeed * rand(0.7, 1.5);
        this.canShoot = typeInfo.canShoot;
        this.fireInterval = typeInfo.fireInterval;
        this.fireTimer = rand(0.6, typeInfo.fireInterval);
        this.portsIn = typeInfo.portsIn;
        this.portsOut = typeInfo.portsOut;
        this.points = typeInfo.points;
        this.typeCandidates = typeInfo.typeCandidates;

        this.hitFlash = 0;
        this.flashColor = typeInfo.accent;
        this.flashApplied = false;
        this.t = rand(0, 2);
        this.jinkTimer = rand(0.4, 1.2);
        this.jinkStrength = rand(22, 78);
        this.anchorAngle = rand(0, Math.PI * 2);
        this.anchorRadius = this.isBoss ? rand(340, 460) : rand(170, 380);
        this.anchorSpin = (Math.random() > 0.5 ? 1 : -1) * rand(0.12, 0.38);
        this.bossDashTimer = this.isBoss ? rand(CONFIG.BOSS_DASH_MIN_INTERVAL, CONFIG.BOSS_DASH_MAX_INTERVAL) : 0;
        this.bossDash = null;
        this.dashSoundQueued = false;

        this.node = null;
        this.baseColor = typeInfo.header;
        this.baseBg = typeInfo.color;
        this.active = true;

        if (!this.isBoss) {
            this.createNode(graph, graphCanvas, typeInfo);
        }
    }

    createNode(graph, graphCanvas, typeInfo) {
        if (!graph?.add) return;

        const LiteGraph = getLiteGraph();
        if (!LiteGraph) return;

        // Find available node type
        const candidates = Array.isArray(typeInfo.typeCandidates) ? typeInfo.typeCandidates : [];
        let nodeType = pickAvailableNodeType(candidates);
        if (!nodeType) {
            nodeType = pickAvailableNodeType(["Reroute", "Note", "PrimitiveNode"]);
        }
        if (!nodeType) return;

        const node = createGraphNode(nodeType);
        if (!node) return;

        // Configure node appearance
        node.title = typeInfo.name;
        node.color = typeInfo.header;
        node.bgcolor = typeInfo.color;
        node._nodeInvader = true;
        node._nodeInvaderBase = { color: typeInfo.header, bgcolor: typeInfo.color };

        if (typeof node.computeSize === "function") {
            node.size = node.computeSize();
        }
        if (Array.isArray(node.size)) {
            this.w = node.size[0];
            this.h = node.size[1];
            node.pos = [this.cx - this.w / 2, this.cy - this.h / 2];
        } else {
            node.pos = [this.cx, this.cy];
        }

        // Ensure visibility
        if (node.setFlag) {
            node.setFlag(LiteGraph.FLAG_VISIBLE, true);
        }

        // Add to graph
        graph.add(node);

        if (node.setDirty) {
            node.setDirty(true);
        }

        this.node = node;
        this.baseColor = node.color;
        this.baseBg = node.bgcolor;
    }

    update(dt, view, center, playerX, playerY, syncTimer = 0) {
        this.t += dt;

        if (this.isBoss && this.updateBossDash(dt, view, playerX, playerY)) {
            if (this.canShoot) {
                this.fireTimer -= dt;
            }
            this.hitFlash = Math.max(0, this.hitFlash - dt);
            return;
        }

        // Calculate boundary margins
        const margin = Math.max(CONFIG.ENEMY_BOUNDARY_MARGIN, Math.max(this.w, this.h));
        const minX = view.left - margin;
        const maxX = view.right + margin;
        const minY = view.top - margin;
        const maxY = view.bottom + margin;

        const isNearEdge = this.cx < minX + margin * 0.5 || this.cx > maxX - margin * 0.5 ||
            this.cy < minY + margin * 0.5 || this.cy > maxY - margin * 0.5;
        const isOutside = this.cx < minX || this.cx > maxX || this.cy < minY || this.cy > maxY;

        const orbitPhase = this.anchorAngle + this.t * this.anchorSpin;
        const targetRadius = this.anchorRadius + Math.sin(this.t * 0.55 + this.anchorAngle) * 34;
        const targetX = playerX + Math.cos(orbitPhase) * targetRadius;
        const targetY = playerY + Math.sin(orbitPhase) * targetRadius;

        const toTargetX = targetX - this.cx;
        const toTargetY = targetY - this.cy;
        const dist = Math.hypot(toTargetX, toTargetY) || 1;
        const nx = toTargetX / dist;
        const ny = toTargetY / dist;

        const toPlayerX = this.cx - playerX;
        const toPlayerY = this.cy - playerY;
        const playerDist = Math.hypot(toPlayerX, toPlayerY) || 1;
        const minPlayerDist = this.isBoss ? 240 : 95;

        // Adjust forces based on position
        const orbitMultiplier = isNearEdge ? 0.2 : 1.0;
        const seekMultiplier = isNearEdge ? 2.0 : 1.0;

        // Apply seek and orbit forces
        this.vx += (nx * this.seek * seekMultiplier + -ny * this.orbit * orbitMultiplier) * dt * 30;
        this.vy += (ny * this.seek * seekMultiplier + nx * this.orbit * orbitMultiplier) * dt * 30;

        if (playerDist < minPlayerDist) {
            const repel = (1 - playerDist / minPlayerDist) * (this.isBoss ? 170 : 115);
            this.vx += (toPlayerX / playerDist) * repel * dt;
            this.vy += (toPlayerY / playerDist) * repel * dt;
        }

        // Apply wobble
        const wobbleMultiplier = isNearEdge ? 0.3 : 1.0;
        const wobble = Math.sin(this.t * this.wobbleSpeed) * this.wobble * wobbleMultiplier;
        this.vx += -ny * wobble * 30 * dt;
        this.vy += nx * wobble * 30 * dt;

        // Apply jink (random acceleration)
        this.jinkTimer -= dt;
        if (this.jinkTimer <= 0) {
            const jink = this.jinkStrength * (isNearEdge ? 0.3 : 1.0);
            this.vx += rand(-jink, jink);
            this.vy += rand(-jink, jink);
            this.jinkTimer = rand(0.5, 1.6);
        }

        // Strong push toward the current engagement lane if outside
        if (isOutside) {
            const pushStrength = 150;
            this.vx += nx * pushStrength * dt;
            this.vy += ny * pushStrength * dt;
        }

        // Clamp speed
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > this.maxSpeed) {
            this.vx = (this.vx / speed) * this.maxSpeed;
            this.vy = (this.vy / speed) * this.maxSpeed;
        }

        // Apply velocity
        this.cx += this.vx * dt;
        this.cy += this.vy * dt;

        // Hard boundary enforcement
        if (this.cx < minX) {
            this.cx = minX;
            if (this.vx < 0) this.vx = Math.abs(nx) * this.maxSpeed * 0.8;
        } else if (this.cx > maxX) {
            this.cx = maxX;
            if (this.vx > 0) this.vx = -Math.abs(nx) * this.maxSpeed * 0.8;
        }
        if (this.cy < minY) {
            this.cy = minY;
            if (this.vy < 0) this.vy = Math.abs(ny) * this.maxSpeed * 0.8;
        } else if (this.cy > maxY) {
            this.cy = maxY;
            if (this.vy > 0) this.vy = -Math.abs(ny) * this.maxSpeed * 0.8;
        }

        // Additional pull toward the current engagement lane when at boundary
        if (isOutside || isNearEdge) {
            const pullStrength = isOutside ? 200 : 80;
            this.vx += nx * pullStrength * dt;
            this.vy += ny * pullStrength * dt;
        }

        // Update fire timer
        if (this.canShoot) {
            this.fireTimer -= dt;
        }

        // Update hit flash
        this.hitFlash = Math.max(0, this.hitFlash - dt);

        // Sync node position (throttled)
        this.syncNodePosition(dt, syncTimer);
    }

    updateBossDash(dt, view, playerX, playerY) {
        if (!this.isBoss) return false;

        if (this.bossDash) {
            const dash = this.bossDash;
            dash.elapsed += dt;
            const t = clamp(dash.elapsed / dash.duration, 0, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            this.cx = dash.fromX + (dash.toX - dash.fromX) * eased;
            this.cy = dash.fromY + (dash.toY - dash.fromY) * eased;
            this.vx = 0;
            this.vy = 0;
            if (t >= 1) {
                this.bossDash = null;
                this.bossDashTimer = rand(CONFIG.BOSS_DASH_MIN_INTERVAL, CONFIG.BOSS_DASH_MAX_INTERVAL);
            }
            return true;
        }

        this.bossDashTimer -= dt;
        if (this.bossDashTimer > 0) return false;

        const padX = Math.min(this.w * 0.5, Math.max(80, view.width * 0.18));
        const padY = Math.min(this.h * 0.5, Math.max(70, view.height * 0.16));
        const minX = view.left + padX;
        const maxX = view.right - padX;
        const minY = view.top + padY;
        const maxY = view.bottom - padY;

        let toX = this.cx;
        let toY = this.cy;

        for (let i = 0; i < 12; i++) {
            const angle = rand(0, Math.PI * 2);
            const distance = rand(CONFIG.BOSS_DASH_MIN_DISTANCE, CONFIG.BOSS_DASH_MAX_DISTANCE);
            const candidateX = clamp(this.cx + Math.cos(angle) * distance, minX, maxX);
            const candidateY = clamp(this.cy + Math.sin(angle) * distance, minY, maxY);
            const fromDist = Math.hypot(candidateX - this.cx, candidateY - this.cy);
            const playerDist = Math.hypot(candidateX - playerX, candidateY - playerY);
            if (fromDist >= CONFIG.BOSS_DASH_MIN_DISTANCE * 0.75 &&
                fromDist <= CONFIG.BOSS_DASH_MAX_DISTANCE &&
                playerDist >= CONFIG.BOSS_DASH_PLAYER_SAFE_DISTANCE) {
                toX = candidateX;
                toY = candidateY;
                break;
            }
        }

        if (toX === this.cx && toY === this.cy) {
            const awayX = this.cx - playerX;
            const awayY = this.cy - playerY;
            const awayLen = Math.hypot(awayX, awayY) || 1;
            const distance = CONFIG.BOSS_DASH_MIN_DISTANCE;
            toX = clamp(this.cx + (awayX / awayLen) * distance, minX, maxX);
            toY = clamp(this.cy + (awayY / awayLen) * distance, minY, maxY);
        }

        this.bossDash = {
            fromX: this.cx,
            fromY: this.cy,
            toX,
            toY,
            elapsed: 0,
            duration: CONFIG.BOSS_DASH_DURATION
        };
        this.flashApplied = false;
        this.dashSoundQueued = true;
        return true;
    }

    syncNodePosition(dt, syncTimer) {
        if (!this.node) return;
        if (!this.node.graph) {
            this.node = null;
            return;
        }

        // Throttle node position updates
        if (syncTimer > 0) {
            // Still update bounds cache frame even if not syncing
            this._boundsFrame = (this._boundsFrame || 0) + 1;
            return;
        }

        // Update size from node if available
        if (Array.isArray(this.node.size)) {
            this.w = this.node.size[0];
            this.h = this.node.size[1];
        }

        // Update flash effect on node
        if (this.hitFlash > 0) {
            if (!this.flashApplied) {
                this.flashApplied = true;
                this.node.color = "#ffffff";
                this.node.bgcolor = this.flashColor;
            }
        } else if (this.flashApplied) {
            this.flashApplied = false;
            this.node.color = this.baseColor;
            this.node.bgcolor = this.baseBg;
        }

        // Update node position from our game position (center to top-left)
        const newPosX = this.cx - this.w / 2;
        const newPosY = this.cy - this.h / 2;

        if (Array.isArray(this.node.pos)) {
            this.node.pos[0] = newPosX;
            this.node.pos[1] = newPosY;
        } else {
            this.node.pos = [newPosX, newPosY];
        }

        // Don't call setDirty on every sync - let graph redraw handle it
        // if (this.node.setDirty) {
        //     this.node.setDirty(true);
        // }

        if (Array.isArray(this.node.pos)) {
            this.cx = this.node.pos[0] + this.w / 2;
            this.cy = this.node.pos[1] + this.h / 2;
        }
    }

    shouldFire() {
        return this.canShoot && this.fireTimer <= 0;
    }

    resetFireTimer() {
        this.fireTimer = this.fireInterval + rand(-0.4, 0.4);
    }

    takeDamage(amount = 1) {
        this.hp = Math.max(0, this.hp - amount);
        this.hitFlash = 0.16;
        return this.hp <= 0;
    }

    checkPlayerCollision(playerX, playerY, playerRadius) {
        const bounds = getEnemyBounds(this);
        return circleRectCollision(playerX, playerY, playerRadius, bounds.x, bounds.y, bounds.w, bounds.h);
    }

    removeNode(graph) {
        if (this.node && graph) {
            graph.remove(this.node);
            this.node = null;
        }
    }

    drawBossOverlay(ctx, time) {
        if (!this.isBoss) return;
        const cx = this.cx;
        const cy = this.cy;
        const w = this.w;
        const h = this.h;
        const halfDiag = Math.hypot(w, h) / 2;

        ctx.save();
        ctx.globalCompositeOperation = "screen";

        // Outer pulsing aura
        const pulse = 0.55 + 0.45 * Math.sin(time * 3.4);
        for (let layer = 3; layer >= 0; layer--) {
            const r = halfDiag + 18 + layer * 18 + pulse * 8;
            const alpha = (0.18 - layer * 0.04) * (0.6 + pulse * 0.4);
            const grad = ctx.createRadialGradient(cx, cy, halfDiag * 0.8, cx, cy, r);
            grad.addColorStop(0, `rgba(192, 132, 252, ${alpha})`);
            grad.addColorStop(0.6, `rgba(240, 171, 252, ${alpha * 0.5})`);
            grad.addColorStop(1, "rgba(192, 132, 252, 0)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        // Crackling boss frame
        ctx.save();
        ctx.strokeStyle = `rgba(240, 171, 252, ${0.7 + pulse * 0.3})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "rgba(192, 132, 252, 0.9)";
        ctx.shadowBlur = 18;
        const x0 = cx - w / 2 - 6;
        const y0 = cy - h / 2 - 6;
        const cornerW = 22;
        const cornerH = 22;
        // Four animated corner brackets
        ctx.beginPath();
        ctx.moveTo(x0, y0 + cornerH); ctx.lineTo(x0, y0); ctx.lineTo(x0 + cornerW, y0);
        ctx.moveTo(x0 + w + 12 - cornerW, y0); ctx.lineTo(x0 + w + 12, y0); ctx.lineTo(x0 + w + 12, y0 + cornerH);
        ctx.moveTo(x0 + w + 12, y0 + h + 12 - cornerH); ctx.lineTo(x0 + w + 12, y0 + h + 12); ctx.lineTo(x0 + w + 12 - cornerW, y0 + h + 12);
        ctx.moveTo(x0 + cornerW, y0 + h + 12); ctx.lineTo(x0, y0 + h + 12); ctx.lineTo(x0, y0 + h + 12 - cornerH);
        ctx.stroke();
        ctx.restore();

        // Boss label + HP bar above the node
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.7)";
        ctx.shadowBlur = 6;
        ctx.font = "800 13px 'Segoe UI Variable Display', 'Segoe UI', Inter, system-ui, sans-serif";
        ctx.letterSpacing = "0.08em";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#f0abfc";
        ctx.fillText("BOSS", cx, cy - h / 2 - 18);
        ctx.letterSpacing = "0px";
        ctx.shadowBlur = 0;

        const barW = w;
        const barH = 6;
        const barX = cx - barW / 2;
        const barY = cy - h / 2 - 12;
        const ratio = clamp(this.hp / this.maxHp, 0, 1);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(barX, barY, barW, barH);
        const hpGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
        hpGrad.addColorStop(0, "#f0abfc");
        hpGrad.addColorStop(0.5, "#c084fc");
        hpGrad.addColorStop(1, "#7c3aed");
        ctx.fillStyle = hpGrad;
        ctx.fillRect(barX, barY, barW * ratio, barH);
        ctx.strokeStyle = "rgba(240, 171, 252, 0.8)";
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
        ctx.restore();
    }

    draw(ctx) {
        if (this.isBoss) {
            this.drawBossSprite(ctx);
            return;
        }

        // Only draw fallback if no node exists
        if (this.node) return;

        const x = this.cx;
        const y = this.cy;
        const w = this.w;
        const h = this.h;
        const x0 = x - w / 2;
        const y0 = y - h / 2;
        const radius = 8;
        const headerHeight = 18;

        ctx.save();
        if (this.hitFlash > 0) {
            ctx.globalAlpha = 0.9;
        }

        // Body
        ctx.fillStyle = this.color;
        ctx.strokeStyle = this.stroke;
        ctx.lineWidth = 2;
        roundRect(ctx, x0, y0, w, h, radius);
        ctx.fill();
        ctx.stroke();

        // Header
        ctx.fillStyle = this.header;
        roundRect(ctx, x0, y0, w, headerHeight, radius, true);
        ctx.fill();

        // Title
        ctx.fillStyle = "#f2f6ff";
        ctx.font = "750 11px 'Segoe UI Variable', 'Segoe UI', Inter, system-ui, sans-serif";
        ctx.fillText(this.name, x0 + 8, y0 + 13);

        // Ports
        ctx.fillStyle = this.accent;
        for (let i = 0; i < this.portsIn; i++) {
            const py = y0 + headerHeight + ((i + 1) * (h - headerHeight)) / (this.portsIn + 1);
            ctx.beginPath();
            ctx.arc(x0 - 3, py, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        for (let i = 0; i < this.portsOut; i++) {
            const py = y0 + headerHeight + ((i + 1) * (h - headerHeight)) / (this.portsOut + 1);
            ctx.beginPath();
            ctx.arc(x0 + w + 3, py, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // HP bar
        const hpWidth = w - 14;
        const hpRatio = this.hp / this.maxHp;
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.fillRect(x0 + 7, y0 + h - 10, hpWidth, 4);
        ctx.fillStyle = this.accent;
        ctx.fillRect(x0 + 7, y0 + h - 10, hpWidth * hpRatio, 4);

        ctx.restore();
    }

    drawBossSprite(ctx) {
        const x0 = this.cx - this.w / 2;
        const y0 = this.cy - this.h / 2;
        const images = this.bossImages || [];
        const img = images[Math.floor(performance.now() / 1000) % 2] || images[0];
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);

        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const glow = ctx.createRadialGradient(this.cx, this.cy, this.w * 0.18, this.cx, this.cy, this.w * 0.62);
        glow.addColorStop(0, `rgba(240, 171, 252, ${0.22 + pulse * 0.12})`);
        glow.addColorStop(0.55, `rgba(124, 58, 237, ${0.16 + pulse * 0.08})`);
        glow.addColorStop(1, "rgba(124, 58, 237, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, this.w * 0.64, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        if (this.hitFlash > 0) {
            ctx.shadowColor = "#ffffff";
            ctx.shadowBlur = 26;
        } else {
            ctx.shadowColor = "rgba(240, 171, 252, 0.75)";
            ctx.shadowBlur = 18;
        }

        if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, x0, y0, this.w, this.h);
        } else {
            const grad = ctx.createLinearGradient(x0, y0, x0, y0 + this.h);
            grad.addColorStop(0, "#3b0764");
            grad.addColorStop(1, "#12031f");
            ctx.fillStyle = grad;
            roundRect(ctx, x0, y0, this.w, this.h, 14);
            ctx.fill();
            ctx.strokeStyle = "#f0abfc";
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.fillStyle = "#f0abfc";
            ctx.font = "900 46px 'Segoe UI Variable Display', 'Segoe UI', Inter, system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("BOSS", this.cx, this.cy);
        }

        if (this.hitFlash > 0) {
            ctx.globalCompositeOperation = "screen";
            ctx.globalAlpha = clamp(this.hitFlash * 3, 0, 0.65);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(x0, y0, this.w, this.h);
        }

        ctx.restore();
    }
}

// ============================================================================
// PARTICLE SYSTEM
// ============================================================================

class Particle {
    constructor(x, y, vx, vy, life, size, color, kind) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.size = size;
        this.color = color;
        this.kind = kind;
        this.active = true;
        this.rotation = rand(0, Math.PI * 2);
        this.rotationSpeed = rand(-8, 8);
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.rotation += this.rotationSpeed * dt;

        if (this.kind === "spark") {
            this.vx *= 0.98;
            this.vy *= 0.98;
        } else if (this.kind === "exhaust") {
            this.vx *= 0.92;
            this.vy *= 0.92;
            this.size *= 0.97;
        } else if (this.kind === "debris") {
            this.vy += 50 * dt;
            this.vx *= 0.99;
            this.size *= 0.995;
        } else {
            this.vy += 40 * dt;
        }

        this.life -= dt;
        if (this.life <= 0) {
            this.active = false;
        }
    }

    draw(ctx, view) {
        // Viewport culling
        const padding = 50;
        if (this.x < view.left - padding || this.x > view.right + padding ||
            this.y < view.top - padding || this.y > view.bottom + padding) {
            return;
        }

        const lifeRatio = this.life / this.maxLife;
        const alpha = clamp(lifeRatio * 1.5, 0, 1);
        if (alpha < 0.02) return;

        ctx.globalAlpha = alpha;

        if (this.kind === "spark") {
            // No shadowBlur - use bright color + trail for glow illusion
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.size * 1.8;
            ctx.lineCap = "round";
            ctx.beginPath();
            const tailX = this.x - this.vx * 0.06;
            const tailY = this.y - this.vy * 0.06;
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(this.x, this.y);
            ctx.stroke();

            // Bright center dot
            if (this.size > 1.2) {
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size * 0.35, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (this.kind === "exhaust") {
            // Simple circle, no shadow
            ctx.fillStyle = "rgba(255, 180, 80, 0.85)";
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Debris - no shadow, use double-circle for glow illusion
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();

            if (this.size > 1.8) {
                ctx.globalAlpha = alpha * 0.5;
                ctx.fillStyle = "#ffffff";
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size * 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

class Shockwave {
    constructor(x, y, maxRadius, life, color) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = maxRadius;
        this.life = life;
        this.maxLife = life;
        this.color = color;
        this.active = true;
    }

    update(dt) {
        this.radius += (this.maxRadius / this.maxLife) * dt * 1.2;
        this.life -= dt;
        if (this.life <= 0) {
            this.active = false;
        }
    }

    draw(ctx, view) {
        // Viewport culling
        const padding = this.maxRadius;
        if (this.x + padding < view.left || this.x - padding > view.right ||
            this.y + padding < view.top || this.y - padding > view.bottom) {
            return;
        }

        const lifeRatio = this.life / this.maxLife;
        if (lifeRatio < 0.02) return;

        const alpha = clamp(lifeRatio * 1.5, 0, 0.8);

        // Outer glow ring (wider, dimmer — no shadowBlur)
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = alpha * 0.35;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Main ring
        ctx.globalAlpha = alpha * 0.7;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner bright ring
        ctx.strokeStyle = "#ffffff";
        ctx.globalAlpha = alpha * 0.8;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.85, 0, Math.PI * 2);
        ctx.stroke();
    }
}

class Explosion {
    constructor(x, y, maxRadius, life, color, accent) {
        this.x = x;
        this.y = y;
        this.maxRadius = maxRadius;
        this.life = life;
        this.maxLife = life;
        this.color = color;
        this.accent = accent || color;
        this.active = true;
        this.pulsePhase = rand(0, Math.PI * 2);
    }

    update(dt) {
        this.life -= dt;
        this.pulsePhase += dt * 12;
        if (this.life <= 0) {
            this.active = false;
        }
    }

    draw(ctx, view) {
        // Viewport culling
        const padding = this.maxRadius;
        if (this.x + padding < view.left || this.x - padding > view.right ||
            this.y + padding < view.top || this.y - padding > view.bottom) {
            return;
        }

        const lifeRatio = clamp(this.life / this.maxLife, 0, 1);
        if (lifeRatio < 0.02) return;

        const expansion = 1 - lifeRatio;
        const pulse = 1 + Math.sin(this.pulsePhase) * 0.15;
        const radius = this.maxRadius * expansion * pulse;
        const fade = lifeRatio;

        // Outer glow layer (no shadowBlur — larger, dimmer circle)
        ctx.globalAlpha = fade * 0.3;
        ctx.fillStyle = this.accent;
        ctx.beginPath();
        ctx.arc(this.x, this.y, radius * 0.9, 0, Math.PI * 2);
        ctx.fill();

        // Main explosion body
        ctx.globalAlpha = fade * 0.85;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, radius * 0.65, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.globalAlpha = fade;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(3, radius * 0.25), 0, Math.PI * 2);
        ctx.fill();

        // Sparkle effect (only if bright and large enough)
        if (lifeRatio > 0.4 && radius > 15) {
            ctx.globalAlpha = (lifeRatio - 0.4) * 2;
            ctx.fillStyle = "#ffffff";
            for (let i = 0; i < 4; i++) {
                const angle = (i / 4) * Math.PI * 2 + this.pulsePhase;
                const dist = radius * 0.5;
                const sparkX = this.x + Math.cos(angle) * dist;
                const sparkY = this.y + Math.sin(angle) * dist;
                ctx.beginPath();
                ctx.arc(sparkX, sparkY, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

// ============================================================================
// FLOATING TEXT CLASS (for combos and milestones)
// ============================================================================

class FloatingText {
    constructor(x, y, text, color, size = 24, duration = 1.2) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.size = size;
        this.life = duration;
        this.maxLife = duration;
        this.active = true;
        this.vy = -60;  // Float upward
        this.scale = 0;  // Start small, scale up
    }

    update(dt) {
        this.life -= dt;
        this.y += this.vy * dt;
        this.vy *= 0.95;  // Slow down

        // Scale animation
        const lifeRatio = this.life / this.maxLife;
        if (lifeRatio > 0.8) {
            // Pop in
            this.scale = 1 - ((lifeRatio - 0.8) / 0.2);
            this.scale = 1 + (1 - this.scale) * 0.3;  // Overshoot
        } else if (lifeRatio > 0.2) {
            this.scale = 1;
        } else {
            // Fade out
            this.scale = lifeRatio / 0.2;
        }

        if (this.life <= 0) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (this.scale <= 0) return;

        const alpha = clamp(this.life / this.maxLife * 2, 0, 1);

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);

        ctx.font = `850 ${this.size}px 'Segoe UI Variable Display', 'Segoe UI', Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = alpha;

        ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 2;
        ctx.strokeStyle = "rgba(3, 7, 18, 0.82)";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(3, this.size * 0.12);
        ctx.strokeText(this.text, 0, 0);

        const grad = ctx.createLinearGradient(0, -this.size * 0.55, 0, this.size * 0.55);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.18, this.color);
        grad.addColorStop(1, this.color);
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = grad;
        ctx.fillText(this.text, 0, 0);

        ctx.restore();
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
        this.shockwaves = [];
        this.explosions = [];
        this.maxParticles = 300; // Limit total particles for performance
    }

    clear() {
        this.particles = [];
        this.shockwaves = [];
        this.explosions = [];
    }

    update(dt) {
        // Update particles (limit count for performance)
        if (this.particles.length > this.maxParticles) {
            // Remove oldest inactive particles first, then oldest active ones
            const toRemove = this.particles.length - this.maxParticles;
            for (let i = 0; i < toRemove && i < this.particles.length; i++) {
                if (!this.particles[i].active) {
                    this.particles.splice(i, 1);
                    i--;
                }
            }
            // If still over limit, remove oldest
            while (this.particles.length > this.maxParticles) {
                this.particles.shift();
            }
        }

        // Batch update particles - more efficient removal
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.update(dt);
            if (!particle.active) {
                // Swap with last element for O(1) removal
                if (i < this.particles.length - 1) {
                    this.particles[i] = this.particles[this.particles.length - 1];
                }
                this.particles.pop();
            }
        }

        // Update shockwaves - optimized removal
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const wave = this.shockwaves[i];
            wave.update(dt);
            if (!wave.active) {
                if (i < this.shockwaves.length - 1) {
                    this.shockwaves[i] = this.shockwaves[this.shockwaves.length - 1];
                }
                this.shockwaves.pop();
            }
        }

        // Update explosions - optimized removal
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const explosion = this.explosions[i];
            explosion.update(dt);
            if (!explosion.active) {
                if (i < this.explosions.length - 1) {
                    this.explosions[i] = this.explosions[this.explosions.length - 1];
                }
                this.explosions.pop();
            }
        }
    }

    addExhaust(x, y, angle) {
        const exhaustAngle = angle + Math.PI + rand(-0.3, 0.3);
        const exhaustSpeed = rand(20, 60);
        this.particles.push(new Particle(
            x + Math.cos(exhaustAngle) * 8,
            y + Math.sin(exhaustAngle) * 8,
            Math.cos(exhaustAngle) * exhaustSpeed,
            Math.sin(exhaustAngle) * exhaustSpeed,
            rand(0.15, 0.3),
            rand(1.5, 2.6),
            "rgba(255, 180, 90, 0.7)",
            "exhaust"
        ));
    }

    addMuzzleFlash(x, y, angle) {
        for (let i = 0; i < Math.min(4, CONFIG.PARTICLE_MUZZLE_COUNT / 2); i++) {
            const sparkAngle = angle + Math.PI + rand(-0.8, 0.8);
            const sparkSpeed = rand(80, 160);
            this.particles.push(new Particle(
                x, y,
                Math.cos(sparkAngle) * sparkSpeed,
                Math.sin(sparkAngle) * sparkSpeed,
                rand(0.1, 0.2),
                rand(1.5, 3),
                "rgba(255, 240, 180, 1)",
                "spark"
            ));
        }

        for (let i = 0; i < 2; i++) {
            const sparkAngle = angle + Math.PI + rand(-0.4, 0.4);
            const sparkSpeed = rand(40, 80);
            this.particles.push(new Particle(
                x, y,
                Math.cos(sparkAngle) * sparkSpeed,
                Math.sin(sparkAngle) * sparkSpeed,
                rand(0.05, 0.12),
                rand(2.5, 4),
                "#ffffff",
                "spark"
            ));
        }
    }

    addExplosion(x, y, color, accent) {
        const core = accent || color;

        const debrisCount = Math.min(20, Math.floor(CONFIG.PARTICLE_EXPLOSION_COUNT * 0.45));
        for (let i = 0; i < debrisCount; i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(100, 300);
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                rand(0.4, 1.0),
                rand(2.5, 6),
                Math.random() > 0.5 ? color : core,
                "debris"
            ));
        }

        const sparkCount = Math.min(10, Math.floor(CONFIG.PARTICLE_SPARK_COUNT * 0.5));
        for (let i = 0; i < sparkCount; i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(200, 420);
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                rand(0.25, 0.6),
                rand(1.5, 3.5),
                core,
                "spark"
            ));
        }

        for (let i = 0; i < 4; i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(250, 450);
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                rand(0.15, 0.35),
                rand(1, 2),
                "#ffffff",
                "spark"
            ));
        }

        this.explosions.push(new Explosion(x, y, rand(100, 140), 0.5, color, core));

        if (Math.random() > 0.7) {
            const offsetX = rand(-15, 15);
            const offsetY = rand(-15, 15);
            this.explosions.push(new Explosion(x + offsetX, y + offsetY, rand(50, 70), 0.3, core, "#ffffff"));
        }

        this.shockwaves.push(new Shockwave(x, y, 120, 0.4, core));
    }

    addRocketDetonation(x, y, color, accent) {
        const core = accent || "#ffd166";
        const outer = color || "#ff5e5b";

        this.explosions.push(new Explosion(x, y, 180, 0.55, outer, core));
        this.explosions.push(new Explosion(x, y, 92, 0.32, "#ffffff", core));
        this.shockwaves.push(new Shockwave(x, y, 170, 0.42, core));
        this.shockwaves.push(new Shockwave(x, y, 95, 0.26, "#ffffff"));

        for (let i = 0; i < 18; i++) {
            const angle = (i / 18) * Math.PI * 2 + rand(-0.08, 0.08);
            const speed = rand(280, 560);
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                rand(0.22, 0.52),
                rand(1.4, 3.2),
                i % 3 === 0 ? "#ffffff" : core,
                "spark"
            ));
        }

        for (let i = 0; i < 12; i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(90, 240);
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                rand(0.45, 0.9),
                rand(3.5, 7.5),
                Math.random() > 0.45 ? outer : core,
                "debris"
            ));
        }
    }

    addHitSpark(x, y, color) {
        const hitColor = color || "#ffffff";

        for (let i = 0; i < Math.min(6, CONFIG.PARTICLE_HIT_COUNT / 2); i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(80, 180);
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                rand(0.15, 0.3),
                rand(1.5, 3),
                hitColor,
                "spark"
            ));
        }

        for (let i = 0; i < 3; i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(100, 200);
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                rand(0.1, 0.2),
                rand(1, 2),
                "#ffffff",
                "spark"
            ));
        }

        for (let i = 0; i < 2; i++) {
            const angle = rand(0, Math.PI * 2);
            const speed = rand(40, 100);
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                rand(0.2, 0.4),
                rand(2, 3.5),
                hitColor,
                "debris"
            ));
        }

        // Only add shockwave occasionally (50% chance)
        if (Math.random() > 0.5) {
            this.shockwaves.push(new Shockwave(x, y, 50, 0.25, hitColor));
        }
    }

    draw(ctx, view) {
        // Batch rendering for better performance
        // Draw shockwaves with additive blending
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (const wave of this.shockwaves) {
            if (wave.active) {
                wave.draw(ctx, view);
            }
        }
        ctx.restore();

        // Draw explosions with additive blending
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (const explosion of this.explosions) {
            if (explosion.active) {
                explosion.draw(ctx, view);
            }
        }
        ctx.restore();

        // Draw particles with normal blending - batch by kind for better performance
        ctx.save();

        // Group particles by kind to reduce state changes
        const sparks = [];
        const exhausts = [];
        const debris = [];

        for (const particle of this.particles) {
            if (!particle.active) continue;
            if (particle.kind === "spark") sparks.push(particle);
            else if (particle.kind === "exhaust") exhausts.push(particle);
            else debris.push(particle);
        }

        // Draw each group
        for (const particle of sparks) {
            particle.draw(ctx, view);
        }
        for (const particle of exhausts) {
            particle.draw(ctx, view);
        }
        for (const particle of debris) {
            particle.draw(ctx, view);
        }

        ctx.restore();
    }
}

// ============================================================================
// INPUT HANDLER
// ============================================================================

class InputHandler {
    constructor() {
        this.up = false;
        this.down = false;
        this.left = false;
        this.right = false;
        this.shoot = false;
        this.pointerX = 0;
        this.pointerY = 0;
        this.pointerDown = false;
        this.pointerActive = false;
        this.rightClick = false;
        this.rightClickDown = false;
    }

    reset() {
        this.up = false;
        this.down = false;
        this.left = false;
        this.right = false;
        this.shoot = false;
        this.pointerDown = false;
        this.rightClick = false;
        this.rightClickDown = false;
    }

    setPointer(x, y) {
        this.pointerX = x;
        this.pointerY = y;
        this.pointerActive = true;
    }

    isFiring() {
        return this.pointerDown || this.shoot;
    }

    isRightClicking() {
        return this.rightClickDown || this.rightClick;
    }
}

class SoundFX {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.lastShot = 0;
        this.lastHit = 0;
        this.volume = 0.42;
    }

    ensure() {
        if (this.ctx) {
            if (this.ctx.state === "suspended") {
                this.ctx.resume().catch(() => {});
            }
            return this.ctx.state === "running";
        }

        if (typeof window === "undefined") return false;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return false;

        try {
            this.ctx = new AudioCtx();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.volume;
            this.master.connect(this.ctx.destination);
            if (this.ctx.state === "suspended") {
                this.ctx.resume().catch(() => {});
            }
            return this.ctx.state === "running";
        } catch (e) {
            this.ctx = null;
            return false;
        }
    }

    tone(freq, duration, type = "sine", gain = 0.08, endFreq = null) {
        if (!this.ensure()) {
            setTimeout(() => this.tone(freq, duration, type, gain, endFreq), 40);
            return;
        }
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const amp = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (endFreq) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
        }
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(amp);
        amp.connect(this.master);
        osc.start(now);
        osc.stop(now + duration + 0.02);
    }

    noise(duration, gain = 0.05, filterFreq = 900, type = "lowpass") {
        if (!this.ensure()) {
            setTimeout(() => this.noise(duration, gain, filterFreq, type), 40);
            return;
        }
        const now = this.ctx.currentTime;
        const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / length);
        }
        const src = this.ctx.createBufferSource();
        const filter = this.ctx.createBiquadFilter();
        const amp = this.ctx.createGain();
        src.buffer = buffer;
        filter.type = type;
        filter.frequency.value = filterFreq;
        amp.gain.setValueAtTime(gain, now);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        src.connect(filter);
        filter.connect(amp);
        amp.connect(this.master);
        src.start(now);
    }

    playShoot() {
        const nowMs = performance.now();
        if (nowMs - this.lastShot < 55) return;
        this.lastShot = nowMs;
        this.tone(880, 0.055, "triangle", 0.06, 1180);
        this.tone(1320, 0.045, "sine", 0.025, 980);
    }

    playHit() {
        const nowMs = performance.now();
        if (nowMs - this.lastHit < 80) return;
        this.lastHit = nowMs;
        this.tone(520, 0.055, "sine", 0.055, 740);
    }

    playExplosion(isBoss = false) {
        this.noise(isBoss ? 0.32 : 0.12, isBoss ? 0.08 : 0.045, isBoss ? 740 : 1200, "lowpass");
        this.tone(isBoss ? 160 : 260, isBoss ? 0.22 : 0.12, "triangle", isBoss ? 0.08 : 0.055, isBoss ? 90 : 180);
        this.tone(isBoss ? 320 : 520, 0.09, "sine", isBoss ? 0.055 : 0.04, isBoss ? 240 : 680);
    }

    playDamage() {
        this.tone(260, 0.15, "triangle", 0.1, 130);
        this.noise(0.08, 0.045, 1500, "bandpass");
    }

    playRocket() {
        this.tone(360, 0.08, "triangle", 0.075, 540);
        setTimeout(() => this.tone(540, 0.1, "triangle", 0.07, 860), 55);
        this.noise(0.11, 0.035, 2200, "highpass");
    }

    playLaser() {
        this.tone(620, 0.18, "sine", 0.08, 1240);
        this.tone(930, 0.14, "triangle", 0.05, 1560);
    }

    playStart() {
        this.tone(420, 0.07, "sine", 0.07, 560);
        setTimeout(() => this.tone(640, 0.1, "triangle", 0.075, 840), 65);
    }

    playBossSpawn() {
        this.tone(140, 0.34, "triangle", 0.09, 80);
        this.tone(280, 0.18, "sine", 0.055, 180);
        this.noise(0.2, 0.06, 620, "lowpass");
    }

    playBossDash() {
        this.tone(360, 0.1, "triangle", 0.065, 920);
        this.noise(0.07, 0.03, 2600, "highpass");
    }

    playGameOver() {
        this.tone(320, 0.26, "triangle", 0.09, 120);
    }

    playNova() {
        this.tone(330, 0.12, "sine", 0.09, 660);
        setTimeout(() => this.tone(660, 0.14, "triangle", 0.08, 990), 75);
        setTimeout(() => this.tone(990, 0.22, "sine", 0.07, 1320), 145);
        this.noise(0.18, 0.045, 3200, "highpass");
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function roundRect(ctx, x, y, w, h, r, topOnly = false) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (topOnly) {
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        return;
    }
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// ============================================================================
// MAIN GAME CLASS
// ============================================================================

export class NodeInvadersGame {
    constructor(root) {
        this.root = root;
        this.canvas = root.querySelector("#nodeinvaders-canvas");
        this.ctx = this.canvas.getContext("2d");

        // UI elements
        this.ui = {
            score: root.querySelector("#ni-score"),
            time: root.querySelector("#ni-time"),
            kills: root.querySelector("#ni-kills"),
            lives: root.querySelector("#ni-lives"),
            modePill: root.querySelector("#ni-mode-pill"),
            modeButtons: root.querySelectorAll(".ni-mode"),
            startOverlay: root.querySelector("#nodeinvaders-start"),
            overOverlay: root.querySelector("#nodeinvaders-over"),
            overScore: root.querySelector("#ni-over-score"),
            overTime: root.querySelector("#ni-over-time"),
            overKills: root.querySelector("#ni-over-kills"),
            overReason: root.querySelector("#ni-over-reason"),
            startButton: root.querySelector("#ni-start-btn"),
            closeButton: root.querySelector("#ni-close-btn"),
            restartButton: root.querySelector("#ni-restart-btn"),
            exitButton: root.querySelector("#ni-exit-btn"),
            rocketIcon: root.querySelector("#ni-rocket-skill"),
            rocketProgress: root.querySelector("#ni-rocket-progress"),
            laserIcon: root.querySelector("#ni-laser-skill"),
            laserProgress: root.querySelector("#ni-laser-progress"),
            novaIcon: root.querySelector("#ni-nova-skill"),
            novaProgress: root.querySelector("#ni-nova-progress")
        };

        // ComfyUI integration
        this.graph = app?.graph || null;
        this.graphCanvas = app?.canvas || null;
        this.graphAvailable = Boolean(this.graph && this.graphCanvas && getLiteGraph());

        // View state
        this.view = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.center = { x: 0, y: 0 };
        this.width = 0;
        this.height = 0;
        this.dpr = 1;

        // Game state
        this.visible = false;
        this.running = false;
        this.lastTime = 0;
        this.rafId = null;
        this.state = { startTime: 0, time: 0, score: 0, kills: 0, lives: CONFIG.PLAYER_LIVES };
        this.invulnTime = 0;

        // Game objects
        this.player = new Player();
        this.input = new InputHandler();
        this.particles = new ParticleSystem();
        this.sfx = new SoundFX();
        this.bullets = [];
        this.enemyBullets = [];
        this.enemies = [];
        this.rockets = [];
        this.floatingTexts = [];

        // Combo system
        this.combo = {
            count: 0,
            timer: 0,
            lastKillX: 0,
            lastKillY: 0
        };
        this.achievedMilestones = new Set();

        // Skill states
        this.skills = {
            rocket: {
                available: false,
                armingUntil: null,
                killsRequired: CONFIG.ROCKET_SKILL_KILLS_REQUIRED
            },
            laser: {
                available: false,
                active: false,
                armingUntil: null,
                timeLeft: 0,
                killsRequired: CONFIG.LASER_SKILL_KILLS_REQUIRED
            },
            nova: {
                available: false,
                armingUntil: null,
                killsRequired: CONFIG.NOVA_SKILL_KILLS_REQUIRED
            }
        };

        // Laser hit particle tracking
        this._laserHitParticles = null;

        // Timers and effects
        this.spawnTimer = 0;
        this.shootCooldown = 0;
        this.muzzleTime = 0;
        this.shakeTime = 0;
        this.shakePower = 0;
        this.flashTime = 0;
        this.flashColor = "#ffffff";

        // Performance optimization timers
        this.graphRedrawTimer = 0;
        this.graphRedrawInterval = 1 / 30;
        this.uiUpdateTimer = 0;
        this.uiUpdateInterval = 1 / 10;
        this.nodeSyncTimer = 0;
        this.nodeSyncInterval = 1 / 30;
        this.viewUpdateNeeded = true;

        // Star field (generated once, reused)
        this.stars = null;
        this._vignetteGradient = null;
        this._lastVignetteSize = null;

        // Bind methods
        this.tick = this.tick.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleBlur = this.handleBlur.bind(this);
        this.handleContextMenu = this.handleContextMenu.bind(this);

        // Boss tracking
        this.bossSpawnedCount = 0;
        this.nextBossKillThreshold = CONFIG.BOSS_FIRST_SPAWN_KILLS;
        this.activeBoss = null;

        // External callback
        this.toggleGamePanel = null;

        // Default mode
        setGameMode("api");
        this.applyModePill();
    }

    applyModePill() {
        if (!this.ui.modePill) return;
        const mode = getGameMode();
        this.ui.modePill.textContent = mode === "api" ? "API Nodes Only" : "Total Chaos";
    }

    setActiveModeButton(mode) {
        if (!this.ui.modeButtons) return;
        this.ui.modeButtons.forEach(btn => {
            if (btn.dataset.mode === mode) btn.classList.add("is-active");
            else btn.classList.remove("is-active");
        });
    }

    setToggleGamePanel(fn) {
        this.toggleGamePanel = fn;
    }

    mount() {
        this.resize();
        this.attachEvents();
        this.showStart();
        this.startLoop();
    }

    attachEvents() {
        this.root.addEventListener("pointermove", this.handlePointerMove);
        this.root.addEventListener("pointerdown", this.handlePointerDown);
        this.root.addEventListener("pointerup", this.handlePointerUp);
        this.root.addEventListener("pointerleave", this.handlePointerUp);
        this.root.addEventListener("contextmenu", this.handleContextMenu);
        window.addEventListener("keydown", this.handleKeyDown, { capture: true });
        window.addEventListener("keyup", this.handleKeyUp, { capture: true });
        window.addEventListener("blur", this.handleBlur);

        this.ui.startButton?.addEventListener("click", () => this.startNewGame());
        this.ui.restartButton?.addEventListener("click", () => this.startNewGame());
        if (this.ui.modeButtons) {
            this.ui.modeButtons.forEach(btn => {
                btn.addEventListener("click", () => {
                    const mode = btn.dataset.mode;
                    if (!mode) return;
                    setGameMode(mode);
                    this.setActiveModeButton(mode);
                    this.applyModePill();
                });
            });
        }
        this.ui.closeButton?.addEventListener("click", () => {
            if (this.toggleGamePanel) this.toggleGamePanel();
        });
        this.ui.exitButton?.addEventListener("click", () => {
            if (this.toggleGamePanel) this.toggleGamePanel();
        });
    }

    detachEvents() {
        this.root.removeEventListener("pointermove", this.handlePointerMove);
        this.root.removeEventListener("pointerdown", this.handlePointerDown);
        this.root.removeEventListener("pointerup", this.handlePointerUp);
        this.root.removeEventListener("pointerleave", this.handlePointerUp);
        this.root.removeEventListener("contextmenu", this.handleContextMenu);
        window.removeEventListener("keydown", this.handleKeyDown, { capture: true });
        window.removeEventListener("keyup", this.handleKeyUp, { capture: true });
        window.removeEventListener("blur", this.handleBlur);
    }

    setVisible(isVisible) {
        this.visible = isVisible;
        if (isVisible) {
            this.lastTime = performance.now();
            this.startLoop();
        } else {
            this.stopLoop();
            this.input.reset();
            this.resetGameState(true);
            this.showStart();
        }
    }

    startLoop() {
        if (!this.rafId) {
            this.rafId = requestAnimationFrame(this.tick);
        }
    }

    stopLoop() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    resetGameState(removeNodes = false) {
        if (removeNodes) {
            this.removeAllInvaderNodes();
        }
        this.enemies = [];
        this.bullets = [];
        this.enemyBullets = [];
        this.rockets = [];
        this.floatingTexts = [];
        this.particles.clear();
        this.spawnTimer = 0;
        this.shootCooldown = 0;
        this.muzzleTime = 0;
        this.shakeTime = 0;
        this.shakePower = 0;
        this.flashTime = 0;
        this.input.pointerActive = false;
        this.player.vx = 0;
        this.player.vy = 0;

        // Reset combo
        this.combo.count = 0;
        this.combo.timer = 0;
        this.achievedMilestones.clear();

        // Reset boss tracking
        this.bossSpawnedCount = 0;
        this.nextBossKillThreshold = getDifficulty().bossFirstKills;
        this.activeBoss = null;

        // Reset lives + invulnerability
        this.state.lives = CONFIG.PLAYER_LIVES;
        this.invulnTime = 0;

        // Reset skills
        this.skills.rocket.available = false;
        this.skills.rocket.armingUntil = null;
        this.skills.rocket.killsRequired = CONFIG.ROCKET_SKILL_KILLS_REQUIRED;
        this.skills.laser.available = false;
        this.skills.laser.active = false;
        this.skills.laser.armingUntil = null;
        this.skills.laser.timeLeft = 0;
        this.skills.laser.killsRequired = CONFIG.LASER_SKILL_KILLS_REQUIRED;
        this.skills.nova.available = false;
        this.skills.nova.armingUntil = null;
        this.skills.nova.killsRequired = CONFIG.NOVA_SKILL_KILLS_REQUIRED;

        // Reset laser hit tracking
        this._laserHitParticles = null;
    }

    removeAllInvaderNodes() {
        if (!this.graphAvailable || !this.graph) return;
        const nodes = this.graph._nodes || [];
        for (const node of nodes.slice()) {
            if (node && node._nodeInvader) {
                this.graph.remove(node);
            }
        }
        this.requestGraphRedraw();
    }

    showStart() {
        this.running = false;
        this.ui.startOverlay?.classList.remove("is-hidden");
        this.ui.overOverlay?.classList.add("is-hidden");
        this.updateUI();
    }

    startNewGame() {
        this.sfx.ensure();
        clearNodeTypesCache();
        this.resetGameState(true);
        this.input.reset();
        this.running = true;
        this.state = {
            startTime: performance.now(),
            time: 0,
            score: 0,
            kills: 0,
            lives: CONFIG.PLAYER_LIVES
        };
        this.invulnTime = 0;
        this.viewUpdateNeeded = true;
        this.updateView();
        this.player.reset(this.center.x, this.center.y);
        this.sfx.playStart();
        this.ui.startOverlay?.classList.add("is-hidden");
        this.ui.overOverlay?.classList.add("is-hidden");

        // Show "GET READY!" message
        this.floatingTexts.push(new FloatingText(
            this.center.x, this.center.y,
            "GET READY!", "#4ade80",
            42, 1.5
        ));
    }

    damagePlayer(reason) {
        if (!this.running) return;
        if (this.invulnTime > 0) return;

        this.state.lives = Math.max(0, this.state.lives - 1);

        if (this.state.lives <= 0) {
            this.sfx.playGameOver();
            this.endGame(reason);
            return;
        }

        // Survive the hit
        this.sfx.playDamage();
        this.invulnTime = CONFIG.INVULN_DURATION;
        this.flashTime = Math.max(this.flashTime, 0.16);
        this.flashColor = "#ff5e5b";
        this.shakeTime = Math.max(this.shakeTime, 0.28);
        this.shakePower = Math.max(this.shakePower, 12);

        // Push the player toward the center to escape danger and clear nearby threats
        const cx = this.center.x;
        const cy = this.center.y;
        this.player.x = cx;
        this.player.y = cy;
        this.player.vx = 0;
        this.player.vy = 0;

        // Wipe enemy bullets within a safe radius
        const safeR = 220;
        const safeRSq = safeR * safeR;
        this.enemyBullets = this.enemyBullets.filter(b => {
            const dx = b.x - cx;
            const dy = b.y - cy;
            return (dx * dx + dy * dy) > safeRSq;
        });

        // Visual + text feedback
        this.particles.addExplosion(cx, cy, "#ff5e5b", "#ffd166");
        this.floatingTexts.push(new FloatingText(
            cx, cy - 50,
            `${this.state.lives} LIFE${this.state.lives === 1 ? "" : "S"} LEFT`,
            "#ff5e5b", 28, 1.4
        ));
        this.updateUI();
    }

    endGame(reason) {
        if (!this.running) return;
        this.running = false;
        const timeText = `${this.state.time.toFixed(1)}s`;
        if (this.ui.overScore) this.ui.overScore.textContent = `${this.state.score}`;
        if (this.ui.overTime) this.ui.overTime.textContent = timeText;
        if (this.ui.overKills) this.ui.overKills.textContent = `${this.state.kills}`;
        if (this.ui.overReason) this.ui.overReason.textContent = reason;
        this.ui.overOverlay?.classList.remove("is-hidden");
    }

    // ========================================================================
    // VIEW & COORDINATE SYSTEM
    // ========================================================================

    resize() {
        this.syncCanvasSize();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.viewUpdateNeeded = true;
        this.updateView();
        if (!this.running) {
            this.player.reset(this.center.x, this.center.y);
        }
    }

    syncCanvasSize() {
        let width = 0, height = 0;
        if (this.graphCanvas?.canvas) {
            const rect = this.graphCanvas.canvas.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
        } else {
            const rect = this.root.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
        }
        width = Math.max(1, width);
        height = Math.max(1, height);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const targetWidth = Math.floor(width * dpr);
        const targetHeight = Math.floor(height * dpr);

        if (this.width !== width) this.width = width;
        if (this.height !== height) this.height = height;
        if (this.dpr !== dpr) this.dpr = dpr;
        if (this.canvas.width !== targetWidth) this.canvas.width = targetWidth;
        if (this.canvas.height !== targetHeight) this.canvas.height = targetHeight;
        if (this.canvas.style.width !== `${width}px`) this.canvas.style.width = `${width}px`;
        if (this.canvas.style.height !== `${height}px`) this.canvas.style.height = `${height}px`;
    }

    updateView() {
        // Re-check graph availability
        if (!this.graphAvailable && app?.graph && app?.canvas && getLiteGraph()) {
            this.graph = app.graph;
            this.graphCanvas = app.canvas;
            this.graphAvailable = true;
        }

        this.syncCanvasSize();

        // Get LiteGraph canvas transform - this is what positions nodes
        const graphCanvas = this.graphCanvas;
        if (graphCanvas && graphCanvas.ds) {
            this.scale = graphCanvas.ds.scale || 1;
            // Store offset in graph coordinates (not pixel coordinates)
            this.offsetX = graphCanvas.ds.offset?.[0] || 0;
            this.offsetY = graphCanvas.ds.offset?.[1] || 0;
        } else {
            this.scale = 1;
            this.offsetX = 0;
            this.offsetY = 0;
        }

        // Calculate visible graph area (in graph coordinates)
        // Use CSS size, not pixel size (DPR already handled in rendering)
        const cssWidth = this.width || 800;
        const cssHeight = this.height || 600;

        const viewLeft = -this.offsetX;
        const viewTop = -this.offsetY;
        const viewWidth = cssWidth / this.scale;
        const viewHeight = cssHeight / this.scale;

        this.view.left = viewLeft;
        this.view.top = viewTop;
        this.view.right = viewLeft + viewWidth;
        this.view.bottom = viewTop + viewHeight;
        this.view.width = viewWidth;
        this.view.height = viewHeight;
        this.center.x = viewLeft + viewWidth * 0.5;
        this.center.y = viewTop + viewHeight * 0.5;

        this.viewUpdateNeeded = false;
    }

    screenToGraph(event) {
        // Always get fresh transform info for accurate mouse tracking
        const graphCanvas = this.graphCanvas;
        let scale = 1;
        let offsetX = 0;
        let offsetY = 0;

        if (graphCanvas && graphCanvas.ds) {
            scale = graphCanvas.ds.scale || 1;
            offsetX = graphCanvas.ds.offset?.[0] || 0;
            offsetY = graphCanvas.ds.offset?.[1] || 0;
        }

        const rect = this.canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const pixelX = canvasX * scaleX;
        const pixelY = canvasY * scaleY;

        // Convert pixel coordinates to graph coordinates
        // Draw transform: ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * scale * dpr, offsetY * scale * dpr)
        // To reverse: graphX = pixelX / (scale * dpr) - (offsetX * scale * dpr) / (scale * dpr)
        // Simplified: graphX = pixelX / (scale * dpr) - offsetX
        const dpr = this.dpr || 1;
        const drawScale = scale * dpr;
        const graphX = (pixelX / drawScale) - offsetX;
        const graphY = (pixelY / drawScale) - offsetY;

        return { x: graphX, y: graphY };
    }

    requestGraphRedraw() {
        if (!this.graphCanvas) return;
        if (this.graphCanvas.setDirty) {
            this.graphCanvas.setDirty(true, true);
        } else if (this.graphCanvas.draw) {
            this.graphCanvas.draw(true, true);
        }
    }

    // ========================================================================
    // INPUT HANDLERS
    // ========================================================================

    handlePointerMove(event) {
        if (!this.visible) return;
        // Update only transform info needed for coordinate conversion (lightweight)
        this.updateTransformForMouse();
        const pos = this.screenToGraph(event);
        this.input.setPointer(pos.x, pos.y);
    }

    updateTransformForMouse() {
        // Lightweight update - only get scale and offset for mouse tracking
        const graphCanvas = this.graphCanvas;
        if (graphCanvas && graphCanvas.ds) {
            this.scale = graphCanvas.ds.scale || 1;
            this.offsetX = graphCanvas.ds.offset?.[0] || 0;
            this.offsetY = graphCanvas.ds.offset?.[1] || 0;
        } else {
            this.scale = 1;
            this.offsetX = 0;
            this.offsetY = 0;
        }
    }

    handlePointerDown(event) {
        if (!this.visible) return;
        this.sfx.ensure();
        event.preventDefault();
        event.stopPropagation();

        if (event.button === 2) {
            // Right click for skills
            this.input.rightClickDown = true;
            this.handleSkillActivation();
        } else {
            // Left click for shooting
            this.handlePointerMove(event);
            this.input.pointerDown = true;
        }
    }

    handlePointerUp(event) {
        if (!this.visible) return;
        if (!event) return;

        event.preventDefault();
        event.stopPropagation();

        if (event.button === 2) {
            this.input.rightClickDown = false;
        } else {
            this.input.pointerDown = false;
        }
    }

    isGameKey(event) {
        const code = event.code;
        const key = event.key?.toLowerCase();
        return code === "ArrowUp" || code === "ArrowDown" ||
            code === "ArrowLeft" || code === "ArrowRight" ||
            code === "Space" ||
            key === "w" || key === "a" || key === "s" || key === "d";
    }

    handleKeyDown(event) {
        if (!this.visible) return;
        this.sfx.ensure();
        if (this.isGameKey(event) || event.code === "Escape") {
            event.preventDefault();
            event.stopPropagation();
        }
        const key = (event.key || "").toLowerCase();
        if (event.code === "ArrowUp" || key === "w") this.input.up = true;
        if (event.code === "ArrowDown" || key === "s") this.input.down = true;
        if (event.code === "ArrowLeft" || key === "a") this.input.left = true;
        if (event.code === "ArrowRight" || key === "d") this.input.right = true;
        if (event.code === "Space") this.input.shoot = true;
        if (event.code === "Escape" && this.toggleGamePanel) {
            this.toggleGamePanel();
        }
    }

    handleKeyUp(event) {
        if (!this.visible) return;
        if (this.isGameKey(event)) {
            event.preventDefault();
            event.stopPropagation();
        }
        const key = (event.key || "").toLowerCase();
        if (event.code === "ArrowUp" || key === "w") this.input.up = false;
        if (event.code === "ArrowDown" || key === "s") this.input.down = false;
        if (event.code === "ArrowLeft" || key === "a") this.input.left = false;
        if (event.code === "ArrowRight" || key === "d") this.input.right = false;
        if (event.code === "Space") this.input.shoot = false;
    }

    handleBlur() {
        this.input.reset();
    }

    handleContextMenu(event) {
        if (this.visible) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    handleSkillActivation() {
        if (!this.running) return;

        if (this.skills.nova.available) {
            this.activateNovaSkill();
            this.skills.nova.available = false;
            this.skills.nova.armingUntil = null;
            this.skills.nova.killsRequired = this.state.kills + CONFIG.NOVA_SKILL_KILLS_REQUIRED;
            return;
        }

        if (this.skills.rocket.available) {
            this.activateRocketSkill();
            this.skills.rocket.available = false;
            this.skills.rocket.armingUntil = null;
            this.skills.rocket.killsRequired = this.state.kills + CONFIG.ROCKET_SKILL_KILLS_REQUIRED;
            return;
        }

        // Laser skill - one click activates for duration
        if (this.skills.laser.available && !this.skills.laser.active) {
            this.activateLaserSkill();
            return;
        }
    }

    activateNovaSkill() {
        this.sfx.playNova();
        const cx = this.player.x;
        const cy = this.player.y;

        this.particles.shockwaves.push(new Shockwave(cx, cy, 620, 0.7, "#a7f3d0"));
        this.particles.shockwaves.push(new Shockwave(cx, cy, 420, 0.42, "#ffffff"));
        this.particles.addRocketDetonation(cx, cy, "#60a5fa", "#a7f3d0");

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (!enemy.active || enemy.hp <= 0) continue;

            if (enemy.isBoss) {
                const killed = enemy.takeDamage(CONFIG.NOVA_BOSS_DAMAGE);
                this.particles.addRocketDetonation(enemy.cx, enemy.cy, enemy.color, enemy.accent);
                if (killed) {
                    this.destroyEnemy(i);
                }
                continue;
            }

            this.destroyEnemy(i);
        }

        this.enemyBullets = [];
        this.flashTime = Math.max(this.flashTime, 0.32);
        this.flashColor = "#a7f3d0";
        this.shakeTime = Math.max(this.shakeTime, 0.55);
        this.shakePower = Math.max(this.shakePower, 18);
        this.floatingTexts.push(new FloatingText(
            cx, cy - 72,
            "NOVA!", "#a7f3d0",
            42, 1.4
        ));
    }

    activateRocketSkill() {
        this.sfx.playRocket();
        // Fire 5 rockets at nearest enemies
        const targets = [...this.enemies]
            .filter(e => e.active && e.hp > 0)
            .sort((a, b) => {
                const dxA = a.cx - this.player.x;
                const dyA = a.cy - this.player.y;
                const dxB = b.cx - this.player.x;
                const dyB = b.cy - this.player.y;
                const distSqA = dxA * dxA + dyA * dyA;
                const distSqB = dxB * dxB + dyB * dyB;
                return distSqA - distSqB; // Compare squared distances
            })
            .slice(0, CONFIG.ROCKET_COUNT);

        const aim = this.player.getAimVector(this.input);
        const startX = this.player.x + aim.x * 25;
        const startY = this.player.y + aim.y * 25;

        for (let i = 0; i < CONFIG.ROCKET_COUNT; i++) {
            const target = targets[i] || null;
            const rocket = new Rocket(startX, startY, target);
            // Spread rockets slightly
            rocket.x += rand(-15, 15);
            rocket.y += rand(-15, 15);
            this.rockets.push(rocket);
        }

        // Visual effect
        this.particles.addMuzzleFlash(startX, startY, aim.angle);
        this.shakeTime = Math.max(this.shakeTime, 0.1);
        this.shakePower = Math.max(this.shakePower, 6);
    }

    activateLaserSkill() {
        if (this.skills.laser.available && !this.skills.laser.active) {
            this.sfx.playLaser();
            this.skills.laser.active = true;
            this.skills.laser.timeLeft = CONFIG.LASER_DURATION;
            this.skills.laser.available = false;
            this.skills.laser.armingUntil = null;
            this.skills.laser.killsRequired = this.state.kills + CONFIG.LASER_SKILL_KILLS_REQUIRED;
        }
    }

    // ========================================================================
    // GAME LOOP
    // ========================================================================

    tick(now) {
        if (!this.visible) return;

        const delta = this.lastTime ? (now - this.lastTime) / 1000 : 0;
        const dt = clamp(delta, 0, CONFIG.MAX_DELTA_TIME);
        this.lastTime = now;

        this.update(dt, now);
        this.draw();

        this.rafId = requestAnimationFrame(this.tick);
    }

    update(dt, now) {
        // Only update view when needed (resize, pointer move, etc.)
        if (this.viewUpdateNeeded) {
            this.updateView();
        }
        this.particles.update(dt);

        // Update floating texts
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            this.floatingTexts[i].update(dt);
            if (!this.floatingTexts[i].active) {
                this.floatingTexts.splice(i, 1);
            }
        }

        if (this.running) {
            this.state.time = (now - this.state.startTime) / 1000;

            // Update combo timer
            if (this.combo.timer > 0) {
                this.combo.timer -= dt;
                if (this.combo.timer <= 0) {
                    this.combo.count = 0;
                }
            }

            // Check skill availability
            this.updateSkills();

            // Update player
            this.player.update(dt, this.input, this.view);

            // Add exhaust particles
            const thrust = Math.hypot(this.player.vx, this.player.vy);
            if (thrust > 30) {
                this.particles.addExhaust(this.player.x, this.player.y, this.player.angle);
            }

            // Handle shooting
            this.updateShooting(dt);

            // Handle laser (runs automatically for duration once activated)
            if (this.skills.laser.active) {
                this.updateLaser(dt);
            }

            // Update rockets
            this.updateRockets(dt);

            // Update enemies
            this.updateEnemies(dt);

            // Update bullets
            this.updateBullets(dt);
            this.updateEnemyBullets(dt);

            // Spawn enemies
            if (this.running) {
                this.spawnEnemies(dt);
            }
        }

        // Update effects
        if (this.invulnTime > 0) {
            this.invulnTime = Math.max(0, this.invulnTime - dt);
        }
        if (this.shakeTime > 0) {
            this.shakeTime = Math.max(0, this.shakeTime - dt);
            this.shakePower = Math.max(0, this.shakePower - dt * 8);
        }
        if (this.muzzleTime > 0) {
            this.muzzleTime = Math.max(0, this.muzzleTime - dt);
        }
        if (this.flashTime > 0) {
            this.flashTime = Math.max(0, this.flashTime - dt * 4);
        }

        // Request graph redraw if enemies exist (throttled)
        this.graphRedrawTimer -= dt;
        if (this.graphRedrawTimer <= 0 && this.graphAvailable && this.running && this.enemies.length > 0) {
            const hasNodes = this.enemies.some(e => e.node && e.node.graph);
            if (hasNodes) {
                this.requestGraphRedraw();
            }
            this.graphRedrawTimer = this.graphRedrawInterval;
        }

        // Update UI (throttled)
        this.uiUpdateTimer -= dt;
        if (this.uiUpdateTimer <= 0) {
            this.updateUI();
            this.uiUpdateTimer = this.uiUpdateInterval;
        }
    }

    updateSkills() {
        const now = this.state.time;
        const rocket = this.skills.rocket;
        if (!rocket.available) {
            if (this.state.kills >= rocket.killsRequired) {
                if (rocket.armingUntil === null) {
                    rocket.armingUntil = now + CONFIG.SKILL_READY_DELAY;
                }
                if (now >= rocket.armingUntil) {
                    rocket.available = true;
                    rocket.armingUntil = null;
                }
            } else {
                rocket.armingUntil = null;
            }
        }

        const laser = this.skills.laser;
        if (laser.active) {
            laser.armingUntil = null;
            return;
        }
        if (!laser.available) {
            if (this.state.kills >= laser.killsRequired) {
                if (laser.armingUntil === null) {
                    laser.armingUntil = now + CONFIG.SKILL_READY_DELAY;
                }
                if (now >= laser.armingUntil) {
                    laser.available = true;
                    laser.armingUntil = null;
                }
            } else {
                laser.armingUntil = null;
            }
        }

        const nova = this.skills.nova;
        if (!nova.available) {
            if (this.state.kills >= nova.killsRequired) {
                if (nova.armingUntil === null) {
                    nova.armingUntil = now + CONFIG.SKILL_READY_DELAY;
                }
                if (now >= nova.armingUntil) {
                    nova.available = true;
                    nova.armingUntil = null;
                }
            } else {
                nova.armingUntil = null;
            }
        }
    }

    updateRockets(dt) {
        for (let i = this.rockets.length - 1; i >= 0; i--) {
            const rocket = this.rockets[i];
            rocket.update(dt, this.enemies);

            if (!rocket.active || rocket.isOutOfBounds(this.view)) {
                this.rockets.splice(i, 1);
                continue;
            }

            // Check collision with enemies
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                if (!enemy.active || enemy.hp <= 0) continue;

                if (rocket.checkHit(enemy)) {
                    const killed = enemy.takeDamage(enemy.maxHp); // Instant kill
                    this.rockets.splice(i, 1);

                    this.particles.addRocketDetonation(enemy.cx, enemy.cy, enemy.color, enemy.accent);
                    this.shakeTime = Math.max(this.shakeTime, 0.24);
                    this.shakePower = Math.max(this.shakePower, 13);

                    if (killed) {
                        this.destroyEnemy(j);
                    }
                    break;
                }
            }
        }
    }

    updateLaser(dt) {
        // Laser runs automatically for duration once activated
        this.skills.laser.timeLeft -= dt;

        if (this.skills.laser.timeLeft <= 0) {
            this.skills.laser.active = false;
            this.skills.laser.timeLeft = 0;
            return;
        }

        // Laser damage to enemies (use same offset as drawLaser for consistency)
        const aim = this.player.getAimVector(this.input);
        const laserLength = 2000;
        const laserStartX = this.player.x + aim.x * 20;
        const laserStartY = this.player.y + aim.y * 20;
        const laserEndX = laserStartX + aim.x * laserLength;
        const laserEndY = laserStartY + aim.y * laserLength;

        const damage = CONFIG.LASER_DAMAGE_PER_SECOND * dt;

        // Initialize laser hit tracking if not exists
        if (!this._laserHitParticles) {
            this._laserHitParticles = new Map();
        }

        // Update particle timers
        for (const [enemyId, timer] of this._laserHitParticles.entries()) {
            const newTimer = timer - dt;
            if (newTimer <= 0) {
                this._laserHitParticles.delete(enemyId);
            } else {
                this._laserHitParticles.set(enemyId, newTimer);
            }
        }

        // Quick bounding box check for laser line
        const minX = Math.min(laserStartX, laserEndX);
        const maxX = Math.max(laserStartX, laserEndX);
        const minY = Math.min(laserStartY, laserEndY);
        const maxY = Math.max(laserStartY, laserEndY);

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (!enemy.active || enemy.hp <= 0) continue;

            // Quick bounding box check first
            const enemyMaxX = enemy.cx + enemy.w / 2 + CONFIG.HIT_PADDING;
            const enemyMinX = enemy.cx - enemy.w / 2 - CONFIG.HIT_PADDING;
            const enemyMaxY = enemy.cy + enemy.h / 2 + CONFIG.HIT_PADDING;
            const enemyMinY = enemy.cy - enemy.h / 2 - CONFIG.HIT_PADDING;

            // Skip if enemy bounding box doesn't intersect laser bounding box
            if (enemyMaxX < minX || enemyMinX > maxX || enemyMaxY < minY || enemyMinY > maxY) {
                continue;
            }

            const bounds = getEnemyBounds(enemy);
            if (lineIntersectsRect(
                laserStartX, laserStartY,
                laserEndX, laserEndY,
                bounds.x - CONFIG.HIT_PADDING,
                bounds.y - CONFIG.HIT_PADDING,
                bounds.w + CONFIG.HIT_PADDING * 2,
                bounds.h + CONFIG.HIT_PADDING * 2
            )) {
                const killed = enemy.takeDamage(damage);

                // Throttle particle effects - only add particles every 0.1 seconds per enemy
                const enemyId = enemy.cx + enemy.cy * 10000; // Simple ID
                if (!this._laserHitParticles.has(enemyId)) {
                    this.particles.addHitSpark(enemy.cx, enemy.cy, enemy.accent);
                    this._laserHitParticles.set(enemyId, 0.1); // 0.1 second cooldown
                }

                if (killed) {
                    this.destroyEnemy(i);
                    this._laserHitParticles.delete(enemyId);
                }
            }
        }
    }

    updateUI() {
        if (this.ui.score) this.ui.score.textContent = `${this.state.score}`;
        if (this.ui.time) this.ui.time.textContent = `${this.state.time.toFixed(1)}`;
        if (this.ui.kills) this.ui.kills.textContent = `${this.state.kills}`;
        if (this.ui.lives) {
            const max = CONFIG.PLAYER_LIVES;
            const current = Math.max(0, this.state.lives);
            let html = "";
            for (let i = 0; i < max; i++) {
                const cls = i < current ? "ni-life on" : "ni-life off";
                html += `<span class="${cls}">&hearts;</span>`;
            }
            this.ui.lives.innerHTML = html;
        }

        // Update skill UI
        this.updateSkillUI();
    }

    updateSkillUI() {
        // Rocket skill
        const rocketIcon = this.ui.rocketIcon;
        const rocketProgress = this.ui.rocketProgress;
        if (rocketIcon && rocketProgress) {
            if (this.skills.rocket.available) {
                rocketIcon.classList.add("ready");
                rocketProgress.textContent = "READY";
            } else {
                rocketIcon.classList.remove("ready");
                const remaining = Math.max(0, this.skills.rocket.killsRequired - this.state.kills);
                if (remaining === 0 && this.skills.rocket.armingUntil !== null) {
                    rocketProgress.textContent = `${Math.max(0, this.skills.rocket.armingUntil - this.state.time).toFixed(1)}s`;
                } else {
                    rocketProgress.textContent = `${remaining}`;
                }
            }
        }

        // Laser skill
        const laserIcon = this.ui.laserIcon;
        const laserProgress = this.ui.laserProgress;
        if (laserIcon && laserProgress) {
            if (this.skills.laser.active) {
                laserIcon.classList.remove("ready");
                laserIcon.classList.add("active");
                laserProgress.textContent = "ACTIVE";
            } else if (this.skills.laser.available) {
                laserIcon.classList.remove("active");
                laserIcon.classList.add("ready");
                laserProgress.textContent = "READY";
            } else {
                laserIcon.classList.remove("ready", "active");
                const remaining = Math.max(0, this.skills.laser.killsRequired - this.state.kills);
                if (remaining === 0 && this.skills.laser.armingUntil !== null) {
                    laserProgress.textContent = `${Math.max(0, this.skills.laser.armingUntil - this.state.time).toFixed(1)}s`;
                } else {
                    laserProgress.textContent = `${remaining}`;
                }
            }
        }

        const novaIcon = this.ui.novaIcon;
        const novaProgress = this.ui.novaProgress;
        if (novaIcon && novaProgress) {
            if (this.skills.nova.available) {
                novaIcon.classList.add("ready");
                novaProgress.textContent = "READY";
            } else {
                novaIcon.classList.remove("ready");
                const remaining = Math.max(0, this.skills.nova.killsRequired - this.state.kills);
                if (remaining === 0 && this.skills.nova.armingUntil !== null) {
                    novaProgress.textContent = `${Math.max(0, this.skills.nova.armingUntil - this.state.time).toFixed(1)}s`;
                } else {
                    novaProgress.textContent = `${remaining}`;
                }
            }
        }
    }

    updateShooting(dt) {
        if (!this.input.isFiring()) return;

        this.shootCooldown -= dt;
        if (this.shootCooldown <= 0) {
            this.fireBullet();
            this.shootCooldown = CONFIG.SHOOT_COOLDOWN;
        }
    }

    fireBullet() {
        if (!this.running) return;

        const aim = this.player.getAimVector(this.input);
        const startX = this.player.x + aim.x * 20;
        const startY = this.player.y + aim.y * 20;

        this.bullets.push(new Bullet(
            startX, startY,
            aim.x * CONFIG.BULLET_SPEED,
            aim.y * CONFIG.BULLET_SPEED
        ));

        this.sfx.playShoot();
        this.particles.addMuzzleFlash(startX, startY, aim.angle);
        this.muzzleTime = CONFIG.MUZZLE_FLASH_DURATION;
    }

    updateBullets(dt) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.update(dt);

            // Check bounds
            if (!bullet.active || bullet.isOutOfBounds(this.view)) {
                this.bullets.splice(i, 1);
                continue;
            }

            // Quick bounding box check before expensive collision
            const bulletX = bullet.x;
            const bulletY = bullet.y;
            const searchRadius = 150; // Only check enemies within this radius
            const searchRadiusSq = searchRadius * searchRadius;

            // Check collision with enemies (optimized with distance check)
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                if (!enemy.active || enemy.hp <= 0) continue;

                // Quick distance check first
                const dx = enemy.cx - bulletX;
                const dy = enemy.cy - bulletY;
                const distSq = dx * dx + dy * dy;

                // Skip if too far (rough estimate using enemy size)
                const maxEnemySize = Math.max(enemy.w, enemy.h) + CONFIG.HIT_PADDING * 2;
                if (distSq > (maxEnemySize * maxEnemySize + searchRadiusSq)) continue;

                if (bulletHitsEnemy(bullet, enemy)) {
                    const killed = enemy.takeDamage(1);
                    this.sfx.playHit();
                    this.shakeTime = Math.max(this.shakeTime, 0.05);
                    this.shakePower = Math.max(this.shakePower, 4);
                    this.bullets.splice(i, 1);

                    if (killed) {
                        this.destroyEnemy(j);
                    } else {
                        this.flashTime = Math.max(this.flashTime, 0.04);
                        this.flashColor = enemy.accent;
                        // Throttle hit sparks - only add every other hit
                        if (Math.random() > 0.5) {
                            this.particles.addHitSpark(enemy.cx, enemy.cy, enemy.accent);
                        }
                    }
                    break;
                }
            }
        }
    }

    updateEnemyBullets(dt) {
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = this.enemyBullets[i];
            bullet.update(dt);

            if (!bullet.active || bullet.isOutOfBounds(this.view)) {
                this.enemyBullets.splice(i, 1);
                continue;
            }

            const dx = bullet.x - this.player.x;
            const dy = bullet.y - this.player.y;
            const hitRadius = this.player.radius + 6;
            const shieldRadius = this.player.radius + 28;

            if (this.invulnTime > 0) {
                if (dx * dx + dy * dy <= shieldRadius * shieldRadius) {
                    this.enemyBullets.splice(i, 1);
                    this.particles.addHitSpark(bullet.x, bullet.y, "#60a5fa");
                }
                continue;
            }

            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                this.enemyBullets.splice(i, 1);
                this.particles.addHitSpark(this.player.x, this.player.y, "#ff5e5b");
                this.damagePlayer("Enemy fire");
                break;
            }
        }
    }

    updateEnemies(dt) {
        // Update node sync timer
        this.nodeSyncTimer -= dt;
        const shouldSyncNodes = this.nodeSyncTimer <= 0;
        if (shouldSyncNodes) {
            this.nodeSyncTimer = this.nodeSyncInterval;
        }

        // Increment frame counter for bounds cache invalidation
        const currentFrame = (this._frameCounter || 0) + 1;
        this._frameCounter = currentFrame;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            // Update bounds frame for cache invalidation
            enemy._boundsFrame = currentFrame;
            enemy.update(dt, this.view, this.center, this.player.x, this.player.y, shouldSyncNodes ? 0 : this.nodeSyncTimer);
            if (enemy.dashSoundQueued) {
                enemy.dashSoundQueued = false;
                this.sfx.playBossDash();
            }

            // Check if enemy should fire
            if (enemy.shouldFire()) {
                this.spawnEnemyBullet(enemy);
                enemy.resetFireTimer();
            }

            // Check player collision (skip while invulnerable)
            if (this.invulnTime > 0) continue;
            if (enemy.checkPlayerCollision(this.player.x, this.player.y, this.player.radius)) {
                this.particles.addExplosion(this.player.x, this.player.y, enemy.color, enemy.accent);
                this.damagePlayer(enemy.isBoss ? "Boss impact" : "Enemy impact");
                break;
            }
        }
    }

    spawnEnemies(dt) {
        const elapsed = this.state.time;
        const difficulty = getDifficulty();
        const baseInterval = Math.max(
            difficulty.minSpawn,
            (CONFIG.SPAWN_BASE_INTERVAL - elapsed * CONFIG.SPAWN_INTERVAL_DECAY * difficulty.spawnDecay) * difficulty.spawnRate
        );

        if (!this.activeBoss && this.state.kills >= this.nextBossKillThreshold) {
            this.spawnBoss();
            this.nextBossKillThreshold = this.state.kills + difficulty.bossInterval;
        }

        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            const burst = elapsed > 12 && Math.random() < difficulty.burstChance ? 2 : 1;
            for (let i = 0; i < burst; i++) {
                this.spawnEnemy();
            }
            this.spawnTimer = baseInterval;
        }

        const maxEnemies = Math.min(
            CONFIG.MAX_ENEMIES + difficulty.enemyCapBonus,
            20 + difficulty.enemyCapBonus + Math.floor(elapsed / 6)
        );
        if (this.enemies.length > maxEnemies) {
            const center = this.center;
            const sorted = this.enemies
                .map((e, i) => ({ e, i, distSq: (e.cx - center.x) ** 2 + (e.cy - center.y) ** 2 }))
                .filter(item => !item.e.isBoss)
                .sort((a, b) => b.distSq - a.distSq);

            const toRemove = Math.min(sorted.length, this.enemies.length - maxEnemies);
            const removeIndices = sorted.slice(0, toRemove).map(s => s.i).sort((a, b) => b - a);

            for (const idx of removeIndices) {
                const enemy = this.enemies[idx];
                // Visual feedback: small poof instead of silent removal
                this.particles.addHitSpark(enemy.cx, enemy.cy, enemy.accent);
                enemy.removeNode(this.graph);
                this.enemies.splice(idx, 1);
            }
        }
    }

    spawnEnemy() {
        const type = pickWeightedType();
        const difficulty = getDifficulty();
        const margin = CONFIG.ENEMY_SPAWN_MARGIN;
        const view = this.view;

        // Random spawn position on edge
        const side = Math.floor(Math.random() * 4);
        let cx = 0, cy = 0;
        if (side === 0) {
            cx = view.left - margin;
            cy = rand(view.top, view.bottom);
        } else if (side === 1) {
            cx = view.right + margin;
            cy = rand(view.top, view.bottom);
        } else if (side === 2) {
            cx = rand(view.left, view.right);
            cy = view.top - margin;
        } else {
            cx = rand(view.left, view.right);
            cy = view.bottom + margin;
        }

        const aimX = this.player?.x || this.center.x;
        const aimY = this.player?.y || this.center.y;
        const dx = aimX - cx;
        const dy = aimY - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const maxSpeed = (type.speed + rand(-12, 16)) * difficulty.enemySpeed;
        const strafe = rand(-0.4, 0.4);
        const vx = nx * maxSpeed + -ny * maxSpeed * strafe;
        const vy = ny * maxSpeed + nx * maxSpeed * strafe;

        const enemy = new Enemy(type, cx, cy, vx, vy, this.graph, this.graphCanvas);
        enemy.maxSpeed *= difficulty.enemySpeed;
        enemy.seek *= difficulty.enemySeek;
        enemy.fireInterval *= difficulty.enemyFireRate;
        enemy.fireTimer *= difficulty.enemyFireRate;
        this.enemies.push(enemy);
    }

    spawnBoss() {
        const view = this.view;
        const margin = CONFIG.ENEMY_SPAWN_MARGIN;
        // Drop the boss in from the top so the player has time to react
        const cx = (view.left + view.right) / 2 + rand(-80, 80);
        const cy = view.top - margin;
        const dx = this.center.x - cx;
        const dy = this.center.y - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const speed = BOSS_TYPE.speed;
        const vx = (dx / dist) * speed * 0.5;
        const vy = (dy / dist) * speed * 0.5;

        const boss = new Enemy(BOSS_TYPE, cx, cy, vx, vy, this.graph, this.graphCanvas);
        this.enemies.push(boss);
        this.activeBoss = boss;
        this.bossSpawnedCount += 1;

        // Big arrival announcement
        this.floatingTexts.push(new FloatingText(
            this.center.x, this.center.y - 60,
            "BOSS COMING", "#f0abfc",
            34, 2.0
        ));
        this.shakeTime = Math.max(this.shakeTime, 0.4);
        this.shakePower = Math.max(this.shakePower, 14);
        this.flashTime = Math.max(this.flashTime, 0.18);
        this.flashColor = "#c084fc";
        this.sfx.playBossSpawn();
    }

    spawnEnemyBullet(enemy) {
        const dx = this.player.x - enemy.cx;
        const dy = this.player.y - enemy.cy;
        const dist = Math.hypot(dx, dy) || 1;

        if (enemy.isBoss) {
            // Boss fires a tight three-shot spread
            const baseAngle = Math.atan2(dy, dx);
            const speed = CONFIG.BOSS_BULLET_SPEED;
            for (const offset of [-0.18, 0, 0.18]) {
                const a = baseAngle + offset;
                this.enemyBullets.push(new Bullet(
                    enemy.cx, enemy.cy,
                    Math.cos(a) * speed,
                    Math.sin(a) * speed,
                    true
                ));
            }
            return;
        }

        this.enemyBullets.push(new Bullet(
            enemy.cx, enemy.cy,
            (dx / dist) * CONFIG.ENEMY_BULLET_SPEED,
            (dy / dist) * CONFIG.ENEMY_BULLET_SPEED,
            true
        ));
    }

    destroyEnemy(index) {
        const enemy = this.enemies[index];
        this.enemies.splice(index, 1);
        enemy.removeNode(this.graph);
        this.sfx.playExplosion(enemy.isBoss);

        if (enemy.isBoss && this.activeBoss === enemy) {
            this.activeBoss = null;
        }

        // Update combo
        this.combo.count += 1;
        this.combo.timer = CONFIG.COMBO_WINDOW;
        this.combo.lastKillX = enemy.cx;
        this.combo.lastKillY = enemy.cy;

        // Calculate score with combo bonus
        const comboBonus = Math.floor(this.combo.count * CONFIG.COMBO_MULTIPLIER);
        const pointsEarned = (enemy.points || 1) + comboBonus;

        this.state.kills += 1;
        this.state.score += pointsEarned;

        // Show combo text if combo >= 2
        if (this.combo.count >= 2) {
            const comboText = `${this.combo.count}x COMBO!`;
            const comboColor = this.combo.count >= 5 ? "#ff5e5b" :
                this.combo.count >= 3 ? "#ffd166" : "#4ade80";
            this.floatingTexts.push(new FloatingText(
                enemy.cx, enemy.cy - 30,
                comboText, comboColor,
                18 + Math.min(this.combo.count * 2, 16),
                1.0
            ));
        }

        // Check milestones
        this.checkMilestones();

        if (enemy.isBoss) {
            // Multi-stage boss explosion
            for (let i = 0; i < 3; i++) {
                const ox = rand(-60, 60);
                const oy = rand(-40, 40);
                this.particles.addExplosion(enemy.cx + ox, enemy.cy + oy, enemy.color, enemy.accent);
            }
            this.floatingTexts.push(new FloatingText(
                enemy.cx, enemy.cy,
                `BOSS DOWN +${pointsEarned}`, "#f0abfc",
                32, 2.4
            ));
            this.shakeTime = Math.max(this.shakeTime, 0.5);
            this.shakePower = Math.max(this.shakePower, 16);
            this.flashTime = Math.max(this.flashTime, 0.3);
            this.flashColor = "#c084fc";
        } else {
            this.particles.addExplosion(enemy.cx, enemy.cy, enemy.color, enemy.accent);
            this.shakeTime = Math.max(this.shakeTime, CONFIG.SHAKE_DURATION);
            this.shakePower = Math.max(this.shakePower, CONFIG.SHAKE_POWER);
            this.flashTime = Math.max(this.flashTime, CONFIG.FLASH_DURATION);
            this.flashColor = enemy.accent;
        }
    }

    checkMilestones() {
        for (const milestone of CONFIG.MILESTONES) {
            if (this.state.kills >= milestone && !this.achievedMilestones.has(milestone)) {
                this.achievedMilestones.add(milestone);
                this.showMilestone(milestone);
            }
        }
    }

    showMilestone(count) {
        const messages = {
            5: "WARMING UP!",
            10: "ON FIRE!",
            25: "UNSTOPPABLE!",
            50: "LEGENDARY!",
            100: "GOD MODE!"
        };
        const colors = {
            5: "#4ade80",
            10: "#ffd166",
            25: "#ff9f1c",
            50: "#ff5e5b",
            100: "#a855f7"
        };

        const message = messages[count] || `${count} KILLS!`;
        const color = colors[count] || "#ffffff";

        // Show milestone at center of view
        this.floatingTexts.push(new FloatingText(
            this.center.x, this.center.y,
            message, color,
            36, 2.0
        ));

        // Extra shake for milestone
        this.shakeTime = Math.max(this.shakeTime, 0.3);
        this.shakePower = Math.max(this.shakePower, 12);
    }

    // ========================================================================
    // RENDERING
    // ========================================================================

    drawCollisionDebug(ctx) {
        ctx.save();

        const padding = CONFIG.HIT_PADDING;

        // Draw enemy hitboxes
        for (const enemy of this.enemies) {
            if (!enemy.active || enemy.hp <= 0) continue;

            // Use the same getEnemyBounds function as collision detection
            const bounds = getEnemyBounds(enemy);

            const rx = bounds.x - padding;
            const ry = bounds.y - padding;
            const rw = bounds.w + padding * 2;
            const rh = bounds.h + padding * 2;

            // Draw hitbox (red) - this is what collision uses
            ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
            ctx.lineWidth = 2;
            ctx.strokeRect(rx, ry, rw, rh);

            // Draw center point (yellow)
            ctx.fillStyle = "rgba(255, 255, 0, 1)";
            ctx.beginPath();
            ctx.arc(bounds.cx, bounds.cy, 5, 0, Math.PI * 2);
            ctx.fill();

            // Draw actual node bounds (cyan)
            ctx.strokeStyle = "rgba(0, 255, 255, 0.6)";
            ctx.lineWidth = 1;
            ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        }

        // Draw bullet positions (green)
        ctx.fillStyle = "rgba(0, 255, 0, 1)";
        for (const bullet of this.bullets) {
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    draw() {
        const ctx = this.ctx;
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw, ch);

        // ── Star field background (screen-space, before graph transform) ──
        if (this.running) {
            this.drawStarfield(ctx, cw, ch);
        }

        // Apply shake
        const shakeX = this.shakeTime > 0 ? rand(-this.shakePower, this.shakePower) : 0;
        const shakeY = this.shakeTime > 0 ? rand(-this.shakePower, this.shakePower) : 0;

        // Transform: DPR * scale, then offset
        const dpr = this.dpr;
        const drawScale = this.scale * dpr;
        const drawOffsetX = (this.offsetX * this.scale + shakeX * this.scale) * dpr;
        const drawOffsetY = (this.offsetY * this.scale + shakeY * this.scale) * dpr;

        ctx.setTransform(drawScale, 0, 0, drawScale, drawOffsetX, drawOffsetY);

        // Draw particles (includes shockwaves and explosions)
        this.particles.draw(ctx, this.view);

        // Draw enemies (fallback only if no node)
        for (const enemy of this.enemies) {
            enemy.draw(ctx);
        }

        // Draw boss overlays (always, on top of the ComfyUI node render)
        const overlayTime = performance.now() * 0.001;
        for (const enemy of this.enemies) {
            if (enemy.isBoss) {
                enemy.drawBossOverlay(ctx, overlayTime);
            }
        }

        // Draw bullets
        for (const bullet of this.bullets) {
            bullet.draw(ctx);
        }

        // Draw enemy bullets
        for (const bullet of this.enemyBullets) {
            bullet.draw(ctx);
        }

        // Draw rockets
        for (const rocket of this.rockets) {
            rocket.draw(ctx);
        }

        // Draw laser
        if (this.skills.laser.active) {
            this.drawLaser(ctx);
        }

        // Draw player (with invuln flicker)
        this.player.draw(ctx, this.muzzleTime > 0, this.invulnTime);

        // Draw floating texts
        for (const text of this.floatingTexts) {
            text.draw(ctx);
        }

        // Debug collision
        if (CONFIG.DEBUG_COLLISION && this.running) {
            this.drawCollisionDebug(ctx);
        }

        // ── Screen-space overlays (flash + vignette) ──
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Flash overlay
        if (this.flashTime > 0) {
            const alpha = clamp(this.flashTime * 2, 0, 0.18);
            ctx.globalCompositeOperation = "screen";
            ctx.globalAlpha = alpha;
            ctx.fillStyle = this.flashColor;
            ctx.fillRect(0, 0, cw, ch);
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = 1;
        }

        // Vignette
        if (this.running) {
            this.drawVignette(ctx, cw, ch);
        }

        // Draw skill UI
        this.drawSkillUI();
    }

    drawLaser(ctx) {
        const aim = this.player.getAimVector(this.input);
        const laserLength = 2000;
        const startX = this.player.x + aim.x * 20;
        const startY = this.player.y + aim.y * 20;
        const endX = startX + aim.x * laserLength;
        const endY = startY + aim.y * laserLength;
        const now = performance.now();
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.026);
        const jitter = 1.5 + pulse * 2.5;
        const normalX = -aim.y;
        const normalY = aim.x;

        ctx.save();
        ctx.globalCompositeOperation = "screen";

        const beam = ctx.createLinearGradient(startX, startY, endX, endY);
        beam.addColorStop(0, "rgba(255, 255, 255, 0.98)");
        beam.addColorStop(0.12, "rgba(125, 249, 255, 0.95)");
        beam.addColorStop(0.55, "rgba(96, 165, 250, 0.88)");
        beam.addColorStop(1, "rgba(168, 85, 247, 0.2)");

        const layers = [
            { width: CONFIG.LASER_WIDTH + 30 + pulse * 8, alpha: 0.16, blur: 34 },
            { width: CONFIG.LASER_WIDTH + 16 + pulse * 5, alpha: 0.34, blur: 22 },
            { width: CONFIG.LASER_WIDTH + 5, alpha: 0.82, blur: 10 }
        ];

        for (const layer of layers) {
            ctx.globalAlpha = layer.alpha;
            ctx.strokeStyle = beam;
            ctx.lineWidth = layer.width;
            ctx.lineCap = "round";
            ctx.shadowColor = "rgba(80, 210, 255, 1)";
            ctx.shadowBlur = layer.blur;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }

        ctx.globalAlpha = 0.95;
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.98)";
        ctx.lineWidth = Math.max(3, CONFIG.LASER_WIDTH * 0.34);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        for (let i = 0; i < 4; i++) {
            const phase = now * 0.004 + i * 1.7;
            const offset = Math.sin(phase) * jitter + (i - 1.5) * 2.6;
            const tail = 60 + i * 28;
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = i % 2 ? "rgba(240, 171, 252, 0.9)" : "rgba(125, 249, 255, 0.9)";
            ctx.lineWidth = 1.2;
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(startX + normalX * offset + aim.x * tail, startY + normalY * offset + aim.y * tail);
            ctx.lineTo(endX + normalX * offset, endY + normalY * offset);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
        const muzzle = ctx.createRadialGradient(startX, startY, 0, startX, startY, 34 + pulse * 8);
        muzzle.addColorStop(0, "rgba(255, 255, 255, 1)");
        muzzle.addColorStop(0.22, "rgba(125, 249, 255, 0.95)");
        muzzle.addColorStop(0.58, "rgba(96, 165, 250, 0.42)");
        muzzle.addColorStop(1, "rgba(96, 165, 250, 0)");
        ctx.fillStyle = muzzle;
        ctx.shadowColor = "rgba(80, 210, 255, 1)";
        ctx.shadowBlur = 28;
        ctx.beginPath();
        ctx.arc(startX, startY, 34 + pulse * 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(startX, startY, 14 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    // ====================================================================
    // VISUAL EFFECTS
    // ====================================================================

    /**
     * Generate star field (called once, cached)
     */
    generateStars(cw, ch) {
        const stars = [];
        for (let i = 0; i < CONFIG.STAR_COUNT; i++) {
            stars.push({
                x: Math.random() * cw,
                y: Math.random() * ch,
                size: 0.4 + Math.random() * 1.6,
                brightness: 0.3 + Math.random() * 0.7,
                twinkleSpeed: 0.5 + Math.random() * 3,
                twinklePhase: Math.random() * Math.PI * 2
            });
        }
        this.stars = stars;
        this._starCanvasW = cw;
        this._starCanvasH = ch;
    }

    drawStarfield(ctx, cw, ch) {
        // Regenerate if canvas size changed
        if (!this.stars || this._starCanvasW !== cw || this._starCanvasH !== ch) {
            this.generateStars(cw, ch);
        }

        const now = performance.now() * 0.001;
        // Parallax offset based on camera position (subtle)
        const px = (this.offsetX * CONFIG.STAR_PARALLAX * this.dpr) % cw;
        const py = (this.offsetY * CONFIG.STAR_PARALLAX * this.dpr) % ch;

        ctx.save();
        for (const star of this.stars) {
            // Apply parallax wrapping
            let sx = (star.x + px) % cw;
            let sy = (star.y + py) % ch;
            if (sx < 0) sx += cw;
            if (sy < 0) sy += ch;

            // Twinkle
            const twinkle = 0.5 + 0.5 * Math.sin(now * star.twinkleSpeed + star.twinklePhase);
            const alpha = star.brightness * twinkle;

            if (alpha < 0.08) continue; // Skip dim stars

            ctx.globalAlpha = alpha;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(sx, sy, star.size * this.dpr * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    drawVignette(ctx, cw, ch) {
        // Cache vignette gradient (only regenerate on size change)
        const sizeKey = `${cw}x${ch}`;
        if (this._lastVignetteSize !== sizeKey) {
            const cx = cw / 2;
            const cy = ch / 2;
            const outerRadius = Math.hypot(cx, cy);
            const g = ctx.createRadialGradient(cx, cy, outerRadius * 0.45, cx, cy, outerRadius);
            g.addColorStop(0, "rgba(0,0,0,0)");
            g.addColorStop(0.7, "rgba(0,0,0,0)");
            g.addColorStop(1, "rgba(0,0,0,0.35)");
            this._vignetteGradient = g;
            this._lastVignetteSize = sizeKey;
        }

        ctx.fillStyle = this._vignetteGradient;
        ctx.fillRect(0, 0, cw, ch);
    }

    drawSkillUI() {
        // Skill UI is drawn in HTML/CSS
        // Actual UI handled by updateSkillUI() which updates DOM elements
    }
}
