/**
 * C2 / C2′ · Mode 2 table host switch.
 * false（默认）= 旧 ArkUI Table 表现；true = XComponent Cocos 宿主。
 *
 * 临时冒烟（勿 commit true）：
 *   1. node scripts/copy_cocos_native_libs.mjs
 *   2. CocosNativeLink.LINK_LIBCOCOS = true
 *   3. 本常量 = true → 进 lb_scr_table 走 CocosTableHost
 * 仅开本开关、不链 so：仍是 SURFACE 占位（C2 stub 行为）。
 */
export const USE_COCOS_TABLE: boolean = false;
