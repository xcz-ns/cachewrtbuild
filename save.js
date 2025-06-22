// 引入 GitHub Actions 核心工具库，用于读取输入、设置输出等
const core = require("@actions/core");

// Node.js 子进程模块，用于执行 shell 命令（如 date）
const { execSync } = require("child_process");

// Node.js 路径模块，用于拼接文件路径
const path = require("path");

// Node.js 文件系统模块，用于读取本地文件
const fs = require("fs");

// GitHub 官方缓存模块
const cache = require("@actions/cache");

/**
 * 将字符串形式的布尔值（true/false）转为真正的布尔类型
 * @param value 输入值（字符串）
 * @param defaultValue 默认值（如果无法识别）
 * @returns boolean 值
 */
function parseBooleanInput(value, defaultValue = false) {
    const normalized = value.trim().toLowerCase();
    return { 'true': true, 'false': false }[normalized] ?? defaultValue;
}

// 主函数：保存缓存
async function saveCache() {
    try {
        // 是否跳过缓存保存（通过 Action 参数传入）
        const skipSaving = parseBooleanInput(core.getInput("skip_saving"));

        // 是否命中缓存（来自 restore 阶段设置的状态）
        const cacheState = core.getState("CACHE_STATE");

        // 仅当没有命中缓存 && 没有设置跳过保存时，才执行保存逻辑
        if (cacheState !== "hit" && !skipSaving) {
            const paths = []; // 将要缓存的路径列表
            const mixkey = core.getInput("mixkey"); // 自定义混合 key（用于多平台区分）
            let keyString = mixkey ? `${mixkey}-cache-openwrt` : "cache-openwrt"; // 基础 key 名称

            // 从输入读取源码路径前缀（openwrt 项目的根目录）
            const prefix = core.getInput("prefix");
            if (prefix) {
                // 切换到工作目录下的 openwrt 子目录
                process.chdir(prefix);
                core.debug(`Changed working directory to: ${prefix}`);
            }

            // 是否缓存工具链目录（默认 true）
            const cacheToolchain = parseBooleanInput(core.getInput("toolchain"), true);
            if (cacheToolchain) {
                let toolchainHash = "unknown";
                const hashPath = path.join(process.cwd(), ".toolchain.hash");

                if (fs.existsSync(hashPath)) {
                    toolchainHash = fs.readFileSync(hashPath, "utf8").trim();
                    core.info(`从 .toolchain.hash 文件读取工具链哈希：${toolchainHash}`);
                } else {
                    core.warning(".toolchain.hash 文件不存在，使用默认值 unknown");
                }

                keyString += `-${toolchainHash}`;

                // 添加需要缓存的路径（OpenWrt 工具链相关输出）
                paths.push(
                    path.join("staging_dir", "host*"),
                    path.join("staging_dir", "tool*")
                );
            }

            // 是否启用 ccache 缓存
            const cacheCcache = parseBooleanInput(core.getInput("ccache"));
            if (cacheCcache) {
                // 当前时间戳（秒），用于唯一标识本次 ccache 缓存
                const timestamp = execSync("date +%s").toString().trim();

                // 拼接到 key 中，避免覆盖已有缓存
                keyString += `-${timestamp}`;

                // 添加 .ccache 路径（ccache 默认目录）
                paths.push(".ccache");
            }

            // 输出最终生成的缓存 key（调试用途）
            console.log(`最终缓存 key: ${keyString}`);

            // 保存缓存
            await cache.saveCache(paths, keyString)
                .then(res => {
                    if (res) console.log(res, " cache saved"); // 保存成功提示
                })
                .catch(err => core.error(`Cache save failed: ${err.stack}`)); // 捕获缓存保存失败
        }
    } catch (error) {
        // 出错时不会终止构建，只打印 warning
        core.warning(error.message);
    }
}

// 执行保存缓存函数
saveCache();
