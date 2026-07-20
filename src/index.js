/**
 * XIUI SDK v3
 *
 * 协议: ```xiui@form:type:id[@key:val]\ncontent\n```
 *
 * 核心类：
 *   - XIUIPlugin → 插件基类（parse/render/event）
 *   - XIUIChat   → 聊天 Session（状态管理）
 */

export { XIUIChat, XIUIPlugin, BUILTIN_PLUGINS, ChoicePlugin, InputPlugin, SubmitPlugin, SliderPlugin, SwitchPlugin, ConfirmPlugin } from './xiui.js';
export { BUILTIN_CARDS } from './xiui.js';
