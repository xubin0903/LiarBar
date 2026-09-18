import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'cocos/assets/scenes/Lobby.scene');

const SF = {
  lobbyBg: '28d941ce-e47e-4528-8890-085d228e9792@f9941',
  splash: 'e67edb4a-acc5-478b-81fa-7b2a4d0e5ffb@f9941',
  dust: 'b9f55ef4-7cfb-4ee6-8339-3968c2dd0194@f9941',
  btnPrimary: 'ddb877e4-dea9-4bf7-a355-a8256334a0c9@f9941',
  inputField: '61226266-8660-4a95-88bb-d67c273ea048@f9941',
  dealerIdle: 'ef4c044d-3c50-4c65-9cd5-3db74cd52ca6@f9941',
  tableBg: 'fd75330e-f29c-4b99-b486-6ca908522ba9@f9941',
  cardBack: 'd4e69b17-fd30-468e-a36f-0b4ecb4985e0@f9941',
  candleBody: 'a4774af4-a31c-4b76-860b-9dde39a2914b@f9941',
  candleStem: '6e1a4c8b-2f70-4d3e-9a15-8c0d47e2b196@f9941',
  flame0: '3c91b217-b748-4448-ba2e-9ee7f736d9b3@f9941'
};

const LOBBY_SCENE_SCRIPT = '9cfd7269-33d0-4bb1-add1-4a38276577c4';

const W = 1280;
const H = 720;

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

const sceneAssetId = push(null);
const sceneId = push(null);

const childrenOf = new Map();
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

  if (opts.opacity != null || opts.withOpacity) {
    const opIdx = push({
      __type__: 'cc.UIOpacity',
      _name: '',
      _objFlags: 0,
      node: { __id__: idx },
      _enabled: true,
      __prefab: null,
      _opacity: opts.opacity ?? 255,
      _id: nid()
    });
    comps.push(opIdx);
  }

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
      _color: color(opts.sr ?? 255, opts.sg ?? 255, opts.sb ?? 255, opts.alpha ?? 255),
      _spriteFrame: {
        __uuid__: opts.sprite,
        __expectedType__: 'cc.SpriteFrame'
      },
      _type: opts.spType ?? 0,
      _fillType: 0,
      _sizeMode: opts.sizeMode ?? 0,
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
      _isSystemFontUsed: true,
      _isItalic: false,
      _isBold: opts.bold ?? false,
      _isUnderline: false,
      _underlineHeight: 2,
      _cacheMode: 0,
      _id: nid()
    });
    comps.push(lbIdx);
  }

  if (opts.button) {
    const btnIdx = push({
      __type__: 'cc.Button',
      _name: '',
      _objFlags: 0,
      node: { __id__: idx },
      _enabled: true,
      __prefab: null,
      _transition: 3, // SCALE
      _duration: 0.1,
      _zoomScale: 0.95,
      _target: { __id__: idx },
      _id: nid()
    });
    comps.push(btnIdx);
  }

  return idx;
}

function finalizeNodes() {
  for (const [idx, compList] of compsOf.entries()) {
    objs[idx]._components = compList.map((c) => ({ __id__: c }));
  }
  for (const [parentIdx, childList] of childrenOf.entries()) {
    if (objs[parentIdx]) {
      objs[parentIdx]._children = childList.map((c) => ({ __id__: c }));
    }
  }
}

objs[sceneId] = {
  __type__: 'cc.Scene',
  _name: 'Lobby',
  _objFlags: 0,
  _parent: null,
  _children: [],
  _active: true,
  _components: [],
  _prefab: null,
  autoReleaseAssets: false,
  _globals: { __id__: 0 },
  _id: nid()
};

const canvasIdx = addNode('Canvas', sceneId, { x: 0, y: 0 }, { w: W, h: H });
const canvasComp = push({
  __type__: 'cc.Canvas',
  _name: '',
  _objFlags: 0,
  node: { __id__: canvasIdx },
  _enabled: true,
  __prefab: null,
  _cameraComponent: null,
  _alignCanvasWithScreen: true,
  _id: nid()
});
compsOf.get(canvasIdx).push(canvasComp);

const cameraIdx = addNode('Camera', canvasIdx, { x: 0, y: 0, z: 1000 }, { w: W, h: H });
const cameraComp = push({
  __type__: 'cc.Camera',
  _name: '',
  _objFlags: 0,
  node: { __id__: cameraIdx },
  _enabled: true,
  __prefab: null,
  _projection: 0,
  _priority: 0,
  _fov: 45,
  _fovAxis: 0,
  _orthoHeight: H / 2,
  _near: 1,
  _far: 2000,
  _color: color(0, 0, 0, 255),
  _depth: 1,
  _stencil: 0,
  _clearFlags: 7,
  _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 },
  _aperture: 16,
  _shutter: 7,
  _iso: 0,
  _screenScale: 1,
  _visibility: 41943040,
  _targetTexture: null,
  _id: nid()
});
compsOf.get(cameraIdx).push(cameraComp);
objs[canvasComp]._cameraComponent = { __id__: cameraComp };

const bgmAudio = push({
  __type__: 'cc.AudioSource',
  node: { __id__: canvasIdx },
  _enabled: true,
  _loop: true,
  _playOnAwake: false,
  _volume: 0.2,
  _id: nid()
});
compsOf.get(canvasIdx).push(bgmAudio);

const ambAudio = push({
  __type__: 'cc.AudioSource',
  node: { __id__: canvasIdx },
  _enabled: true,
  _loop: true,
  _playOnAwake: false,
  _volume: 0.13,
  _id: nid()
});
compsOf.get(canvasIdx).push(ambAudio);

const sfxAudio = push({
  __type__: 'cc.AudioSource',
  node: { __id__: canvasIdx },
  _enabled: true,
  _loop: false,
  _playOnAwake: false,
  _volume: 1.0,
  _id: nid()
});
compsOf.get(canvasIdx).push(sfxAudio);

// Lobby Root Screen
const scr = addNode('lb_scr_lobby', canvasIdx, { x: 0, y: 0 }, { w: W, h: H });

// 1. Background
const bg = addNode('lb_cmp_lobby_bg', scr, { x: 0, y: 0 }, {
  w: W, h: H, sprite: SF.lobbyBg, sizeMode: 0
});

// 2. Dust
const dust = addNode('lb_cmp_dust', scr, { x: 0, y: 120 }, {
  w: W, h: 480, sprite: SF.dust, sizeMode: 0, alpha: 120
});

// 3. Dealer illustration
const dealer = addNode('lb_cmp_dealer', scr, { x: -300, y: -20 }, {
  w: 420, h: 480, sprite: SF.dealerIdle, sizeMode: 0
});

// 4. Candle
const candle = addNode('lb_cmp_candle', scr, { x: -80, y: -160 }, { w: 60, h: 100 });
addNode('lb_cmp_candle_stem', candle, { x: 0, y: -20 }, {
  w: 40, h: 60, sprite: SF.candleStem, sizeMode: 0
});
const flame = addNode('lb_cmp_candle_flame', candle, { x: 0, y: 25 }, {
  w: 30, h: 40, sprite: SF.flame0, sizeMode: 0
});

// 5. Top bar
const topbar = addNode('lb_cmp_topbar', scr, { x: 0, y: 270 }, { w: W, h: 100, withOpacity: true });
addNode('lb_txt_title', topbar, { x: 0, y: 15 }, {
  w: 600, h: 50, label: "夜半酒馆 · LIAR'S BAR", font: 40, align: 1, lr: 255, lg: 215, lb: 110, bold: true
});
addNode('lb_txt_subtitle', topbar, { x: 0, y: -25 }, {
  w: 600, h: 30, label: '骗子酒吧 · 鸿蒙与Cocos双端平替重构版', font: 20, align: 1, lr: 190, lg: 180, lb: 160
});

// 6. Settings & player card panel
const panel = addNode('lb_cmp_panel', scr, { x: 300, y: 30 }, { w: 420, h: 320, withOpacity: true });
// Panel background
addNode('lb_cmp_panel_bg', panel, { x: 0, y: 0 }, {
  w: 420, h: 320, sprite: SF.inputField, sizeMode: 0, alpha: 180, sr: 30, sg: 25, sb: 20
});

addNode('lb_lbl_nick_hint', panel, { x: -160, y: 110 }, {
  w: 300, h: 30, label: '玩家昵称：', font: 20, align: 0, ax: 0, lr: 220, lg: 200, lb: 170
});
const nickField = addNode('lb_cmp_nick_field', panel, { x: 0, y: 60 }, {
  w: 340, h: 50, sprite: SF.inputField, sizeMode: 0
});
addNode('lb_txt_nickname', nickField, { x: 0, y: 0 }, {
  w: 320, h: 40, label: '你', font: 24, align: 1, lr: 255, lg: 255, lb: 255
});

const playercount = addNode('lb_cmp_playercount', panel, { x: -160, y: -5 }, {
  w: 320, h: 36, label: '人数 4 · 命 3', font: 22, align: 0, ax: 0, lr: 245, lg: 230, lb: 180
});

const silentRow = addNode('lb_row_silent', panel, { x: -160, y: -65 }, { w: 320, h: 36 });
addNode('lb_lbl_silent', silentRow, { x: 0, y: 0 }, {
  w: 200, h: 30, label: '静音模式', font: 20, align: 0, ax: 0, lr: 200, lg: 190, lb: 180
});
const toggleSilent = addNode('lb_tog_silent', silentRow, { x: 280, y: 0 }, {
  w: 60, h: 30, label: '关', font: 18, button: true
});

// 7. Buttons
const quickstart = addNode('lb_btn_quickstart', scr, { x: 300, y: -200 }, {
  w: 340, h: 80, sprite: SF.btnPrimary, sizeMode: 0, button: true, withOpacity: true
});
addNode('lb_txt_quickstart', quickstart, { x: 0, y: 0 }, {
  w: 300, h: 40, label: '快速开局', font: 32, align: 1, lr: 255, lg: 240, lb: 210, bold: true
});

const peekTable = addNode('lb_btn_peek_table', scr, { x: -300, y: -260 }, {
  w: 220, h: 50, sprite: SF.btnPrimary, sizeMode: 0, button: true, withOpacity: true, alpha: 180
});
addNode('lb_txt_peek_table', peekTable, { x: 0, y: 0 }, {
  w: 200, h: 30, label: '查看牌桌', font: 22, align: 1, lr: 230, lg: 220, lb: 200
});

// 8. Match load overlay
const matchLoad = addNode('lb_ovl_match_load', scr, { x: 0, y: 0 }, {
  w: W, h: H, active: false, withOpacity: true
});
addNode('lb_cmp_load_felt', matchLoad, { x: 0, y: 0 }, {
  w: W, h: H, sprite: SF.tableBg, sizeMode: 0
});
addNode('lb_cmp_load_card', matchLoad, { x: 0, y: 40 }, {
  w: 120, h: 168, sprite: SF.cardBack, sizeMode: 0
});
addNode('lb_txt_load_tip', matchLoad, { x: 0, y: -90 }, {
  w: 400, h: 40, label: '牌局加载中...', font: 28, align: 1, lr: 255, lg: 230, lb: 170
});

// 9. Splash screen
const splash = addNode('art_splash_still', scr, { x: 0, y: 0 }, {
  w: W, h: H, sprite: SF.splash, sizeMode: 0, withOpacity: true
});

// Attach LobbyScene driver to Canvas
const lobbyScript = push({
  __type__: LOBBY_SCENE_SCRIPT,
  _name: '',
  _objFlags: 0,
  node: { __id__: canvasIdx },
  _enabled: true,
  __prefab: null,
  nodeBg: { __id__: bg },
  nodeSplash: { __id__: splash },
  nodeDust: { __id__: dust },
  nodeDealer: { __id__: dealer },
  nodeCandle: { __id__: candle },
  nodeFlame: { __id__: flame },
  nodeTopbar: { __id__: topbar },
  nodePanel: { __id__: panel },
  lblPlayerCount: { __id__: compsOf.get(playercount)[1] },
  btnQuickStart: { __id__: compsOf.get(quickstart)[2] },
  btnPeekTable: { __id__: compsOf.get(peekTable)[2] },
  nodeMatchLoad: { __id__: matchLoad },
  audioBgm: { __id__: bgmAudio },
  audioAmb: { __id__: ambAudio },
  audioSfx: { __id__: sfxAudio },
  _id: nid()
});
compsOf.get(canvasIdx).push(lobbyScript);

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
  _name: 'Lobby',
  _objFlags: 0,
  _native: '',
  scene: { __id__: sceneId }
};

writeFileSync(out, JSON.stringify(objs, null, 2));
console.log('Wrote', out, 'objects=', objs.length);
