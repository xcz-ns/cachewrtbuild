const core = require("@actions/core");
const { execSync } = require("child_process");
const path = require("path");
const cache = require("@actions/cache");

/**
 * 解析字符串输入为布尔值
 * @param {string} value 输入字符串
 * @param {boolean} defaultValue 默认值
 * @returns {boolean}
 */
function parseBooleanInput(value, defaultValue = false) {
    const normalized = value.trim().toLowerCase();
    return { 'true': true, 'false': false }[normalized] ?? defaultValue;
}

async function fetchCache() {
    try {
        const paths = [];
        const restoreKeys = [];

        const mixkey = core.getInput("mixkey");
        const prefix = core.getInput("prefix");
        const cleanUpCache = parseBooleanInput(core.getInput("clean"));

        if (cleanUpCache) {
            core.info("🧹 设置了清理标志，跳过缓存恢复");
            return;
        }

        if (prefix) {
            process.chdir(prefix);
            core.debug(`切换当前工作目录到: ${prefix}`);
        }

        const timestamp = execSync("date +%s").toString().trim();

        let keyString = mixkey ? `${mixkey}-cache-openwrt--${timestamp}` : `cache-openwrt--${timestamp}`;

        const cacheCcache = parseBooleanInput(core.getInput("ccache"));
        if (cacheCcache) {
            restoreKeys.unshift(mixkey ? `${mixkey}-cache-openwrt--` : 'cache-openwrt--');
            paths.push(".ccache");
        }

        core.info("📦 缓存恢复调试信息:");
        core.info(`🗝️  主键: ${keyString}`);
        core.info(`🔑 备选键: ${JSON.stringify(restoreKeys)}`);
        core.info(`📁 缓存路径: ${paths.join(", ")}`);
        core.info(`📂 当前工作目录: ${process.cwd()}`);

        const result = await cache.restoreCache(paths, keyString, restoreKeys);

        if (result) {
            core.info(`✅ 缓存命中: ${result}`);
            core.setOutput("hit", "1");
            core.saveState("CACHE_STATE", "hit");
        } else {
            core.info("❌ 未命中缓存。可能原因包括:");
            core.info("- 🔑 缓存键不匹配（请检查key格式是否变更）");
            core.info("- 📁 缓存路径不匹配（确认restore和save使用了相同的路径）");
            core.info("- 🧹 缓存已过期或被手动删除");
            core.info("- 📦 缓存是在不同的仓库、分支或环境中创建的");
        }
    } catch (error) {
        core.setFailed(`💥 缓存恢复失败: ${error.message}`);
        process.exit(1);
    }
}

fetchCache();
