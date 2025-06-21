const core = require("@actions/core");
const { execSync } = require("child_process");
const path = require("path");
const cache = require("@actions/cache");

function parseBooleanInput(value, defaultValue = false) {
    const normalized = value.trim().toLowerCase();
    return { 'true': true, 'false': false }[normalized] ?? defaultValue;
}

async function fetchCache() {
    try {
        const paths = [];

        const prefix = core.getInput("prefix");
        const cleanUpCache = parseBooleanInput(core.getInput("clean"));
        if (cleanUpCache) return;

        if (prefix) {
            process.chdir(prefix);
            core.debug(`Changed working directory to: ${prefix}`);
        }

        // ✅ 固定 key
        const keyString = "cache-openwrt--1750504499";

        // ✅ 只指定你已缓存的内容路径
        const cacheToolchain = parseBooleanInput(core.getInput("toolchain"), true);
        if (cacheToolchain) {
            paths.push("staging_dir/host*", "staging_dir/tool*");
        }

        const cacheCcache = parseBooleanInput(core.getInput("ccache"));
        if (cacheCcache) {
            paths.push(".ccache");
        }

        core.debug(`Cache paths: ${paths.join(", ")}`);
        console.log("使用缓存 key:", keyString);

        const cacheFetchingResult = await cache.restoreCache(paths, keyString);

        if (cacheFetchingResult) {
            core.info(`✅ 缓存命中：${cacheFetchingResult}`);
            core.setOutput("hit", "true");
            core.saveState("CACHE_STATE", "hit");
        } else {
            core.info("❌ 未命中缓存");
            core.setOutput("hit", "false");
        }
    } catch (error) {
        core.setFailed(error.message);
        process.exit(1);
    }
}

fetchCache();