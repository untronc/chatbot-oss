// 見本のサイトの Worker の入口。自分のサイトでは、このフォルダを写して site.config.js を書き換える。
import { createWorker } from "../../src/worker.js";
import widgetJs from "../../dist/widget.js";
import site from "./site.config.js";

export default createWorker(site, widgetJs);
