import { contextBridge } from "electron";
contextBridge.exposeInMainWorld("vampire", {
  version: "0.2.1",
  platform: process.platform
});