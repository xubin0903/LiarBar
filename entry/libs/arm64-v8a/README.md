# entry/libs/arm64-v8a · libcocos 本机放置（不进 git）

票 **C2′**。`*.so` 已在根 `.gitignore`；此处只交说明。

## 源（K2补 · ASCII 交接包）

| 文件 | 本机源 |
|------|--------|
| `libcocos.so`（~235MB） | `E:\Cocos\projects\LiarBarHarmonyNative\handoff-arm64-v8a\libcocos.so` |
| `libc++_shared.so` | 同目录 |

完整 native 工程（DevEco 可开）：`E:\Cocos\projects\LiarBarHarmonyNative\engine\harmonyos-next\`  
资源：`E:\Cocos\projects\LiarBarHarmonyNative\build-harmonyos-next\data\`  
摘要：`jsEngine=JSVM` · ABI=`arm64-v8a` · SDK=`6.1.0(23)`

## 一键拷贝

```powershell
cd E:\Projects\liar项目\agent-client\LiarBar
node scripts/copy_cocos_native_libs.mjs
```

默认拷到本目录；也可用 `--dest` 指向 `cocos_engine/libs/arm64-v8a`。

## Mode 2 冒烟开关（默认均 false，保护旧桌）

1. 先跑拷贝脚本，确认本目录有两个 `.so`。
2. `entry/src/main/ets/harmony/CocosNativeLink.ets` → `LINK_LIBCOCOS = true`（XComponent `libraryname: 'cocos'`）。
3. `entry/src/main/ets/harmony/CocosTableFlag.ets` → `USE_COCOS_TABLE = true`（进桌走 `CocosTableHost`）。
4. DevEco 编译 / 模拟器进 `lb_scr_table`；**勿 commit** 上述 true 与 `.so`。

> 仅链 so + `libraryname` **不等于** 可见 Cocos 场景牌面；场景/Worker/jsb 仍待整包引擎 ArkTS 并入（见 `cocos_engine/README.md`）。
