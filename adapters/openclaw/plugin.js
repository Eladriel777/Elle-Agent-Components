// SPDX-License-Identifier: MIT
import { createQQTools } from "../../src/qq/tools.js";

export default {
  id: "elle-agent-components",
  name: "Elle 智能体组件集",
  register(api) {
    const config = api.pluginConfig ?? {};
    const account = { httpUrl: config.httpUrl ?? "http://127.0.0.1:3001", accessToken: process.env.ONEBOT_ACCESS_TOKEN ?? config.accessToken };
    for (const tool of createQQTools(account)) api.registerTool(tool, { name: tool.name });
  },
};
