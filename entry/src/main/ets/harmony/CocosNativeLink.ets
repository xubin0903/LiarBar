/**
 * C2′ · whether XComponent links native libcocos (libraryname: 'cocos').
 *
 * Default **false**：无本机 so / 未跑 copy 脚本时勿强链，避免缺库启动失败。
 * 本机冒烟：
 *   1. node scripts/copy_cocos_native_libs.mjs
 *   2. 本常量改 true
 *   3. CocosTableFlag.USE_COCOS_TABLE 改 true
 * 勿把 true 与 *.so 一并 commit。详见 entry/libs/arm64-v8a/README.md · cocos_engine/README.md
 */
export const LINK_LIBCOCOS: boolean = false;
