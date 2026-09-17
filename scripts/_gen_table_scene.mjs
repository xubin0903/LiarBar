/**
 * One-shot: generate cocos/assets/scenes/Table.scene for K4.
 * Design 1280×720 · FIT_HEIGHT · HAND_RING_GAP=24% · 禁 padB 顶高 · 中顶只 timer。
 * Run: node scripts/_gen_table_scene.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'cocos/assets/scenes/Table.scene');

const SF = {
  tableBg: 'fd75330e-f29c-4b99-b486-6ca908522ba9@f9941',
  cardBack: 'd4e69b17-fd30-468e-a36f-0b4ecb4985e0@f9941',
  dealer: 'ef4c044d-3c50-4c65-9cd5-3db74cd52ca6@f9941',
  player: 'd7f4f032-e0bd-44f2-be7b-95b23838ccc3@f9941',
  pool: 'ebd0ab01-8402-4101-abaf-344a1aca9d4c@f9941',
  doubt: 'f4dc4d38-f126-4147-b291-3bd93a9f7bb4@f9941',
  believe: 'ac64144e-1d78-4bbe-b282-cdeaaa1248c9@f9941',
  shark: '5c036081-25c8-4fdd-8519-6f4148c85707@f9941',
  karen: 'b5f8395a-0487-4d20-85d2-ccbf794feae2@f9941',
  timid: 'b2c77873-59b1-444e-9a77-1a9d4340b756@f9941',
  candle: '8c013291-848c-4178-8a4a-79804a7073da@f9941'
};

/** TableScene.ts.meta uuid — must match file meta */
const TABLE_SCENE_SCRIPT = 'c4a0e91b-7d2f-4f6a-9b3e-1a8c5d0e4f72';

const W = 1280;
const H = 720;
const GAP_H = Math.round(H * 0.24); // 173
const TOP_H = Math.round(H * 0.12); // 86
const BOTTOM_H = 150; // 手牌带宽 ~21% · 贴底 · padB=0

const objs = [];
let nextId = 0;

function id() {
  return nextId++;
}

function nid() {
  return randomBytes(12).toString('base64url').slice(0, 22);
}

function vec3(x, y, z = 0) {
  return { __type__: 'cc.Vec3', x, y, z };
}
function quat() {
  return { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 };
}
function size(w, h) {
  return { __type__: 'cc.Size', width: w, height: h };
}
function color(r, g, b, a = 255) {
  return { __type__: 'cc.Color', r, g, b, a };
}
function vec2(x, y) {
  return { __type__: 'cc.Vec2', x, y };
}

function push(obj) {
  objs.push(obj);
  return objs.length - 1;
}

// Reserve scene asset + scene
const sceneAssetId = push(null);
const sceneId = push(null);

const childrenOf = new Map(); // parentIdx -> [childIdx]
const compsOf = new Map();

function addNode(name, parentIdx, pos, opts = {}) {
  const idx = push(null);
  if (!childrenOf.has(parentIdx)) childrenOf.set(parentIdx, []);
  childrenOf.get(parentIdx).push(idx);
  const comps = [];
  compsOf.set(idx, comps);
  const node = {
    __type__: 'cc.Node',
    _name: name,
    _objFlags: 0,
    _parent: { __id__: parentIdx },
    _children: [],
    _active: opts.active !== false,
    _components: [],
    _prefab: null,
    _lpos: vec3(pos.x, pos.y, pos.z || 0),
    _lrot: quat(),
    _lscale: vec3(opts.sx || 1, opts.sy || 1, 1),
    _layer: 33554432,
    _euler: vec3(0, 0, 0),
    _id: nid()
  };
  objs[idx] = node;

  const uiIdx = push({
    __type__: 'cc.UITransform',
    _name: '',
    _objFlags: 0,
    node: { __id__: idx },
    _enabled: true,
    __prefab: null,
    _contentSize: size(opts.w || 100, opts.h || 100),
    _anchorPoint: vec2(opts.ax ?? 0.5, opts.ay ?? 0.5),
    _id: nid()
  });
  comps.push(uiIdx);

  if (opts.sprite) {
    const spIdx = push({
      __type__: 'cc.Sprite',
      _name: '',
      _objFlags: 0,
      node: { __id__: idx },
      _enabled: true,
      __prefab: null,
      _customMaterial: null,
      _srcBlendFactor: 2,
      _dstBlendFactor: 4,
      _color: color(255, 255, 255, opts.alpha ?? 255),
      _spriteFrame: {
        __uuid__: opts.sprite,
        __expectedType__: 'cc.SpriteFrame'
      },
      _type: 0,
      _fillType: 0,
      _sizeMode: opts.sizeMode ?? 0, // CUSTOM
      _fillCenter: vec2(0, 0),
      _fillStart: 0,
      _fillRange: 0,
      _isTrimmedMode: true,
      _useGrayscale: false,
      _atlas: null,
      _id: nid()
    });
    comps.push(spIdx);
  }

  if (opts.label != null) {
    const lbIdx = push({
      __type__: 'cc.Label',
      _name: '',
      _objFlags: 0,
      node: { __id__: idx },
      _enabled: true,
      __prefab: null,
      _customMaterial: null,
      _srcBlendFactor: 2,
      _dstBlendFactor: 4,
      _color: color(opts.lr ?? 245, opts.lg ?? 230, opts.lb ?? 200, 255),
      _string: opts.label,
      _horizontalAlign: opts.align ?? 1,
      _verticalAlign: 1,
      _actualFontSize: opts.font ?? 24,
      _fontSize: opts.font ?? 24,
      _fontFamily: 'Arial',
      _lineHeight: (opts.font ?? 24) + 4,
      _overflow: 0,
      _enableWrapText: true,
      _font: null,
      _isSystemFontUsed: true,
      _spacingX: 0,
      _isItalic: false,
      _isBold: false,
      _isUnderline: false,
      _underlineHeight: 2,
      _cacheMode: 0,
      _id: nid(),
      _enableOutline: true,
      _outlineColor: color(20, 12, 8, 220),
      _outlineWidth: 2,
      _enableShadow: false,
      _shadowColor: color(0, 0, 0, 255),
      _shadowOffset: vec2(0, 0),
      _shadowBlur: 0
    });
    comps.push(lbIdx);
  }

  if (opts.widget) {
    const w = opts.widget;
    const wgIdx = push({
      __type__: 'cc.Widget',
      _name: '',
      _objFlags: 0,
      node: { __id__: idx },
      _enabled: true,
      __prefab: null,
      _alignFlags: w.flags,
      _target: null,
      _left: w.left ?? 0,
      _right: w.right ?? 0,
      _top: w.top ?? 0,
      _bottom: w.bottom ?? 0,
      _horizontalCenter: 0,
      _verticalCenter: 0,
      _isAbsLeft: true,
      _isAbsRight: true,
      _isAbsTop: true,
      _isAbsBottom: true,
      _isAbsHorizontalCenter: true,
      _isAbsVerticalCenter: true,
      _originalWidth: w.ow ?? 0,
      _originalHeight: w.oh ?? 0,
      _alignMode: 2,
      _lockFlags: 0,
      _id: nid()
    });
    comps.push(wgIdx);
  }

  return idx;
}

function finalizeNodes() {
  for (const [idx, kids] of childrenOf) {
    if (objs[idx] && objs[idx].__type__ === 'cc.Node') {
      objs[idx]._children = kids.map((k) => ({ __id__: k }));
    }
  }
  for (const [idx, comps] of compsOf) {
    if (objs[idx] && objs[idx].__type__ === 'cc.Node') {
      objs[idx]._components = comps.map((c) => ({ __id__: c }));
    }
  }
}

// --- build tree ---
// Scene
objs[sceneId] = {
  __type__: 'cc.Scene',
  _name: 'Table',
  _objFlags: 0,
  _parent: null,
  _children: [],
  _active: true,
  _components: [],
  _prefab: null,
  autoReleaseAssets: false,
  _globals: null, // filled later
  _id: 'd8400a38-a130-4fb7-a2ff-baf571d061b8'
};
childrenOf.set(sceneId, []);

const canvasIdx = addNode('Canvas', sceneId, { x: W / 2, y: H / 2 }, { w: W, h: H });
// Camera under Canvas
const camIdx = addNode('Camera', canvasIdx, { x: 0, y: 0 }, { w: 0, h: 0 });
const camComp = push({
  __type__: 'cc.Camera',
  _name: '',
  _objFlags: 0,
  node: { __id__: camIdx },
  _enabled: true,
  __prefab: null,
  _projection: 0,
  _priority: 0,
  _fov: 45,
  _fovAxis: 0,
  _orthoHeight: 10,
  _near: 0,
  _far: 2000,
  _color: color(0, 0, 0, 255),
  _depth: 1,
  _stencil: 0,
  _clearFlags: 7,
  _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 },
  _aperture: 19,
  _shutter: 7,
  _iso: 0,
  _screenScale: 1,
  _visibility: 1108344832,
  _targetTexture: null,
  _id: nid()
});
compsOf.get(camIdx).push(camComp);

// Canvas comps: UITransform already added; add Canvas + Widget
const canvasComp = push({
  __type__: 'cc.Canvas',
  _name: '',
  _objFlags: 0,
  node: { __id__: canvasIdx },
  _enabled: true,
  __prefab: null,
  _cameraComponent: { __id__: camComp },
  _alignCanvasWithScreen: true,
  _id: nid()
});
compsOf.get(canvasIdx).push(canvasComp);
const canvasWidget = push({
  __type__: 'cc.Widget',
  _name: '',
  _objFlags: 0,
  node: { __id__: canvasIdx },
  _enabled: true,
  __prefab: null,
  _alignFlags: 45,
  _target: null,
  _left: 0,
  _right: 0,
  _top: 0,
  _bottom: 0,
  _horizontalCenter: 0,
  _verticalCenter: 0,
  _isAbsLeft: true,
  _isAbsRight: true,
  _isAbsTop: true,
  _isAbsBottom: true,
  _isAbsHorizontalCenter: true,
  _isAbsVerticalCenter: true,
  _originalWidth: 0,
  _originalHeight: 0,
  _alignMode: 2,
  _lockFlags: 0,
  _id: nid()
});
compsOf.get(canvasIdx).push(canvasWidget);

// TableScene driver on Canvas
const tableScript = push({
  __type__: TABLE_SCENE_SCRIPT,
  _name: '',
  _objFlags: 0,
  node: { __id__: canvasIdx },
  _enabled: true,
  __prefab: null,
  cardBack: {
    __uuid__: SF.cardBack,
    __expectedType__: 'cc.SpriteFrame'
  },
  _id: nid()
});
compsOf.get(canvasIdx).push(tableScript);

// Root content
const scr = addNode('lb_scr_table', canvasIdx, { x: 0, y: 0 }, { w: W, h: H });

// bg Cover
addNode('lb_cmp_table_bg', scr, { x: 0, y: 0 }, {
  w: W,
  h: H,
  sprite: SF.tableBg,
  sizeMode: 0
});

const safe = addNode('lb_cmp_safe_frame', scr, { x: 0, y: 0 }, { w: W, h: H });

// topbar ≤12%
const topY = H / 2 - TOP_H / 2;
const topbar = addNode('lb_cmp_topbar', safe, { x: 0, y: topY }, { w: W, h: TOP_H });
addNode('lb_txt_claim', topbar, { x: -480, y: 12 }, {
  w: 320, h: 36, label: '本局宣称：—', font: 28, align: 0, ax: 0, ay: 0.5
});
addNode('lb_cmp_table_tip', topbar, { x: -480, y: -18 }, {
  w: 360, h: 28, label: '等待开局', font: 22, align: 0, ax: 0, ay: 0.5
});
addNode('lb_txt_judge', topbar, { x: -200, y: -18 }, {
  w: 280, h: 28, label: '法官句·左上', font: 22, align: 0, ax: 0, ay: 0.5
});
// ★中顶只 timer
addNode('lb_txt_timer', topbar, { x: 0, y: 0 }, {
  w: 160, h: 48, label: '--', font: 40, align: 1, lr: 255, lg: 220, lb: 120
});
addNode('lb_btn_home', topbar, { x: 560, y: 0 }, {
  w: 80, h: 36, label: '回', font: 22, align: 1
});

// playfield
const playfield = addNode('lb_cmp_playfield', safe, { x: 0, y: 20 }, { w: W, h: 420 });

function seat(name, x, y, sprite, label) {
  const s = addNode(name, playfield, { x, y }, { w: 120, h: 140 });
  addNode(`${name}_avatar`, s, { x: 0, y: 20 }, {
    w: 96, h: 96, sprite, sizeMode: 0
  });
  addNode(`${name}_name`, s, { x: 0, y: -55 }, {
    w: 120, h: 24, label, font: 18
  });
  return s;
}

seat('lb_cmp_seat_p2', 0, 160, SF.shark, '老千');
seat('lb_cmp_seat_p3', -520, 20, SF.karen, '杠精');
seat('lb_cmp_seat_p1', 520, 20, SF.timid, '怂货');

const heart = addNode('lb_cmp_table_heart', playfield, { x: 0, y: 10 }, { w: 280, h: 220 });
// 荷官回池旁
addNode('lb_cmp_dealer', heart, { x: -110, y: 30 }, {
  w: 140, h: 160, sprite: SF.dealer, sizeMode: 0
});
addNode('lb_cmp_pool', heart, { x: 40, y: 0 }, {
  w: 100, h: 138, sprite: SF.pool, sizeMode: 0
});
addNode('lb_txt_pool_count', heart, { x: 40, y: 80 }, {
  w: 80, h: 28, label: '', font: 22
});

// GAP 24% · 只在心下→牌上 · 禁垫手下 · padB=0
const gapY = -90;
addNode('lb_cmp_ring_hand_gap', safe, { x: 0, y: gapY }, {
  w: W * 0.6,
  h: GAP_H
});
// 锁注释节点（不可见）：DRAW_TO_FLIP=1000 REVEAL_HOLD=3000 HAND_RING_GAP=24 禁padB顶高
addNode('lb_lock_cues_note', safe, { x: 0, y: 0 }, {
  w: 10,
  h: 10,
  active: false,
  label: 'LOCK DRAW_TO_FLIP=1000 REVEAL_HOLD=3000 HAND_RING_GAP=24 padB=0 forbid raise hand',
  font: 12
});

// bottom band · 贴底 · padB=0
const bottomY = -H / 2 + BOTTOM_H / 2;
const bottom = addNode('lb_cmp_bottom_band', safe, { x: 0, y: bottomY }, {
  w: W,
  h: BOTTOM_H,
  widget: { flags: 4, bottom: 0, ow: W, oh: BOTTOM_H } // bottom align only · padB=0
});

addNode('lb_cmp_seat_self', bottom, { x: -480, y: 10 }, {
  w: 100, h: 110, sprite: SF.player, sizeMode: 0
});
addNode('lb_cmp_life_self', bottom, { x: -380, y: -20 }, {
  w: 36, h: 56, sprite: SF.candle, sizeMode: 0
});

const hand = addNode('lb_cmp_hand', bottom, { x: 40, y: -10 }, { w: 520, h: 120 });
for (let i = 0; i < 5; i++) {
  addNode(`lb_cmp_card_${i}`, hand, { x: (i - 2) * 88, y: 0 }, {
    w: 72, h: 100, sprite: SF.cardBack, sizeMode: 0
  });
}

// challenge entry skeleton (自位身前)
const ch = addNode('lb_cmp_challenge_entry', scr, { x: 0, y: -200 }, {
  w: 400, h: 80, active: true
});
addNode('lb_btn_challenge_doubt', ch, { x: -110, y: 0 }, {
  w: 180, h: 70, sprite: SF.doubt, sizeMode: 0
});
addNode('lb_btn_challenge_believe', ch, { x: 110, y: 0 }, {
  w: 180, h: 70, sprite: SF.believe, sizeMode: 0
});

// placeholders (nodes for future)
addNode('lb_cmp_empty_target_choice', scr, { x: 0, y: 0 }, { w: 10, h: 10, active: false });
addNode('lb_cmp_reveal_dim', scr, { x: 0, y: 0 }, { w: W, h: H, active: false });
addNode('lb_cmp_reveal_stage', scr, { x: 0, y: -56 }, { w: 200, h: 120, active: false });
addNode('lb_cmp_npc_challenge_bubble', scr, { x: 0, y: 100 }, { w: 10, h: 10, active: false });
addNode('lb_cmp_peek_mask', scr, { x: 0, y: 0 }, { w: 10, h: 10, active: false });
addNode('lb_sheet_play', scr, { x: 0, y: 0 }, { w: 10, h: 10, active: false });
addNode('lb_cmp_play_confirm_bar', scr, { x: 0, y: -260 }, { w: 10, h: 10, active: false });
addNode('lb_ovl_match_load', scr, { x: 0, y: 0 }, { w: 10, h: 10, active: false });

// Scene globals
const globalsId = push({
  __type__: 'cc.SceneGlobals',
  ambient: { __id__: 0 },
  shadows: { __id__: 0 },
  _skybox: { __id__: 0 },
  fog: { __id__: 0 },
  octree: { __id__: 0 },
  skin: { __id__: 0 }
});
const ambientId = push({
  __type__: 'cc.AmbientInfo',
  _skyColorHDR: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0.52 },
  _skyColor: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0.52 },
  _skyIllumHDR: 20000,
  _skyIllum: 20000,
  _groundAlbedoHDR: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0 },
  _groundAlbedo: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0 },
  _skyColorLDR: { __type__: 'cc.Vec4', x: 0.2, y: 0.5, z: 0.8, w: 1 },
  _skyIllumLDR: 20000,
  _groundAlbedoLDR: { __type__: 'cc.Vec4', x: 0.2, y: 0.2, z: 0.2, w: 1 }
});
const shadowsId = push({
  __type__: 'cc.ShadowsInfo',
  _enabled: false,
  _type: 0,
  _normal: vec3(0, 1, 0),
  _distance: 0,
  _shadowColor: color(76, 76, 76),
  _maxReceived: 4,
  _size: vec2(512, 512)
});
const skyId = push({
  __type__: 'cc.SkyboxInfo',
  _envLightingType: 0,
  _envmapHDR: null,
  _envmap: null,
  _envmapLDR: null,
  _diffuseMapHDR: null,
  _diffuseMapLDR: null,
  _enabled: false,
  _useHDR: true
});
const fogId = push({
  __type__: 'cc.FogInfo',
  _type: 0,
  _fogColor: color(200, 200, 200),
  _enabled: false,
  _fogDensity: 0.3,
  _fogStart: 0.5,
  _fogEnd: 300,
  _fogAtten: 5,
  _fogTop: 1.5,
  _fogRange: 1.2,
  _accurate: false
});
const octreeId = push({
  __type__: 'cc.OctreeInfo',
  _enabled: false,
  _minPos: vec3(-1024, -1024, -1024),
  _maxPos: vec3(1024, 1024, 1024),
  _depth: 8
});
const skinId = push({
  __type__: 'cc.SkinInfo',
  _enabled: false,
  _scale: 5
});

objs[globalsId].ambient = { __id__: ambientId };
objs[globalsId].shadows = { __id__: shadowsId };
objs[globalsId]._skybox = { __id__: skyId };
objs[globalsId].fog = { __id__: fogId };
objs[globalsId].octree = { __id__: octreeId };
objs[globalsId].skin = { __id__: skinId };

finalizeNodes();
objs[sceneId]._children = childrenOf.get(sceneId).map((k) => ({ __id__: k }));
objs[sceneId]._globals = { __id__: globalsId };

objs[sceneAssetId] = {
  __type__: 'cc.SceneAsset',
  _name: 'Table',
  _objFlags: 0,
  _native: '',
  scene: { __id__: sceneId }
};

writeFileSync(out, JSON.stringify(objs, null, 2));
console.log('Wrote', out, 'objects=', objs.length, 'GAP_H=', GAP_H);
